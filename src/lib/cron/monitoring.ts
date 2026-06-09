/**
 * Helpers d'évaluation santé cron (R12 mitigation — Steve 2026-06-09).
 *
 * Pourquoi ? Sébastien et Camille ont flag R12 « cron 6h30 du lundi 20/7 KO =
 * AlyoS aveugle le lundi matin » comme risque critique pour la bascule du
 * 18 juillet. On a déjà `notifyCronError` qui notifie quand un cron throw,
 * mais on n'a RIEN qui détecte un cron « silencieux » : le job n'a juste
 * pas tourné (Vercel cron miss, Supabase down avant l'INSERT, etc.) → 0 row
 * en BDD pour la journée et aucune alerte.
 *
 * Ce module factorise la logique pure « ce cron est-il en bonne santé ? »
 * pour qu'elle soit testable hors infra (Vitest unit, pas d'E2E preview).
 * Elle est consommée par :
 *  - `/api/cron/sourcing-monitoring` (tick quotidien 7h00) qui décide
 *    d'envoyer un mail d'alerte à Sébastien
 *  - `/api/admin/crons/smoke-sourcing-run` (déclenchement manuel) qui
 *    affiche un verdict OK/KO dans la réponse JSON.
 *
 * Best-effort sur tout : les callers absorbent les exceptions, le
 * monitoring ne doit jamais bloquer l'app.
 */

import { sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { cronRunLog } from "@/db/schema/cron-log";

/**
 * Fenêtre de fraîcheur par défaut : un cron `sourcing-run` (lun-ven 06:30
 * Europe/Paris) doit avoir un run terminé dans les 90 minutes précédant
 * le check 07:00. On garde une marge confortable au-delà des 30 minutes
 * théoriques pour absorber un Vercel cron trigger en retard (observé
 * jusqu'à 10-15 min de drift sur les plans Hobby/Pro).
 *
 * Note : sur une bascule prod, on tournera probablement à 60 min pour
 * resserrer le SLA. Pour l'instant 90 min couvre les pics de drift sans
 * spam.
 */
export const DEFAULT_FRESHNESS_WINDOW_MS = 90 * 60 * 1000;

/**
 * Verdict structuré renvoyé par le helper. `ok` est le seul champ
 * vraiment utile pour décider d'alerter ; les autres servent à logger
 * la raison précise dans le payload du cron monitoring et à hydrater
 * le mail Resend.
 */
export interface CronHealthVerdict {
  /** true = cron en bonne santé ; false = alerter Sébastien. */
  ok: boolean;
  /** Code raison machine-lisible, idem pour les tests vitest. */
  reason: "ok" | "no_recent_run" | "last_run_failed" | "last_run_still_running" | "db_unavailable";
  /** Message humain à mettre dans le mail / log. */
  message: string;
  /** Détails contextuels (date du dernier run, status, error_message bref). */
  details: {
    cronName: string;
    lastRunStartedAt: string | null;
    lastRunFinishedAt: string | null;
    lastRunStatus: "ok" | "error" | "running" | null;
    lastRunErrorMessage: string | null;
    ageMinutes: number | null;
  };
}

/**
 * Shape de la row `cron_run_log` qu'on lit. On accepte aussi bien la
 * version snake_case (Supabase client direct) que camelCase (Drizzle
 * inferSelect) pour pouvoir consommer le helper depuis n'importe quel
 * caller sans coupler à un ORM.
 */
export interface CronRunRowSnapshot {
  started_at: string | Date | null;
  finished_at: string | Date | null;
  status: string | null;
  error_message: string | null;
}

/**
 * Cœur du helper — fonction pure. Évalue un dernier run et retourne le
 * verdict structuré.
 *
 * Règles :
 *  - Aucun run → `no_recent_run` (KO)
 *  - Run plus vieux que la fenêtre → `no_recent_run` (KO)
 *  - Status `error` → `last_run_failed` (KO)
 *  - Status `running` et plus vieux que la fenêtre → `last_run_still_running` (KO)
 *    (un run vraiment en cours dans la fenêtre = on a déjà vu un trigger,
 *    on ne hurle pas tout de suite)
 *  - Status `ok` et dans la fenêtre → `ok` (OK)
 */
export function evaluateCronHealth(
  cronName: string,
  lastRun: CronRunRowSnapshot | null,
  options: { now?: Date; freshnessWindowMs?: number } = {},
): CronHealthVerdict {
  const now = options.now ?? new Date();
  const freshnessWindowMs = options.freshnessWindowMs ?? DEFAULT_FRESHNESS_WINDOW_MS;

  if (!lastRun || !lastRun.started_at) {
    return {
      ok: false,
      reason: "no_recent_run",
      message: `Aucune exécution de ${cronName} trouvée en base. Le cron ne tourne probablement pas (Vercel cron miss, route 404, secret KO).`,
      details: {
        cronName,
        lastRunStartedAt: null,
        lastRunFinishedAt: null,
        lastRunStatus: null,
        lastRunErrorMessage: null,
        ageMinutes: null,
      },
    };
  }

  const startedAt =
    lastRun.started_at instanceof Date ? lastRun.started_at : new Date(lastRun.started_at);
  const finishedAt =
    lastRun.finished_at == null
      ? null
      : lastRun.finished_at instanceof Date
        ? lastRun.finished_at
        : new Date(lastRun.finished_at);

  // started_at invalide → on traite comme absence de run (défensif :
  // pendant les tests on a déjà vu des Date(NaN) passer ici).
  if (Number.isNaN(startedAt.getTime())) {
    return {
      ok: false,
      reason: "no_recent_run",
      message: `Dernier run ${cronName} : started_at invalide. État BDD corrompu, à inspecter.`,
      details: {
        cronName,
        lastRunStartedAt: null,
        lastRunFinishedAt: null,
        lastRunStatus: (lastRun.status as CronHealthVerdict["details"]["lastRunStatus"]) ?? null,
        lastRunErrorMessage: lastRun.error_message ?? null,
        ageMinutes: null,
      },
    };
  }

  const ageMs = now.getTime() - startedAt.getTime();
  const ageMinutes = Math.round(ageMs / 60_000);
  const stale = ageMs > freshnessWindowMs;

  const baseDetails = {
    cronName,
    lastRunStartedAt: startedAt.toISOString(),
    lastRunFinishedAt: finishedAt ? finishedAt.toISOString() : null,
    lastRunStatus: (lastRun.status as CronHealthVerdict["details"]["lastRunStatus"]) ?? null,
    lastRunErrorMessage: lastRun.error_message ?? null,
    ageMinutes,
  };

  if (stale) {
    return {
      ok: false,
      reason: "no_recent_run",
      message: `Dernier run ${cronName} il y a ${ageMinutes} min (seuil ${Math.round(
        freshnessWindowMs / 60_000,
      )} min). Le cron n'a probablement pas tourné aujourd'hui.`,
      details: baseDetails,
    };
  }

  if (lastRun.status === "error") {
    return {
      ok: false,
      reason: "last_run_failed",
      message: `Dernier run ${cronName} a échoué : ${lastRun.error_message ?? "erreur sans message"}.`,
      details: baseDetails,
    };
  }

  if (lastRun.status === "running") {
    // Si la row est encore running mais récente, on laisse couler — c'est
    // probablement le run lui-même en train de finir (sourcing-run peut
    // durer 2-3 min côté pipeline BOAMP). C'est `reapOrphanedRunningRows`
    // qui s'occupe des zombies > 5 min.
    return {
      ok: false,
      reason: "last_run_still_running",
      message: `Dernier run ${cronName} est encore « en cours » depuis ${ageMinutes} min. À recheck dans 5 min ; si toujours en cours, escalade.`,
      details: baseDetails,
    };
  }

  if (lastRun.status === "ok") {
    return {
      ok: true,
      reason: "ok",
      message: `Dernier run ${cronName} OK il y a ${ageMinutes} min.`,
      details: baseDetails,
    };
  }

  // Status inconnu (jamais arrivé en prod mais défensif)
  return {
    ok: false,
    reason: "last_run_failed",
    message: `Dernier run ${cronName} : statut « ${lastRun.status} » non reconnu.`,
    details: baseDetails,
  };
}

/**
 * Charge la dernière row `cron_run_log` pour un cron donné. Retourne `null`
 * si aucune row ou si la BDD est inaccessible (best-effort).
 *
 * NB : on n'utilise PAS `db.select().from().where()` typé Drizzle ici parce
 * que ce module est testé en pure unit (Vitest) et qu'on veut un fake Db
 * minimal. On accepte un `Db` typé qui expose `.select` (compatible Drizzle
 * et fake). Le caller décide de quel client utiliser.
 */
export async function fetchLastCronRun(
  db: Db,
  cronName: string,
): Promise<CronRunRowSnapshot | null> {
  try {
    const rows = await db
      .select({
        started_at: cronRunLog.startedAt,
        finished_at: cronRunLog.finishedAt,
        status: cronRunLog.status,
        error_message: cronRunLog.errorMessage,
      })
      .from(cronRunLog)
      .where(sql`${cronRunLog.cronName} = ${cronName}`)
      .orderBy(sql`${cronRunLog.startedAt} desc`)
      .limit(1);
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    if (!r) return null;
    return {
      started_at: r.started_at,
      finished_at: r.finished_at,
      status: r.status,
      error_message: r.error_message,
    };
  } catch (err) {
    console.warn("[cron-monitoring:fetch:fail]", cronName, err);
    return null;
  }
}

/**
 * Construit le payload mail (subject + html + text) envoyé via Resend
 * quand le cron est KO. Format aligné sur `notifyCronError` (visuel,
 * mention edifio Sourcing, lien /admin/crons) mais subject explicite
 * « ALERT » pour qu'il ressorte dans la boîte de Sébastien.
 *
 * Convention naming (CLAUDE.md) : `edifio Sourcing`, jamais `EDIFIO`.
 */
export function buildMonitoringMail(
  verdict: CronHealthVerdict,
  opts: { siteUrl: string; checkDate: Date },
): { subject: string; html: string; text: string } {
  const dateStr = opts.checkDate.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const adminUrl = `${opts.siteUrl}/sourcing/admin/crons`;
  const smokeUrl = `${opts.siteUrl}/api/admin/crons/smoke-sourcing-run`;

  const subject = `ALERT: cron ${verdict.details.cronName} KO le ${dateStr}`;

  const lastRunSummary = verdict.details.lastRunStartedAt
    ? `Dernier run : ${verdict.details.lastRunStartedAt} (status « ${verdict.details.lastRunStatus ?? "?"} », il y a ${verdict.details.ageMinutes ?? "?"} min).`
    : "Aucun run récent en base.";

  const text =
    `ALERT — Monitoring edifio Sourcing\n\n` +
    `Le cron ${verdict.details.cronName} est en état KO ce matin (${dateStr}).\n\n` +
    `Raison : ${verdict.reason}\n` +
    `Détail : ${verdict.message}\n\n` +
    `${lastRunSummary}\n\n` +
    `Actions à faire (runbook RUNBOOK_CRON_SOURCING_RUN.md) :\n` +
    `  1. Ouvrir ${adminUrl} et regarder la dernière row\n` +
    `  2. Si aucun run du jour, déclencher manuellement via le bouton du panel\n` +
    `  3. Si le bouton manuel KO aussi, lancer le smoke test : ${smokeUrl}\n` +
    `  4. Si tout est rouge, escalader équipe Suivi+ACT (Sébastien) ou rollback\n\n` +
    `— edifio Sourcing, monitoring R12.`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:sans-serif;color:#0f172a;line-height:1.5;max-width:640px">
<h2 style="color:#dc2626">ALERT — cron <code>${escapeHtml(verdict.details.cronName)}</code> KO</h2>
<p>Ce matin (<strong>${escapeHtml(dateStr)}</strong>), le monitoring 7h00 d'edifio Sourcing a détecté que le cron principal n'a pas tourné correctement.</p>

<table style="border-collapse:collapse;font-size:13px;margin:12px 0">
  <tr><td style="padding:4px 12px 4px 0;color:#64748b">Raison</td><td style="padding:4px"><code>${escapeHtml(verdict.reason)}</code></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#64748b">Détail</td><td style="padding:4px">${escapeHtml(verdict.message)}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#64748b">Dernier run</td><td style="padding:4px">${escapeHtml(lastRunSummary)}</td></tr>
</table>

<h3 style="color:#0f172a;margin-top:24px">Actions (runbook)</h3>
<ol style="font-size:13px;line-height:1.6">
  <li>Ouvrir <a href="${adminUrl}">${adminUrl}</a> et regarder la dernière row.</li>
  <li>Si aucun run du jour : déclencher manuellement via le bouton « Sourcing matinal » du panel.</li>
  <li>Si le bouton manuel KO aussi : déclencher le smoke test <code>${smokeUrl}</code>.</li>
  <li>Si tout est rouge : escalader équipe Suivi+ACT (Sébastien) ou rollback bascule.</li>
</ol>

<p style="margin-top:16px"><a href="${adminUrl}" style="display:inline-block;padding:8px 16px;background:#0f172a;color:#fff;text-decoration:none;border-radius:20px;font-size:13px">Ouvrir /admin/crons</a></p>
<p style="font-size:11px;color:#64748b;margin-top:24px">edifio Sourcing — monitoring R12. Cette alerte part automatiquement quand le cron 6h30 n'a pas tourné correctement.</p>
</body></html>`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
