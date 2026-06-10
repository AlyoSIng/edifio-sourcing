"use server";

/**
 * Server Actions — module organisations superadmin — edifio Sourcing
 *
 * Actions disponibles :
 *   - `createOrgAction`  : crée une organisation + administrateur initial + envoi invitation
 *   - `updateOrgAction`  : met à jour nom/tier/siren/siret + revalidate
 *
 * Note : la garde superadmin est vérifiée dans chaque action (défense en profondeur),
 * en plus du layout superadmin qui bloque déjà l'accès aux non-superadmins.
 *
 * Source de vérité schema : `src/db/schema/organizations.ts` + `src/db/schema/users.ts`.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { organizations } from "@/db/schema/organizations";
import { users, memberships } from "@/db/schema/users";
import { PROVISIONAL_PASSWORD_TTL_HOURS } from "@/lib/auth/constants";
import { computeProvisionalExpiresAt } from "@/lib/auth/password";
import { generateProvisionalPassword } from "@/lib/auth/password-server";
import { isSuperAdmin, toUserProfile, type UserMetadata } from "@/lib/auth/types";
import { sendWelcomeEmail } from "@/lib/email/send";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { createOrganization, updateOrganization } from "@/lib/superadmin/organizations-queries";

// ─── Valeurs autorisées ───────────────────────────────────────────────────────

const VALID_TIERS = ["sourcing", "cotraitance", "studio"] as const;
type SubscriptionTier = (typeof VALID_TIERS)[number];

function isValidTier(value: string): value is SubscriptionTier {
  return (VALID_TIERS as readonly string[]).includes(value);
}

// ─── Helpers de validation ────────────────────────────────────────────────────

/** Valide un SIREN : 9 chiffres exactement, ou null si vide. */
function validateSiren(raw: string): { value: string | null; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null };
  if (!/^\d{9}$/.test(trimmed))
    return { value: null, error: "Le SIREN doit comporter 9 chiffres exactement." };
  return { value: trimmed };
}

/** Valide un SIRET : 14 chiffres exactement, ou null si vide. */
function validateSiret(raw: string): { value: string | null; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null };
  if (!/^\d{14}$/.test(trimmed))
    return { value: null, error: "Le SIRET doit comporter 14 chiffres exactement." };
  return { value: trimmed };
}

// ─── createOrgAction ──────────────────────────────────────────────────────────

/**
 * Crée une nouvelle organisation depuis le formulaire inline NewOrgForm,
 * puis crée le compte de l'administrateur initial et lui envoie l'email
 * d'invitation avec son mot de passe provisoire.
 *
 * Reçoit un FormData avec les champs :
 *   - name, subscriptionTier, siren, siret (organisation)
 *   - adminFirstName, adminLastName, adminEmail (admin initial — obligatoires)
 *
 * GARDE-FOU SÉCURITÉ : le mot de passe provisoire n'est jamais retourné
 * dans le résultat de l'action (cf. invariante password-server.ts).
 */
export async function createOrgAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  // ── Guard superadmin ─────────────────────────────────────────────────────────
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) return { ok: false, error: "Authentification requise." };
  if (!isSuperAdmin(toUserProfile(caller))) {
    return { ok: false, error: "Réservé aux superadmins." };
  }

  // ── Lecture champs organisation ──────────────────────────────────────────────
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const tierRaw = (formData.get("subscriptionTier") as string | null)?.trim() ?? "studio";
  const sirenRaw = (formData.get("siren") as string | null) ?? "";
  const siretRaw = (formData.get("siret") as string | null) ?? "";

  // Validation — nom obligatoire
  if (!name) return { ok: false, error: "Le nom de l'organisation est obligatoire." };
  if (name.length > 255) return { ok: false, error: "Le nom ne peut pas dépasser 255 caractères." };

  // Validation — tier
  if (!isValidTier(tierRaw)) {
    return { ok: false, error: "Palier de souscription invalide." };
  }

  // Validation — SIREN
  const sirenResult = validateSiren(sirenRaw);
  if (sirenResult.error) return { ok: false, error: sirenResult.error };

  // Validation — SIRET
  const siretResult = validateSiret(siretRaw);
  if (siretResult.error) return { ok: false, error: siretResult.error };

  // ── Lecture champs admin ─────────────────────────────────────────────────────
  const adminEmail = (formData.get("adminEmail") as string | null)?.trim().toLowerCase() ?? "";
  const adminFirstName = (formData.get("adminFirstName") as string | null)?.trim() ?? "";
  const adminLastName = (formData.get("adminLastName") as string | null)?.trim() ?? "";

  if (!adminEmail || !adminFirstName || !adminLastName) {
    return {
      ok: false,
      error: "Les informations de l'administrateur initial sont obligatoires.",
    };
  }
  // ADR-014 (2026-06-05) — garde `isAuthorizedEmail(adminEmail)` retirée :
  // ouverture multi-tenant (PROTECT + orgs futures). Le superadmin éditeur
  // peut désormais provisionner un admin sur n'importe quel domaine ; la RLS
  // BDD scope strictement ses accès à sa seule org via memberships, et les
  // signups publics Supabase sont désactivés côté config.

  // ── Création de l'organisation ───────────────────────────────────────────────
  let org;
  try {
    org = await createOrganization(
      {
        name,
        subscriptionTier: tierRaw,
        siren: sirenResult.value,
        siret: siretResult.value,
      },
      db,
    );
  } catch (err) {
    // Erreur contrainte UNIQUE sur siren
    const msg = err instanceof Error ? err.message : "Erreur inconnue lors de la création.";
    if (msg.includes("organizations_siren_unique") || msg.includes("unique")) {
      return { ok: false, error: "Ce SIREN est déjà utilisé par une autre organisation." };
    }
    return { ok: false, error: msg };
  }

  // ── Création du compte administrateur initial ────────────────────────────────
  const adminClient = createSupabaseAdminClient();
  const provisional = generateProvisionalPassword();
  const expiresAt = computeProvisionalExpiresAt(PROVISIONAL_PASSWORD_TTL_HOURS);

  const metadata: UserMetadata = {
    role: "admin",
    must_change_password: true,
    provisional_password_expires_at: expiresAt,
    first_name: adminFirstName,
    last_name: adminLastName,
  };

  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email: adminEmail,
    password: provisional,
    email_confirm: true,
    user_metadata: metadata as Record<string, unknown>,
  });

  if (createErr || !created.user) {
    if (createErr && /already/i.test(createErr.message ?? "")) {
      return {
        ok: false,
        error: `L'organisation a été créée mais un compte existe déjà pour ${adminEmail}. Ajoutez l'utilisateur manuellement.`,
      };
    }
    return {
      ok: false,
      error: `L'organisation a été créée mais la création du compte admin a échoué : ${createErr?.message ?? "erreur inconnue"}. Ajoutez l'utilisateur manuellement.`,
    };
  }

  // ── Insert public.users + membership (HARDFAIL) ──────────────────────────────
  // HARDFAIL post-mortem 2026-06-10 — aligné sur pattern /api/admin/users
  // Lot 1.6-bis (Hugo, 2026-06-09). L'ancienne version était non-bloquante :
  // en cas d'échec BDD, l'org ET le compte Supabase Auth restaient créés SANS
  // membership → l'admin initial atterrissait sur /no-org au login (incident
  // Steve, matin de la bascule 10/06). Désormais on rollback TOUT ce que
  // l'action a créé jusqu'ici, dans cet ordre :
  //   1. le compte Supabase Auth (`deleteUser`) — cascade `public.users` +
  //      `memberships` via FK ON DELETE CASCADE (migrations 0001 + 0003).
  //      En premier : c'est le user orphelin qui est dangereux, pas l'org vide.
  //   2. la ligne `organizations` — aucune autre ligne liée n'existe à ce
  //      stade : `createOrganization` n'insère que l'org, et aucun trigger
  //      BDD ne seed de search_profile (vérifié migrations 0000 → 0053).
  // Chaque étape de rollback est best-effort : si elle rate on log, mais on
  // retourne quand même l'erreur (le superadmin doit voir l'échec, pas un
  // succès trompeur).
  try {
    await db
      .insert(users)
      .values({
        id: created.user.id,
        email: adminEmail,
        firstname: adminFirstName,
        lastname: adminLastName,
      })
      .onConflictDoNothing();

    await db
      .insert(memberships)
      .values({
        organizationId: org.id,
        userId: created.user.id,
        role: "admin",
      })
      .onConflictDoNothing();
  } catch (dbErr) {
    console.error("[createOrgAction:db:fail-hardfail]", {
      org_id: org.id,
      user_id: created.user.id,
      email: adminEmail,
      message: dbErr instanceof Error ? dbErr.message : String(dbErr),
    });

    // Rollback 1/2 — compte Supabase Auth (cascade public.users + memberships).
    // Nota : supabase-js retourne l'erreur dans `error` SANS throw — on checke
    // les deux canaux (retour + exception réseau) pour ne rien rater.
    try {
      const { error: deleteErr } = await adminClient.auth.admin.deleteUser(created.user.id);
      if (deleteErr) throw new Error(deleteErr.message);
    } catch (rollbackErr) {
      console.error("[createOrgAction:db:fail-hardfail:rollback-user-failed]", {
        user_id: created.user.id,
        email: adminEmail,
        message: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
      });
    }

    // Rollback 2/2 — organisation créée en début d'action.
    try {
      await db.delete(organizations).where(eq(organizations.id, org.id));
    } catch (rollbackErr) {
      console.error("[createOrgAction:db:fail-hardfail:rollback-org-failed]", {
        org_id: org.id,
        message: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
      });
    }

    return {
      ok: false,
      error:
        "Création BDD impossible (users/memberships). L'organisation et le compte admin ont été annulés — réessayez.",
    };
  }

  // ── Envoi email d'invitation ─────────────────────────────────────────────────
  try {
    await sendWelcomeEmail({
      to: adminEmail,
      email: adminEmail,
      firstName: adminFirstName,
      provisionalPassword: provisional,
      expiresAt,
      loginUrl: `${getSiteUrl()}/login`,
    });
  } catch {
    console.error("[createOrgAction:email:fail]", { email: adminEmail });
    // Succès partiel : org + user créés, email a foiré. L'admin peut régénérer
    // le provisoire via la liste users de l'organisation.
    revalidatePath("/sourcing/superadmin/organizations");
    return { ok: true };
  }

  revalidatePath("/sourcing/superadmin/organizations");
  return { ok: true };
}

// ─── updateOrgAction ──────────────────────────────────────────────────────────

/**
 * Met à jour les paramètres d'une organisation.
 * Reçoit un FormData avec les champs : id, name, subscriptionTier, siren, siret.
 */
export async function updateOrgAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  // ── Guard superadmin ─────────────────────────────────────────────────────────
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) return { ok: false, error: "Authentification requise." };
  if (!isSuperAdmin(toUserProfile(caller))) {
    return { ok: false, error: "Réservé aux superadmins." };
  }

  const id = (formData.get("id") as string | null)?.trim() ?? "";
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const tierRaw = (formData.get("subscriptionTier") as string | null)?.trim() ?? "studio";
  const sirenRaw = (formData.get("siren") as string | null) ?? "";
  const siretRaw = (formData.get("siret") as string | null) ?? "";

  // Validation — id
  if (!id || id.length < 10) return { ok: false, error: "Identifiant d'organisation invalide." };

  // Validation — nom obligatoire
  if (!name) return { ok: false, error: "Le nom de l'organisation est obligatoire." };
  if (name.length > 255) return { ok: false, error: "Le nom ne peut pas dépasser 255 caractères." };

  // Validation — tier
  if (!isValidTier(tierRaw)) {
    return { ok: false, error: "Palier de souscription invalide." };
  }

  // Validation — SIREN
  const sirenResult = validateSiren(sirenRaw);
  if (sirenResult.error) return { ok: false, error: sirenResult.error };

  // Validation — SIRET
  const siretResult = validateSiret(siretRaw);
  if (siretResult.error) return { ok: false, error: siretResult.error };

  try {
    const updated = await updateOrganization(
      id,
      {
        name,
        subscriptionTier: tierRaw,
        siren: sirenResult.value,
        siret: siretResult.value,
      },
      db,
    );

    if (!updated) return { ok: false, error: "Organisation introuvable." };

    revalidatePath("/sourcing/superadmin/organizations");
    revalidatePath(`/sourcing/superadmin/organizations/${id}`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur inconnue lors de la mise à jour.";
    if (msg.includes("organizations_siren_unique") || msg.includes("unique")) {
      return { ok: false, error: "Ce SIREN est déjà utilisé par une autre organisation." };
    }
    return { ok: false, error: msg };
  }
}
