/**
 * analyzeRc — appel Anthropic Sonnet 4.6 + validation Zod pour le prompt P1.
 *
 * Deux variantes exportées :
 *   - `analyzeRc(tenderId, rcText, orgId)`     : envoi du texte déjà extrait
 *     (variante rapide — utilisée en premier par `analyzeRcAction` après
 *     extraction via `pdf-parse`).
 *   - `analyzeRcFromPdf(tenderId, pdfBuffer, orgId)` : envoi direct du PDF binaire
 *     à Claude (API Anthropic gère extraction texte + OCR auto natif).
 *     Variante fallback (streaming HTTP — évite le 504 Vercel sur gros PDF).
 *     Utilisée si pdf-parse échoue ou si le texte extrait est trop court.
 *
 * Charge le prompt actif depuis `ai_prompts` (name='rc_analysis_full').
 * Si absent → `{ ok: false, error: 'prompt_not_seeded' }`.
 *
 * Trace chaque run dans `ai_runs` (organisation AlyoS, tenderId, inputHash,
 * output validé, coût estimé, latence).
 *
 * Contrainte Gate 5 §7 (provenance IA) : la validation Zod garantit que chaque
 * champ extrait comporte page + citation. Sans ça → `parse_error`.
 *
 * Coûts Anthropic Claude Sonnet 4.6 (approximation au moment de l'implémentation) :
 *   $3 / Mtok input + $15 / Mtok output.
 *   À ajuster si la grille tarifaire change (cf. DECISIONS.md ou facture Anthropic).
 *
 * Note streaming (2026-06-02) :
 *   `analyzeRcFromPdf` utilise `client.messages.stream()` plutôt que
 *   `client.messages.create()`. La connexion HTTP reste active pendant que les
 *   tokens arrivent côté Anthropic → pas de Vercel Gateway Timeout 504 même si
 *   l'analyse complète prend > 60 s (24 pages PDF natif typique : 60-90 s).
 *   `stream.finalMessage()` retourne le `Message` final identique à l'API
 *   non-streaming, donc le reste du pipeline (parse JSON, Zod, ai_runs) est inchangé.
 */

import Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { createHash } from "crypto";

import { db } from "@/db/client";
import { aiPrompts, aiRuns } from "@/db/schema/ai";
import { rcAnalysisSchema, type RcAnalysis } from "./schemas";

// ---------------------------------------------------------------------------
// Mapping enum BDD → identifiant API Anthropic
// L'enum `ai_model` stocke 'sonnet-4-6' / 'haiku-4-5'.
// L'API Anthropic exige le préfixe 'claude-' : 'claude-sonnet-4-6', etc.
// ---------------------------------------------------------------------------
const ANTHROPIC_MODEL_MAP: Record<string, string> = {
  "sonnet-4-6": "claude-sonnet-4-6",
  "haiku-4-5": "claude-haiku-4-5",
};

// ---------------------------------------------------------------------------
// Types retour
// ---------------------------------------------------------------------------

export type AnalyzeRcResult =
  | {
      ok: true;
      analysis: RcAnalysis;
      runId: string;
      costUsd: number;
      latencyMs: number;
      /** Nom du prompt utilisé (ex. 'rc_analysis_full') — pour audit log A7. */
      promptName: string;
      /** Version du prompt (snapshot) — pour audit log A7. */
      promptVersion: number;
      /** Identifiant modèle enum BDD (ex. 'sonnet-4-6') — pour audit log A7. */
      model: string;
      /** Tokens d'entrée consommés — pour audit log A7. */
      tokensIn: number;
      /** Tokens de sortie consommés — pour audit log A7. */
      tokensOut: number;
    }
  | {
      ok: false;
      error: "prompt_not_seeded" | "anthropic_error" | "parse_error" | "internal_error";
      message?: string;
    };

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

/**
 * Analyse un RC (texte extrait du PDF) via Claude Sonnet 4.6 — prompt P1.
 *
 * @param tenderId  UUID du tender auquel le RC appartient
 * @param rcText    Texte brut extrait du PDF RC (via pdf-parse)
 * @param orgId     UUID de l'organisation courante (résolu via getRequiredOrgId)
 */
export async function analyzeRc(
  tenderId: string,
  rcText: string,
  orgId: string,
): Promise<AnalyzeRcResult> {
  try {
    // 1. Charger le prompt actif depuis la BDD
    const [prompt] = await db
      .select()
      .from(aiPrompts)
      .where(and(eq(aiPrompts.name, "rc_analysis_full"), eq(aiPrompts.active, true)))
      .limit(1);

    if (!prompt) {
      return { ok: false, error: "prompt_not_seeded" };
    }

    // 2. Construire le message utilisateur (substitution du placeholder)
    const userMessage = prompt.userPromptTemplate.replace("<<RC_TEXT>>", rcText);

    // 3. Hash SHA-256 de l'input pour traçabilité + cache future
    const inputHash = createHash("sha256").update(rcText).digest("hex");

    // 4. Appel Anthropic
    //    Nom du modèle tel que configuré dans ai_prompts (champ `model` BDD).
    //    L'enum ai_model accepte 'sonnet-4-6' — l'API Anthropic accepte
    //    'claude-sonnet-4-5' (alias exact à vérifier avec le SDK).
    //    On passe le model tel quel depuis la BDD pour éviter tout désalignement.
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const startMs = Date.now();

    let response: Awaited<ReturnType<typeof client.messages.create>>;
    try {
      response = await client.messages.create({
        // Mapping enum BDD ('sonnet-4-6') → nom API Anthropic ('claude-sonnet-4-6')
        model: ANTHROPIC_MODEL_MAP[prompt.model] ?? prompt.model,
        max_tokens: 4000,
        system: prompt.systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });
    } catch (err) {
      console.error("[analyze-rc:anthropic:fail]", err);
      return {
        ok: false,
        error: "anthropic_error",
        message: err instanceof Error ? err.message : String(err),
      };
    }

    const latencyMs = Date.now() - startMs;

    // 5. Extraire le texte de la réponse
    const firstContent = response.content[0];
    const rawText =
      firstContent !== undefined && firstContent.type === "text"
        ? (firstContent.text as string)
        : "";

    // 6. Parser le JSON (Anthropic peut envelopper dans ```json ... ```)
    const jsonText = extractJson(rawText);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      console.error("[analyze-rc:parse:json:fail]", rawText.slice(0, 300));
      return {
        ok: false,
        error: "parse_error",
        message: "JSON invalide dans la réponse Anthropic",
      };
    }

    // 7. Valider avec Zod (garantit la présence des provenances — Gate 5 §7)
    const validated = rcAnalysisSchema.safeParse(parsed);
    if (!validated.success) {
      console.error("[analyze-rc:parse:zod:fail]", validated.error.flatten());
      return {
        ok: false,
        error: "parse_error",
        message: "Structure JSON inattendue dans la réponse Anthropic",
      };
    }

    // 8. Calculer le coût estimé
    //    Grille Claude Sonnet 4.6 (approximation) : $3/Mtok input + $15/Mtok output.
    const costUsd =
      (response.usage.input_tokens * 3 + response.usage.output_tokens * 15) / 1_000_000;

    // 9. Enregistrer le run IA dans ai_runs (traçabilité + audit)
    const inserted = await db
      .insert(aiRuns)
      .values({
        organizationId: orgId,
        promptId: prompt.id,
        tenderId,
        inputHash,
        output: {
          prompt_name: prompt.name,
          prompt_version: prompt.version,
          payload: validated.data as Record<string, unknown>,
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

    return {
      ok: true,
      analysis: validated.data,
      runId,
      costUsd,
      latencyMs,
      promptName: prompt.name,
      promptVersion: prompt.version,
      model: prompt.model,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
    };
  } catch (err) {
    console.error("[analyze-rc:unhandled]", err);
    return {
      ok: false,
      error: "internal_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Fonction alternative : envoi direct du PDF à Claude (PDF natif)
// ---------------------------------------------------------------------------

/**
 * Analyse un RC en envoyant le PDF binaire directement à Claude Sonnet 4.6.
 *
 * Avantages vs `analyzeRc(rcText)` :
 *   - Plus de dépendance à `pdf-parse` (bug sur PDFs à fonts custom / encodage exotique)
 *   - OCR automatique pour les pages scannées sans couche texte
 *   - Anthropic gère nativement l'extraction
 *
 * Limites Anthropic :
 *   - 32 Mo max par PDF (vérifié côté caller)
 *   - 100 pages max (au-delà : erreur API renvoyée comme `anthropic_error`)
 *
 * Le placeholder `<<RC_TEXT>>` du prompt est remplacé par une consigne textuelle
 * indiquant à Claude que le RC est en pièce jointe. L'inputHash est calculé
 * sur les bytes du PDF (différent du hash texte, mais idem traçabilité ai_runs).
 *
 * @param tenderId  UUID du tender auquel le RC appartient
 * @param pdfBuffer Buffer Node.js du PDF (lu depuis Supabase Storage)
 * @param orgId     UUID de l'organisation courante (résolu via getRequiredOrgId)
 */
export async function analyzeRcFromPdf(
  tenderId: string,
  pdfBuffer: Buffer,
  orgId: string,
): Promise<AnalyzeRcResult> {
  try {
    // 1. Charger le prompt actif depuis la BDD
    const [prompt] = await db
      .select()
      .from(aiPrompts)
      .where(and(eq(aiPrompts.name, "rc_analysis_full"), eq(aiPrompts.active, true)))
      .limit(1);

    if (!prompt) {
      return { ok: false, error: "prompt_not_seeded" };
    }

    // 2. Substitution du placeholder : Claude reçoit le PDF en pièce jointe,
    //    on lui demande explicitement de l'analyser directement.
    const userMessage = prompt.userPromptTemplate.replace(
      "<<RC_TEXT>>",
      "Le RC est joint en pièce jointe (PDF). Analyse-le directement.",
    );

    // 3. Hash SHA-256 sur les bytes du PDF (traçabilité + dédup future)
    const inputHash = createHash("sha256").update(pdfBuffer).digest("hex");

    // 4. Encodage base64 pour l'API Anthropic (DocumentBlockParam → Base64PDFSource)
    const pdfBase64 = pdfBuffer.toString("base64");

    // 5. Appel Anthropic — bloc `document` + bloc `text` dans le même message.
    //    IMPORTANT — On FORCE Claude Haiku 4.5 ici (au lieu du modèle Sonnet 4.6
    //    du prompt). Le PDF natif Sonnet sur 24 pages dépasse les 60 s de
    //    Vercel Gateway (504 timeout). Haiku 4.5 est 3-4× plus rapide et reste
    //    largement assez bon pour extraire pièces + critères + alertes.
    //    Si Anthropic relève la limite Vercel ou si Haiku donne des résultats
    //    insuffisants, on pourra repasser sur le model du prompt.
    const PDF_NATIVE_MODEL_ENUM = "haiku-4-5";
    const PDF_NATIVE_MODEL_API = ANTHROPIC_MODEL_MAP[PDF_NATIVE_MODEL_ENUM] ?? "claude-haiku-4-5";
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const startMs = Date.now();

    let response: Anthropic.Messages.Message;
    try {
      const stream = client.messages.stream({
        model: PDF_NATIVE_MODEL_API,
        max_tokens: 4000,
        system: prompt.systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBase64,
                },
              },
              { type: "text", text: userMessage },
            ],
          },
        ],
      });

      response = await stream.finalMessage();
    } catch (err) {
      console.error("[analyze-rc-from-pdf:anthropic:fail]", err);
      return {
        ok: false,
        error: "anthropic_error",
        message: err instanceof Error ? err.message : String(err),
      };
    }

    const latencyMs = Date.now() - startMs;

    // 6. Extraire le texte de la réponse
    const firstContent = response.content[0];
    const rawText =
      firstContent !== undefined && firstContent.type === "text"
        ? (firstContent.text as string)
        : "";

    // 7. Parser le JSON (Anthropic peut envelopper dans ```json ... ```)
    const jsonText = extractJson(rawText);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      console.error("[analyze-rc-from-pdf:parse:json:fail]", rawText.slice(0, 300));
      return {
        ok: false,
        error: "parse_error",
        message: "JSON invalide dans la réponse Anthropic",
      };
    }

    // 8. Valider avec Zod (garantit la présence des provenances — Gate 5 §7)
    const validated = rcAnalysisSchema.safeParse(parsed);
    if (!validated.success) {
      console.error("[analyze-rc-from-pdf:parse:zod:fail]", validated.error.flatten());
      return {
        ok: false,
        error: "parse_error",
        message: "Structure JSON inattendue dans la réponse Anthropic",
      };
    }

    // 9. Calcul du coût estimé — grille Haiku 4.5 : $1/Mtok input + $5/Mtok output
    //    (3-5× moins cher que Sonnet 4.6).
    const costUsd =
      (response.usage.input_tokens * 1 + response.usage.output_tokens * 5) / 1_000_000;

    // 10. Enregistrer le run IA dans ai_runs (modèle réellement utilisé = haiku-4-5)
    const inserted = await db
      .insert(aiRuns)
      .values({
        organizationId: orgId,
        promptId: prompt.id,
        tenderId,
        inputHash,
        output: {
          prompt_name: prompt.name,
          prompt_version: prompt.version,
          payload: validated.data as Record<string, unknown>,
          metadata: {
            tokens_in: response.usage.input_tokens,
            tokens_out: response.usage.output_tokens,
            input_hash: inputHash,
          },
        },
        costUsd: costUsd.toFixed(4),
        latencyMs,
        model: PDF_NATIVE_MODEL_ENUM,
        succeeded: true,
      })
      .returning({ id: aiRuns.id });

    const runId = inserted[0]?.id ?? "unknown";

    return {
      ok: true,
      analysis: validated.data,
      runId,
      costUsd,
      latencyMs,
      promptName: prompt.name,
      promptVersion: prompt.version,
      model: PDF_NATIVE_MODEL_ENUM,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
    };
  } catch (err) {
    console.error("[analyze-rc-from-pdf:unhandled]", err);
    return {
      ok: false,
      error: "internal_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Helper : extraction JSON robuste
// ---------------------------------------------------------------------------

/**
 * Extrait le JSON d'une réponse potentiellement enveloppée dans ```json ... ```.
 * En dernier recours, cherche le premier `{` ou `[` jusqu'au dernier `}` ou `]`.
 */
function extractJson(text: string): string {
  // Cas 1 : markdown code block ```json ... ``` ou ``` ... ```
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch && mdMatch[1] !== undefined) return mdMatch[1].trim();

  // Cas 2 : cherche le premier délimiteur JSON jusqu'au dernier
  const start = text.search(/[{[]/);
  const lastBrace = text.lastIndexOf("}");
  const lastBracket = text.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);
  if (start !== -1 && end > start) return text.slice(start, end + 1);

  // Cas 3 : on retourne tel quel, le JSON.parse échouera avec un message clair
  return text.trim();
}
