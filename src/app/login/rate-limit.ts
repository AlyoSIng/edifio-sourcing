/**
 * Helpers — détection rate-limit Supabase Auth côté login.
 *
 * Module séparé de `./actions.ts` parce qu'un fichier `"use server"` ne peut
 * exporter QUE des async functions (Next.js 14). On veut pouvoir importer
 * `isRateLimitError` depuis un test Vitest sans déclencher le pipeline
 * Server Actions.
 *
 * Source de vérité du comportement : Board Q4/A 2026-05-12.
 */

/**
 * Détecte un rate-limit Supabase à partir de l'erreur retournée par
 * `supabase.auth.signInWithPassword`.
 *
 * On reconnaît trois signaux possibles (selon version `@supabase/supabase-js`) :
 *   - `error.status === 429` — status HTTP transporté sur AuthError
 *   - `error.code === "over_request_rate_limit"` — code applicatif récent
 *   - `/rate.?limit/i` sur le message brut — fallback texte
 *
 * Si aucun signal n'est présent, on retourne `false` et l'erreur est traitée
 * comme un identifiant invalide (message générique anti-énumération).
 */
export function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; code?: string; message?: string };
  if (e.status === 429) return true;
  if (typeof e.code === "string" && e.code === "over_request_rate_limit") return true;
  if (typeof e.message === "string" && /rate.?limit/i.test(e.message)) return true;
  return false;
}
