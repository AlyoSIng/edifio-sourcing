/**
 * Types et constantes partagés entre la page `/login`, le Client Component
 * `LoginForm.tsx` et la Server Action `signInWithOtpAction` (`./actions.ts`).
 *
 * Pourquoi un module dédié ?
 * Un fichier marqué `"use server"` ne peut exporter QUE des async functions
 * (cf. https://nextjs.org/docs/messages/invalid-use-server-value). Exporter
 * une constante ou un objet depuis `./actions.ts` provoque une 500 runtime
 * au premier appel de Server Action en production :
 *
 *   Error: A "use server" file can only export async functions, found object.
 *
 * On déplace donc `LoginState` (type — stripped par TS, neutre, mais on
 * regroupe par cohérence) et `initialLoginState` (objet runtime, fautif) ici.
 * Les types restent importables via `import type { LoginState } from "./types"`.
 */

/**
 * Cooldown anti-rate-limit Supabase Auth pour le renvoi de magic-link.
 *
 * Fallback côté UI : la valeur runtime côté serveur est lue depuis
 * `process.env.LOGIN_RESEND_COOLDOWN_MS` (cf. `./actions.ts`). Cette
 * constante sert :
 *   1. de défaut affiché côté UI quand aucun rate-limit n'est connu
 *      (formulaire idle, première saisie) ;
 *   2. de garde-fou côté tests Vitest (`actions.test.ts`).
 *
 * Override CI : `LOGIN_RESEND_COOLDOWN_MS=2000` pour les tests E2E
 * Playwright (cf. `.github/workflows/ci.yml`) → cooldown réduit à 2 s pour
 * que le test ne dure pas 60 s.
 */
export const RESEND_COOLDOWN_MS = 60_000;

/**
 * État rate-limit posé par la Server Action quand Supabase répond par un
 * 429 / `over_email_send_rate_limit`. Permet au formulaire de connaître :
 * - l'email pour lequel le quota est atteint (pour ne pas re-disabler le
 *   bouton si l'utilisateur change d'email) ;
 * - la deadline absolue (timestamp ms) à laquelle le bouton se ré-active.
 */
export type RateLimitedHint = {
  email: string;
  /** Timestamp absolu (ms) à partir duquel le renvoi est ré-autorisé. */
  deadlineMs: number;
};

export type LoginState =
  | { status: "idle" }
  | { status: "error"; message: string; rateLimited?: RateLimitedHint }
  | { status: "sent"; email: string };

export const initialLoginState: LoginState = { status: "idle" };
