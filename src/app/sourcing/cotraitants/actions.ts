"use server";

/**
 * Server Actions — module Bibliothèque Cotraitants.
 *
 * Fonctions exposées :
 *  - createCotraitant   : crée un cotraitant dans l'annuaire (admin)
 *  - updateCotraitant   : met à jour une fiche (admin)
 *  - deleteCotraitant   : archive (soft delete via active=false) une fiche (admin)
 *  - listCotraitants    : liste les cotraitants actifs (tous rôles)
 *  - associateToTender  : associe un cotraitant à un AO (admin)
 *  - dissociateFromTender : dissocie le cotraitant d'un AO (admin)
 *  - uploadCotraitantDocument : upload une pièce vers Supabase Storage (admin)
 *  - deleteCotraitantDocument : supprime une pièce + le fichier Storage (admin)
 *  - getDownloadUrl     : génère une URL signée 60 min (tous rôles)
 *
 * Sécurité :
 *  - Auth check via `requireAlyosUser` (domaine @alyosingenierie.fr)
 *  - Filtre tenant explicite `ALYOS_ORG_ID` sur toutes les requêtes
 *  - Écriture : admin uniquement
 *  - `revalidatePath` après chaque mutation
 *
 * Source de vérité : demande Board 2026-05-26 (bibliothèque cotraitants).
 */

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db as defaultDb } from "@/db/client";
import {
  cotraitantDocuments,
  cotraitants,
  tenderCotraitants,
  type Cotraitant,
  type CotraitantDocument,
  type CotraitantDocumentKind,
} from "@/db/schema/cotraitants";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

// ============================================================================
// Types publics
// ============================================================================

export type DrizzleClient = typeof defaultDb;

/** Résultat standard d'une mutation. */
export type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | {
      ok: false;
      error:
        | "not_authenticated"
        | "forbidden_domain"
        | "forbidden_role"
        | "invalid_input"
        | "not_found"
        | "already_associated"
        | "internal_error";
    };

export interface CreateCotraitantInput {
  cabinet: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  siret?: string | null;
  zip?: string | null;
  city?: string | null;
  notes?: string | null;
}

export type UpdateCotraitantInput = Partial<CreateCotraitantInput>;

export type CotraitantRow = Cotraitant;
export type CotraitantDocumentRow = CotraitantDocument;

// ============================================================================
// Constantes
// ============================================================================

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const STORAGE_BUCKET = "cotraitant-docs";

// ============================================================================
// Helper auth interne
// ============================================================================

interface AuthClientLike {
  auth: {
    getUser: () => Promise<{ data: { user: import("@supabase/supabase-js").User | null } }>;
  };
}

async function requireAlyosUser(
  authClient: AuthClientLike,
): Promise<
  | { ok: true; userId: string; profile: ReturnType<typeof toUserProfile> }
  | { ok: false; error: "not_authenticated" | "forbidden_domain" }
> {
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };
  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) return { ok: false, error: "forbidden_domain" };
  return { ok: true, userId: user.id, profile };
}

// ============================================================================
// 1. listCotraitants — lecture (tous rôles)
// ============================================================================

/**
 * Retourne tous les cotraitants actifs du tenant AlyoS, triés par cabinet.
 * Accessible à tous les rôles authentifiés.
 */
export async function listCotraitants(
  dbClient: DrizzleClient = defaultDb,
): Promise<CotraitantRow[]> {
  const authClient = createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return [];

  try {
    const rows = await dbClient
      .select()
      .from(cotraitants)
      .where(and(eq(cotraitants.organizationId, ALYOS_ORG_ID), eq(cotraitants.active, true)))
      .orderBy(cotraitants.cabinet);
    return rows;
  } catch (err) {
    console.error("[cotraitants-actions:list:fail]", err);
    return [];
  }
}

// ============================================================================
// 2. createCotraitant — création (admin)
// ============================================================================

/**
 * Crée un nouveau cotraitant dans l'annuaire du tenant AlyoS.
 * Réservé aux admins.
 */
export async function createCotraitant(
  data: CreateCotraitantInput,
  dbClient: DrizzleClient = defaultDb,
): Promise<ActionResult<{ id: string }>> {
  const authClient = createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  if (!isAdmin(authResult.profile)) return { ok: false, error: "forbidden_role" };

  if (!data.cabinet || data.cabinet.trim().length === 0) {
    return { ok: false, error: "invalid_input" };
  }

  try {
    const rows = await dbClient
      .insert(cotraitants)
      .values({
        organizationId: ALYOS_ORG_ID,
        cabinet: data.cabinet.trim(),
        contactName: data.contactName ?? null,
        email: data.email?.trim() ?? null,
        phone: data.phone?.trim() ?? null,
        siret: data.siret?.trim() ?? null,
        zip: data.zip?.trim() ?? null,
        city: data.city?.trim() ?? null,
        notes: data.notes ?? null,
        active: true,
      })
      .returning({ id: cotraitants.id });

    if (!rows[0]) throw new Error("INSERT cotraitants returned no row");

    revalidatePath("/sourcing/cotraitants");
    return { ok: true, data: { id: rows[0].id } };
  } catch (err) {
    console.error("[cotraitants-actions:create:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// 3. updateCotraitant — mise à jour (admin)
// ============================================================================

/**
 * Met à jour une fiche cotraitant existante.
 * Réservé aux admins.
 */
export async function updateCotraitant(
  id: string,
  data: UpdateCotraitantInput,
  dbClient: DrizzleClient = defaultDb,
): Promise<ActionResult> {
  const authClient = createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  if (!isAdmin(authResult.profile)) return { ok: false, error: "forbidden_role" };

  if (!UUID_SHAPE.test(id)) return { ok: false, error: "invalid_input" };

  if (data.cabinet !== undefined && data.cabinet.trim().length === 0) {
    return { ok: false, error: "invalid_input" };
  }

  try {
    const updateData: Partial<typeof cotraitants.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.cabinet !== undefined) updateData.cabinet = data.cabinet.trim();
    if (data.contactName !== undefined) updateData.contactName = data.contactName;
    if (data.email !== undefined) updateData.email = data.email?.trim() ?? null;
    if (data.phone !== undefined) updateData.phone = data.phone?.trim() ?? null;
    if (data.siret !== undefined) updateData.siret = data.siret?.trim() ?? null;
    if (data.zip !== undefined) updateData.zip = data.zip?.trim() ?? null;
    if (data.city !== undefined) updateData.city = data.city?.trim() ?? null;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const rows = await dbClient
      .update(cotraitants)
      .set(updateData)
      .where(and(eq(cotraitants.id, id), eq(cotraitants.organizationId, ALYOS_ORG_ID)))
      .returning({ id: cotraitants.id });

    if (!rows[0]) return { ok: false, error: "not_found" };

    revalidatePath("/sourcing/cotraitants");
    return { ok: true };
  } catch (err) {
    console.error("[cotraitants-actions:update:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// 4. deleteCotraitant — soft-delete via active=false (admin)
// ============================================================================

/**
 * Archive un cotraitant (active = false). Soft delete : les données et
 * documents associés sont conservés.
 * Réservé aux admins.
 */
export async function deleteCotraitant(
  id: string,
  dbClient: DrizzleClient = defaultDb,
): Promise<ActionResult> {
  const authClient = createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  if (!isAdmin(authResult.profile)) return { ok: false, error: "forbidden_role" };

  if (!UUID_SHAPE.test(id)) return { ok: false, error: "invalid_input" };

  try {
    const rows = await dbClient
      .update(cotraitants)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(cotraitants.id, id), eq(cotraitants.organizationId, ALYOS_ORG_ID)))
      .returning({ id: cotraitants.id });

    if (!rows[0]) return { ok: false, error: "not_found" };

    revalidatePath("/sourcing/cotraitants");
    return { ok: true };
  } catch (err) {
    console.error("[cotraitants-actions:delete:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// 5. associateToTender — associer un cotraitant à un AO (admin)
// ============================================================================

/**
 * Associe un cotraitant à un AO. Contrainte UNIQUE sur tender_id : si l'AO a
 * déjà un cotraitant, retourne l'erreur `already_associated`.
 * Réservé aux admins.
 */
export async function associateToTender(
  tenderId: string,
  cotraitantId: string,
  dbClient: DrizzleClient = defaultDb,
): Promise<ActionResult> {
  const authClient = createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  if (!isAdmin(authResult.profile)) return { ok: false, error: "forbidden_role" };

  if (!UUID_SHAPE.test(tenderId) || !UUID_SHAPE.test(cotraitantId)) {
    return { ok: false, error: "invalid_input" };
  }

  try {
    await dbClient.insert(tenderCotraitants).values({
      tenderId,
      cotraitantId,
      organizationId: ALYOS_ORG_ID,
    });

    revalidatePath(`/sourcing/ao/${tenderId}/tandem/cotraitant`);
    return { ok: true };
  } catch (err) {
    // Postgres unique violation : code 23505
    const code = (err as { code?: string }).code;
    if (code === "23505") return { ok: false, error: "already_associated" };
    console.error("[cotraitants-actions:associate:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// 6. dissociateFromTender — dissocier le cotraitant d'un AO (admin)
// ============================================================================

/**
 * Supprime l'association entre un AO et son cotraitant.
 * Réservé aux admins.
 */
export async function dissociateFromTender(
  tenderId: string,
  dbClient: DrizzleClient = defaultDb,
): Promise<ActionResult> {
  const authClient = createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  if (!isAdmin(authResult.profile)) return { ok: false, error: "forbidden_role" };

  if (!UUID_SHAPE.test(tenderId)) return { ok: false, error: "invalid_input" };

  try {
    const rows = await dbClient
      .delete(tenderCotraitants)
      .where(
        and(
          eq(tenderCotraitants.tenderId, tenderId),
          eq(tenderCotraitants.organizationId, ALYOS_ORG_ID),
        ),
      )
      .returning({ id: tenderCotraitants.id });

    if (!rows[0]) return { ok: false, error: "not_found" };

    revalidatePath(`/sourcing/ao/${tenderId}/tandem/cotraitant`);
    return { ok: true };
  } catch (err) {
    console.error("[cotraitants-actions:dissociate:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// 7. uploadCotraitantDocument — upload Storage + enregistrement BDD (admin)
// ============================================================================

/**
 * Upload un fichier vers le bucket Supabase Storage "cotraitant-docs" (privé)
 * et insère la métadonnée en BDD.
 *
 * Le chemin Storage est : `{organizationId}/{cotraitantId}/{timestamp}_{filename}`.
 * Réservé aux admins.
 */
export async function uploadCotraitantDocument(
  cotraitantId: string,
  tenderId: string | null,
  file: FormData,
  kind: CotraitantDocumentKind,
  label: string,
  dbClient: DrizzleClient = defaultDb,
): Promise<ActionResult<{ id: string }>> {
  const authClient = createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  if (!isAdmin(authResult.profile)) return { ok: false, error: "forbidden_role" };

  if (!UUID_SHAPE.test(cotraitantId)) return { ok: false, error: "invalid_input" };
  if (tenderId !== null && !UUID_SHAPE.test(tenderId)) return { ok: false, error: "invalid_input" };
  if (!label.trim()) return { ok: false, error: "invalid_input" };

  const rawFile = file.get("file");
  if (!(rawFile instanceof File)) return { ok: false, error: "invalid_input" };

  try {
    // Construction du chemin Storage
    const timestamp = Date.now();
    const sanitizedFilename = rawFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${ALYOS_ORG_ID}/${cotraitantId}/${timestamp}_${sanitizedFilename}`;

    // Upload vers Supabase Storage
    const supabaseAdmin = createSupabaseAdminClient();
    const { error: uploadError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, rawFile, {
        contentType: rawFile.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      console.error("[cotraitants-actions:upload:storage:fail]", uploadError);
      return { ok: false, error: "internal_error" };
    }

    // Enregistrement BDD
    const rows = await dbClient
      .insert(cotraitantDocuments)
      .values({
        cotraitantId,
        tenderId: tenderId ?? undefined,
        organizationId: ALYOS_ORG_ID,
        kind,
        label: label.trim(),
        storagePath,
        filename: rawFile.name,
        uploadedBy: authResult.userId,
      })
      .returning({ id: cotraitantDocuments.id });

    if (!rows[0]) throw new Error("INSERT cotraitant_documents returned no row");

    revalidatePath(`/sourcing/ao/${tenderId}/tandem/cotraitant`);
    revalidatePath("/sourcing/cotraitants");
    return { ok: true, data: { id: rows[0].id } };
  } catch (err) {
    console.error("[cotraitants-actions:upload:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// 8. deleteCotraitantDocument — suppression Storage + BDD (admin)
// ============================================================================

/**
 * Supprime une pièce (Storage + ligne BDD).
 * Réservé aux admins.
 */
export async function deleteCotraitantDocument(
  documentId: string,
  dbClient: DrizzleClient = defaultDb,
): Promise<ActionResult> {
  const authClient = createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  if (!isAdmin(authResult.profile)) return { ok: false, error: "forbidden_role" };

  if (!UUID_SHAPE.test(documentId)) return { ok: false, error: "invalid_input" };

  try {
    // Récupération du chemin Storage avant suppression
    const docs = await dbClient
      .select({
        storagePath: cotraitantDocuments.storagePath,
        tenderId: cotraitantDocuments.tenderId,
      })
      .from(cotraitantDocuments)
      .where(
        and(
          eq(cotraitantDocuments.id, documentId),
          eq(cotraitantDocuments.organizationId, ALYOS_ORG_ID),
        ),
      )
      .limit(1);

    if (!docs[0]) return { ok: false, error: "not_found" };

    const { storagePath, tenderId } = docs[0];

    // Suppression Storage (best-effort — on continue même si le fichier est déjà absent)
    const supabaseAdmin = createSupabaseAdminClient();
    const { error: storageError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .remove([storagePath]);

    if (storageError) {
      console.error("[cotraitants-actions:delete-doc:storage:fail]", storageError);
      // On continue quand même pour supprimer la métadonnée BDD
    }

    // Suppression BDD
    await dbClient
      .delete(cotraitantDocuments)
      .where(
        and(
          eq(cotraitantDocuments.id, documentId),
          eq(cotraitantDocuments.organizationId, ALYOS_ORG_ID),
        ),
      );

    if (tenderId) revalidatePath(`/sourcing/ao/${tenderId}/tandem/cotraitant`);
    revalidatePath("/sourcing/cotraitants");
    return { ok: true };
  } catch (err) {
    console.error("[cotraitants-actions:delete-doc:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// 9. getDownloadUrl — URL signée 60 min (tous rôles)
// ============================================================================

/**
 * Génère une URL signée Supabase Storage valable 60 minutes pour télécharger
 * un document cotraitant.
 * Accessible à tous les rôles authentifiés AlyoS.
 */
export async function getDownloadUrl(
  documentId: string,
  dbClient: DrizzleClient = defaultDb,
): Promise<ActionResult<{ url: string }>> {
  const authClient = createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;

  if (!UUID_SHAPE.test(documentId)) return { ok: false, error: "invalid_input" };

  try {
    // Vérification tenant + récupération chemin
    const docs = await dbClient
      .select({ storagePath: cotraitantDocuments.storagePath })
      .from(cotraitantDocuments)
      .where(
        and(
          eq(cotraitantDocuments.id, documentId),
          eq(cotraitantDocuments.organizationId, ALYOS_ORG_ID),
        ),
      )
      .limit(1);

    if (!docs[0]) return { ok: false, error: "not_found" };

    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(docs[0].storagePath, 60 * 60); // 1 heure

    if (error || !data?.signedUrl) {
      console.error("[cotraitants-actions:download-url:fail]", error);
      return { ok: false, error: "internal_error" };
    }

    return { ok: true, data: { url: data.signedUrl } };
  } catch (err) {
    console.error("[cotraitants-actions:download-url:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// 10. listDocumentsForCotraitant — lecture des documents (tous rôles)
// ============================================================================

/**
 * Liste tous les documents d'un cotraitant, optionnellement filtrés par AO.
 * Accessible à tous les rôles authentifiés.
 */
export async function listDocumentsForCotraitant(
  cotraitantId: string,
  tenderId?: string | null,
  dbClient: DrizzleClient = defaultDb,
): Promise<CotraitantDocumentRow[]> {
  const authClient = createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return [];

  if (!UUID_SHAPE.test(cotraitantId)) return [];

  try {
    const conditions = [
      eq(cotraitantDocuments.cotraitantId, cotraitantId),
      eq(cotraitantDocuments.organizationId, ALYOS_ORG_ID),
    ];

    if (tenderId !== undefined && tenderId !== null) {
      conditions.push(eq(cotraitantDocuments.tenderId, tenderId));
    }

    const rows = await dbClient
      .select()
      .from(cotraitantDocuments)
      .where(and(...conditions))
      .orderBy(cotraitantDocuments.uploadedAt);

    return rows;
  } catch (err) {
    console.error("[cotraitants-actions:list-docs:fail]", err);
    return [];
  }
}

// ============================================================================
// 11. getTenderCotraitant — récupère l'association AO ↔ cotraitant (tous rôles)
// ============================================================================

/**
 * Retourne le cotraitant associé à un AO (avec sa fiche complète) ou null.
 * Accessible à tous les rôles authentifiés.
 */
export async function getTenderCotraitant(
  tenderId: string,
  dbClient: DrizzleClient = defaultDb,
): Promise<{ association: typeof tenderCotraitants.$inferSelect; cotraitant: Cotraitant } | null> {
  const authClient = createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return null;

  if (!UUID_SHAPE.test(tenderId)) return null;

  try {
    const rows = await dbClient
      .select({
        association: tenderCotraitants,
        cotraitant: cotraitants,
      })
      .from(tenderCotraitants)
      .innerJoin(cotraitants, eq(tenderCotraitants.cotraitantId, cotraitants.id))
      .where(
        and(
          eq(tenderCotraitants.tenderId, tenderId),
          eq(tenderCotraitants.organizationId, ALYOS_ORG_ID),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  } catch (err) {
    console.error("[cotraitants-actions:get-tender-cotraitant:fail]", err);
    return null;
  }
}
