"use server";

/**
 * Server Actions — bibliothèque entreprise AlyoS.
 *
 * Deux actions :
 *  - `uploadLibraryDoc`  : upload Storage + insert BDD
 *  - `deleteLibraryDoc`  : delete Storage + delete BDD
 *
 * Sécurité :
 *  - Auth check + isAdmin sur chaque action (defense in depth)
 *  - Validation MIME + taille côté serveur (ne jamais faire confiance au client)
 *  - Storage chemin : `{orgId}/{kind}/{timestamp}_{sanitizedFilename}`
 *
 * Source de vérité :
 *  - Spec PR-A module dossier IA (brief Board 2026-05-25)
 *  - Bucket Supabase `company_library` — privé, 50 MB max, RLS tenant-scoped
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { presentationLibrary } from "@/db/schema/library";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Taille maximale autorisée : 50 Mo (cohérent avec la config bucket Supabase). */
const MAX_SIZE_BYTES = 50 * 1024 * 1024;

/** Types MIME autorisés : PDF + formats Office courants. */
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
]);

/** Nom du bucket Supabase Storage (déjà créé, privé, RLS activée). */
const BUCKET_NAME = "company_library";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize un nom de fichier : remplace espaces et caractères non alphanumériques
 * (sauf tiret et point) par un underscore pour éviter les problèmes d'URL Storage.
 */
function sanitizeFilename(name: string): string {
  // Conserve les chiffres, lettres, tirets, underscores et l'extension (point)
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

// ---------------------------------------------------------------------------
// Action : upload
// ---------------------------------------------------------------------------

export interface UploadLibraryDocResult {
  ok: boolean;
  error?: string;
}

/**
 * Uploade un document dans la bibliothèque AlyoS.
 *
 * Champs FormData attendus :
 *  - `file`       — File (obligatoire)
 *  - `kind`       — string (obligatoire, ex. "kbis")
 *  - `validUntil` — string ISO date (optionnel)
 *  - `notes`      — string (optionnel, max 500 car.)
 */
export async function uploadLibraryDoc(formData: FormData): Promise<UploadLibraryDocResult> {
  // 1. Auth check
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "not_authenticated" };

  const profile = toUserProfile(user);
  if (!isAdmin(profile)) return { ok: false, error: "forbidden_role" };

  // 2. Extraction et validation des champs FormData
  const file = formData.get("file");
  const kind = formData.get("kind");
  const validUntil = formData.get("validUntil");
  const notes = formData.get("notes");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "missing_file" };
  }
  if (typeof kind !== "string" || kind.trim() === "") {
    return { ok: false, error: "missing_kind" };
  }

  // Validation taille
  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, error: "file_too_large" };
  }

  // Validation MIME
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, error: "invalid_mime_type" };
  }

  // Validation date d'expiration si fournie
  const validUntilStr =
    typeof validUntil === "string" && validUntil.trim() !== "" ? validUntil.trim() : null;

  if (validUntilStr !== null && !/^\d{4}-\d{2}-\d{2}$/.test(validUntilStr)) {
    return { ok: false, error: "invalid_valid_until" };
  }

  const notesStr =
    typeof notes === "string" && notes.trim() !== "" ? notes.trim().slice(0, 500) : null;

  // 3. Chemin de stockage : {orgId}/{kind}/{timestamp}_{sanitizedFilename}
  const timestamp = Date.now();
  const safeFilename = sanitizeFilename(file.name);
  const storagePath = `${ALYOS_ORG_ID}/${kind.trim()}/${timestamp}_${safeFilename}`;

  // 4. Upload vers Supabase Storage (le client server porte la session RLS)
  const fileBuffer = await file.arrayBuffer();
  const { error: storageError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (storageError) {
    console.error("[bibliotheque:upload:storage:fail]", storageError);
    return { ok: false, error: "storage_upload_failed" };
  }

  // 5. Insert dans la table BDD
  try {
    await db.insert(presentationLibrary).values({
      organizationId: ALYOS_ORG_ID,
      kind: kind.trim(),
      name: file.name,
      storagePath,
      sizeBytes: file.size,
      validUntil: validUntilStr,
      notes: notesStr,
    });
  } catch (err) {
    console.error("[bibliotheque:upload:db:fail]", err);
    // Nettoyage Storage si l'insert BDD échoue (cohérence best-effort)
    await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
    return { ok: false, error: "db_insert_failed" };
  }

  revalidatePath("/sourcing/admin/bibliotheque");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Action : suppression
// ---------------------------------------------------------------------------

export interface DeleteLibraryDocResult {
  ok: boolean;
  error?: string;
}

/**
 * Supprime un document de la bibliothèque (Storage + BDD).
 *
 * @param id          — UUID du document dans `presentation_library`
 * @param storagePath — chemin complet dans le bucket (ex. `{orgId}/kbis/…`)
 */
export async function deleteLibraryDoc(
  id: string,
  storagePath: string,
): Promise<DeleteLibraryDocResult> {
  // 1. Auth check
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "not_authenticated" };

  const profile = toUserProfile(user);
  if (!isAdmin(profile)) return { ok: false, error: "forbidden_role" };

  // 2. Validation basique des paramètres
  if (!id || typeof id !== "string") return { ok: false, error: "invalid_id" };
  if (!storagePath || typeof storagePath !== "string") {
    return { ok: false, error: "invalid_storage_path" };
  }

  // 3. Suppression du fichier dans Storage
  const { error: storageError } = await supabase.storage.from(BUCKET_NAME).remove([storagePath]);

  if (storageError) {
    console.error("[bibliotheque:delete:storage:fail]", storageError);
    return { ok: false, error: "storage_delete_failed" };
  }

  // 4. Suppression de la ligne BDD
  try {
    await db.delete(presentationLibrary).where(eq(presentationLibrary.id, id));
  } catch (err) {
    console.error("[bibliotheque:delete:db:fail]", err);
    return { ok: false, error: "db_delete_failed" };
  }

  revalidatePath("/sourcing/admin/bibliotheque");
  return { ok: true };
}
