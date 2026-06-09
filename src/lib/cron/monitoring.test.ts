/**
 * Tests evaluateCronHealth + buildMonitoringMail (R12 — Steve 2026-06-09).
 *
 * Couvre les invariants de décision d'alerte :
 *   - Aucun run en base → KO `no_recent_run`
 *   - Run plus vieux que la fenêtre → KO `no_recent_run`
 *   - Status `error` → KO `last_run_failed`
 *   - Status `running` ancien → KO `last_run_still_running`
 *   - Status `ok` récent → OK
 *   - started_at invalide → KO `no_recent_run` (défensif)
 *   - Status inconnu → KO `last_run_failed` (défensif)
 *   - buildMonitoringMail rend subject + html + text avec date FR + liens admin
 */

import { describe, expect, it } from "vitest";

import { buildMonitoringMail, DEFAULT_FRESHNESS_WINDOW_MS, evaluateCronHealth } from "./monitoring";

const CRON = "sourcing-run";
const NOW = new Date("2026-07-20T07:00:00Z");

describe("evaluateCronHealth", () => {
  it("renvoie KO `no_recent_run` si aucun run en base", () => {
    const v = evaluateCronHealth(CRON, null, { now: NOW });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("no_recent_run");
    expect(v.details.cronName).toBe(CRON);
    expect(v.details.lastRunStartedAt).toBeNull();
    expect(v.message).toMatch(/Aucune exécution/i);
  });

  it("renvoie OK si dernier run status=ok dans la fenêtre", () => {
    const startedAt = new Date(NOW.getTime() - 30 * 60 * 1000); // 30 min ago
    const v = evaluateCronHealth(
      CRON,
      {
        started_at: startedAt,
        finished_at: new Date(NOW.getTime() - 25 * 60 * 1000),
        status: "ok",
        error_message: null,
      },
      { now: NOW },
    );
    expect(v.ok).toBe(true);
    expect(v.reason).toBe("ok");
    expect(v.details.ageMinutes).toBe(30);
    expect(v.details.lastRunStatus).toBe("ok");
  });

  it("renvoie KO `no_recent_run` si dernier run plus vieux que la fenêtre (par défaut 90 min)", () => {
    const startedAt = new Date(NOW.getTime() - (DEFAULT_FRESHNESS_WINDOW_MS + 60_000)); // 91 min ago
    const v = evaluateCronHealth(
      CRON,
      {
        started_at: startedAt,
        finished_at: new Date(NOW.getTime() - 90 * 60 * 1000),
        status: "ok",
        error_message: null,
      },
      { now: NOW },
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("no_recent_run");
    expect(v.message).toMatch(/n'a probablement pas tourné/i);
  });

  it("renvoie KO `last_run_failed` si dernier run a un status=error", () => {
    const startedAt = new Date(NOW.getTime() - 10 * 60 * 1000);
    const v = evaluateCronHealth(
      CRON,
      {
        started_at: startedAt,
        finished_at: new Date(NOW.getTime() - 9 * 60 * 1000),
        status: "error",
        error_message: "BOAMP timeout 504",
      },
      { now: NOW },
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("last_run_failed");
    expect(v.message).toMatch(/BOAMP timeout 504/);
    expect(v.details.lastRunErrorMessage).toBe("BOAMP timeout 504");
  });

  it("renvoie KO `last_run_still_running` si dernier run est encore running", () => {
    const startedAt = new Date(NOW.getTime() - 30 * 60 * 1000); // 30 min, dans la fenêtre
    const v = evaluateCronHealth(
      CRON,
      {
        started_at: startedAt,
        finished_at: null,
        status: "running",
        error_message: null,
      },
      { now: NOW },
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("last_run_still_running");
    expect(v.message).toMatch(/encore « en cours »/);
  });

  it("renvoie KO `no_recent_run` si started_at est une Date invalide", () => {
    const v = evaluateCronHealth(
      CRON,
      {
        started_at: "not-a-date",
        finished_at: null,
        status: "ok",
        error_message: null,
      },
      { now: NOW },
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("no_recent_run");
    expect(v.message).toMatch(/started_at invalide/);
  });

  it("renvoie KO `last_run_failed` si status est inconnu (défensif)", () => {
    const startedAt = new Date(NOW.getTime() - 30 * 60 * 1000);
    const v = evaluateCronHealth(
      CRON,
      {
        started_at: startedAt,
        finished_at: null,
        status: "cancelled",
        error_message: null,
      },
      { now: NOW },
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("last_run_failed");
  });

  it("respecte une fenêtre custom (60 min serré)", () => {
    const startedAt = new Date(NOW.getTime() - 75 * 60 * 1000); // 75 min
    const v = evaluateCronHealth(
      CRON,
      {
        started_at: startedAt,
        finished_at: new Date(NOW.getTime() - 70 * 60 * 1000),
        status: "ok",
        error_message: null,
      },
      { now: NOW, freshnessWindowMs: 60 * 60 * 1000 },
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("no_recent_run");
  });

  it("accepte aussi des dates en string ISO (chemin Supabase client direct)", () => {
    const startedAt = new Date(NOW.getTime() - 30 * 60 * 1000).toISOString();
    const v = evaluateCronHealth(
      CRON,
      {
        started_at: startedAt,
        finished_at: new Date(NOW.getTime() - 25 * 60 * 1000).toISOString(),
        status: "ok",
        error_message: null,
      },
      { now: NOW },
    );
    expect(v.ok).toBe(true);
    expect(v.reason).toBe("ok");
  });
});

describe("buildMonitoringMail", () => {
  const verdict = evaluateCronHealth(
    CRON,
    null, // no_recent_run = pire cas
    { now: NOW },
  );

  it("renvoie subject avec la date FR et le cron name", () => {
    const mail = buildMonitoringMail(verdict, {
      siteUrl: "https://edifio-sourcing.vercel.app",
      checkDate: NOW,
    });
    expect(mail.subject).toMatch(/^ALERT: cron sourcing-run KO le /);
    // Date FR weekday : "lundi 20/07/2026" attendu (selon locale runtime).
    expect(mail.subject).toMatch(/2026/);
  });

  it("subject est de la forme exacte demandée par le brief", () => {
    const mail = buildMonitoringMail(verdict, {
      siteUrl: "https://edifio-sourcing.vercel.app",
      checkDate: NOW,
    });
    // Brief : "ALERT: cron sourcing-run KO le {date}"
    expect(mail.subject.startsWith("ALERT: cron sourcing-run KO le ")).toBe(true);
  });

  it("text contient un lien vers /sourcing/admin/crons", () => {
    const mail = buildMonitoringMail(verdict, {
      siteUrl: "https://edifio-sourcing.vercel.app",
      checkDate: NOW,
    });
    expect(mail.text).toContain("https://edifio-sourcing.vercel.app/sourcing/admin/crons");
  });

  it("html contient un lien vers /sourcing/admin/crons et le smoke test", () => {
    const mail = buildMonitoringMail(verdict, {
      siteUrl: "https://edifio-sourcing.vercel.app",
      checkDate: NOW,
    });
    expect(mail.html).toContain("https://edifio-sourcing.vercel.app/sourcing/admin/crons");
    expect(mail.html).toContain("/api/admin/crons/smoke-sourcing-run");
  });

  it("html ne contient pas d'apostrophe ou de < non échappés provenant du message", () => {
    // Sanity check anti-XSS — on injecte du HTML hostile et on vérifie l'escape.
    const verdictHostile = evaluateCronHealth(
      CRON,
      {
        started_at: new Date(NOW.getTime() - 10 * 60 * 1000),
        finished_at: new Date(NOW.getTime() - 9 * 60 * 1000),
        status: "error",
        error_message: "<script>alert('xss')</script>",
      },
      { now: NOW },
    );
    const mail = buildMonitoringMail(verdictHostile, {
      siteUrl: "https://edifio-sourcing.vercel.app",
      checkDate: NOW,
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("respecte le naming « edifio Sourcing » (jamais EDIFIO)", () => {
    const mail = buildMonitoringMail(verdict, {
      siteUrl: "https://edifio-sourcing.vercel.app",
      checkDate: NOW,
    });
    expect(mail.text).toContain("edifio Sourcing");
    expect(mail.html).toContain("edifio Sourcing");
    // Pas de variante interdite
    expect(mail.text).not.toMatch(/\bEDIFIO\b/);
    expect(mail.html).not.toMatch(/\bEDIFIO\b/);
    expect(mail.text).not.toMatch(/\bEdifio\b/);
  });
});
