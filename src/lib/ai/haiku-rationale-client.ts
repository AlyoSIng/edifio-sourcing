/**
 * HaikuRationaleClient — implémentation Anthropic Haiku 4.5 de AiRationaleClient.
 *
 * Utilisé par matchArchitectsForTender pour générer une rationale courte
 * (≤ 220 chars) expliquant pourquoi un architecte est pertinent pour un AO.
 *
 * Prompt P5 (specs/ai_prompts_v1.md) : 1 phrase directe, ton edifio,
 * < 220 caractères. Haiku 4.5 retourne du texte brut (pas de JSON).
 *
 * Coût estimé : ~0,0008 $/appel (100 tok input + 50 tok output @ Haiku 4.5).
 * Timeout : 8 secondes via AbortSignal.timeout.
 * En cas d'erreur → retourne null, le caller bascule sur fallbackRationale.
 */

import Anthropic from "@anthropic-ai/sdk";

import type { AiRationaleClient } from "@/lib/tandem/ai-rationale";
import type { Architect } from "@/db/schema/architects";
import type { Tender } from "@/db/schema/tenders";
import type { MatchBreakdown } from "@/lib/tandem/matching";

const MODEL = "claude-haiku-4-5";

function buildPrompt(input: {
  architect: Architect;
  tender: Pick<Tender, "title" | "buyer">;
  breakdown: MatchBreakdown;
  score: number;
}): string {
  const { architect, tender, breakdown, score } = input;

  const parts: string[] = [];
  if (breakdown.specialty > 0) parts.push(`spécialité : +${breakdown.specialty}`);
  if (breakdown.geo > 0) parts.push(`géographie : +${breakdown.geo}`);
  if (breakdown.history > 0)
    parts.push(`historique : +${breakdown.history} (${architect.pastCollabsCount} collab(s))`);
  if (breakdown.availability > 0) parts.push(`disponibilité : +${breakdown.availability}`);
  if (breakdown.preference > 0) parts.push(`préféré : +${breakdown.preference}`);

  const breakdownStr = parts.length > 0 ? parts.join(", ") : "score de base";

  return `Tu es un assistant interne chez AlyoS Ingénierie (bureau d'études BTP). Rédige en français une phrase courte (≤ 220 caractères, ton direct et professionnel) expliquant pourquoi le cabinet "${architect.cabinet}" est proposé pour cet appel d'offres.

AO : "${tender.title}" — maître d'ouvrage : "${tender.buyer ?? "inconnu"}"
Score : ${score}/100 (détail : ${breakdownStr})

Réponds UNIQUEMENT avec la phrase de rationale, sans guillemets, sans introduction.`;
}

export function createHaikuRationaleClient(): AiRationaleClient {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  return {
    async generate(input) {
      try {
        const response = await anthropic.messages.create(
          {
            model: MODEL,
            max_tokens: 120,
            messages: [
              {
                role: "user",
                content: buildPrompt(input),
              },
            ],
          },
          { signal: AbortSignal.timeout(8000) },
        );

        const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : null;

        return text && text.length > 0 ? text : null;
      } catch (err) {
        console.warn("[haiku-rationale] Erreur Anthropic:", err);
        return null;
      }
    },
  };
}
