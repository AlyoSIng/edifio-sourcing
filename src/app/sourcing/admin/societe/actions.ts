"use server";

/**
 * Server Actions — présentation société (Exigence D).
 *
 * Source de vérité :
 *  - `handoff/SPEC_ADDENDUM_260525_ARCHITECTES_MENU_ET_TRAME_MAIL.md` §Exigence D
 *  - Décision Board 2026-05-25 : table `organization_profiles` source de vérité.
 *
 * Fournit la variable {{presentation_societe}} injectée dans tous les templates.
 * Multi-tenant-ready via `organization_id` (Phase 2 : multi-orgs sans dette).
 */

import { revalidatePath } from "next/cache";

import { z } from "zod";
import { eq } from "drizzle-orm";

import { db as defaultDb } from "@/db/client";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { organizationProfiles } from "@/db/schema/messaging";
import { organizations } from "@/db/schema/organizations";
import { withTenantContext } from "@/lib/db/with-tenant-context";

/* -------------------------------------------------------------------------- */
/*  Schéma Zod                                                                 */
/* -------------------------------------------------------------------------- */

const saveOrgProfileSchema = z.object({
  presentationBlock: z.string().max(4000, "Le bloc de présentation est trop long (max 4000 car.)"),
  commercialName: z.string().max(200, "Le nom commercial est trop long"),
  emailSignature: z.string().max(500, "La signature est trop longue"),
  agencyDetails: z.string().max(2000, "Les coordonnées agences sont trop longues"),
  phone: z.string().max(50, "Le téléphone est trop long"),
  contactEmail: z
    .string()
    .max(254)
    .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
      message: "Format e-mail invalide",
    }),
  // `logoUrl` retiré côté form (Steve 2026-06-03) — géré via Personnalisation.
  // ---------------------------------------------------------------- DC2 (Lot B)
  addressLine1: z.string().max(255, "Adresse trop longue"),
  addressLine2: z.string().max(255, "Complément d'adresse trop long"),
  legalRepresentativeName: z.string().max(200, "Nom du représentant légal trop long"),
  legalRepresentativeRole: z.string().max(120, "Qualité trop longue"),
  capitalEur: z
    .string()
    .max(20)
    .refine((v) => v === "" || /^\d+$/.test(v), {
      message: "Le capital doit être un entier positif en euros (sans séparateur)",
    }),
  // CA n-1 / n-2 / n-3 — DC2 §E (Steve 2026-06-04).
  revenueN1: z
    .string()
    .max(20)
    .refine((v) => v === "" || /^\d+$/.test(v), {
      message: "Le CA n-1 doit être un entier positif en euros (sans séparateur)",
    }),
  revenueN2: z
    .string()
    .max(20)
    .refine((v) => v === "" || /^\d+$/.test(v), {
      message: "Le CA n-2 doit être un entier positif en euros (sans séparateur)",
    }),
  revenueN3: z
    .string()
    .max(20)
    .refine((v) => v === "" || /^\d+$/.test(v), {
      message: "Le CA n-3 doit être un entier positif en euros (sans séparateur)",
    }),
  signatureCity: z.string().max(120, "Ville de signature trop longue"),
  // Forme juridique — champ libre TEXT (cf. migration 0040 + lib/legal-forms.ts).
  legalForm: z.string().max(60, "Forme juridique trop longue"),
});

/* -------------------------------------------------------------------------- */
/*  Types de retour                                                            */
/* -------------------------------------------------------------------------- */

export type SaveOrgProfileResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "not_authenticated"
        | "forbidden_domain"
        | "forbidden_role"
        | "invalid_input"
        | "internal_error";
      detail?: string;
      fieldErrors?: Record<string, string[]>;
    };

/* -------------------------------------------------------------------------- */
/*  Action saveOrgProfileAction                                                */
/* -------------------------------------------------------------------------- */

export async function saveOrgProfileAction(formData: FormData): Promise<SaveOrgProfileResult> {
  // 1. Auth check
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "not_authenticated" };

  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(user.email ?? "")) {
    return { ok: false, error: "forbidden_domain" };
  }
  if (!isAdmin(profile)) {
    return { ok: false, error: "forbidden_role" };
  }

  const orgId = await getRequiredOrgId(user.id);

  // 2. Parse + validation Zod
  const parsed = saveOrgProfileSchema.safeParse({
    presentationBlock: formData.get("presentationBlock") ?? "",
    commercialName: formData.get("commercialName") ?? "",
    emailSignature: formData.get("emailSignature") ?? "",
    agencyDetails: formData.get("agencyDetails") ?? "",
    phone: formData.get("phone") ?? "",
    contactEmail: formData.get("contactEmail") ?? "",
    addressLine1: formData.get("addressLine1") ?? "",
    addressLine2: formData.get("addressLine2") ?? "",
    legalRepresentativeName: formData.get("legalRepresentativeName") ?? "",
    legalRepresentativeRole: formData.get("legalRepresentativeRole") ?? "",
    capitalEur: formData.get("capitalEur") ?? "",
    revenueN1: formData.get("revenueN1") ?? "",
    revenueN2: formData.get("revenueN2") ?? "",
    revenueN3: formData.get("revenueN3") ?? "",
    signatureCity: formData.get("signatureCity") ?? "",
    legalForm: formData.get("legalForm") ?? "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_input",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const values = parsed.data;

  // Normalisation des champs DC2 : chaîne vide -> NULL en BDD pour rester
  // sémantiquement « non renseigné » et préserver la nullabilité côté schéma.
  const capitalEurNum =
    values.capitalEur && values.capitalEur !== "" ? Number.parseInt(values.capitalEur, 10) : null;
  const revenueN1Num =
    values.revenueN1 && values.revenueN1 !== "" ? Number.parseInt(values.revenueN1, 10) : null;
  const revenueN2Num =
    values.revenueN2 && values.revenueN2 !== "" ? Number.parseInt(values.revenueN2, 10) : null;
  const revenueN3Num =
    values.revenueN3 && values.revenueN3 !== "" ? Number.parseInt(values.revenueN3, 10) : null;
  const dc2Fields = {
    addressLine1: values.addressLine1 || null,
    addressLine2: values.addressLine2 || null,
    legalRepresentativeName: values.legalRepresentativeName || null,
    legalRepresentativeRole: values.legalRepresentativeRole || null,
    capitalEur: capitalEurNum,
    revenueN1: revenueN1Num,
    revenueN2: revenueN2Num,
    revenueN3: revenueN3Num,
    signatureCity: values.signatureCity || null,
    legalForm: values.legalForm || null,
  } as const;

  // 3. UPSERT en BDD
  try {
    await defaultDb
      .insert(organizationProfiles)
      .values({
        organizationId: orgId,
        presentationBlock: values.presentationBlock,
        commercialName: values.commercialName,
        emailSignature: values.emailSignature,
        agencyDetails: values.agencyDetails,
        phone: values.phone,
        contactEmail: values.contactEmail,
        // logoUrl : géré via Personnalisation (organizations.logo_url).
        // La colonne legacy `organization_profiles.logo_url` n'est plus
        // écrite — elle sera droppée dans une migration de nettoyage V2.
        ...dc2Fields,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: organizationProfiles.organizationId,
        set: {
          presentationBlock: values.presentationBlock,
          commercialName: values.commercialName,
          emailSignature: values.emailSignature,
          agencyDetails: values.agencyDetails,
          phone: values.phone,
          contactEmail: values.contactEmail,
          ...dc2Fields,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      });

    // Audit log best-effort
    console.info(`[audit:org_profile_change] org=${orgId} user=${user.email}`);

    revalidatePath("/sourcing/admin/societe");
    revalidatePath("/sourcing/admin/modeles-email");

    return { ok: true };
  } catch (err) {
    console.error("[societe:save:fail]", err);
    return {
      ok: false,
      error: "internal_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Action saveOrgSiretAction — SIRET organisation AlyoS                       */
/* -------------------------------------------------------------------------- */

export type SaveOrgSiretResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "not_authenticated"
        | "forbidden_domain"
        | "forbidden_role"
        | "invalid_input"
        | "internal_error";
      detail?: string;
    };

/**
 * Met à jour le SIRET de l'organisation AlyoS dans la table `organizations`.
 *
 * Le SIRET (14 chiffres) est utilisé pour pre-fill les formulaires DC1/DC2.
 * Validation regex stricte côté serveur.
 *
 * @param formData FormData avec le champ `siret` (string, peut être vide pour reset)
 */
export async function saveOrgSiretAction(formData: FormData): Promise<SaveOrgSiretResult> {
  // Auth check
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "not_authenticated" };
  if (!isAuthorizedEmail(user.email ?? "")) return { ok: false, error: "forbidden_domain" };
  const profile = toUserProfile(user);
  if (!isAdmin(profile)) return { ok: false, error: "forbidden_role" };

  const orgId = await getRequiredOrgId(user.id);

  const raw = (formData.get("siret") ?? "").toString().trim();

  // Validation : vide = reset autorisé, sinon 14 chiffres stricts
  if (raw !== "" && !/^\d{14}$/.test(raw)) {
    return {
      ok: false,
      error: "invalid_input",
      detail: "Le SIRET doit comporter exactement 14 chiffres.",
    };
  }

  try {
    await defaultDb
      .update(organizations)
      .set({ siret: raw || null })
      .where(eq(organizations.id, orgId));

    revalidatePath("/sourcing/admin/societe");
    return { ok: true };
  } catch (err) {
    console.error("[societe:siret:save:fail]", err);
    return {
      ok: false,
      error: "internal_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Charge le SIRET courant d'une organisation.
 * Retourne null si non renseigné ou si l'organisation est introuvable.
 *
 * @param organizationId UUID de l'organisation (résolu depuis memberships)
 */
export async function loadOrgSiret(organizationId: string): Promise<string | null> {
  try {
    const rows = await defaultDb
      .select({ siret: organizations.siret })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    return rows[0]?.siret ?? null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Query — chargement du profil                                               */
/* -------------------------------------------------------------------------- */

/**
 * Charge le profil organisation depuis la BDD.
 * Retourne `null` si absent (seed non encore exécuté).
 *
 * @param organizationId UUID de l'organisation (résolu depuis memberships)
 */
export async function loadOrgProfile(organizationId: string) {
  try {
    // withTenantContext pose app.current_organization_id pour FORCE RLS
    // (cf. ANSWER_260527_CTO_RLS_FORCE_EDGE.md + with-tenant-context.ts).
    const rows = await withTenantContext(organizationId, defaultDb, (client) =>
      client
        .select()
        .from(organizationProfiles)
        .where(eq(organizationProfiles.organizationId, organizationId))
        .limit(1),
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
