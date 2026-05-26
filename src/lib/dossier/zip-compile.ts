/**
 * Compilation d'un dossier de candidature en ZIP.
 *
 * Télécharge depuis Supabase Storage :
 *   - DC1.json + DC2.json (bucket response_files)
 *   - Documents disponibles de la bibliothèque (bucket company_library)
 *
 * Structure du ZIP produit :
 *   dossier_candidature/
 *     CERFA/
 *       DC1.json
 *       DC2.json
 *     pieces/
 *       {nom_piece_sanitize}.{ext}
 *
 * Utilise `fflate.zipSync` — pure JS, compatible Node.js 18+ et Edge Runtime.
 * Pas d'import BDD : fonction pure côté serveur.
 *
 * Source de vérité : brief Board PR-E 2026-05-26.
 */

import { zipSync } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PieceMatch } from "./pieces-match";
import type { ExistingCerfa } from "@/app/sourcing/ao/[id]/dossier/cerfa/actions";

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export interface ZipCompileInput {
  /** DC1 validé (null si absent). */
  dc1: ExistingCerfa | null;
  /** DC2 validé (null si absent). */
  dc2: ExistingCerfa | null;
  /** Résultats du matching pièces RC vs bibliothèque. */
  pieceMatches: PieceMatch[];
}

export interface ZipCompileResult {
  /** Buffer ZIP prêt pour upload Storage. */
  buffer: Uint8Array;
  /** Nombre de fichiers inclus dans le ZIP. */
  fileCount: number;
  /**
   * Vrai si au moins un téléchargement Storage a échoué silencieusement.
   * Permet à l'appelant de distinguer "aucune pièce" (bibliothèque vide)
   * de "pièces existent mais Storage inatteignable".
   */
  hadDownloadFailures: boolean;
}

// ---------------------------------------------------------------------------
// Helper : sanitize filename
// ---------------------------------------------------------------------------

/**
 * Sanitize un nom de fichier pour l'inclure dans le ZIP sans problème
 * de système de fichiers ou d'URL. Conserve l'extension.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

// ---------------------------------------------------------------------------
// Helper : download depuis Storage
// ---------------------------------------------------------------------------

/**
 * Télécharge un fichier depuis un bucket Supabase Storage et retourne
 * son contenu en Uint8Array. Retourne null si le download échoue.
 */
async function downloadFromStorage(
  supabase: SupabaseClient,
  bucket: string,
  storagePath: string,
): Promise<Uint8Array | null> {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(storagePath);
    if (error || !data) {
      console.error(`[zip-compile:download:fail] ${bucket}/${storagePath}`, error);
      return null;
    }
    const arrayBuffer = await data.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (err) {
    console.error(`[zip-compile:download:unhandled] ${bucket}/${storagePath}`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

/**
 * Compile un dossier de candidature en ZIP depuis Storage.
 *
 * Stratégie résiliente : si un fichier individuel ne peut pas être téléchargé,
 * on le logue et on continue — le ZIP sera généré avec les fichiers disponibles.
 *
 * @param supabase  Client Supabase avec session utilisateur (pour RLS Storage)
 * @param input     Données compilées (DC1/DC2 paths + matching pièces)
 */
export async function compileDossierZip(
  supabase: SupabaseClient,
  input: ZipCompileInput,
): Promise<ZipCompileResult> {
  const files: Record<string, Uint8Array> = {};
  let hadDownloadFailures = false;

  // 1. DC1.json
  if (input.dc1?.storagePath) {
    const dc1Bytes = await downloadFromStorage(supabase, "response_files", input.dc1.storagePath);
    if (dc1Bytes) {
      files["dossier_candidature/CERFA/DC1.json"] = dc1Bytes;
    } else {
      hadDownloadFailures = true;
    }
  }

  // 2. DC2.json
  if (input.dc2?.storagePath) {
    const dc2Bytes = await downloadFromStorage(supabase, "response_files", input.dc2.storagePath);
    if (dc2Bytes) {
      files["dossier_candidature/CERFA/DC2.json"] = dc2Bytes;
    } else {
      hadDownloadFailures = true;
    }
  }

  // 3. Pièces disponibles de la bibliothèque
  const availablePieces = input.pieceMatches.filter(
    (m) => m.status === "available" && m.libraryItem !== null,
  );

  // Évite les doublons si deux pièces matchent le même document bibliothèque
  const seenLibraryIds = new Set<string>();

  for (const match of availablePieces) {
    const item = match.libraryItem!;

    if (seenLibraryIds.has(item.id)) continue;
    seenLibraryIds.add(item.id);

    const bytes = await downloadFromStorage(supabase, "company_library", item.storagePath);
    if (bytes) {
      const safeFilename = sanitizeFilename(item.name);
      files[`dossier_candidature/pieces/${safeFilename}`] = bytes;
    } else {
      hadDownloadFailures = true;
    }
  }

  // 4. Générer le ZIP
  const fileCount = Object.keys(files).length;

  if (fileCount === 0) {
    return { buffer: new Uint8Array(0), fileCount: 0, hadDownloadFailures };
  }

  const zipped = zipSync(files, { level: 6 });

  return { buffer: zipped, fileCount, hadDownloadFailures };
}
