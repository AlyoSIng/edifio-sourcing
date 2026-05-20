/**
 * Types — Server Action `requestPasswordResetAction`.
 *
 * On garde une seule réponse de succès apparent (`{status:"sent"}`) pour
 * tous les cas — anti-énumération : un attaquant ne doit pas pouvoir
 * deviner si un email existe en BDD en observant la réponse.
 */

export type ForgotPasswordState = { status: "idle" } | { status: "sent" };

export const initialForgotPasswordState: ForgotPasswordState = { status: "idle" };
