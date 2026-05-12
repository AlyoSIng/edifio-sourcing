"use server";

import { redirect } from "next/navigation";

import { passwordErrorLabel, validatePasswordStrength } from "@/lib/auth/password";
import { toUserProfile, type UserMetadata } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ResetPasswordState } from "./types";

/**
 * Server Action — définit ou réinitialise le mot de passe de l'utilisateur
 * courant.
 *
 * Deux flows :
 *
 * 1. **Recovery** — l'utilisateur arrive depuis un lien email avec `code` en
 *    URL. La page passe ce `code` à l'action via le formulaire hidden field.
 *    On échange le code contre une session via `exchangeCodeForSession`, puis
 *    on met à jour le password.
 *
 * 2. **First-login** — l'utilisateur est déjà connecté (session valide) avec
 *    `must_change_password === true`. Pas de `code`. On met à jour le
 *    password + on remet à zéro les flags metadata.
 *
 * Validation côté serveur : force du mot de passe + confirmation match.
 * Audit log de l'action (TODO étape post-ORM — pour le moment console.warn).
 */
export async function updatePasswordAction(
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  let redirectTo: string | null = null;

  try {
    const password = formData.get("password");
    const confirm = formData.get("confirm");
    const code = formData.get("code");

    if (typeof password !== "string" || password.length === 0) {
      return { status: "error", message: "Veuillez saisir un nouveau mot de passe." };
    }
    if (typeof confirm !== "string" || confirm.length === 0) {
      return { status: "error", message: "Veuillez confirmer le mot de passe." };
    }
    if (password !== confirm) {
      return { status: "error", message: "Les deux mots de passe ne correspondent pas." };
    }

    // Validation force serveur (en plus du client).
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return {
        status: "error",
        message: strength.errors.map(passwordErrorLabel).join(" "),
      };
    }

    const supabase = createSupabaseServerClient();

    // Flow 1 : recovery — on échange d'abord le code contre une session.
    if (typeof code === "string" && code.length > 0) {
      const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exchErr) {
        console.warn("[reset-password:exchange:fail]", { message: exchErr.message });
        return {
          status: "error",
          message:
            "Le lien de réinitialisation est invalide ou a expiré. Refaites une demande depuis « Mot de passe oublié ».",
        };
      }
    }

    // À ce stade on doit avoir une session — soit du flow recovery, soit du
    // flow first-login (user déjà loggé).
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        status: "error",
        message:
          "Session expirée. Recommencez la procédure depuis la page « Mot de passe oublié ».",
      };
    }

    // Reset des flags metadata associés au provisoire (s'ils étaient posés).
    const currentMeta = (user.user_metadata ?? {}) as UserMetadata;
    const nextMeta: UserMetadata = {
      ...currentMeta,
      must_change_password: false,
      provisional_password_expires_at: null,
    };

    const { error: updErr } = await supabase.auth.updateUser({
      password,
      data: nextMeta as Record<string, unknown>,
    });

    if (updErr) {
      console.error("[reset-password:updateUser:fail]", { message: updErr.message });
      return {
        status: "error",
        message: "Impossible de définir le mot de passe pour le moment. Réessaye dans une minute.",
      };
    }

    // TODO post-ORM : INSERT audit_logs (action = 'password_updated', actor = user.id, ...)
    // Cf. `specs/audit_log_v1.md`. Pour le moment on log côté serveur uniquement.
    const profile = toUserProfile(user);
    console.warn("[audit_log:password_updated]", {
      user_id: profile.id,
      email: profile.email,
      flow: code ? "recovery" : "first_login",
    });

    // Décision : on signe-out l'utilisateur côté recovery (sécurité — il
    // re-saisira son nouveau mot de passe ; cohérent avec le comportement
    // des outils SaaS habituels). En flow first-login, on le laisse connecté
    // et on l'envoie directement dans l'app.
    if (code) {
      await supabase.auth.signOut();
      redirectTo = "/login?notice=password_updated";
    } else {
      redirectTo = "/sourcing/ao-du-jour";
    }
  } catch (err) {
    console.error("[updatePasswordAction:unhandled]", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : null,
    });
    return {
      status: "error",
      message: "Erreur technique côté serveur. L'équipe a été notifiée — réessaye dans une minute.",
    };
  }

  if (redirectTo) redirect(redirectTo);
  return { status: "idle" };
}
