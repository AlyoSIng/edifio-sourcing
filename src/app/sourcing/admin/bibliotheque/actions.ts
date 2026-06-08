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
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { presentationLibrary } from "@/db/schema/library";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

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

/**
 * Liste blanche des valeurs `kind` autorisées — doit rester synchronisée avec
 * `LIBRARY_KINDS` dans `LibraryClient.tsx`.
 * Valider côté serveur empêche toute injection de chemin dans Storage.
 *
 * Catégories actives (liste officielle 2026-05-26, étendue 2026-06-03) :
 *   dc1, dc2, dc4, pouvoir_mandataire, kbis, urssaf, attestation_fiscale,
 *   assurance_rc, declaration_honneur, declaration_ca, declaration_effectifs,
 *   rib, presentation_entreprise, moyens_humains, references,
 *   memoire_rse, autre
 *
 * Catégories legacy (backward-compat — ne plus uploader, docs existants conservés) :
 *   bilan, dc2_vierge, dc4_vierge
 */
const VALID_KINDS = new Set([
  // Catégories actives
  "dc1",
  "dc2",
  "dc4",
  "pouvoir_mandataire",
  "kbis",
  "urssaf",
  "attestation_fiscale",
  "assurance_rc",
  // 3 nouvelles déclarations RC (Steve 2026-06-03) — matching pieces page.
  "declaration_honneur",
  "declaration_ca",
  "declaration_effectifs",
  "rib",
  "presentation_entreprise",
  "moyens_humains",
  "references",
  // Salve R (Steve 2026-06-05) — références avec matching auto.
  "references_table", // 1 seul tableau Excel par org, filtré au compile
  "reference_fiche", // fiches A4 individuelles, matching keywords
  "memoire_rse",
  "fiche_metier", // matching keywords (manquait à la whitelist, bug pré-existant fixé R)
  // Salve S (Steve 2026-06-05) — CV intervenants avec matching auto.
  "cv", // CV individuels des intervenants, matching keywords
  "autre",
  // Catégories legacy — supprimées de l'UI d'upload mais conservées ici pour
  // que les documents existants en BDD restent valides (pas d'erreur "invalid_kind"
  // si un ancien doc est re-soumis ou si la suppression passe par cette validation).
  "bilan",
  "dc2_vierge",
  "dc4_vierge",
]);

/**
 * Kinds qui acceptent un champ `matching_keywords` lors de l'upload.
 * Salve R : étendu à `reference_fiche`. Salve S : étendu à `cv`.
 * Logique identique à `fiche_metier`.
 */
const KINDS_WITH_KEYWORDS = new Set(["fiche_metier", "reference_fiche", "cv"]);

/**
 * Kind « singleton » : un seul item par organisation. À l'upload d'un nouveau,
 * on supprime les anciens (Storage + BDD) avant d'insérer le nouveau.
 * Cas d'usage : tableau Excel maître des références.
 */
const SINGLETON_KINDS = new Set(["references_table"]);

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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "not_authenticated" };

  const profile = toUserProfile(user);
  if (!isAdmin(profile)) return { ok: false, error: "forbidden_role" };

  const orgId = await getRequiredOrgId(user.id);

  // Storage admin : RLS bypass intentionnel — auth + isAdmin() vérifiés L.122-130
  const supabaseAdmin = createSupabaseAdminClient();

  // 2. Extraction et validation des champs FormData
  const file = formData.get("file");
  const kind = formData.get("kind");
  const validUntil = formData.get("validUntil");
  const notes = formData.get("notes");
  // Mots-clés associés (kind='fiche_metier' uniquement, sinon ignoré).
  // Format reçu : chaîne séparée par virgules « patrimoine, abf, restauration ».
  const matchingKeywordsRaw = formData.get("matchingKeywords");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "missing_file" };
  }
  if (typeof kind !== "string" || kind.trim() === "") {
    return { ok: false, error: "missing_kind" };
  }

  // Validation kind contre la liste blanche (évite l'injection de chemin dans Storage)
  if (!VALID_KINDS.has(kind.trim())) {
    return { ok: false, error: "invalid_kind" };
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

  // Parse matching_keywords : split par virgule, trim, dedup, max 20 keywords,
  // chaque keyword max 80 chars. Utilisé pour les kinds `fiche_metier` et
  // `reference_fiche` (matching auto à la compile dossier).
  let matchingKeywords: string[] | null = null;
  if (KINDS_WITH_KEYWORDS.has(kind.trim()) && typeof matchingKeywordsRaw === "string") {
    const parsed = matchingKeywordsRaw
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0 && k.length <= 80);
    const dedup = Array.from(new Set(parsed)).slice(0, 20);
    matchingKeywords = dedup.length > 0 ? dedup : null;
  }

  // Validation spécifique pour les tableaux Excel maîtres : on parse le fichier
  // côté serveur pour vérifier qu'il contient bien une colonne « Mots-clés »
  // avant de l'accepter en biblio. Sinon, le filtrage à la compile dossier
  // throw silencieusement et Steve ne saura pas que son tableau est invalide.
  if (kind.trim() === "references_table") {
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const { filterReferencesTableXlsx } = await import("@/lib/dossier/references-table-filter");
      // Dry-run avec un keyword bidon : si la colonne « Mots-clés » est
      // présente, filterReferencesTableXlsx renvoie sans throw (même si 0
      // ligne matche). Sinon, elle throw "Colonne « Mots-clés » introuvable".
      await filterReferencesTableXlsx(buf, ["__validation_dryrun__"]);
    } catch (err) {
      console.warn("[bibliotheque:upload:references_table:validation:fail]", err);
      return { ok: false, error: "references_table_missing_keywords_column" };
    }
  }

  // 3. Singleton kinds — supprime l'ancien avant d'insérer le nouveau (best
  //    effort : si la suppression échoue, on continue l'upload, l'admin peut
  //    nettoyer manuellement). Évite l'accumulation de N tableaux Excel.
  if (SINGLETON_KINDS.has(kind.trim())) {
    try {
      const oldItems = await db
        .select({
          id: presentationLibrary.id,
          storagePath: presentationLibrary.storagePath,
        })
        .from(presentationLibrary)
        .where(
          and(
            eq(presentationLibrary.organizationId, orgId),
            eq(presentationLibrary.kind, kind.trim()),
          ),
        );
      if (oldItems.length > 0) {
        const paths = oldItems.map((o) => o.storagePath);
        await supabaseAdmin.storage.from(BUCKET_NAME).remove(paths);
        await db
          .delete(presentationLibrary)
          .where(
            and(
              eq(presentationLibrary.organizationId, orgId),
              eq(presentationLibrary.kind, kind.trim()),
            ),
          );
      }
    } catch (err) {
      console.warn("[bibliotheque:upload:singleton:cleanup:fail]", err);
    }
  }

  // 4. Chemin de stockage : {orgId}/{kind}/{timestamp}_{sanitizedFilename}
  const timestamp = Date.now();
  const safeFilename = sanitizeFilename(file.name);
  const storagePath = `${orgId}/${kind.trim()}/${timestamp}_${safeFilename}`;

  // 5. Upload vers Supabase Storage
  const fileBuffer = await file.arrayBuffer();
  // Storage admin : RLS bypass intentionnel — auth + isAdmin() vérifiés L.122-130
  const { error: storageError } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (storageError) {
    console.error("[bibliotheque:upload:storage:fail]", storageError);
    return { ok: false, error: "storage_upload_failed" };
  }

  // 6. Insert dans la table BDD
  try {
    await db.insert(presentationLibrary).values({
      organizationId: orgId,
      kind: kind.trim(),
      name: file.name,
      storagePath,
      sizeBytes: file.size,
      validUntil: validUntilStr,
      notes: notesStr,
      matchingKeywords,
    });
  } catch (err) {
    console.error("[bibliotheque:upload:db:fail]", err);
    // Nettoyage Storage si l'insert BDD échoue (cohérence best-effort)
    // Storage admin : RLS bypass intentionnel — auth + isAdmin() vérifiés L.122-130
    await supabaseAdmin.storage.from(BUCKET_NAME).remove([storagePath]);
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
 * Sécurité : le `storagePath` passé par le client est IGNORÉ — on re-lit le
 * chemin depuis la BDD (filtre `organizationId = orgId`) pour empêcher
 * toute suppression cross-tenant.
 *
 * @param id          — UUID du document dans `presentation_library`
 * @param _storagePath — ignoré (conservé dans la signature pour compatibilité client)
 */
export async function deleteLibraryDoc(
  id: string,
  _storagePath: string,
): Promise<DeleteLibraryDocResult> {
  // Paramètre ignoré volontairement : le storagePath client n'est jamais utilisé
  // (re-lecture BDD filtre tenant). Déclaré pour compatibilité signature appelant.
  void _storagePath;

  // 1. Auth check
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "not_authenticated" };

  const profile = toUserProfile(user);
  if (!isAdmin(profile)) return { ok: false, error: "forbidden_role" };

  const deleteOrgId = await getRequiredOrgId(user.id);

  // Storage admin : RLS bypass intentionnel — auth + isAdmin() vérifiés L.240-248
  const supabaseAdmin = createSupabaseAdminClient();

  // 2. Validation basique du paramètre id
  if (!id || typeof id !== "string") return { ok: false, error: "invalid_id" };

  // 3. Re-lecture du storagePath depuis la BDD avec filtre tenant
  //    On n'utilise jamais le chemin fourni par le client (risque cross-tenant).
  const [doc] = await db
    .select({ storagePath: presentationLibrary.storagePath })
    .from(presentationLibrary)
    .where(and(eq(presentationLibrary.id, id), eq(presentationLibrary.organizationId, deleteOrgId)))
    .limit(1);

  if (!doc) return { ok: false, error: "document_not_found" };

  // 4. Suppression du fichier dans Storage (chemin certifié depuis la BDD)
  // Storage admin : RLS bypass intentionnel — auth + isAdmin() vérifiés L.240-248
  const { error: storageError } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .remove([doc.storagePath]);

  if (storageError) {
    console.error("[bibliotheque:delete:storage:fail]", storageError);
    return { ok: false, error: "storage_delete_failed" };
  }

  // 5. Suppression de la ligne BDD
  try {
    await db.delete(presentationLibrary).where(eq(presentationLibrary.id, id));
  } catch (err) {
    console.error("[bibliotheque:delete:db:fail]", err);
    return { ok: false, error: "db_delete_failed" };
  }

  revalidatePath("/sourcing/admin/bibliotheque");
  return { ok: true };
}
