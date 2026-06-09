import { expect, test } from "@playwright/test";

import {
  cleanupMultiOrgFixtures,
  seedMultiOrgFixtures,
  getAdminClient,
} from "../fixtures/multi-org-seed";
import { MULTI_ORG_USERS } from "../fixtures/multi-org-seed";
import { signInWith, getCookieFor } from "../helpers/auth";

/**
 * S14 — Cron 6h30 lundi 20/7 — mitigation R12.
 *
 * Source de vérité :
 *  - `gates/RECETTE_FINALE_PROTECT_BASCULE_JUILLET.md` §2 (S14)
 *  - `src/app/api/admin/crons/smoke-sourcing-run/route.ts` (Alex 2026-06-09 R12)
 *  - `src/app/api/cron/sourcing-monitoring/route.ts`        (Alex 2026-06-09 R12)
 *
 * Mitigation R12 (Steve) : ajout d'une route smoke `/api/admin/crons/smoke-sourcing-run`
 * pour déclencher manuellement le cron sourcing-run après la bascule du 18/7,
 * sans attendre le tick Vercel de 6h30 le lundi suivant. Cette spec valide :
 *
 *   1. La route smoke est **gated superadmin** (401 anon, 403 admin non-super).
 *   2. La route monitoring `/api/cron/sourcing-monitoring` est gated `Bearer
 *      CRON_SECRET` (401 sans header).
 *   3. **Smoke réel** : on déclenche le smoke avec un cookie superadmin et on
 *      vérifie le contour de la réponse JSON :
 *        { ok: boolean, verdict: "ok" | "ko", tendersInserted: number, ... }
 *      Note : on N'ASSURE PAS `verdict=ok` (le cron sourcing-run dépend de
 *      BOAMP et CRON_SECRET configurés — en CI E2E preview, on accepte les
 *      deux verdicts). L'invariant est la **forme** de la réponse.
 *   4. **Trace BDD** : la table `cron_run_log` doit contenir une row récente
 *      pour `sourcing-run` ou `smoke-sourcing-run` (selon le contexte
 *      d'exécution). L'invariant est qu'on NE laisse PAS de run "running"
 *      bloqué.
 *
 * **Important nommage** : la table s'appelle `cron_run_log` (PAS `cron_runs`)
 * et la colonne de fin est `finished_at` (PAS `completed_at`) — cf.
 * `src/db/schema/cron-log.ts`. Le brief P1 disait `cron_runs / completed_at`
 * par mémoire ; on s'aligne sur le schéma réel.
 *
 * Tags : `@multi-org`, `@p1`.
 */

const SMOKE_PATH = "/api/admin/crons/smoke-sourcing-run";
const MONITORING_PATH = "/api/cron/sourcing-monitoring";

test.describe("@multi-org @p1 S14 — Cron lundi R12 (smoke + monitoring)", () => {
  test.beforeAll(async () => {
    await seedMultiOrgFixtures();
  });

  test.afterAll(async () => {
    await cleanupMultiOrgFixtures();
  });

  test("Route smoke sans auth → 401", async ({ request }) => {
    const res = await request.get(SMOKE_PATH);
    expect(res.status(), `GET ${SMOKE_PATH} sans cookie doit retourner 401`).toBe(401);
    const body = await res.json().catch(() => ({}));
    expect(body.ok).toBe(false);
  });

  test("Route smoke avec admin non-super → 403", async ({ page }) => {
    // admin AlyoS (rôle `admin`, pas `superadmin`) → 403.
    await signInWith(page, MULTI_ORG_USERS.ALYOS.admin);
    const res = await page.request.get(SMOKE_PATH);
    expect(res.status(), `${SMOKE_PATH} admin non-super doit retourner 403`).toBe(403);
    const body = await res.json().catch(() => ({}));
    expect(body.ok).toBe(false);
    expect(body.message ?? "").toMatch(/superadmin/i);
  });

  test("Route monitoring sans header secret → 401", async ({ request }) => {
    const res = await request.get(MONITORING_PATH);
    expect(res.status(), `GET ${MONITORING_PATH} sans Bearer doit retourner 401`).toBe(401);
  });

  test("Route monitoring avec Bearer incorrect → 401", async ({ request }) => {
    const res = await request.get(MONITORING_PATH, {
      headers: { authorization: "Bearer wrong-cron-secret-xxxxxxxxxxx" },
    });
    expect(res.status()).toBe(401);
  });

  test("Smoke avec superadmin → réponse JSON conforme (ok|verdict|tendersInserted)", async () => {
    // On utilise getCookieFor pour récupérer un cookie superadmin sans avoir
    // à ouvrir une page (le smoke est appelable par requête API directe).
    const cookieHeader = await getCookieFor(MULTI_ORG_USERS.SUPERADMIN);

    // On instancie un browser context pour rejouer le cookie sb-* (même
    // pattern que S5 — extractMultipart).
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext();
      const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
      const url = new URL(baseURL);
      const cookies = cookieHeader
        .split("; ")
        .map((c) => {
          const idx = c.indexOf("=");
          if (idx < 0) return null;
          return {
            name: c.slice(0, idx),
            value: c.slice(idx + 1),
            domain: url.hostname,
            path: "/",
            httpOnly: true,
            secure: url.protocol === "https:",
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
      await context.addCookies(cookies);

      // Timeout généreux : le smoke fait un fetch interne sourcing-run qui peut
      // prendre 2-3 min en prod (BOAMP + scoring + insert). En CI preview sans
      // BOAMP joignable, on devrait avoir un échec rapide → verdict `ko`.
      const res = await context.request.post(SMOKE_PATH, { timeout: 60_000 });

      const body = await res.json().catch(() => null);
      expect(body, "Réponse smoke doit être JSON parseable").not.toBeNull();
      if (!body) return; // type-narrowing TS

      // Invariants de FORME (pas de verdict — celui-ci dépend du runtime).
      expect(typeof body.ok, "ok est boolean").toBe("boolean");
      expect(typeof body.verdict, "verdict est string").toBe("string");
      expect(["ok", "ko"], `verdict ∈ {ok, ko}, reçu "${body.verdict}"`).toContain(body.verdict);
      expect(typeof body.tendersInserted, "tendersInserted est number").toBe("number");
      expect(typeof body.tendersUpdated, "tendersUpdated est number").toBe("number");
      expect(typeof body.durationMs, "durationMs est number").toBe("number");
      expect(typeof body.message, "message est string").toBe("string");

      // Le HTTP status doit être 200 (ok) ou 502 (ko — bad gateway interne).
      // Pas de 5xx autre, pas de 4xx (l'auth a passé).
      expect([200, 502], `status HTTP attendu 200/502, reçu ${res.status()}`).toContain(
        res.status(),
      );
    } finally {
      await browser.close();
    }
  });

  test("Aucun run cron_run_log bloqué en 'running' depuis > 10 min", async () => {
    // Si un cron a planté en cours de route sans poser finished_at, on a un
    // souci de telemetry. La spec garantit l'absence de runs zombies — c'est
    // l'invariant du withCronRunLog (poser finished_at en finally).
    const admin = getAdminClient();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data, error } = await admin
      .from("cron_run_log")
      .select("id, cron_name, started_at, status")
      .eq("status", "running")
      .lt("started_at", tenMinutesAgo);
    expect(error?.message ?? null, `Lecture cron_run_log: ${error?.message}`).toBeNull();
    const zombies = data ?? [];
    expect(
      zombies.length,
      `Runs zombies (status=running > 10 min) : ${JSON.stringify(zombies.map((z) => z.cron_name))}`,
    ).toBe(0);
  });

  test("Smoke écrit une trace cohérente OU sourcing-monitoring n'envoie pas d'alerte sur cas OK", async () => {
    // Cas OK : si le smoke précédent a verdict=ok, on s'attend à voir une row
    // récente `sourcing-run` finished_at NOT NULL dans cron_run_log. Si CI sans
    // BOAMP, le smoke est verdict=ko mais l'invariant ici reste : aucune row
    // status='running' bloquée pour sourcing-run dans la dernière minute.
    const admin = getAdminClient();
    const { data } = await admin
      .from("cron_run_log")
      .select("id, cron_name, status, finished_at, started_at")
      .eq("cron_name", "sourcing-run")
      .order("started_at", { ascending: false })
      .limit(1);

    if ((data ?? []).length === 0) {
      // OK : aucune row sourcing-run récente (le smoke a peut-être échoué
      // avant même d'invoquer le run). On ne fait pas planter le test —
      // l'invariant zombie est déjà couvert par le test précédent.
      test.info().annotations.push({
        type: "info",
        description: "Pas de row sourcing-run récente — pipeline non exercé en E2E preview.",
      });
      return;
    }
    const lastRun = data?.[0];
    if (!lastRun) return;
    // Si la row est récente (< 10 min), elle DOIT être terminée (finished_at
    // posé) ou explicitement marquée 'error'. PAS 'running' éternel.
    const startedAtMs = new Date(lastRun.started_at as string).getTime();
    if (Date.now() - startedAtMs < 10 * 60 * 1000) {
      expect(
        ["ok", "error"],
        `Dernier sourcing-run récent doit être terminé (ok|error), trouvé ${lastRun.status}`,
      ).toContain(lastRun.status);
      expect(lastRun.finished_at, "finished_at doit être posé sur un run terminé").not.toBeNull();
    }
  });
});
