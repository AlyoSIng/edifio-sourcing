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
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { organizationProfiles } from "@/db/schema/messaging";
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
  logoUrl: z
    .string()
    .max(2048)
    .refine((v) => v === "" || /^https?:\/\//.test(v), {
      message: "L'URL du logo doit commencer par http:// ou https://",
    }),
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
  const supabase = createSupabaseServerClient();
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

  // 2. Parse + validation Zod
  const parsed = saveOrgProfileSchema.safeParse({
    presentationBlock: formData.get("presentationBlock") ?? "",
    commercialName: formData.get("commercialName") ?? "",
    emailSignature: formData.get("emailSignature") ?? "",
    agencyDetails: formData.get("agencyDetails") ?? "",
    phone: formData.get("phone") ?? "",
    contactEmail: formData.get("contactEmail") ?? "",
    logoUrl: formData.get("logoUrl") ?? "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_input",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const values = parsed.data;

  // 3. UPSERT en BDD
  try {
    await defaultDb
      .insert(organizationProfiles)
      .values({
        organizationId: ALYOS_ORG_ID,
        presentationBlock: values.presentationBlock,
        commercialName: values.commercialName,
        emailSignature: values.emailSignature,
        agencyDetails: values.agencyDetails,
        phone: values.phone,
        contactEmail: values.contactEmail,
        logoUrl: values.logoUrl || null,
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
          logoUrl: values.logoUrl || null,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      });

    // Audit log best-effort
    console.info(`[audit:org_profile_change] org=${ALYOS_ORG_ID} user=${user.email}`);

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
/*  Query — chargement du profil                                               */
/* -------------------------------------------------------------------------- */

/**
 * Charge le profil organisation depuis la BDD.
 * Retourne `null` si absent (seed non encore exécuté).
 */
export async function loadOrgProfile() {
  try {
    // withTenantContext pose app.current_organization_id pour FORCE RLS
    // (cf. ANSWER_260527_CTO_RLS_FORCE_EDGE.md + with-tenant-context.ts).
    const rows = await withTenantContext(ALYOS_ORG_ID, defaultDb, (client) =>
      client
        .select()
        .from(organizationProfiles)
        .where(eq(organizationProfiles.organizationId, ALYOS_ORG_ID))
        .limit(1),
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
