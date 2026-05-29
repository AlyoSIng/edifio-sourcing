import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { PROVISIONAL_PASSWORD_TTL_HOURS } from "@/lib/auth/constants";
import { computeProvisionalExpiresAt } from "@/lib/auth/password";
import { generateProvisionalPassword } from "@/lib/auth/password-server";
import { isAdmin, toUserProfile, type Role, type UserMetadata } from "@/lib/auth/types";
import { sendWelcomeEmail } from "@/lib/email/send";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { users, memberships } from "@/db/schema/users";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";

/**
 * POST /api/admin/users — création d'un nouveau collaborateur AlyoS par un admin.
 *
 * Flow :
 *   1. Vérification admin (defense in depth : le middleware bloque déjà
 *      `/api/admin/*` aux non-admin, mais on re-checke ici au cas où).
 *   2. Validation des champs (email + role + first_name + last_name).
 *   3. Garde domaine `@alyosingenierie.fr` côté backend (impossible
 *      d'inviter un externe).
 *   4. Génération mot de passe provisoire + création user avec metadata.
 *   5. Envoi email Resend avec le provisoire.
 *   6. Audit log (stub — TODO post-ORM).
 *
 * Réponse JSON :
 *   - 201 { ok: true, user_id, expires_at }
 *   - 400 { ok: false, message } pour les erreurs de validation
 *   - 403 { ok: false, message } si l'appelant n'est pas admin
 *   - 409 { ok: false, message } si l'email existe déjà
 *   - 500 { ok: false, message } pour les erreurs serveur (Supabase, Resend)
 */

const VALID_ROLES: Role[] = ["admin", "user", "viewer"];
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // ---------- 1. Vérification admin ----------
    const supabase = createSupabaseServerClient();
    const {
      data: { user: caller },
    } = await supabase.auth.getUser();

    if (!caller || !caller.email) {
      return jsonError(401, "Authentification requise.");
    }
    if (!isAuthorizedEmail(caller.email)) {
      return jsonError(403, "Accès réservé aux membres AlyoS.");
    }
    const callerProfile = toUserProfile(caller);
    if (!isAdmin(callerProfile)) {
      return jsonError(403, "Réservé aux administrateurs.");
    }

    // ---------- 2. Validation ----------
    const fd = await req.formData().catch(() => null);
    if (!fd) return jsonError(400, "Corps de requête invalide (form-data attendu).");

    const email = String(fd.get("email") ?? "")
      .trim()
      .toLowerCase();
    const firstName = String(fd.get("first_name") ?? "").trim();
    const lastName = String(fd.get("last_name") ?? "").trim();
    const role = String(fd.get("role") ?? "") as Role;

    if (!email || !EMAIL_REGEX.test(email)) {
      return jsonError(400, "Adresse email invalide.");
    }
    if (!isAuthorizedEmail(email)) {
      return jsonError(
        400,
        "L'email doit appartenir au domaine @alyosingenierie.fr ou @edifio.fr.",
      );
    }
    if (!firstName || !lastName) {
      return jsonError(400, "Prénom et nom requis.");
    }
    if (!VALID_ROLES.includes(role)) {
      return jsonError(400, "Rôle invalide.");
    }

    // ---------- 3. Création user via admin API ----------
    const admin = createSupabaseAdminClient();

    const provisional = generateProvisionalPassword();
    const expiresAt = computeProvisionalExpiresAt(PROVISIONAL_PASSWORD_TTL_HOURS);

    const metadata: UserMetadata = {
      role,
      must_change_password: true,
      provisional_password_expires_at: expiresAt,
      first_name: firstName,
      last_name: lastName,
    };

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: provisional,
      email_confirm: true,
      user_metadata: metadata as Record<string, unknown>,
    });

    if (createErr || !created.user) {
      // Supabase renvoie une erreur lisible si l'email existe déjà.
      if (createErr && /already/i.test(createErr.message)) {
        return jsonError(409, "Un compte existe déjà pour cet email.");
      }
      console.error("[admin/users:createUser:fail]", { message: createErr?.message });
      return jsonError(500, "Impossible de créer le compte (Supabase).");
    }

    // ---------- 3b. Création public.users + membership ----------
    // Indispensable pour que la FK audit_logs.actor_id → public.users.id
    // ne rejette pas les futures insertions d'audit. Idempotent (onConflictDoNothing).
    try {
      await db
        .insert(users)
        .values({
          id: created.user.id,
          email,
          firstname: firstName,
          lastname: lastName,
        })
        .onConflictDoNothing();

      await db
        .insert(memberships)
        .values({
          organizationId: ALYOS_ORG_ID,
          userId: created.user.id,
          role,
        })
        .onConflictDoNothing();
    } catch (dbErr) {
      // Non-bloquant : le compte auth est créé, l'email partira quand même.
      // L'admin peut corriger via un backfill si besoin. Log structuré.
      console.error("[admin/users:db:fail]", {
        user_id: created.user.id,
        email,
        message: dbErr instanceof Error ? dbErr.message : String(dbErr),
      });
    }

    // ---------- 4. Email Resend ----------
    try {
      await sendWelcomeEmail({
        to: email,
        email,
        firstName,
        provisionalPassword: provisional,
        expiresAt,
        loginUrl: `${getSiteUrl()}/login`,
      });
    } catch (e) {
      // Le compte est créé en BDD mais l'email a foiré. On log côté serveur,
      // on renvoie un 207-like (success-with-warning) — le caller pourra
      // proposer de regénérer le provisoire ultérieurement.
      console.error("[admin/users:resend:fail]", {
        email,
        message: e instanceof Error ? e.message : String(e),
      });
      // On retourne quand même un succès avec un flag warning pour ne pas
      // bloquer l'admin — il peut copier le provisoire manuellement.
      return NextResponse.json(
        {
          ok: true,
          user_id: created.user.id,
          expires_at: expiresAt,
          warning: "Compte créé mais l'envoi email a échoué — contacter l'IT pour relayer.",
        },
        { status: 201 },
      );
    }

    // ---------- 5. Audit log ----------
    // GARDE-FOU SÉCURITÉ (Board Q1/B 2026-05-12) : ne JAMAIS inclure le
    // password provisoire dans le payload audit. Cf. JSDoc en-tête de
    // `src/lib/audit/index.ts` et `password-server.ts`.
    await audit({
      action: "membership_change",
      data: {
        target_user_id: created.user.id,
        target_email: email,
        to_role: role,
        operation: "invite",
      },
      subjectType: "user",
      subjectId: created.user.id,
      request: req,
    });

    return NextResponse.json(
      {
        ok: true,
        user_id: created.user.id,
        expires_at: expiresAt,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[admin/users:POST:unhandled]", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : null,
    });
    return jsonError(500, "Erreur serveur.");
  }
}

function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status });
}
