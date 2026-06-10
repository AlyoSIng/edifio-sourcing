import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
// ADR-014 (Steve 2026-06-05) — `isAuthorizedEmail` retiré : ouverture multi-tenant.
// L'admin de chaque org peut désormais inviter n'importe quel email — la garde est
// la garde de rôle (`isAdmin`) qui reste en place ci-dessous.
import { PROVISIONAL_PASSWORD_TTL_HOURS } from "@/lib/auth/constants";
import { computeProvisionalExpiresAt } from "@/lib/auth/password";
import { generateProvisionalPassword } from "@/lib/auth/password-server";
import { isAdmin, toUserProfile, type Role, type UserMetadata } from "@/lib/auth/types";
import { sendWelcomeEmail } from "@/lib/email/send";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { users, memberships } from "@/db/schema/users";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";

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
 *   6. Audit log `membership_change` (operation=`invite`) via helper `audit()`.
 *      Insertion réelle dans `audit_logs` — best-effort, non bloquant.
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
    const supabase = await createSupabaseServerClient();
    const {
      data: { user: caller },
    } = await supabase.auth.getUser();

    if (!caller || !caller.email) {
      return jsonError(401, "Authentification requise.");
    }
    // ADR-014 : le filtre `isAuthorizedEmail(caller.email)` a été retiré.
    // Seule la garde de rôle reste appliquée — un admin de PROTECT pourra
    // inviter des users `@protect-marseille.com`, un admin AlyoS des
    // `@alyosingenierie.fr`, etc.
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
    // ADR-014 : pas de filtre domaine sur l'email cible — l'admin invite
    // qui il veut dans son org (et la garde RLS BDD scope automatiquement
    // les accès du user invité à sa seule org via memberships).
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

    // ---------- 3b. Création public.users + membership (HARDFAIL) ----------
    // Indispensable pour que la FK audit_logs.actor_id → public.users.id
    // ne rejette pas les futures insertions d'audit. Idempotent (onConflictDoNothing).
    // L'organisation du nouveau membre = celle de l'admin appelant (résolution dynamique).
    //
    // Lot 1.6-bis (Hugo, 2026-06-09) — HARDFAIL : l'ancienne version laissait
    // passer un user créé côté Supabase Auth mais sans `memberships` côté BDD.
    // Combiné au fallback `ALYOS_ORG_ID` (désormais supprimé), ce user voyait
    // l'org AlyoS au login — fuite cross-tenant CC-2. Désormais, si l'insert
    // memberships échoue, on **rollback** la création Supabase Auth pour ne
    // pas laisser de fantôme exploitable.
    try {
      const callerOrgId = await getRequiredOrgId(caller.id);

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
          organizationId: callerOrgId,
          userId: created.user.id,
          role,
        })
        .onConflictDoNothing();
    } catch (dbErr) {
      // HARDFAIL : on rollback la création auth pour éviter un user fantôme
      // (auth.users sans memberships → après suppression du fallback
      // ALYOS_ORG_ID, ce user atterrirait sur /no-org au login mais
      // resterait actif côté Supabase Auth — orphelin gênant et exploitable
      // si un admin re-active le fallback par erreur).
      console.error("[admin/users:db:fail-hardfail]", {
        user_id: created.user.id,
        email,
        message: dbErr instanceof Error ? dbErr.message : String(dbErr),
      });

      // Best-effort rollback — si le deleteUser rate, on log mais on renvoie
      // tout de même 500 (l'admin doit voir l'erreur, pas un 201 trompeur).
      // Nota (backport revue Hugo 2026-06-10) : supabase-js retourne l'erreur
      // dans `error` SANS throw — on checke les deux canaux (retour + exception
      // réseau) pour ne pas rater un rollback échoué silencieux.
      try {
        const { error: deleteErr } = await admin.auth.admin.deleteUser(created.user.id);
        if (deleteErr) throw new Error(deleteErr.message);
      } catch (rollbackErr) {
        console.error("[admin/users:db:fail-hardfail:rollback-failed]", {
          user_id: created.user.id,
          email,
          message: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
        });
      }

      return jsonError(
        500,
        "Création BDD impossible (memberships). Le compte a été annulé — réessayez.",
      );
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
