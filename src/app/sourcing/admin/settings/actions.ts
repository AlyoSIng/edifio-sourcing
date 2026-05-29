"use server";

/**
 * Server Actions — Personnalisation organisation (branding).
 *
 * Fournit :
 *  - `updateBrandingAction` : sauvegarde couleur dominante + police.
 *  - `uploadLogoAction` : upload du logo vers Supabase Storage `org-assets`,
 *    sauvegarde de l'URL publique dans `organizations.logo_url`.
 *  - `removeLogoAction` : supprime le logo (reset logo_url → null).
 *
 * Guard : admin org uniquement (même pattern que societe/actions.ts).
 * Résilience : try/catch absorbé, retour d'erreur structuré.
 */

import { revalidatePath } from "next/cache";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { organizations } from "@/db/schema/organizations";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/* -------------------------------------------------------------------------- */
/*  Types de retour communs                                                    */
/* -------------------------------------------------------------------------- */

export type BrandingActionResult =
  | { ok: true; logoUrl?: string }
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

/* -------------------------------------------------------------------------- */
/*  Schéma Zod — mise à jour couleur + police                                 */
/* -------------------------------------------------------------------------- */

const updateBrandingSchema = z.object({
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "La couleur doit être au format hexadécimal #RRGGBB.")
    .nullable()
    .or(z.literal("")),
  fontFamily: z
    .enum(["space-grotesk", "outfit", "playfair-display", "inter"])
    .nullable()
    .or(z.literal("")),
});

/* -------------------------------------------------------------------------- */
/*  Helpers d'auth (pattern admin guard)                                      */
/* -------------------------------------------------------------------------- */

/** Type discriminé — résultat du guard admin. */
type AdminAuthResult =
  | { ok: false; error: "not_authenticated" | "forbidden_domain" | "forbidden_role" }
  | { ok: true; orgId: string };

async function requireAdminUser(): Promise<AdminAuthResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "not_authenticated" };
  if (!isAuthorizedEmail(user.email ?? "")) return { ok: false, error: "forbidden_domain" };

  const profile = toUserProfile(user);
  if (!isAdmin(profile)) return { ok: false, error: "forbidden_role" };

  const orgId = await getRequiredOrgId(user.id);
  return { ok: true, orgId };
}

/* -------------------------------------------------------------------------- */
/*  Action — Mise à jour couleur + police                                     */
/* -------------------------------------------------------------------------- */

/**
 * Sauvegarde la couleur dominante et/ou la police d'affichage de l'organisation.
 *
 * @param formData  Champs attendus : `primaryColor` (hex ou ""), `fontFamily` (slug ou "")
 */
export async function updateBrandingAction(formData: FormData): Promise<BrandingActionResult> {
  const auth = await requireAdminUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { orgId } = auth;

  const parsed = updateBrandingSchema.safeParse({
    primaryColor: formData.get("primaryColor") ?? "",
    fontFamily: formData.get("fontFamily") ?? "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_input",
      detail: parsed.error.issues.map((i) => i.message).join(" — "),
    };
  }

  const { primaryColor, fontFamily } = parsed.data;

  try {
    await db
      .update(organizations)
      .set({
        primaryColor: primaryColor || null,
        fontFamily: fontFamily || null,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, orgId));

    console.info(`[audit:org_branding_update] org=${orgId}`);
    revalidatePath("/sourcing/admin/settings");
    revalidatePath("/sourcing", "layout");
    return { ok: true };
  } catch (err) {
    console.error("[settings:branding:save:fail]", err);
    return {
      ok: false,
      error: "internal_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Action — Upload logo                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Uploade le logo de l'organisation dans Supabase Storage (`org-assets`),
 * puis met à jour `organizations.logo_url` avec l'URL publique.
 *
 * @param formData  Champ `logo` : objet `File` (PNG / JPEG / WebP / SVG, max 512 Ko).
 */
export async function uploadLogoAction(formData: FormData): Promise<BrandingActionResult> {
  const auth = await requireAdminUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { orgId } = auth;

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "invalid_input", detail: "Aucun fichier fourni." };
  }

  const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
  if (!ALLOWED.includes(file.type)) {
    return {
      ok: false,
      error: "invalid_input",
      detail: "Format non supporté. Utilise PNG, JPEG, WebP ou SVG.",
    };
  }

  if (file.size > 524288) {
    return { ok: false, error: "invalid_input", detail: "Le fichier dépasse 512 Ko." };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const storagePath = `logos/${orgId}/logo.${ext}`;

  try {
    const supabase = createSupabaseServerClient();
    const buffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("org-assets")
      .upload(storagePath, new Uint8Array(buffer), {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("[settings:logo:upload:fail]", uploadError);
      return { ok: false, error: "internal_error", detail: uploadError.message };
    }

    const { data: urlData } = supabase.storage.from("org-assets").getPublicUrl(storagePath);
    const logoUrl = urlData.publicUrl;

    await db
      .update(organizations)
      .set({ logoUrl, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));

    console.info(`[audit:org_logo_upload] org=${orgId} path=${storagePath}`);
    revalidatePath("/sourcing/admin/settings");
    revalidatePath("/sourcing", "layout");
    return { ok: true, logoUrl };
  } catch (err) {
    console.error("[settings:logo:upload:fail]", err);
    return {
      ok: false,
      error: "internal_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Action — Suppression logo                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Supprime le logo de l'organisation (reset `logo_url` → null).
 * Le fichier dans Supabase Storage est également supprimé si possible.
 */
export async function removeLogoAction(): Promise<BrandingActionResult> {
  const auth = await requireAdminUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { orgId } = auth;

  try {
    // Lire le chemin actuel pour suppression Storage
    const rows = await db
      .select({ logoUrl: organizations.logoUrl })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    const currentLogoUrl = rows[0]?.logoUrl;

    // Reset BDD
    await db
      .update(organizations)
      .set({ logoUrl: null, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));

    // Suppression Storage best-effort (ne bloque pas si echec)
    if (currentLogoUrl) {
      const supabase = createSupabaseServerClient();
      const url = new URL(currentLogoUrl);
      // Extraire le path depuis l'URL publique Supabase
      const match = url.pathname.match(/\/org-assets\/(.+)$/);
      if (match?.[1]) {
        await supabase.storage
          .from("org-assets")
          .remove([match[1]])
          .catch((e) => console.warn("[settings:logo:remove:storage-warn]", e));
      }
    }

    console.info(`[audit:org_logo_remove] org=${orgId}`);
    revalidatePath("/sourcing/admin/settings");
    revalidatePath("/sourcing", "layout");
    return { ok: true };
  } catch (err) {
    console.error("[settings:logo:remove:fail]", err);
    return {
      ok: false,
      error: "internal_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
