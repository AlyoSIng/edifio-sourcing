"use server";

import { isAuthorizedEmail } from "@/lib/auth/domain";
import { sendPasswordResetEmail } from "@/lib/email/send";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

import type { ForgotPasswordState } from "./types";

/**
 * Server Action — demande de réinitialisation de mot de passe.
 *
 * Pivot Board 2026-05-11 : on n'utilise PAS `supabase.auth.resetPasswordForEmail`
 * qui envoie l'email via Supabase. À la place :
 *   1. `auth.admin.generateLink({ type: "recovery", email })` côté serveur
 *      (service_role) → on récupère l'URL de récupération.
 *   2. On envoie nous-mêmes l'email via Resend (cf. `lib/email/send.ts`).
 *
 * Anti-énumération : la réponse est TOUJOURS `{status:"sent"}` (succès apparent).
 * Les erreurs réelles (email inconnu, erreur Supabase, erreur Resend) sont
 * loguées côté serveur uniquement.
 */

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function requestPasswordResetAction(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  try {
    const emailRaw = formData.get("email");
    if (typeof emailRaw !== "string" || emailRaw.trim().length === 0) {
      // Même en validation locale, on conserve le succès apparent — on évite
      // de donner au scanner un signal binaire « format invalide » vs
      // « envoyé ». La validation HTML5 `required` empêche déjà cet état en
      // pratique.
      return { status: "sent" };
    }

    const email = emailRaw.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email) || !isAuthorizedEmail(email)) {
      // On log discrètement pour le debug, mais on renvoie succès.
      console.warn("[forgot-password:filtered]", { reason: "format_or_domain", email });
      return { status: "sent" };
    }

    const admin = createSupabaseAdminClient();
    // Route le retour de Supabase via /auth/callback pour que le
    // ClientCallbackHandler décode le fragment d'URL (#access_token=…) que
    // /auth/v1/verify pose en mode implicit flow. Sans cette indirection, la
    // session n'est jamais établie sur localhost (cookies posés côté Supabase
    // uniquement) et /reset-password affiche "Lien invalide". Une fois la
    // session posée par setSession, le callback redirige sur /reset-password
    // qui détecte la session et affiche le form en mode recovery.
    const redirectTo = `${getSiteUrl()}/auth/callback?next=/reset-password`;

    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (error || !data?.properties?.action_link) {
      console.warn("[forgot-password:generateLink:fail]", {
        email,
        message: error?.message ?? "no action_link",
      });
      return { status: "sent" };
    }

    // Envoi via Resend — tout est tracé côté `lib/email/send.ts`. Si Resend
    // est offline ou non configuré, on log mais on renvoie quand même succès.
    try {
      // Le prénom n'est pas dispo côté admin (pas de query directe). Première
      // version : on envoie sans prénom (le template gère). Une vraie
      // récupération via `auth.admin.listUsers` est possible mais coûteuse
      // pour une UX 1-shot — à raffiner si Léa le demande.
      await sendPasswordResetEmail({
        to: email,
        firstName: null,
        resetUrl: data.properties.action_link,
      });
    } catch (e) {
      console.error("[forgot-password:resend:fail]", {
        message: e instanceof Error ? e.message : String(e),
      });
    }

    return { status: "sent" };
  } catch (err) {
    console.error("[requestPasswordResetAction:unhandled]", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : null,
    });
    // Toujours succès apparent — défense en profondeur.
    return { status: "sent" };
  }
}
