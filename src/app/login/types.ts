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

export type LoginState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "sent"; email: string };

export const initialLoginState: LoginState = { status: "idle" };
