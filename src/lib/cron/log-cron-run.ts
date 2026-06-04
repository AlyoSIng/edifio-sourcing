/**
 * Wrapper d'observabilité pour les routes Vercel Cron (chantier I3).
 *
 * Steve 2026-06-04. Insère une row `cron_run_log` au début (status='running'),
 * appelle le runner, puis UPDATE la row avec finished_at + duration_ms +
 * status final ('ok' | 'error') + payload sérialisé ou message d'erreur.
 *
 * Pourquoi un wrapper et pas un middleware Next.js ? Les routes cron sont
 * 4 fichiers indépendants avec des signatures Runner différentes — un
 * helper que chaque handler invoque garde le code explicite et permet de
 * sérialiser un payload typé spécifique au cron.
 *
 * Best-effort sur le logging : si l'INSERT ou l'UPDATE rate (BDD down), on
 * log la trace et on continue — l'observabilité ne doit jamais casser le
 * cron lui-même.
 */

import { and, eq, lt, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { cronRunLog } from "@/db/schema/cron-log";

export interface CronRunHandle {
  id: string;
  startedAt: Date;
  startedAtMs: number;
}

/**
 * Seuil au-delà duquel une row `status='running'` est considérée orpheline
 * (la function Vercel a probablement été killed sur timeout ou crash hard,
 * `finishCronRun` n'a jamais tourné). On utilise 5 min qui dépasse confortable-
 * ment le `maxDuration` plafond Vercel Pro (300s).
 *
 * Steve 2026-06-04 — observé sur sourcing-run après FUNCTION_INVOCATION_TIMEOUT :
 * la row reste en 'running' indéfiniment et fausse les agrégats /admin/crons.
 */
const ORPHAN_RUNNING_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Self-heal best-effort : à chaque `startCronRun`, on UPDATE les rows du même
 * cron_name encore en `running` mais dont `started_at` est plus vieux que le
 * seuil. Statut → 'error' avec error_message explicite. Comme ça les vraies
 * runs concurrentes (peu probable mais possible si deux ticks se chevauchent)
 * ne sont pas touchées, mais les zombies sont nettoyés au prochain run.
 *
 * Exportée pour testabilité.
 */
export async function reapOrphanedRunningRows(db: Db, cronName: string): Promise<void> {
  try {
    const threshold = new Date(Date.now() - ORPHAN_RUNNING_THRESHOLD_MS);
    await db
      .update(cronRunLog)
      .set({
        status: "error",
        finishedAt: sql`now()`,
        durationMs: sql`extract(epoch from (now() - ${cronRunLog.startedAt})) * 1000`,
        errorMessage:
          "Run orpheline : Vercel a probablement timeout (FUNCTION_INVOCATION_TIMEOUT) ou crashed avant que finishCronRun ne tourne.",
      })
      .where(
        and(
          eq(cronRunLog.cronName, cronName),
          eq(cronRunLog.status, "running"),
          lt(cronRunLog.startedAt, threshold),
        ),
      );
  } catch (err) {
    console.warn("[cron-log:reap-orphans:fail]", cronName, err);
  }
}

/**
 * Insère la row de début. Renvoie un handle à passer à `finishCronRun`.
 *
 * Si l'INSERT rate, on renvoie un handle « ghost » qui sera ignoré par
 * `finishCronRun` — le cron continue à s'exécuter normalement.
 */
export async function startCronRun(db: Db, cronName: string): Promise<CronRunHandle> {
  const startedAt = new Date();
  const startedAtMs = startedAt.getTime();

  // Self-heal — nettoie les rows running orphelines du même cron avant
  // d'insérer la nouvelle. Best-effort, n'empêche jamais le run en cours.
  await reapOrphanedRunningRows(db, cronName);

  try {
    const [row] = await db
      .insert(cronRunLog)
      .values({
        cronName,
        startedAt,
        status: "running",
      })
      .returning({ id: cronRunLog.id });
    if (!row) {
      console.warn("[cron-log:start:noreturn]", cronName);
      return { id: "", startedAt, startedAtMs };
    }
    return { id: row.id, startedAt, startedAtMs };
  } catch (err) {
    console.warn("[cron-log:start:fail]", cronName, err);
    return { id: "", startedAt, startedAtMs };
  }
}

/**
 * Marque la row comme terminée. `payload` est inséré tel quel comme jsonb,
 * `error` (s'il existe) écrase status à 'error' et trace message + stack.
 */
export async function finishCronRun(
  db: Db,
  handle: CronRunHandle,
  result: { payload?: unknown; error?: unknown } = {},
): Promise<void> {
  if (!handle.id) return;
  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - handle.startedAtMs;

  const isError = result.error !== undefined && result.error !== null;
  const errorMessage =
    isError && result.error instanceof Error
      ? result.error.message
      : isError
        ? String(result.error)
        : null;
  const errorStack =
    isError && result.error instanceof Error && typeof result.error.stack === "string"
      ? result.error.stack.slice(0, 8000) // bornage à 8k pour ne pas saturer jsonb
      : null;

  try {
    await db
      .update(cronRunLog)
      .set({
        finishedAt,
        durationMs,
        status: isError ? "error" : "ok",
        payload: (result.payload ?? null) as never,
        errorMessage,
        errorStack,
      })
      .where(eq(cronRunLog.id, handle.id));
  } catch (err) {
    console.warn("[cron-log:finish:fail]", handle.id, err);
  }
}

/**
 * Helper haut-niveau : `withCronRunLog('cron-name', async () => { ... })`.
 * Capture succès / exception et trace dans cron_run_log.
 *
 * Option `onError` : callback appelé après finishCronRun quand le runner
 * throw. Sert au polish I3 (notification mail superadmin via
 * `notifyCronError`). Best-effort : si onError throw, on warn console et
 * on renvoie quand même `{ok: false, error}`.
 */
export async function withCronRunLog<T>(
  db: Db,
  cronName: string,
  runner: () => Promise<T>,
  opts: { onError?: (error: unknown) => Promise<void> } = {},
): Promise<{ ok: true; result: T } | { ok: false; error: unknown }> {
  const handle = await startCronRun(db, cronName);
  try {
    const result = await runner();
    await finishCronRun(db, handle, { payload: result });
    return { ok: true, result };
  } catch (error) {
    await finishCronRun(db, handle, { error });
    if (opts.onError) {
      try {
        await opts.onError(error);
      } catch (notifyErr) {
        console.warn("[cron-log:onError:fail]", cronName, notifyErr);
      }
    }
    return { ok: false, error };
  }
}
