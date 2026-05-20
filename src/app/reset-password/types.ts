/**
 * Types — Server Action `updatePasswordAction`.
 *
 * Deux contextes d'usage :
 *   - flow `recovery` : utilisateur arrive depuis un email reset (token en URL)
 *   - flow `first-login` : utilisateur connecté avec must_change_password=true
 *
 * La même action gère les deux : elle exchange le code s'il y en a un, sinon
 * elle s'appuie sur la session courante.
 */

export type ResetPasswordState = { status: "idle" } | { status: "error"; message: string };

export const initialResetPasswordState: ResetPasswordState = { status: "idle" };
