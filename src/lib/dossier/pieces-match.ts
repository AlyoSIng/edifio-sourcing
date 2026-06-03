/**
 * Matching pièces demandées (issues de l'analyse RC) vs bibliothèque entreprise.
 *
 * Algorithme simple, sans IA :
 *   - Normalisation des textes (lowercase, suppression des accents, split en mots)
 *   - Score = nombre de mots significatifs (longueur > 3) en commun entre
 *     le nom de la pièce et le `kind` ou `name` d'un item bibliothèque
 *   - `available` si score >= 2 mots communs
 *   - `partial`   si score == 1 mot commun
 *   - `missing`   si score == 0 mot commun
 *
 * Aucun import de BDD : fonction pure, 100 % testable avec Vitest.
 *
 * Source de vérité : brief Board PR-D 2026-05-25.
 */

import type { RcAnalysis } from "@/lib/ai/schemas";
import type { PresentationLibraryItem } from "@/db/schema/library";

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export type PieceMatchStatus = "available" | "partial" | "missing";

export interface PieceMatch {
  /** La pièce telle qu'extraite du RC par Claude. */
  piece: RcAnalysis["pieces_demandees"][number];
  /** Statut du matching avec la bibliothèque. */
  status: PieceMatchStatus;
  /** Meilleur item bibliothèque trouvé (null si `missing`). */
  libraryItem: PresentationLibraryItem | null;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise un texte pour le matching :
 * 1. Lowercase
 * 2. Supprime les accents (NFD + filtre diacritiques)
 * 3. Remplace la ponctuation par des espaces
 * 4. Split en tokens
 * 5. Filtre les mots de longueur <= 3 (mots courants insignifiants : de, le, la…)
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // supprime les diacritiques
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

/**
 * Calcule le nombre de mots significatifs communs entre deux ensembles de tokens.
 */
function commonTokenCount(tokensA: string[], tokensB: string[]): number {
  const setB = new Set(tokensB);
  return tokensA.filter((t) => setB.has(t)).length;
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

/**
 * Métadonnées d'indexation IA — extrait de `library_item_index` (chantier E).
 *
 * Quand disponible, ces champs sont concaténés à la surface de matching de
 * l'item biblio. Ça élargit considérablement le vocabulaire détecté par
 * `commonTokenCount` :
 *   - sans index : tokens = kind + name (souvent juste le nom de fichier)
 *   - avec index : tokens = kind + name + extracted_title + keywords
 *
 * Steve 2026-06-03 — V2 du chantier E.
 */
export interface LibraryItemIndexData {
  /** Titre intelligent extrait par Claude (peut être null). */
  extractedTitle?: string | null;
  /** Mots-clés normalisés (lowercase) extraits par Claude. */
  keywords?: readonly string[];
}

/**
 * Pour chaque pièce demandée par le RC, identifie le meilleur item de la
 * bibliothèque entreprise et qualifie la correspondance.
 *
 * Si `indexByItemId` est fourni, les items indexés bénéficient d'une surface
 * de matching élargie (titre intelligent + mots-clés Claude), ce qui réduit
 * fortement les faux négatifs (pièces marquées « manquant » alors qu'un doc
 * adapté existe en biblio avec un nom de fichier opaque).
 *
 * @param pieces         Pièces extraites par l'analyse RC (Claude Sonnet 4.6)
 * @param libraryItems   Items de la `presentation_library` de l'organisation
 * @param indexByItemId  Optionnel — map { library_item_id → métadonnées
 *                       indexées }. Si absent, on retombe sur l'ancienne
 *                       logique (kind + name seulement).
 * @returns              Tableau de matchings, dans le même ordre que `pieces`
 */
export function matchPiecesWithLibrary(
  pieces: RcAnalysis["pieces_demandees"],
  libraryItems: PresentationLibraryItem[],
  indexByItemId?: Map<string, LibraryItemIndexData>,
): PieceMatch[] {
  // Précalcul des tokens bibliothèque (évite de retokenizer à chaque pièce).
  // La surface inclut les métadonnées IA si dispo pour l'item.
  const libraryTokens: Array<{ item: PresentationLibraryItem; tokens: string[] }> =
    libraryItems.map((item) => {
      const surfaceParts = [item.kind, item.name];
      const idx = indexByItemId?.get(item.id);
      if (idx) {
        if (idx.extractedTitle) surfaceParts.push(idx.extractedTitle);
        if (idx.keywords && idx.keywords.length > 0) {
          surfaceParts.push(idx.keywords.join(" "));
        }
      }
      return {
        item,
        tokens: tokenize(surfaceParts.join(" ")),
      };
    });

  return pieces.map((piece): PieceMatch => {
    const pieceTokens = tokenize(piece.nom);

    // Si la pièce a 0 token significatif → missing par défaut
    if (pieceTokens.length === 0) {
      return { piece, status: "missing", libraryItem: null };
    }

    // Trouver le meilleur match
    let bestScore = 0;
    let bestItem: PresentationLibraryItem | null = null;

    for (const { item, tokens } of libraryTokens) {
      const score = commonTokenCount(pieceTokens, tokens);
      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }

    let status: PieceMatchStatus;
    if (bestScore >= 2) {
      status = "available";
    } else if (bestScore === 1) {
      status = "partial";
    } else {
      status = "missing";
    }

    return {
      piece,
      status,
      libraryItem: status !== "missing" ? bestItem : null,
    };
  });
}
