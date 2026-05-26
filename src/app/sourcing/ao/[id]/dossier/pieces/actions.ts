"use server";

/**
 * Server Actions — page pièces `/sourcing/ao/[id]/dossier/pieces`.
 *
 * Action : `compileDossierAction`
 *   Compile DC1 + DC2 + documents disponibles de la bibliothèque dans un ZIP,
 *   upload vers Supabase Storage, retourne une URL signée (1 heure).
 *
 * Sécurité :
 *   - Auth check obligatoire
 *   - UUID validation sur tenderId
 *   - Filtre tenant ALYOS_ORG_ID sur toutes les requêtes BDD
 *   - Aucune donnée cliente utilisée pour les chemins Storage
 *
 * Source de vérité : brief Board PR-E 2026-05-26.
 */

export const runtime = "nodejs";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { responseFiles } from "@/db/schema/library";
import { presentationLibrary } from "@/db/schema/library";
import { tenderEvents, tenders } from "@/db/schema/tenders";
import { toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rcAnalysisSchema } from "@/lib/ai/schemas";
import { matchPiecesWithLibrary } from "@/lib/dossier/pieces-match";
import { compileDossierZip } from "@/lib/dossier/zip-compile";
import { loadExistingCerfa } from "../cerfa/actions";

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

export interface CompileDossierResult {
  ok: boolean;
  error?:
    | "not_authenticated"
    | "tender_not_found"
    | "no_cerfa"
    | "zip_empty"
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
// Action : compileDossierAction
// ---------------------------------------------------------------------------

/**
 * Compile le dossier de candidature en ZIP et retourne une URL de téléchargement.
 *
 * Workflow :
 *   1. Auth check
 *   2. UUID validation
 *   3. Vérifier ownership du tender
 *   4. Charger DC1 + DC2 validés
 *   5. Charger l'analyse RC + bibliothèque → matcher les pièces
 *   6. Compiler le ZIP via `compileDossierZip`
 *   7. Upload ZIP vers Storage
 *   8. Créer URL signée (1h)
 *   9. Insérer une ligne `response_files` (kind='dossier_zip')
 *  10. Retourner { ok, downloadUrl, zipSizeBytes }
 *
 * @param tenderId UUID du tender
 */
export async function compileDossierAction(tenderId: string): Promise<CompileDossierResult> {
  try {
    // 1. Auth check
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { ok: false, error: "not_authenticated" };
    void toUserProfile(user); // vérifie que le user est bien formé

    // 2. UUID validation
    if (!UUID_SHAPE.test(tenderId)) {
      return { ok: false, error: "tender_not_found" };
    }

    // 3. Vérifier ownership du tender
    const [tender] = await db
      .select({ id: tenders.id })
      .from(tenders)
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, ALYOS_ORG_ID)))
      .limit(1);

    if (!tender) return { ok: false, error: "tender_not_found" };

    // 4. Charger DC1 + DC2 validés
    const { dc1, dc2 } = await loadExistingCerfa(tenderId);

    if (!dc1 && !dc2) {
      return { ok: false, error: "no_cerfa" };
    }

    // 5a. Charger l'analyse RC (dernier event rc_analyzed)
    const [rcEvent] = await db
      .select({ data: tenderEvents.data })
      .from(tenderEvents)
      .where(
        and(
          eq(tenderEvents.tenderId, tenderId),
          eq(tenderEvents.organizationId, ALYOS_ORG_ID),
          eq(tenderEvents.eventType, "rc_analyzed"),
        ),
      )
      .orderBy(desc(tenderEvents.occurredAt))
      .limit(1);

    // 5b. Charger la bibliothèque entreprise
    const libraryItems = await db
      .select()
      .from(presentationLibrary)
      .where(eq(presentationLibrary.organizationId, ALYOS_ORG_ID));

    // 5c. Matcher les pièces RC vs bibliothèque
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

    // 6. Compiler le ZIP
    const zipResult = await compileDossierZip(supabase, { dc1, dc2, pieceMatches });

    if (zipResult.fileCount === 0) {
      return { ok: false, error: "zip_empty" };
    }

    // 7. Upload ZIP vers Storage
    const timestamp = Date.now();
    const storagePath = `${ALYOS_ORG_ID}/${tenderId}/dossier_${timestamp}.zip`;

    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, zipResult.buffer, {
        contentType: "application/zip",
        upsert: false,
      });

    if (storageError) {
      console.error("[compile-dossier:storage:upload:fail]", storageError);
      return { ok: false, error: "storage_upload_failed" };
    }

    // 8. Créer URL signée (1 heure)
    const { data: signedData, error: signedError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_SECONDS);

    if (signedError || !signedData?.signedUrl) {
      console.error("[compile-dossier:signed-url:fail]", signedError);
      return { ok: false, error: "signed_url_failed" };
    }

    // 9. Insérer dans response_files (traçabilité)
    const zipSizeBytes = zipResult.buffer.byteLength;
    try {
      await db.insert(responseFiles).values({
        tenderId,
        organizationId: ALYOS_ORG_ID,
        kind: "dossier_zip",
        name: `Dossier compilé (${zipResult.fileCount} fichier${zipResult.fileCount > 1 ? "s" : ""})`,
        storagePath,
        sizeBytes: zipSizeBytes,
        validated: true,
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
