/**
 * Indexation d'un item presentation_library via Claude.
 *
 * Décision Steve 2026-06-03 (chantier E MVP). Première itération :
 *  - Modèle : Haiku 4.5 (rapide + ~3 fois moins cher que Sonnet).
 *  - Entrée : nom du doc + kind biblio + (si PDF) le binaire envoyé natif.
 *  - Sortie : titre intelligent, mots-clés, résumé, type canonique, entités.
 *  - Pas de prompt en BDD pour l'instant — prompt hardcodé. Si on veut le
 *    versionner (comme `rc_analysis_full`), on bascule plus tard.
 *
 * Coûts approximatifs : ~1-5 c€ par doc indexé selon taille (Haiku 4.5 :
 *   $0.80 / Mtok input + $4 / Mtok output).
 *
 * Limites :
 *  - Pas d'OCR explicite (Claude PDF natif fait l'OCR si scanné).
 *  - .docx/.xlsx/.doc : on n'envoie que les métadonnées (nom + catégorie)
 *    → résultat dégradé mais utilisable comme heuristique d'enrichissement.
 *  - Pas de retry en cas d'échec API.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const MODEL_VERSION = "haiku-4-5";
const ANTHROPIC_MODEL = "claude-haiku-4-5";

/**
 * Schéma Zod de la sortie Claude (JSON strict).
 *
 * Tous les champs sont optionnels côté sortie : Claude peut renvoyer `null`
 * si l'info n'est pas extractible. La sérialisation BDD remplit avec des
 * defaults sensibles.
 */
export const libraryIndexOutputSchema = z.object({
  extracted_title: z.string().min(1).max(120).nullable().optional(),
  keywords: z.array(z.string().min(1).max(40)).max(15).default([]),
  summary: z.string().max(280).nullable().optional(),
  /**
   * Type canonique parmi un vocabulaire fermé — aligné sur LIBRARY_KINDS
   * + quelques variantes utiles au matching. `null` si Claude ne sait pas.
   */
  doc_type: z
    .enum([
      "dc1",
      "dc2",
      "dc4",
      "pouvoir_mandataire",
      "kbis",
      "urssaf",
      "attestation_fiscale",
      "assurance_rc",
      "assurance_decennale",
      "declaration_honneur",
      "declaration_ca",
      "declaration_effectifs",
      "rib",
      "presentation_entreprise",
      "moyens_humains",
      "references",
      "memoire_rse",
      "memoire_technique",
      "cv",
      "ordre_architectes",
      "qualibat",
      "qualifelec",
      "qualipv",
      "autre",
    ])
    .nullable()
    .optional(),
  /** Entités structurées libres (SIRET, dates, montants, etc.). */
  extracted_entities: z.record(z.string(), z.unknown()).default({}),
});

export type LibraryIndexOutput = z.infer<typeof libraryIndexOutputSchema>;

// ---------------------------------------------------------------------------
// Types retour
// ---------------------------------------------------------------------------

export type IndexLibraryItemResult =
  | {
      ok: true;
      output: LibraryIndexOutput;
      modelVersion: string;
      tokensIn: number;
      tokensOut: number;
      costUsd: number;
      latencyMs: number;
    }
  | {
      ok: false;
      error: "anthropic_error" | "parse_error" | "internal_error" | "missing_api_key";
      message?: string;
    };

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * Prompt système — instructions générales.
 */
const SYSTEM_PROMPT = `Tu es un assistant expert en marchés publics français. Tu analyses des documents de la bibliothèque d'une entreprise candidate (attestations, références, CV, présentations société, déclarations CERFA, etc.).

Pour chaque document, tu extrais :
  1. extracted_title — un titre clair et court (≤ 120 caractères) qui décrit le document mieux que son nom de fichier.
  2. keywords — 3 à 10 mots-clés en français (lowercase, séparables, pas de stop-words) utiles pour matcher des pièces demandées dans un RC.
  3. summary — un résumé en 1-2 phrases (≤ 280 caractères) du contenu et de l'usage du document.
  4. doc_type — la catégorie canonique parmi la liste fournie.
  5. extracted_entities — un objet JSON avec les données structurées détectées (varie selon le type) :
     - attestation* : { siret, raison_sociale, date_emission, date_validite }
     - reference   : { client, montant_eur, annee, role }
     - kbis        : { siret, denomination, date_immat, capital_eur }
     - autres      : libre

Tu réponds STRICTEMENT en JSON valide, sans backticks, sans commentaire, conforme au schéma demandé. Tous les champs sont optionnels — si tu ne sais pas, renvoie null ou tableau vide.`;

/**
 * Construit le prompt utilisateur final (texte + reminders sur le JSON schema).
 */
function buildUserPrompt(itemName: string, itemKind: string): string {
  return `Document à indexer.
Nom de fichier : ${itemName}
Catégorie déclarée par l'admin : ${itemKind}

Schéma JSON attendu :
{
  "extracted_title": "string|null",
  "keywords": ["string", ...],
  "summary": "string|null",
  "doc_type": "dc1|dc2|dc4|pouvoir_mandataire|kbis|urssaf|attestation_fiscale|assurance_rc|assurance_decennale|declaration_honneur|declaration_ca|declaration_effectifs|rib|presentation_entreprise|moyens_humains|references|memoire_rse|memoire_technique|cv|ordre_architectes|qualibat|qualifelec|qualipv|autre|null",
  "extracted_entities": { ... }
}

Réponds uniquement par le JSON valide.`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractJsonBlock(raw: string): string {
  // Si Claude renvoie un block markdown malgré l'instruction, on l'extrait.
  const fence = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fence?.[1]) return fence[1].trim();
  // Sinon on cherche le premier `{` et le dernier `}` correspondants.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return raw.trim();
  return raw.slice(start, end + 1);
}

function estimateCostUsd(tokensIn: number, tokensOut: number): number {
  // Haiku 4.5 — tarifs au moment de l'implémentation (2026-06).
  // À ajuster si la grille tarifaire change.
  const INPUT_PER_M_USD = 0.8;
  const OUTPUT_PER_M_USD = 4;
  return (tokensIn * INPUT_PER_M_USD + tokensOut * OUTPUT_PER_M_USD) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

/**
 * Indexe un item presentation_library via Claude.
 *
 * @param input.itemName       Nom du fichier (cf. `presentation_library.name`)
 * @param input.itemKind       Catégorie biblio (cf. `presentation_library.kind`)
 * @param input.pdfBytes       PDF binaire (si dispo) — Claude PDF natif.
 *                              Si absent, on indexe uniquement sur les métadonnées.
 */
export async function indexLibraryItem(input: {
  itemName: string;
  itemKind: string;
  pdfBytes?: Uint8Array;
}): Promise<IndexLibraryItemResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "missing_api_key" };
  }

  const client = new Anthropic({ apiKey });

  const userText = buildUserPrompt(input.itemName, input.itemKind);

  // Construction du `content` selon dispo PDF.
  type ContentBlock =
    | { type: "text"; text: string }
    | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

  const content: ContentBlock[] = [];
  if (input.pdfBytes && input.pdfBytes.length > 0) {
    const base64 = Buffer.from(input.pdfBytes).toString("base64");
    content.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: base64,
      },
    });
  }
  content.push({ type: "text", text: userText });

  const t0 = Date.now();
  try {
    const message = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });
    const latencyMs = Date.now() - t0;

    // Extraction du texte de réponse.
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { ok: false, error: "anthropic_error", message: "no text block returned" };
    }
    const jsonText = extractJsonBlock(textBlock.text);

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonText);
    } catch (err) {
      return {
        ok: false,
        error: "parse_error",
        message: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const validated = libraryIndexOutputSchema.safeParse(parsedJson);
    if (!validated.success) {
      return {
        ok: false,
        error: "parse_error",
        message: `Schema validation failed: ${validated.error.message}`,
      };
    }

    const tokensIn = message.usage?.input_tokens ?? 0;
    const tokensOut = message.usage?.output_tokens ?? 0;

    return {
      ok: true,
      output: validated.data,
      modelVersion: MODEL_VERSION,
      tokensIn,
      tokensOut,
      costUsd: estimateCostUsd(tokensIn, tokensOut),
      latencyMs,
    };
  } catch (err) {
    return {
      ok: false,
      error: "anthropic_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
