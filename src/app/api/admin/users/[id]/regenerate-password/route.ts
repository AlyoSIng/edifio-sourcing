import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
// ADR-014 (Steve 2026-06-05) — `isAuthorizedEmail` retiré : ouverture multi-tenant.
// La garde de rôle (`isAdmin`) et l'existence du user cible en BDD font office
// de garde-fou. Un admin de PROTECT peut regénérer le mot de passe de ses users.
import { PROVISIONAL_PASSWORD_TTL_HOURS } from "@/lib/auth/constants";
import { computeProvisionalExpiresAt } from "@/lib/auth/password";
import { generateProvisionalPassword } from "@/lib/auth/password-server";
import { isAdmin, toUserProfile, type UserMetadata } from "@/lib/auth/types";
import { sendWelcomeEmail } from "@/lib/email/send";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/users/[id]/regenerate-password
 *
 * Bouton « Renvoyer » dans /sourcing/admin/users (Board Q1/A.3 2026-05-12).
 *
 * Regénère un mot de passe provisoire pour un utilisateur existant et lui
 * renvoie l'email de bienvenue. Utile quand :
 *   - l'utilisateur a perdu / supprimé le premier email
 *   - le provisoire a expiré (TTL 24h) et un admin veut redonner l'accès
 *   - l'utilisateur veut rejouer son onboarding (cas marginal)
 *
 * Flow :
 *   1. Vérif appelant admin (defense in depth — le middleware bloque déjà
 *      /api/admin/* aux non-admin)
 *   2. Récupère le user via auth.admin.getUserById(id)
 *   3. Génère un nouveau password provisoire
 *   4. Update via auth.admin.updateUserById avec must_change_password=true
 *      et provisional_password_expires_at = now + 24h
 *   5. Envoie l'email Resend `welcome_provisional_password` (template
 *      réutilisé — le greeting est neutre, pas besoin d'un template
 *      dédié pour le MVP)
 *   6. Audit log `user_provisional_regenerated` (stub)
 *
 * Réponse :
 *   - 200 { ok: true, user_id, email, expires_at }
 *   - 401/403/404/500 { ok: false, message }
 */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const params = await props.params;
  try {
    // ---------- 1. Vérification admin ----------
    const supabase = createSupabaseServerClient();
    const {
      data: { user: caller },
    } = await supabase.auth.getUser();

    if (!caller || !caller.email) {
      return jsonError(401, "Authentification requise.");
    }
    // ADR-014 : pas de filtre domaine sur le caller — seule la garde de rôle reste.
    const callerProfile = toUserProfile(caller);
    if (!isAdmin(callerProfile)) {
      return jsonError(403, "Réservé aux administrateurs.");
    }

    // ---------- 2. Récupère le user cible ----------
    const targetId = params.id;
    if (!targetId || typeof targetId !== "string") {
      return jsonError(400, "Identifiant utilisateur manquant.");
    }

    const admin = createSupabaseAdminClient();
    const { data: targetData, error: getErr } = await admin.auth.admin.getUserById(targetId);
    if (getErr || !targetData?.user) {
      console.warn("[admin/users/regenerate:getUserById:fail]", {
        target_id: targetId,
        message: getErr?.message,
      });
      return jsonError(404, "Utilisateur introuvable.");
    }
    const target = targetData.user;
    const targetEmail = target.email ?? "";
    if (!targetEmail) {
      return jsonError(404, "Utilisateur introuvable (email manquant).");
    }
    // ADR-014 : pas de filtre domaine sur le user cible — n'importe quel
    // user invité par un admin peut voir son mot de passe regénéré.

    // ---------- 3. Génération + update ----------
    // GARDE-FOU SÉCURITÉ (Board Q1/B 2026-05-12) : ne JAMAIS logger
    // `provisional`. Cf. invariante dans `password-server.ts`.
    const provisional = generateProvisionalPassword();
    const expiresAt = computeProvisionalExpiresAt(PROVISIONAL_PASSWORD_TTL_HOURS);

    const currentMeta = (target.user_metadata ?? {}) as UserMetadata;
    const nextMeta: UserMetadata = {
      ...currentMeta,
      must_change_password: true,
      provisional_password_expires_at: expiresAt,
    };

    const { error: updErr } = await admin.auth.admin.updateUserById(targetId, {
      password: provisional,
      user_metadata: nextMeta as Record<string, unknown>,
    });

    if (updErr) {
      console.error("[admin/users/regenerate:updateUserById:fail]", {
        target_id: targetId,
        message: updErr.message,
      });
      return jsonError(500, "Impossible de regénérer le mot de passe (Supabase).");
    }

    // ---------- 4. Email Resend ----------
    // Le template welcome_provisional_password est suffisant pour le MVP —
    // copy neutre (« Bienvenue / Votre accès »). Si Léa veut un template
    // dédié "lien renvoyé" plus tard, on basculera.
    const firstName = (currentMeta.first_name ?? "").toString();
    try {
      await sendWelcomeEmail({
        to: targetEmail,
        email: targetEmail,
        firstName,
        provisionalPassword: provisional,
        expiresAt,
        loginUrl: `${getSiteUrl()}/login`,
      });
    } catch (e) {
      console.error("[admin/users/regenerate:resend:fail]", {
        email: targetEmail,
        message: e instanceof Error ? e.message : String(e),
      });
      return NextResponse.json(
        {
          ok: true,
          user_id: targetId,
          email: targetEmail,
          expires_at: expiresAt,
          warning: "Mot de passe regénéré mais l'envoi email a échoué — contacter l'IT.",
        },
        { status: 200 },
      );
    }

    // ---------- 5. Audit log ----------
    // Action mappée sur A2 `membership_change` avec `operation: "regenerate_provisional"`
    // (amendement spec 2026-05-20, validé CTO Sophie — cf.
    // `handoff/ANSWER_260520_1810_ETENDRE_A2_OPERATION_REGEN.md`).
    // GARDE-FOU : on ne logge JAMAIS le password en clair.
    const currentRole = (currentMeta.role ?? "user") as "admin" | "user" | "viewer";
    await audit({
      action: "membership_change",
      data: {
        target_user_id: targetId,
        target_email: targetEmail,
        from_role: currentRole,
        to_role: currentRole,
        operation: "regenerate_provisional",
      },
      subjectType: "user",
      subjectId: targetId,
      request: req,
    });

    return NextResponse.json(
      {
        ok: true,
        user_id: targetId,
        email: targetEmail,
        expires_at: expiresAt,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[admin/users/regenerate:POST:unhandled]", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : null,
    });
    return jsonError(500, "Erreur serveur.");
  }
}

function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status });
}
