/**
 * Compilation d'un dossier de candidature en ZIP.
 *
 * Télécharge depuis Supabase Storage :
 *   - DC1 + DC2 PDF (bucket response_files)
 *   - Pouvoir mandataire (bucket company_library, item presentation_library
 *     avec kind='pouvoir_mandataire') — inclus systématiquement s'il existe,
 *     même hors liste RC, car quasi-obligatoire pour les groupements.
 *   - RC source en PDF (bucket tender_documents — copie pour traçabilité)
 *   - Documents disponibles de la bibliothèque (bucket company_library)
 *     issus du matching pieces RC ↔ bibliothèque.
 *
 * Structure du ZIP produit :
 *   dossier_candidature/
 *     CERFA/
 *       DC1.pdf
 *       DC2.pdf
 *     pouvoir_mandataire.{ext}    (si présent en bibliothèque)
 *     RC.{ext}                    (si présent dans tender_documents)
 *     pieces/
 *       {nom_piece_sanitize}.{ext}
 *
 * Utilise `fflate.zipSync` — pure JS, compatible Node.js 18+ et Edge Runtime.
 * Pas d'import BDD : fonction pure côté serveur.
 *
 * Source de vérité : brief Board PR-E 2026-05-26 + brief Lot D 2026-06-02
 *   (multi-archi / multi-BE + Pouvoir + RC).
 */

import { zipSync } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PieceMatch } from "./pieces-match";
import type { ExistingCerfa } from "@/app/sourcing/ao/[id]/dossier/cerfa/actions";
import type { PresentationLibraryItem } from "@/db/schema/library";

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

/**
 * Document de bibliothèque à inclure de force dans le ZIP (Pouvoir mandataire).
 * Pas de matching RC nécessaire — l'appelant sait déjà qu'il faut l'inclure.
 */
export interface ForcedLibraryItem {
  /** Item presentation_library (storage_path dans bucket company_library). */
  item: PresentationLibraryItem;
  /**
   * Nom de fichier cible dans le ZIP (sans dossier).
   * Ex. `pouvoir_mandataire.docx`. L'extension est conservée si elle figure
   * dans le nom — sinon ajoutée depuis `storage_path`.
   */
  targetFilename: string;
}

/**
 * Document source de l'AO à inclure dans le ZIP (typiquement le RC).
 */
export interface TenderDocumentRef {
  /** Chemin Supabase Storage dans le bucket `tender_documents`. */
  storagePath: string;
  /** Nom de fichier cible dans le ZIP. Ex. `RC.pdf`. */
  targetFilename: string;
}

export interface ZipCompileInput {
  /** DC1 validé (null si absent). */
  dc1: ExistingCerfa | null;
  /** DC2 validé (null si absent). */
  dc2: ExistingCerfa | null;
  /** Résultats du matching pièces RC vs bibliothèque. */
  pieceMatches: PieceMatch[];
  /**
   * Items bibliothèque à inclure de force, hors matching RC.
   * Typiquement le Pouvoir mandataire. Vide si rien à forcer.
   */
  forcedLibraryItems?: ForcedLibraryItem[];
  /**
   * Documents AO source à inclure (typiquement le RC analysé).
   * Vide si rien à inclure.
   */
  tenderDocuments?: TenderDocumentRef[];
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
// Helper : extension depuis storage_path
// ---------------------------------------------------------------------------

/**
 * Extrait l'extension finale d'un storage_path (sans le point).
 * Retourne `bin` par défaut si aucune extension n'est trouvée.
 */
function extensionFromStoragePath(storagePath: string): string {
  const lastDot = storagePath.lastIndexOf(".");
  if (lastDot === -1 || lastDot === storagePath.length - 1) return "bin";
  // Ne garder que les chars alphanumériques (anti-injection nom de fichier).
  const ext = storagePath.slice(lastDot + 1).match(/^[a-zA-Z0-9]+/);
  return ext ? ext[0].toLowerCase() : "bin";
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
 * @param input     Données compilées (DC1/DC2 paths + matching pièces + Pouvoir + RC)
 */
export async function compileDossierZip(
  supabase: SupabaseClient,
  input: ZipCompileInput,
): Promise<ZipCompileResult> {
  const files: Record<string, Uint8Array> = {};
  let hadDownloadFailures = false;

  // 1. DC1.pdf (les CERFA sont désormais générés en PDF — cf. brief Lot A 2026-06-02).
  if (input.dc1?.storagePath) {
    const dc1Bytes = await downloadFromStorage(supabase, "response_files", input.dc1.storagePath);
    if (dc1Bytes) {
      const ext = extensionFromStoragePath(input.dc1.storagePath);
      files[`dossier_candidature/CERFA/DC1.${ext}`] = dc1Bytes;
    } else {
      hadDownloadFailures = true;
    }
  }

  // 2. DC2.pdf
  if (input.dc2?.storagePath) {
    const dc2Bytes = await downloadFromStorage(supabase, "response_files", input.dc2.storagePath);
    if (dc2Bytes) {
      const ext = extensionFromStoragePath(input.dc2.storagePath);
      files[`dossier_candidature/CERFA/DC2.${ext}`] = dc2Bytes;
    } else {
      hadDownloadFailures = true;
    }
  }

  // 3. Items bibliothèque forcés (Pouvoir mandataire). Pas de doublon avec les
  // pièces matchées en aval : on prépare les IDs déjà inclus pour les filtrer.
  const forcedLibraryIds = new Set<string>();
  if (input.forcedLibraryItems && input.forcedLibraryItems.length > 0) {
    for (const forced of input.forcedLibraryItems) {
      const bytes = await downloadFromStorage(supabase, "company_library", forced.item.storagePath);
      if (bytes) {
        const safeFilename = sanitizeFilename(forced.targetFilename);
        files[`dossier_candidature/${safeFilename}`] = bytes;
        forcedLibraryIds.add(forced.item.id);
      } else {
        hadDownloadFailures = true;
      }
    }
  }

  // 4. Documents AO source (RC analysé) — copie pour traçabilité dossier.
  if (input.tenderDocuments && input.tenderDocuments.length > 0) {
    for (const doc of input.tenderDocuments) {
      const bytes = await downloadFromStorage(supabase, "tender_documents", doc.storagePath);
      if (bytes) {
        const safeFilename = sanitizeFilename(doc.targetFilename);
        files[`dossier_candidature/${safeFilename}`] = bytes;
      } else {
        hadDownloadFailures = true;
      }
    }
  }

  // 5. Pièces disponibles de la bibliothèque (matching RC ↔ bibliothèque).
  const availablePieces = input.pieceMatches.filter(
    (m) => m.status === "available" && m.libraryItem !== null,
  );

  // Évite les doublons si deux pièces matchent le même document bibliothèque,
  // OU si le doc figure déjà dans les forced (Pouvoir).
  const seenLibraryIds = new Set<string>(forcedLibraryIds);

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

  // 6. Générer le ZIP
  const fileCount = Object.keys(files).length;

  if (fileCount === 0) {
    return { buffer: new Uint8Array(0), fileCount: 0, hadDownloadFailures };
  }

  const zipped = zipSync(files, { level: 6 });

  return { buffer: zipped, fileCount, hadDownloadFailures };
}
