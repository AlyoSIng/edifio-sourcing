"use server";

import { PROVISIONAL_PASSWORD_TTL_HOURS } from "@/lib/auth/constants";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { computeProvisionalExpiresAt } from "@/lib/auth/password";
import { generateProvisionalPassword } from "@/lib/auth/password-server";
import type { UserMetadata } from "@/lib/auth/types";
import { sendWelcomeProvisionalPassword } from "@/lib/email/send";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

import type { ForgotPasswordState } from "./types";

/**
 * Server Action — demande de réinitialisation de mot de passe (ADR-011 couche 3).
 *
 * **Pivot 2026-05-14 (ADR-011)** : on abandonne le flow Supabase
 * `generateLink({type:"recovery"})` qui envoie un lien tokenisé à usage
 * unique — consommable par le scanner email d'entreprise AlyoS qui
 * pré-clique tous les liens entrants pour vérification sécurité. À la place,
 * on regénère un mot de passe provisoire (16 car. URL-safe) qu'on pose via
 * `admin.updateUserById` + on l'envoie en clair par Resend (variant `reset`
 * du template welcome_provisional_password). L'utilisateur retourne sur
 * `/login`, saisit son email + le provisoire, puis le middleware le force-
 * redirige vers `/reset-password` (must_change_password=true) pour qu'il
 * choisisse son mot de passe définitif.
 *
 * Anti-énumération : la réponse est TOUJOURS `{status:"sent"}` (succès
 * apparent). Les erreurs réelles (email inconnu, erreur Supabase, erreur
 * Resend) sont loguées côté serveur uniquement.
 *
 * Cf. `specs/adr_011_auth_strategy_post_scanner.md`.
 */

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Recherche un utilisateur par email via l'admin API. Le SDK Supabase
 * n'expose pas de `getUserByEmail` — on `listUsers` paginé puis on filtre.
 * Suffisant à l'échelle AlyoS interne (~20 collaborateurs MVP).
 */
async function findUserByEmail(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  email: string,
): Promise<{ id: string; metadata: UserMetadata; firstName: string } | null> {
  const lowered = email.toLowerCase();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) {
    console.error("[forgot-password:listUsers:fail]", { message: error.message });
    return null;
  }
  const found = (data?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === lowered);
  if (!found) return null;
  const metadata = (found.user_metadata ?? {}) as UserMetadata;
  return {
    id: found.id,
    metadata,
    firstName: (metadata.first_name ?? "").toString(),
  };
}

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
      console.warn("[forgot-password:filtered]", { reason: "format_or_domain", email });
      return { status: "sent" };
    }

    const admin = createSupabaseAdminClient();

    const target = await findUserByEmail(admin, email);
    if (!target) {
      // Anti-énumération : on log côté serveur mais on renvoie succès.
      console.warn("[forgot-password:user_not_found]", { email });
      return { status: "sent" };
    }

    // Génération + update via admin API. GARDE-FOU SÉCURITÉ
    // (Board Q1/B 2026-05-12, cf. `password-server.ts`) : ne JAMAIS logger
    // `provisional`. Cf. invariante du module générateur.
    const provisional = generateProvisionalPassword();
    const expiresAt = computeProvisionalExpiresAt(PROVISIONAL_PASSWORD_TTL_HOURS);
    const nowIso = new Date().toISOString();

    const nextMeta: UserMetadata = {
      ...target.metadata,
      must_change_password: true,
      provisional_password_expires_at: expiresAt,
      // Trace métier — utile en debug / audit pour distinguer un provisoire
      // posé par invitation admin d'un reset à l'initiative du user.
      password_reset_at: nowIso,
    };

    const { error: updErr } = await admin.auth.admin.updateUserById(target.id, {
      password: provisional,
      user_metadata: nextMeta as Record<string, unknown>,
    });

    if (updErr) {
      console.error("[forgot-password:updateUserById:fail]", {
        email,
        message: updErr.message,
      });
      return { status: "sent" };
    }

    // Envoi via Resend — tracé côté `lib/email/send.ts`. Si Resend est
    // offline ou non configuré, on log mais on renvoie quand même succès
    // apparent (défense en profondeur).
    try {
      await sendWelcomeProvisionalPassword({
        to: email,
        email,
        firstName: target.firstName,
        provisionalPassword: provisional,
        expiresAt,
        loginUrl: `${getSiteUrl()}/login`,
        variant: "reset",
      });
    } catch (e) {
      console.error("[forgot-password:resend:fail]", {
        email,
        message: e instanceof Error ? e.message : String(e),
      });
    }

    // Audit log (stub — TODO post-ORM). Pattern cohérent avec
    // `user_invited` et `user_provisional_regenerated` : on ne JAMAIS inclure
    // le password en clair.
    console.warn("[audit_log:password_reset_requested]", {
      target_user_id: target.id,
      target_email: email,
    });

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
