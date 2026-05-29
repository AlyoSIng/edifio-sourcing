/**
 * generateBrief — génère un brief court (3-4 lignes) pour un AO.
 *
 * Prompt versionné dans ai_prompts (name = "ao_brief"), run tracé dans ai_runs.
 * Maîtrise du coût : généré uniquement à la demande (pas de batch).
 * Provenance obligatoire : rawData.record uniquement — pas d'invention.
 *
 * Pattern exact copié depuis `analyze-rc.ts` (module IA de référence).
 *
 * Coûts Anthropic Claude Sonnet 4.6 : $3 / Mtok input + $15 / Mtok output.
 *
 * Réf : SPEC_ADDENDUM_260524_AO_DU_JOUR_REPORT_ET_BRIEF.md §Exigence 2.
 */

import Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { createHash } from "crypto";

import { db } from "@/db/client";
import { aiPrompts, aiRuns } from "@/db/schema/ai";
import type { TenderRawData } from "@/db/types/jsonb";

// ---------------------------------------------------------------------------
// Mapping enum BDD → identifiant API Anthropic
// ---------------------------------------------------------------------------
const ANTHROPIC_MODEL_MAP: Record<string, string> = {
  "sonnet-4-6": "claude-sonnet-4-6",
  "haiku-4-5": "claude-haiku-4-5",
};

// ---------------------------------------------------------------------------
// Types retour
// ---------------------------------------------------------------------------

export type GenerateBriefResult =
  | {
      ok: true;
      briefText: string;
      runId: string;
      costUsd: number;
      latencyMs: number;
    }
  | {
      ok: false;
      error: "prompt_not_seeded" | "parse_error" | "api_error" | "no_raw_data";
      message?: string;
    };

// ---------------------------------------------------------------------------
// Extraction contexte AO depuis rawData
// ---------------------------------------------------------------------------

/**
 * Construit un texte lisible à partir de rawData.record pour le prompt.
 * Priorité : objet > description > libelle pour le titre/objet.
 */
function buildAoContext(rawData: TenderRawData): string {
  const rec = rawData.record as Record<string, unknown>;

  const titre =
    (typeof rec["objet"] === "string" ? rec["objet"] : null) ??
    (typeof rec["libelle"] === "string" ? rec["libelle"] : null) ??
    "Non précisé";

  const acheteur =
    (typeof rec["nomacheteur"] === "string" ? rec["nomacheteur"] : null) ??
    (typeof rec["acheteur"] === "string" ? rec["acheteur"] : null) ??
    "Non précisé";

  const description =
    (typeof rec["description"] === "string" ? rec["description"] : null) ??
    (typeof rec["objet"] === "string" ? rec["objet"] : null) ??
    "Non précisé";

  const montant =
    (typeof rec["montant"] === "string" ? rec["montant"] : null) ??
    (typeof rec["montant"] === "number" ? String(rec["montant"]) : null) ??
    (typeof rec["valeur"] === "string" ? rec["valeur"] : null) ??
    "Non précisé";

  const deadline =
    (typeof rec["datecloture"] === "string" ? rec["datecloture"] : null) ??
    (typeof rec["date_cloture"] === "string" ? rec["date_cloture"] : null) ??
    (typeof rec["deadline"] === "string" ? rec["deadline"] : null) ??
    "Non précisé";

  const cpv =
    (typeof rec["codecpv_principal"] === "string" ? rec["codecpv_principal"] : null) ??
    "Non précisé";

  return [
    `Titre / objet : ${titre}`,
    `Maître d'ouvrage : ${acheteur}`,
    `Description : ${description.slice(0, 600)}${description.length > 600 ? "…" : ""}`,
    `Montant estimé : ${montant}`,
    `Date de clôture : ${deadline}`,
    `Code CPV principal : ${cpv}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

/**
 * Génère un brief court pour un AO à partir de son rawData BOAMP.
 *
 * @param rawData   Payload brut de la plateforme (tender.rawData)
 * @param tenderId  UUID du tender (pour traçabilité ai_runs)
 * @param orgId     UUID de l'organisation courante (résolu via getRequiredOrgId)
 * @param dbClient  Instance Drizzle (injectable en tests)
 */
export async function generateBrief(
  rawData: TenderRawData | null,
  tenderId: string,
  orgId: string,
  dbClient = db,
): Promise<GenerateBriefResult> {
  // 1. Vérifie que rawData est non-null
  if (!rawData?.record) {
    return { ok: false, error: "no_raw_data" };
  }

  // 2. Charge le prompt actif "ao_brief"
  const [prompt] = await dbClient
    .select()
    .from(aiPrompts)
    .where(and(eq(aiPrompts.name, "ao_brief"), eq(aiPrompts.active, true)))
    .limit(1);

  if (!prompt) {
    return { ok: false, error: "prompt_not_seeded" };
  }

  // 3. Construit le contexte AO
  const aoContext = buildAoContext(rawData);
  const userMessage = prompt.userPromptTemplate.replace("<<AO_CONTEXT>>", aoContext);

  // 4. Hash SHA-256 de l'input
  const inputHash = createHash("sha256").update(aoContext).digest("hex");

  // 5. Appel Anthropic
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const startMs = Date.now();

  let response: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    response = await client.messages.create({
      model: ANTHROPIC_MODEL_MAP[prompt.model] ?? prompt.model,
      max_tokens: 512,
      system: prompt.systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    console.error("[generate-brief:anthropic:fail]", err);
    return {
      ok: false,
      error: "api_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const latencyMs = Date.now() - startMs;

  // 6. Parse le texte retourné (texte direct, pas de JSON)
  const firstContent = response.content[0];
  const briefText =
    firstContent !== undefined && firstContent.type === "text"
      ? (firstContent.text as string).trim()
      : "";

  if (!briefText) {
    console.error("[generate-brief:parse:empty]");
    return { ok: false, error: "parse_error", message: "Réponse vide reçue de l'API" };
  }

  // 7. Calcule le coût
  const costUsd = (response.usage.input_tokens * 3 + response.usage.output_tokens * 15) / 1_000_000;

  // 8. INSERT dans ai_runs
  const inserted = await dbClient
    .insert(aiRuns)
    .values({
      organizationId: orgId,
      promptId: prompt.id,
      tenderId,
      inputHash,
      output: {
        prompt_name: prompt.name,
        prompt_version: prompt.version,
        payload: { brief_text: briefText },
        metadata: {
          tokens_in: response.usage.input_tokens,
          tokens_out: response.usage.output_tokens,
          input_hash: inputHash,
        },
      },
      costUsd: costUsd.toFixed(4),
      latencyMs,
      model: prompt.model,
      succeeded: true,
    })
    .returning({ id: aiRuns.id });

  const runId = inserted[0]?.id ?? "unknown";

  // 9. Retourne le résultat
  return { ok: true, briefText, runId, costUsd, latencyMs };
}
