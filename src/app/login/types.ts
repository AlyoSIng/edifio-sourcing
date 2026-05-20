/**
 * Types — Server Action `signInWithPasswordAction`.
 *
 * Pivot Board 2026-05-11 : on abandonne le magic-link (`{status:"sent"}`,
 * cooldown ad hoc) au profit d'email + password durable.
 *
 * Ajustement Board 2026-05-12 Q4/A : on réintroduit un cooldown dédié au
 * rate-limit login (5 tentatives / 15 min → blocage 15 min côté Supabase
 * Auth). La détection du 429 côté Server Action peuple `rateLimitedUntil`
 * (timestamp absolu en ms) et le formulaire affiche un countdown.
 *
 * Pourquoi un module dédié ? Un fichier `"use server"` ne peut exporter QUE
 * des async functions (cf. https://nextjs.org/docs/messages/invalid-use-server-value).
 * Toutes les constantes / types exportés en runtime vivent ici.
 */

export type LoginState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      /**
       * Timestamp absolu (ms epoch) jusqu'auquel le bouton submit doit
       * rester désactivé côté UI. Présent uniquement si Supabase a répondu
       * un 429 (rate-limit). `undefined` sur toutes les autres erreurs.
       */
      rateLimitedUntil?: number;
    };

export const initialLoginState: LoginState = { status: "idle" };
