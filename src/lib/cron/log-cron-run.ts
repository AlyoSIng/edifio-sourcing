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

import { eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { cronRunLog } from "@/db/schema/cron-log";

export interface CronRunHandle {
  id: string;
  startedAt: Date;
  startedAtMs: number;
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
 */
export async function withCronRunLog<T>(
  db: Db,
  cronName: string,
  runner: () => Promise<T>,
): Promise<{ ok: true; result: T } | { ok: false; error: unknown }> {
  const handle = await startCronRun(db, cronName);
  try {
    const result = await runner();
    await finishCronRun(db, handle, { payload: result });
    return { ok: true, result };
  } catch (error) {
    await finishCronRun(db, handle, { error });
    return { ok: false, error };
  }
}
