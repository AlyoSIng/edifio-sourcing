/**
 * Cleanup des ZIPs de dossier orphelins (chantier H4, Steve 2026-06-04).
 *
 * Contexte : chaque clic sur « Compiler le dossier » ou « Recompiler » crée
 * une nouvelle entrée `response_files` `kind='dossier_zip'` et upload un
 * nouveau fichier dans Supabase Storage avec un timestamp dans le path. Le
 * suffixe timestamp évite la collision `upsert:false` mais accumule les
 * versions à chaque run. Sur un AO actif (test, archi switch, etc.) on peut
 * facilement avoir 5-10 ZIPs pour la même paire (tender, archi).
 *
 * Politique de rétention :
 *  - Pour chaque (tender_id, architect_id, be_id, organization_id), garde le
 *    plus récent par `createdAt desc`.
 *  - Supprime tous les autres : DELETE BDD + remove Storage.
 *  - Best-effort : si Storage refuse (RLS, fichier déjà supprimé), on log
 *    et continue — la BDD reste cohérente.
 *
 * Tenant isolation : la boucle calcule l'ensemble des candidats à supprimer
 * via une query unique (PARTITION BY + ROW_NUMBER), puis traite tout en
 * batch. Pas de cross-tenant possible — le DELETE filtre par organization_id.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { SupabaseClient } from "@supabase/supabase-js";

import { responseFiles } from "@/db/schema/library";
import type { db as defaultDb } from "@/db/client";

type DrizzleClient = typeof defaultDb;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunDossierZipCleanupInput {
  db: DrizzleClient;
  /** Client Supabase admin (service_role) pour bypass RLS sur storage.objects. */
  supabaseAdmin: SupabaseClient;
  /** Nom du bucket Storage où vivent les ZIPs (défaut `response_files`). */
  bucket?: string;
}

export interface RunDossierZipCleanupResult {
  /** Total de lignes `dossier_zip` examinées avant déduplication. */
  totalCandidates: number;
  /** Nombre de lignes BDD supprimées (les non-plus-récentes). */
  rowsDeleted: number;
  /** Nombre de fichiers Storage supprimés avec succès. */
  storageDeleted: number;
  /** Nombre d'échecs Storage (fichier introuvable, RLS) — non bloquant. */
  storageFailures: number;
  /** Détails des échecs Storage (échantillon 10 premiers). */
  storageFailuresSample: Array<{ storagePath: string; message: string }>;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

/**
 * Parcourt tous les `response_files` `kind='dossier_zip'`, identifie les
 * doublons par (tender_id, architect_id, be_id, organization_id) et supprime
 * tout sauf le plus récent.
 */
export async function runDossierZipCleanup(
  input: RunDossierZipCleanupInput,
): Promise<RunDossierZipCleanupResult> {
  const { db, supabaseAdmin, bucket = "response_files" } = input;
  const t0 = Date.now();

  // 1. Identifie les lignes à supprimer via une CTE PARTITION BY (row_number()).
  //    Plus efficace que de charger tout en JS et grouper.
  const obsoleteRows = await db.execute<{
    id: string;
    storage_path: string;
  }>(sql`
    WITH ranked AS (
      SELECT
        id,
        storage_path,
        ROW_NUMBER() OVER (
          PARTITION BY tender_id, architect_id, be_id, organization_id
          ORDER BY created_at DESC, id DESC
        ) AS rn
      FROM response_files
      WHERE kind = 'dossier_zip'
    )
    SELECT id, storage_path FROM ranked WHERE rn > 1
  `);

  const rows: Array<{ id: string; storagePath: string }> = [];
  for (const row of obsoleteRows) {
    rows.push({
      id: String(row.id),
      storagePath: String(row.storage_path),
    });
  }

  const result: RunDossierZipCleanupResult = {
    totalCandidates: rows.length,
    rowsDeleted: 0,
    storageDeleted: 0,
    storageFailures: 0,
    storageFailuresSample: [],
    durationMs: 0,
  };

  if (rows.length === 0) {
    result.durationMs = Date.now() - t0;
    return result;
  }

  // 2. Supprime côté Storage (best-effort, par lots de 100).
  //    Supabase Storage `remove` accepte un array de paths.
  const STORAGE_BATCH = 100;
  for (let i = 0; i < rows.length; i += STORAGE_BATCH) {
    const batch = rows.slice(i, i + STORAGE_BATCH);
    const paths = batch.map((r) => r.storagePath);
    try {
      const { error } = await supabaseAdmin.storage.from(bucket).remove(paths);
      if (error) {
        result.storageFailures += batch.length;
        if (result.storageFailuresSample.length < 10) {
          result.storageFailuresSample.push({
            storagePath: paths[0] ?? "(unknown)",
            message: `batch remove failed: ${error.message}`,
          });
        }
      } else {
        result.storageDeleted += batch.length;
      }
    } catch (err) {
      result.storageFailures += batch.length;
      if (result.storageFailuresSample.length < 10) {
        result.storageFailuresSample.push({
          storagePath: paths[0] ?? "(unknown)",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // 3. Supprime côté BDD (inArray IN). On le fait APRÈS Storage pour que
  //    même si Storage rate, la BDD reste cohérente (l'admin verra que
  //    le response_file a disparu et n'essaiera plus de re-télécharger).
  //
  //    Si on inversait, on aurait des response_files en BDD pointant sur
  //    des storage_path absents.
  const ids = rows.map((r) => r.id);
  const DB_BATCH = 500;
  for (let i = 0; i < ids.length; i += DB_BATCH) {
    const batch = ids.slice(i, i + DB_BATCH);
    try {
      await db
        .delete(responseFiles)
        .where(and(eq(responseFiles.kind, "dossier_zip"), inArray(responseFiles.id, batch)));
      result.rowsDeleted += batch.length;
    } catch (err) {
      console.error("[dossier-zip-cleanup:db-delete:fail]", {
        batchSize: batch.length,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  result.durationMs = Date.now() - t0;
  return result;
}

// `desc` not strictly needed but kept available for future ordering variants.
void desc;
