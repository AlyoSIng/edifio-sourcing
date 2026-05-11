/**
 * Helpers de détection du rate-limit Supabase Auth.
 *
 * Module séparé (pas marqué `"use server"`) pour pouvoir être importé
 * librement depuis la Server Action (`./actions.ts`) ET depuis les tests
 * unitaires (`./actions.test.ts`). Un fichier `"use server"` ne peut exporter
 * QUE des async functions — interdit pour une fonction synchrone comme
 * `isSupabaseRateLimitError`.
 *
 * Source : codes d'erreur publics Supabase Auth (officiel `over_email_send_rate_limit`)
 * + statut HTTP 429 + filet regex pour la résilience inter-versions.
 */

import { RESEND_COOLDOWN_MS } from "./types";

/**
 * Heuristique de détection d'un rate-limit Supabase Auth.
 *
 * Trois signaux possibles, du plus stable au plus défensif :
 *   1. `status === 429` (HTTP standard, robuste à long terme) ;
 *   2. `code === "over_email_send_rate_limit"` (code officiel Supabase) ;
 *   3. message contient « rate limit » (filet de sécurité au cas où le
 *      `code` change en version mineure).
 *
 * Conserve une signature large (champs optionnels) pour ne pas dépendre du
 * type concret de `AuthError` de `@supabase/supabase-js` — le code reste
 * compilable même si Supabase enrichit son type d'erreur plus tard.
 */
export function isSupabaseRateLimitError(error: {
  status?: number;
  code?: string;
  message?: string;
}): boolean {
  if (error.status === 429) return true;
  if (error.code === "over_email_send_rate_limit") return true;
  if (typeof error.message === "string" && /rate.?limit/i.test(error.message)) return true;
  return false;
}

/**
 * Lit le cooldown configuré côté env (override CI à 2 000 ms) avec fallback
 * sur la constante UI (60 000 ms). Lu à chaque invocation pour que le
 * basculement preview ↔ tests E2E ne nécessite pas de rebuild.
 */
export function getCooldownMs(): number {
  const raw = process.env.LOGIN_RESEND_COOLDOWN_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : RESEND_COOLDOWN_MS;
}
