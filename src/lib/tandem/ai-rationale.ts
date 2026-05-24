/**
 * Génération de rationale IA « pourquoi cet architecte » — module Tandem.
 *
 * Source de vérité :
 *  - `specs/module_tandem_engine_v1.md` §3.1 — appel P5 Haiku par architecte
 *    du top 3 pour expliquer le score (affiché dans la short-list M-D1).
 *  - `specs/ai_prompts_v1.md` (P5) — prompt structuré + schéma Zod.
 *
 * Stratégie MVP (sans client Anthropic — branchement Phase 7+) :
 *  - **Fallback string déterministe** dérivé du breakdown (toujours dispo,
 *    pas de coût IA, pas de latence).
 *  - **Hook IA optionnel** via `generateRationaleWithAi` : injection d'une
 *    fonction `aiClient` côté caller pour activer l'appel Haiku quand
 *    `ANTHROPIC_API_KEY` est posée. Sinon → fallback.
 *
 * Choix : pas de couplage en dur au SDK Anthropic dans ce module. La spec P5
 * est documentée mais l'intégration concrète viendra avec `src/lib/ai/anthropic.ts`
 * (à écrire Phase 7 — pas dans le périmètre Tandem étape 2).
 *
 * Format de sortie : 1 phrase courte (≤ 220 chars), ton edifio (direct,
 * chaleureux, sans jargon). Pas de fioritures — Sandrine lit en diagonale.
 */

import type { Architect } from "@/db/schema/architects";
import type { Tender } from "@/db/schema/tenders";

import type { MatchBreakdown } from "./matching";

/* -------------------------------------------------------------------------- */
/*  Fallback déterministe                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Génère une rationale fallback à partir du breakdown — sans IA.
 * Toujours synchrone, toujours dispo, jamais d'erreur.
 *
 * Format type :
 *   « Score 75. Spécialité OK, département 75 connu, 3 collabs passées. »
 *
 * Cas particulier : score = 0 → « Aucun critère ne matche fortement. »
 */
export function fallbackRationale(
  architect: Architect,
  tender: Pick<Tender, "title">,
  score: number,
  breakdown: MatchBreakdown,
): string {
  if (score === 0) {
    return `${architect.cabinet} ne matche aucun critère fort sur cet AO.`;
  }
  const reasons: string[] = [];
  if (breakdown.specialty > 0) {
    reasons.push(
      breakdown.specialty >= 15 ? "spécialité directement alignée" : "spécialité connexe au sujet",
    );
  }
  if (breakdown.geo > 0) {
    reasons.push(
      breakdown.geo >= 20
        ? "implanté dans le département cible"
        : "implanté dans un département limitrophe",
    );
  }
  if (breakdown.history > 0) {
    const collabs = architect.pastCollabsCount;
    reasons.push(
      collabs === 1
        ? "1 collaboration passée avec nous"
        : `${collabs} collaborations passées avec nous`,
    );
  }
  if (breakdown.availability > 0 && breakdown.availability < 15) {
    reasons.push("disponibilité limitée (déjà sollicité ce mois-ci)");
  }
  if (breakdown.preference > 0) {
    reasons.push("marqué « préféré » par l'équipe");
  }

  // Cap à 220 chars pour ne pas exploser la carte M-D1.
  const tail = reasons.length > 0 ? ` : ${reasons.join(", ")}.` : ".";
  const sentence = `${architect.cabinet}, score ${score}/100${tail}`;
  return sentence.length > 220 ? `${sentence.slice(0, 217)}...` : sentence;
}

/* -------------------------------------------------------------------------- */
/*  Hook IA (optionnel)                                                       */
/* -------------------------------------------------------------------------- */

export interface AiRationaleClient {
  /**
   * Appel IA Haiku P5. Retourne `null` en cas d'échec (API down, timeout,
   * rate-limit) — le caller bascule sur le fallback.
   */
  generate(input: {
    architect: Architect;
    tender: Pick<Tender, "title" | "buyer">;
    breakdown: MatchBreakdown;
    score: number;
  }): Promise<string | null>;
}

/**
 * Génère une rationale en privilégiant l'IA si le client est fourni, sinon
 * fallback déterministe. JAMAIS d'erreur propagée — la short-list doit
 * s'afficher même si Anthropic est down.
 */
export async function generateRationaleWithAi(
  architect: Architect,
  tender: Pick<Tender, "title" | "buyer">,
  breakdown: MatchBreakdown,
  score: number,
  aiClient?: AiRationaleClient,
): Promise<string> {
  if (aiClient) {
    try {
      const ai = await aiClient.generate({ architect, tender, breakdown, score });
      if (ai && ai.trim().length > 0) {
        return ai.trim().length > 220 ? `${ai.trim().slice(0, 217)}...` : ai.trim();
      }
    } catch {
      // Swallow — on bascule sur le fallback.
    }
  }
  return fallbackRationale(architect, tender, score, breakdown);
}
