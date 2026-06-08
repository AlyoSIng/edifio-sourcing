"use server";

import { redirect } from "next/navigation";

import { passwordErrorLabel, validatePasswordStrengthServer } from "@/lib/auth/password";
import { toUserProfile, type UserMetadata } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ResetPasswordState } from "./types";

/**
 * Server Action — définit le mot de passe définitif de l'utilisateur courant.
 *
 * **ADR-011 couche 3** : depuis l'abandon du flow recovery tokenisé Supabase
 * (token consommé par le scanner email d'entreprise AlyoS), il n'existe plus
 * qu'un seul chemin pour arriver ici — le user vient de se connecter avec
 * son mot de passe provisoire (issu d'une invitation admin OU d'un
 * `forgot-password` qui a regénéré un provisoire et l'a envoyé par Resend).
 * Le middleware le force-redirige sur `/reset-password` parce que
 * `must_change_password === true`. La session est donc déjà établie en
 * arrivant sur cette action ; il suffit de :
 *
 *   1. valider la force du nouveau mot de passe,
 *   2. update le password + reset les flags metadata,
 *   3. rediriger vers `/sourcing/ao-du-jour`.
 *
 * Plus de branche PKCE (`?code`) ni recovery implicit (fragment
 * `#access_token`) : ces deux chemins sont morts depuis l'ADR-011.
 *
 * Cf. `specs/adr_011_auth_strategy_post_scanner.md`.
 */
export async function updatePasswordAction(
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  let redirectTo: string | null = null;

  try {
    const password = formData.get("password");
    const confirm = formData.get("confirm");

    if (typeof password !== "string" || password.length === 0) {
      return { status: "error", message: "Veuillez saisir un nouveau mot de passe." };
    }
    if (typeof confirm !== "string" || confirm.length === 0) {
      return { status: "error", message: "Veuillez confirmer le mot de passe." };
    }
    if (password !== confirm) {
      return { status: "error", message: "Les deux mots de passe ne correspondent pas." };
    }

    // Validation force serveur (en plus du client). On utilise la variante
    // SERVER qui couvre en plus la liste 10k SecLists — défense en profondeur
    // contre le brute-force par dictionnaire (Board 2026-05-29, Lot 3 v2).
    const strength = validatePasswordStrengthServer(password);
    if (!strength.valid) {
      return {
        status: "error",
        message: strength.errors.map(passwordErrorLabel).join(" "),
      };
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // Session absente / expirée — l'utilisateur doit recommencer depuis
      // « Mot de passe oublié » qui lui regénèrera un provisoire.
      return {
        status: "error",
        message: "Session expirée. Recommence la procédure depuis la page « Mot de passe oublié ».",
      };
    }

    // Reset des flags metadata associés au provisoire. `password_reset_at`
    // est conservé tel quel pour la trace audit ; seules les deux clés qui
    // décrivent l'état « provisoire actif » sont remises à zéro.
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
    });

    // Le user a remplacé son provisoire par un mot de passe durable — on
    // l'envoie directement dans l'app, pas besoin de re-saisir.
    redirectTo = "/sourcing/ao-du-jour";
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
