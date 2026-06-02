"use server";

/**
 * Server Actions — page pièces `/sourcing/ao/[id]/dossier/pieces`.
 *
 * Action : `compileDossierAction`
 *   Compile DC1 + DC2 + Pouvoir + RC + documents disponibles de la bibliothèque
 *   dans un ZIP, upload vers Supabase Storage, retourne une URL signée (1 heure).
 *
 *   Le ZIP est contextualisé selon le mode de réponse :
 *     - Solo                 → DC1 + DC2 AlyoS (response_files où architect_id IS NULL AND be_id IS NULL)
 *     - Tandem (archi)       → DC1 archi + DC2 AlyoS du contexte (architect_id = X)
 *     - Cotraitance BE       → DC1 AlyoS + DC2 BE (be_id = X)
 *
 *   Dans tous les cas, le Pouvoir mandataire (presentation_library
 *   kind='pouvoir_mandataire') est inclus s'il existe pour l'org, ainsi que le
 *   PDF RC source (tender_documents kind='RC') pour traçabilité.
 *
 * Sécurité :
 *   - Auth check obligatoire
 *   - UUID validation sur tenderId / architectId / beId (defense in depth)
 *   - Mutual exclusivity : `?archi=` prime sur `?be=` si les deux fournis
 *   - Filtre tenant orgId sur toutes les requêtes BDD
 *   - Aucune donnée cliente utilisée pour les chemins Storage
 *
 * Source de vérité : brief Board PR-E 2026-05-26 + brief Lot D 2026-06-02
 *   (multi-archi / multi-BE + Pouvoir + RC + nommage ZIP contextualisé).
 */

import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { architects } from "@/db/schema/architects";
import { bureauEtudes } from "@/db/schema/bureaux-etudes";
import { presentationLibrary, responseFiles } from "@/db/schema/library";
import { architectResponses } from "@/db/schema/selections";
import { tenderBeCotraitants } from "@/db/schema/tender-cotraitants";
import { tenderDocuments, tenderEvents, tenders } from "@/db/schema/tenders";
import { toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { rcAnalysisSchema } from "@/lib/ai/schemas";
import { matchPiecesWithLibrary } from "@/lib/dossier/pieces-match";
import {
  compileDossierZip,
  type ForcedLibraryItem,
  type TenderDocumentRef,
} from "@/lib/dossier/zip-compile";
import type { ExistingCerfa } from "../cerfa/actions";
// `loadExistingCerfa` n'est plus utilisée ici — remplacée par `loadContextualCerfa`
// qui prend en compte le contexte multi-archi / multi-BE (Phase 3 + Lot B).

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const BUCKET = "response_files";

/** Durée de validité de l'URL signée (1 heure). */
const SIGNED_URL_SECONDS = 3600;

/** UUID regex — défense profonde sur surface réseau. */
const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// ---------------------------------------------------------------------------
// Types retour
// ---------------------------------------------------------------------------

export interface CompileDossierOptions {
  /**
   * UUID de l'architecte sélectionné (mode Tandem multi-archi).
   * Si fourni : DC1 et DC2 chargés avec `response_files.architect_id = architectId`.
   */
  architectId?: string | null;
  /**
   * UUID du BE cotraitant (mode Cotraitance BE).
   * Si fourni (et `architectId` vide) : DC2 chargé avec `response_files.be_id = beId`,
   * et DC1 chargé avec `response_files.architect_id IS NULL AND be_id IS NULL`
   * (DC1 AlyoS mandataire du contexte Cotraitance BE).
   */
  beId?: string | null;
}

export interface CompileDossierResult {
  ok: boolean;
  error?:
    | "not_authenticated"
    | "tender_not_found"
    | "architect_not_accepted"
    | "be_not_cotraitant"
    | "no_cerfa"
    | "zip_empty"
    | "zip_download_failed"
    | "storage_upload_failed"
    | "signed_url_failed"
    | "db_insert_failed"
    | "internal_error";
  /** URL signée Supabase Storage (valide 1 heure). */
  downloadUrl?: string;
  /** Taille du ZIP en octets. */
  zipSizeBytes?: number;
  /** Nombre de fichiers inclus dans le ZIP. */
  fileCount?: number;
}

// ---------------------------------------------------------------------------
// Helper : slug contexte (cabinet archi / BE / "alyos") pour nom de ZIP
// ---------------------------------------------------------------------------

/**
 * Slugifie un nom de cabinet pour usage dans un nom de fichier ZIP.
 * Conserve uniquement [a-z0-9-], borne à 50 chars.
 */
function slugForFilename(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "dossier"
  );
}

// ---------------------------------------------------------------------------
// Helper : charger DC1/DC2 contextualisés (multi-archi / multi-BE)
// ---------------------------------------------------------------------------

/**
 * Charge le DC1 et le DC2 les plus récents pour un contexte donné.
 *
 *   - Solo                  : architect_id IS NULL AND be_id IS NULL
 *   - Tandem (archi)        : DC1 et DC2 où architect_id = architectId
 *   - Cotraitance BE (be)   : DC1 où architect_id IS NULL AND be_id IS NULL (AlyoS mandataire)
 *                             DC2 où be_id = beId
 */
async function loadContextualCerfa(
  tenderId: string,
  orgId: string,
  architectId: string | null,
  beId: string | null,
): Promise<{ dc1: ExistingCerfa | null; dc2: ExistingCerfa | null }> {
  // --- DC1 : conditions selon le mode ---
  let dc1Where;
  if (architectId) {
    // Tandem : DC1 lié à l'archi mandataire.
    dc1Where = and(
      eq(responseFiles.tenderId, tenderId),
      eq(responseFiles.organizationId, orgId),
      eq(responseFiles.kind, "dc1"),
      eq(responseFiles.architectId, architectId),
    );
  } else {
    // Solo et Cotraitance BE : DC1 AlyoS (architect_id IS NULL AND be_id IS NULL).
    dc1Where = and(
      eq(responseFiles.tenderId, tenderId),
      eq(responseFiles.organizationId, orgId),
      eq(responseFiles.kind, "dc1"),
      isNull(responseFiles.architectId),
      isNull(responseFiles.beId),
    );
  }

  // --- DC2 : conditions selon le mode ---
  let dc2Where;
  if (architectId) {
    // Tandem : DC2 lié à l'archi sélectionné (DC2 AlyoS cotraitant du contexte).
    dc2Where = and(
      eq(responseFiles.tenderId, tenderId),
      eq(responseFiles.organizationId, orgId),
      eq(responseFiles.kind, "dc2"),
      eq(responseFiles.architectId, architectId),
    );
  } else if (beId) {
    // Cotraitance BE : DC2 lié au BE.
    dc2Where = and(
      eq(responseFiles.tenderId, tenderId),
      eq(responseFiles.organizationId, orgId),
      eq(responseFiles.kind, "dc2"),
      eq(responseFiles.beId, beId),
    );
  } else {
    // Solo : DC2 AlyoS (architect_id IS NULL AND be_id IS NULL).
    dc2Where = and(
      eq(responseFiles.tenderId, tenderId),
      eq(responseFiles.organizationId, orgId),
      eq(responseFiles.kind, "dc2"),
      isNull(responseFiles.architectId),
      isNull(responseFiles.beId),
    );
  }

  const [dc1Row] = await db
    .select({
      id: responseFiles.id,
      kind: responseFiles.kind,
      name: responseFiles.name,
      storagePath: responseFiles.storagePath,
      createdAt: responseFiles.createdAt,
    })
    .from(responseFiles)
    .where(dc1Where)
    .orderBy(desc(responseFiles.createdAt))
    .limit(1);

  const [dc2Row] = await db
    .select({
      id: responseFiles.id,
      kind: responseFiles.kind,
      name: responseFiles.name,
      storagePath: responseFiles.storagePath,
      createdAt: responseFiles.createdAt,
    })
    .from(responseFiles)
    .where(dc2Where)
    .orderBy(desc(responseFiles.createdAt))
    .limit(1);

  return { dc1: dc1Row ?? null, dc2: dc2Row ?? null };
}

// ---------------------------------------------------------------------------
// Action : compileDossierAction
// ---------------------------------------------------------------------------

/**
 * Compile le dossier de candidature en ZIP et retourne une URL de téléchargement.
 *
 * Workflow :
 *   1. Auth check
 *   2. UUID validation
 *   3. Vérifier ownership du tender + récupérer external_ref pour le nom ZIP
 *   4. Mutual exclusivity : `architectId` prime sur `beId`
 *   5. Defense in depth : valider que l'archi/BE est bien lié à ce tender
 *   6. Charger DC1 + DC2 contextualisés
 *   7. Charger l'analyse RC + bibliothèque → matcher les pièces
 *   8. Charger le Pouvoir mandataire (presentation_library) si présent
 *   9. Charger le PDF RC source (tender_documents kind='RC') si présent
 *  10. Compiler le ZIP via `compileDossierZip`
 *  11. Upload ZIP vers Storage avec un nom contextualisé
 *  12. Créer URL signée (1h)
 *  13. Insérer une ligne `response_files` (kind='dossier_zip', architectId/beId)
 *  14. Retourner { ok, downloadUrl, zipSizeBytes }
 *
 * @param tenderId UUID du tender
 * @param options  Contexte multi-archi / multi-BE (optionnel).
 *                 Sans options → comportement Solo (DC1/DC2 AlyoS).
 */
export async function compileDossierAction(
  tenderId: string,
  options?: CompileDossierOptions,
): Promise<CompileDossierResult> {
  try {
    // 1. Auth check
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { ok: false, error: "not_authenticated" };
    void toUserProfile(user); // vérifie que le user est bien formé
    const orgId = await getRequiredOrgId(user.id);

    // 2. UUID validation tenderId
    if (!UUID_SHAPE.test(tenderId)) {
      return { ok: false, error: "tender_not_found" };
    }

    // Mutual exclusivity : `architectId` prime sur `beId`.
    let architectId: string | null = options?.architectId ?? null;
    let beId: string | null = options?.beId ?? null;
    if (architectId && beId) {
      console.warn("[compile-dossier:both-archi-and-be] architectId wins", { tenderId });
      beId = null;
    }
    // Validation UUID défensive sur les options client.
    if (architectId !== null && !UUID_SHAPE.test(architectId)) {
      architectId = null;
    }
    if (beId !== null && !UUID_SHAPE.test(beId)) {
      beId = null;
    }

    // 3. Vérifier ownership du tender + external_ref pour le nom ZIP
    const [tender] = await db
      .select({ id: tenders.id, externalRef: tenders.externalRef })
      .from(tenders)
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, orgId)))
      .limit(1);

    if (!tender) return { ok: false, error: "tender_not_found" };

    // 5a. Defense in depth — si architectId fourni : il doit être accepté.
    let contextSlug = "alyos"; // Solo par défaut
    if (architectId) {
      const [acceptedRow] = await db
        .select({ cabinet: architects.cabinet })
        .from(architectResponses)
        .innerJoin(architects, eq(architectResponses.architectId, architects.id))
        .where(
          and(
            eq(architectResponses.tenderId, tenderId),
            eq(architectResponses.organizationId, orgId),
            eq(architectResponses.architectId, architectId),
            eq(architectResponses.status, "accepted"),
          ),
        )
        .limit(1);
      if (!acceptedRow) {
        return { ok: false, error: "architect_not_accepted" };
      }
      contextSlug = slugForFilename(acceptedRow.cabinet);
    } else if (beId) {
      // 5b. Defense in depth — si beId fourni : il doit être cotraitant de ce tender.
      const [beRow] = await db
        .select({ cabinet: bureauEtudes.cabinet })
        .from(tenderBeCotraitants)
        .innerJoin(bureauEtudes, eq(tenderBeCotraitants.beId, bureauEtudes.id))
        .where(
          and(
            eq(tenderBeCotraitants.tenderId, tenderId),
            eq(tenderBeCotraitants.organizationId, orgId),
            eq(tenderBeCotraitants.beId, beId),
            eq(bureauEtudes.organizationId, orgId),
          ),
        )
        .limit(1);
      if (!beRow) {
        return { ok: false, error: "be_not_cotraitant" };
      }
      contextSlug = slugForFilename(beRow.cabinet);
    }

    // 6. Charger DC1 + DC2 contextualisés
    const { dc1, dc2 } = await loadContextualCerfa(tenderId, orgId, architectId, beId);

    if (!dc1 && !dc2) {
      return { ok: false, error: "no_cerfa" };
    }

    // 7a. Charger l'analyse RC (dernier event rc_analyzed)
    const [rcEvent] = await db
      .select({ data: tenderEvents.data })
      .from(tenderEvents)
      .where(
        and(
          eq(tenderEvents.tenderId, tenderId),
          eq(tenderEvents.organizationId, orgId),
          eq(tenderEvents.eventType, "rc_analyzed"),
        ),
      )
      .orderBy(desc(tenderEvents.occurredAt))
      .limit(1);

    // 7b. Charger la bibliothèque entreprise
    const libraryItems = await db
      .select()
      .from(presentationLibrary)
      .where(eq(presentationLibrary.organizationId, orgId));

    // 7c. Matcher les pièces RC vs bibliothèque
    let pieceMatches: ReturnType<typeof matchPiecesWithLibrary> = [];
    if (rcEvent?.data) {
      const extra = (rcEvent.data as { extra?: { rc_analysis?: unknown } }).extra;
      if (extra?.rc_analysis) {
        const parsed = rcAnalysisSchema.safeParse(extra.rc_analysis);
        if (parsed.success) {
          pieceMatches = matchPiecesWithLibrary(parsed.data.pieces_demandees, libraryItems);
        } else {
          console.warn("[compile-dossier:rc-analysis:schema-mismatch]", parsed.error.flatten());
        }
      }
    }

    // 8. Charger le Pouvoir mandataire (forcé) — uniquement s'il existe pour l'org.
    //    Pas de matching RC nécessaire : c'est quasi-systématique pour les groupements.
    //    On prend le plus récent (updatedAt desc) si plusieurs existent.
    const pouvoir = libraryItems
      .filter((it) => it.kind === "pouvoir_mandataire")
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    const forcedLibraryItems: ForcedLibraryItem[] = [];
    if (pouvoir) {
      // Conserve l'extension issue du storage_path (docx, pdf, etc.).
      const ext = pouvoir.storagePath.split(".").pop()?.toLowerCase() ?? "docx";
      const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : "docx";
      forcedLibraryItems.push({
        item: pouvoir,
        targetFilename: `pouvoir_mandataire.${safeExt}`,
      });
    }

    // 9. Charger le PDF RC source (tender_documents kind='RC') — copie traçabilité.
    const tenderDocsForZip: TenderDocumentRef[] = [];
    const [rcDoc] = await db
      .select({ storagePath: tenderDocuments.storagePath })
      .from(tenderDocuments)
      .where(
        and(
          eq(tenderDocuments.tenderId, tenderId),
          eq(tenderDocuments.organizationId, orgId),
          eq(tenderDocuments.kind, "RC"),
        ),
      )
      .orderBy(desc(tenderDocuments.uploadedAt))
      .limit(1);
    if (rcDoc) {
      const ext = rcDoc.storagePath.split(".").pop()?.toLowerCase() ?? "pdf";
      const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : "pdf";
      tenderDocsForZip.push({
        storagePath: rcDoc.storagePath,
        targetFilename: `RC.${safeExt}`,
      });
    }

    // 10. Compiler le ZIP (téléchargements depuis Storage via admin client)
    //     Storage admin : RLS bypass intentionnel — auth vérifiée plus haut.
    const supabaseAdmin = createSupabaseAdminClient();
    const zipResult = await compileDossierZip(supabaseAdmin, {
      dc1,
      dc2,
      pieceMatches,
      forcedLibraryItems,
      tenderDocuments: tenderDocsForZip,
    });

    if (zipResult.fileCount === 0) {
      return {
        ok: false,
        error: zipResult.hadDownloadFailures ? "zip_download_failed" : "zip_empty",
      };
    }

    // 11. Upload ZIP vers Storage avec nom contextualisé.
    //     Nom logique : `dossier_{externalRef}_{contextSlug}.zip` (dans Storage on
    //     ajoute aussi un timestamp pour éviter les collisions upsert:false).
    const refSlug = slugForFilename(tender.externalRef);
    const timestamp = Date.now();
    const zipDisplayName = `dossier_${refSlug}_${contextSlug}.zip`;
    const storagePath = `${orgId}/${tenderId}/${zipDisplayName.replace(/\.zip$/, "")}_${timestamp}.zip`;

    const { error: storageError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, zipResult.buffer, {
        contentType: "application/zip",
        upsert: false,
      });

    if (storageError) {
      console.error("[compile-dossier:storage:upload:fail]", storageError);
      return { ok: false, error: "storage_upload_failed" };
    }

    // 12. Créer URL signée (1 heure) avec un download filename contextualisé.
    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_SECONDS, {
        download: zipDisplayName,
      });

    if (signedError || !signedData?.signedUrl) {
      console.error("[compile-dossier:signed-url:fail]", signedError);
      return { ok: false, error: "signed_url_failed" };
    }

    // 13. Insérer dans response_files (traçabilité multi-archi / multi-BE)
    const zipSizeBytes = zipResult.buffer.byteLength;
    try {
      await db.insert(responseFiles).values({
        tenderId,
        organizationId: orgId,
        kind: "dossier_zip",
        name: `${zipDisplayName} (${zipResult.fileCount} fichier${zipResult.fileCount > 1 ? "s" : ""})`,
        storagePath,
        sizeBytes: zipSizeBytes,
        validated: true,
        // Multi-archi (Phase 3) / Multi-BE (Lot B) — traçabilité du contexte.
        architectId,
        beId,
      });
    } catch (err) {
      console.error("[compile-dossier:db:insert:fail]", err);
      // Non bloquant — le ZIP est déjà uploadé, on peut quand même retourner l'URL
    }

    revalidatePath(`/sourcing/ao/${tenderId}/dossier/pieces`);

    return {
      ok: true,
      downloadUrl: signedData.signedUrl,
      zipSizeBytes,
      fileCount: zipResult.fileCount,
    };
  } catch (err) {
    console.error("[compile-dossier:unhandled]", err);
    return { ok: false, error: "internal_error" };
  }
}
