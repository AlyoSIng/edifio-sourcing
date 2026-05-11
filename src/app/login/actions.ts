"use server";

import { isAuthorizedEmail } from "@/lib/auth/domain";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { getCooldownMs, isSupabaseRateLimitError } from "./rate-limit";
import type { LoginState } from "./types";

/**
 * Server Action — envoi du magic-link Supabase Auth.
 *
 * Source : `specs/middleware_domain_gate.md` + flux `signInWithOtp` Supabase.
 *
 * Validation côté serveur AVANT envoi du magic-link :
 * 1. Email non vide + format basique (regex `local@host.tld`).
 * 2. Domaine `@alyosingenierie.fr` (réutilise `isAuthorizedEmail` étape 2).
 *    Refus pré-envoi → on ne consomme pas de magic-link inutile et on ne
 *    laisse pas une fuite d'info sur l'existence des comptes.
 *
 * Détection rate-limit Supabase (renvoyé via `LoginState.rateLimited`) :
 *  - `error.status === 429` (HTTP) ;
 *  - `error.code === "over_email_send_rate_limit"` (code Supabase officiel) ;
 *  - filet regex `/rate.?limit/i.test(error.message)` au cas où Supabase
 *    change le code en version mineure (résilience).
 * Voir `./rate-limit.ts` pour le détail (module séparé car non `"use server"`).
 *
 * Si l'utilisateur n'existe pas encore dans Supabase Auth, il sera auto-créé
 * à la confirmation du magic-link (`shouldCreateUser: true` par défaut).
 * Cohérent avec « 1 seule organisation au MVP : AlyoS » — la table
 * `memberships` (Gate 5 schéma 22+ tables) sera peuplée à l'étape 7.
 */

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// NB : `LoginState`, `RateLimitedHint`, `initialLoginState` et la constante
// `RESEND_COOLDOWN_MS` vivent dans `./types.ts`. Un fichier `"use server"` ne
// peut exporter QUE des async functions. Cf. ce module pour le détail et le
// lien Next.js correspondant.

export async function signInWithOtpAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  // Garde-fou défensif global — toute exception non capturée par la logique
  // ci-dessous (par exemple `requireEnv` qui throw si une var Supabase
  // manque en runtime Vercel) provoque une 500 Server Components render et
  // un écran blanc opaque côté utilisateur. On préfère logger côté serveur
  // et renvoyer un état d'erreur lisible côté UI.
  try {
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

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${getSiteUrl()}/auth/callback`,
      },
    });

    if (error) {
      // Détection rate-limit prioritaire : on renvoie une `deadlineMs`
      // explicite pour que le formulaire affiche un countdown et désactive
      // le bouton « Renvoyer le lien » jusqu'à l'expiration du cooldown.
      if (isSupabaseRateLimitError(error)) {
        const cooldownMs = getCooldownMs();
        const deadlineMs = Date.now() + cooldownMs;
        console.warn("[signInWithOtp:rate_limited]", error.message, { email, deadlineMs });
        return {
          status: "error",
          message:
            "Un lien vient d'être demandé pour cet email. Pas reçu ? Renvoie-toi un lien dans 60 secondes.",
          rateLimited: { email, deadlineMs },
        };
      }

      // Autres erreurs Supabase (infra, config). On n'expose pas le détail
      // côté client pour ne pas faciliter le probing.
      console.error("[signInWithOtp:error]", error.message, { email });
      return {
        status: "error",
        message: "Impossible d'envoyer le lien pour le moment. Réessaye dans une minute.",
      };
    }

    return { status: "sent", email };
  } catch (err) {
    // Cible typique : `requireEnv` qui throw parce qu'une var Supabase
    // n'est pas posée sur le scope Vercel courant (par ex. Preview vs
    // Production), ou un module Node non compatible serverless.
    console.error("[signInWithOtpAction:unhandled]", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : null,
    });
    return {
      status: "error",
      message: "Erreur technique côté serveur. L'équipe a été notifiée — réessaye dans une minute.",
    };
  }
}
