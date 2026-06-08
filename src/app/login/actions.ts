"use server";

import { redirect } from "next/navigation";

import { LOGIN_RATE_LIMIT_COOLDOWN_MS } from "@/lib/auth/constants";
import { isProvisionalPasswordExpired, mustChangePassword, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { isRateLimitError } from "./rate-limit";
import type { LoginState } from "./types";

/**
 * Server Action — connexion email + password (pivot Board 2026-05-11).
 *
 * Remplace le précédent `signInWithOtpAction`.
 *
 * Garde-fous :
 * 1. Validation format email + présence password AVANT appel Supabase
 *    (économise un round-trip et n'expose pas l'API rate-limit).
 * 2. PAS de pré-validation de domaine ici : le contrôle `@alyosingenierie.fr`
 *    est 100 % à la charge du middleware (cf. `specs/middleware_domain_gate.md`
 *    §0 — source unique de vérité, anti-divergence).
 * 3. Message d'erreur générique « Email ou mot de passe incorrect » — anti-
 *    énumération (on ne distingue jamais email inconnu / password invalide).
 * 4. Si la connexion réussit mais que `provisional_password_expires_at` est
 *    dans le passé ET `must_change_password === true`, on `signOut` et on
 *    renvoie un message explicite « provisoire expiré, contacte l'admin ».
 * 5. Détection rate-limit Supabase (Board Q4/A 2026-05-12) : 5 tentatives /
 *    15 min → blocage 15 min côté Supabase Auth. Quand le 429 remonte, on
 *    renvoie `rateLimitedUntil` pour que l'UI affiche un countdown visible.
 *
 * Note middleware : si `must_change_password === true` (et provisoire pas
 * expiré), le middleware redirigera l'utilisateur vers `/reset-password`
 * lors de sa première requête après login. Pas besoin de le faire ici.
 */

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Destination par défaut après login (peut être surclassée par `?next=...`). */
const DEFAULT_NEXT = "/sourcing/ao-du-jour";

/**
 * Sanitize la valeur `next` du form pour éviter l'open-redirect.
 * Accepte uniquement un path absolu interne (`/...`).
 */
function sanitizeNext(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_NEXT;
  if (!value.startsWith("/")) return DEFAULT_NEXT;
  if (value.startsWith("//")) return DEFAULT_NEXT;
  if (value.includes("\\")) return DEFAULT_NEXT;
  return value;
}

export async function signInWithPasswordAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  let redirectTo: string | null = null;

  try {
    const emailRaw = formData.get("email");
    const passwordRaw = formData.get("password");
    const next = sanitizeNext(formData.get("next"));

    if (typeof emailRaw !== "string" || emailRaw.trim().length === 0) {
      return { status: "error", message: "Veuillez saisir votre email." };
    }
    if (typeof passwordRaw !== "string" || passwordRaw.length === 0) {
      return { status: "error", message: "Veuillez saisir votre mot de passe." };
    }

    const email = emailRaw.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      return { status: "error", message: "Adresse email invalide." };
    }

    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: passwordRaw,
    });

    if (error || !data.user) {
      // Cas rate-limit : message explicite + deadline countdown. Pas
      // anti-énumération nécessaire ici : l'attaquant SAIT déjà qu'il a
      // dépassé son quota (il a forcément essayé plusieurs fois).
      if (isRateLimitError(error)) {
        console.warn("[signInWithPassword:rate_limited]", {
          email,
          message: error?.message,
        });
        return {
          status: "error",
          message: "Trop de tentatives. Réessaye dans quelques minutes.",
          rateLimitedUntil: Date.now() + LOGIN_RATE_LIMIT_COOLDOWN_MS,
        };
      }

      // Anti-énumération : message générique pour « email inconnu » et
      // « password incorrect ». On log côté serveur pour debug.
      console.warn("[signInWithPassword:fail]", { email, message: error?.message });
      return { status: "error", message: "Email ou mot de passe incorrect." };
    }

    // Vérification provisoire expiré : on ne laisse PAS l'utilisateur se
    // connecter avec un provisoire périmé. Il doit demander un nouveau
    // provisoire à un admin (cf. brief §5 — étape 5 middleware).
    const profile = toUserProfile(data.user);
    if (mustChangePassword(profile) && isProvisionalPasswordExpired(profile)) {
      await supabase.auth.signOut();
      return {
        status: "error",
        message:
          "Votre mot de passe provisoire a expiré. Demande à un administrateur AlyoS un nouveau lien d'accès.",
      };
    }

    // Si l'utilisateur doit changer son mot de passe (flow first-login avec
    // provisoire valide), on shunte la cible `next` et on l'envoie
    // directement sur /reset-password. Le middleware sait aussi le faire,
    // mais le passage par `next` (= /sourcing/ao-du-jour par défaut)
    // déclenche en pratique une chaîne Server Action → fetch RSC interne
    // qui n'embarque pas toujours le cookie auth fraîchement posé — résultat,
    // la redirection arrivait avec plusieurs secondes de retard sur CI
    // (constaté sur les traces E2E de la PR auth-pivot). On décide
    // directement ici puisque le profil est déjà chargé : défense en
    // profondeur + comportement déterministe côté tests.
    if (mustChangePassword(profile)) {
      redirectTo = "/reset-password";
    } else {
      redirectTo = next;
    }
  } catch (err) {
    console.error("[signInWithPasswordAction:unhandled]", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : null,
    });
    return {
      status: "error",
      message: "Erreur technique côté serveur. L'équipe a été notifiée — réessaye dans une minute.",
    };
  }

  // `redirect()` throw un `NEXT_REDIRECT` qui doit s'échapper du try/catch.
  // On l'appelle après le bloc try pour ne pas le confondre avec une erreur
  // imprévue. La cible est résolue plus haut : `/reset-password` pour les
  // users provisoires, `next` (sanitizé) sinon. Le middleware reste la
  // ligne de défense pour les accès directs (URL collée, bookmark).
  if (redirectTo) redirect(redirectTo);
  return { status: "idle" };
}
