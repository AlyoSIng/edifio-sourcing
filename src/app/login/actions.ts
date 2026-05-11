"use server";

import { isAuthorizedEmail } from "@/lib/auth/domain";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server Action — envoi du magic-link Supabase Auth.
 *
 * Source : `specs/middleware_domain_gate.md` + flux `signInWithOtp` Supabase.
 *
 * Validation côté serveur AVANT envoi du magic-link :
 * 1. Email non vide + format basique (regex `local@host.tld`).
 * 2. Domaine `@alyosingenierie.fr` (réutilise `isAuthorizedEmail` étape 2).
 *    Refus pré-envoi → on ne consomme pas de magic-link inutile et on ne
 *    laisse pas une fuite d'info sur l'existence d'utilisateurs non Alyos.
 *
 * Si l'utilisateur n'existe pas encore dans Supabase Auth, il sera auto-créé
 * à la confirmation du magic-link (`shouldCreateUser: true` par défaut).
 * Cohérent avec « 1 seule organisation au MVP : AlyoS » — la table
 * `memberships` (Gate 5 schéma 22+ tables) sera peuplée à l'étape 7.
 */

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type LoginState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "sent"; email: string };

export const initialLoginState: LoginState = { status: "idle" };

export async function signInWithOtpAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const emailRaw = formData.get("email");
  if (typeof emailRaw !== "string" || emailRaw.trim().length === 0) {
    return { status: "error", message: "Veuillez saisir votre email." };
  }

  const email = emailRaw.trim().toLowerCase();

  if (!EMAIL_REGEX.test(email)) {
    return { status: "error", message: "Adresse email invalide." };
  }

  if (!isAuthorizedEmail(email)) {
    return {
      status: "error",
      message:
        "Accès réservé aux emails @alyosingenierie.fr. Si tu penses qu'il s'agit d'une erreur, contacte l'équipe IT.",
    };
  }

  const supabase = createSupabaseServerClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    // Erreur Supabase (rate limiting, infra, etc.). On n'expose pas le
    // détail côté client pour ne pas faciliter le probing.
    console.error("[signInWithOtp:error]", error.message, { email });
    return {
      status: "error",
      message: "Impossible d'envoyer le lien pour le moment. Réessaye dans une minute.",
    };
  }

  return { status: "sent", email };
}
