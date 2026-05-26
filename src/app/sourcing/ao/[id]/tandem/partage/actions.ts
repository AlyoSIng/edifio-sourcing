"use server";

/**
 * Server Actions — partage de pièces aux cotraitants (côté AlyoS).
 *
 * Toutes ces actions nécessitent une session @alyosingenierie.fr valide.
 * Le token de partage est généré côté BDD (uuid_generate_v4 DEFAULT).
 *
 * Actions exposées :
 *  - createShareSession : crée un partage + ses items
 *  - revokeShare        : révoque un partage (accès cotraitant bloqué)
 *  - getDownloadUrl     : URL signée 1h pour télécharger une pièce originale
 */

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { cotraitantShareItems, cotraitantShares } from "@/db/schema/sharing";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

type ActionResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// createShareSession
// ---------------------------------------------------------------------------

/**
 * Crée une session de partage avec les pièces sélectionnées.
 *
 * FormData attendu :
 *  - tenderId      : UUID
 *  - contactName   : string non vide
 *  - contactEmail  : string non vide
 *  - items         : JSON Array<{id, name, kind, storagePath}>
 *
 * Retourne le token UUID du partage créé (pour construire le lien public).
 */
export async function createShareSession(
  formData: FormData,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  // Auth
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) return { ok: false, error: "forbidden_domain" };

  // Validation des champs
  const tenderId = formData.get("tenderId");
  const contactName = formData.get("contactName");
  const contactEmail = formData.get("contactEmail");
  const itemsJson = formData.get("items");

  if (typeof tenderId !== "string" || !UUID_SHAPE.test(tenderId)) {
    return { ok: false, error: "invalid_input" };
  }
  if (typeof contactName !== "string" || contactName.trim() === "") {
    return { ok: false, error: "missing_contact_name" };
  }
  if (typeof contactEmail !== "string" || contactEmail.trim() === "") {
    return { ok: false, error: "missing_contact_email" };
  }
  if (typeof itemsJson !== "string") {
    return { ok: false, error: "missing_items" };
  }

  let items: Array<{ id: string; name: string; kind: string; storagePath: string }>;
  try {
    items = JSON.parse(itemsJson) as typeof items;
  } catch {
    return { ok: false, error: "invalid_items" };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "no_items_selected" };
  }

  try {
    // Expiration 30 jours
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const shareRows = await db
      .insert(cotraitantShares)
      .values({
        tenderId,
        organizationId: ALYOS_ORG_ID,
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        expiresAt,
        createdBy: user.id,
      })
      .returning({
        id: cotraitantShares.id,
        token: cotraitantShares.token,
      });

    const share = shareRows[0];
    if (!share) return { ok: false, error: "internal_error" };

    await db.insert(cotraitantShareItems).values(
      items.map((item) => ({
        shareId: share.id,
        libraryItemId: UUID_SHAPE.test(item.id) ? item.id : null,
        name: item.name,
        kind: item.kind,
        originalStoragePath: item.storagePath,
      })),
    );

    revalidatePath(`/sourcing/ao/${tenderId}/tandem/partage`);
    return { ok: true, token: share.token };
  } catch (err) {
    console.error("[partage:create:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ---------------------------------------------------------------------------
// revokeShare
// ---------------------------------------------------------------------------

/**
 * Révoque un partage existant.
 * Après révocation, la page /cotraitant/[token] renvoie une erreur.
 */
export async function revokeShare(shareId: string, tenderId: string): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) return { ok: false, error: "forbidden_domain" };

  if (!UUID_SHAPE.test(shareId)) return { ok: false, error: "invalid_input" };

  try {
    await db
      .update(cotraitantShares)
      .set({ revokedAt: sql`now()` })
      .where(
        and(eq(cotraitantShares.id, shareId), eq(cotraitantShares.organizationId, ALYOS_ORG_ID)),
      );

    revalidatePath(`/sourcing/ao/${tenderId}/tandem/partage`);
    return { ok: true };
  } catch (err) {
    console.error("[partage:revoke:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ---------------------------------------------------------------------------
// getDownloadUrl
// ---------------------------------------------------------------------------

/**
 * Génère une URL signée Supabase Storage pour télécharger une pièce originale.
 * Valable 1 heure. Utilise le client admin pour bypasser la RLS Storage.
 */
export async function getDownloadUrl(
  storagePath: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) return { ok: false, error: "forbidden_domain" };

  if (!storagePath || storagePath.includes("..")) {
    return { ok: false, error: "invalid_path" };
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage
      .from("company_library")
      .createSignedUrl(storagePath, 3600);

    if (error || !data?.signedUrl) {
      console.error("[partage:download-url:fail]", error);
      return { ok: false, error: "storage_error" };
    }

    return { ok: true, url: data.signedUrl };
  } catch {
    return { ok: false, error: "internal_error" };
  }
}
