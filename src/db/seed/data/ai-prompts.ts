/**
 * Catalogue des 12 prompts IA (P1-P12) — seed initial `ai_prompts`.
 *
 * Source de vérité : `specs/ai_prompts_v1.md` (figée par CTO 2026-05-10).
 *
 * Étape 6/7 de la PR #2 module sourcing engine (cf.
 * `notes-de-suivi/DRAFT_PR2_BOAMP_CONNECTOR.md` §Étape 6/7).
 *
 * Pourquoi un fichier séparé ?
 *  - `system_prompt` + `user_prompt_template` font plusieurs centaines de
 *    caractères chacun → inline dans `index.ts` casse la lisibilité.
 *  - Le contenu de chaque prompt doit pouvoir être revu en PR isolément
 *    (CMO / CTO) sans rouvrir tout le seed.
 *  - Snapshot test (cf. `ai-prompts.test.ts`) verrouille tout changement
 *    silencieux : moindre dérive nécessite revue CTO (cf. Gate 5).
 *
 * UUIDs déterministes (préfixe `bbbbbbbb-0000-0000-0000-0000000000XX`) pour
 * idempotence : relancer le seed ne crée pas de doublons (contrainte UNIQUE
 * `(name, version)` + `onConflictDoNothing()`).
 *
 * Politique versioning (rappel) : tout changement d'un prompt incrémente
 * `version`, l'ancienne reste `active=false` (cf. spec §Politique de versioning).
 * Cette livraison v1 marque toutes les versions à `1` et `active=true`.
 */

import type { aiPrompts } from "../../schema";

/** Type strict pour le seed — aligne `NewAiPrompt` (cf. schema/ai.ts) */
export type AiPromptSeed = typeof aiPrompts.$inferInsert;

// ============================================================================
// Schémas Zod sérialisés (cf. spec §Zod)
// ----------------------------------------------------------------------------
// On stocke l'expression Zod *en texte* dans `output_schema_zod`. La spec
// indique : « expression Zod sérialisée pour validation côté app ». Ce n'est
// pas un .toString() de l'objet (Zod 4 n'expose pas une sérialisation
// canonique stable) — on stocke directement le code source TypeScript du
// schéma, qui sera ré-évalué côté worker IA via `eval` contrôlé OU mieux,
// référencé par `prompt_name` côté code (le texte ici sert de documentation
// + sourcing du schéma exact lors d'un audit).
//
// Choix technique assumé : pas de eval. Le `output_schema_zod` reste un
// SOURCE TEXT versionné en BDD pour traçabilité ; la validation runtime
// utilise les schémas TS importés (à venir PR #7 scoring IA). Le texte
// permet de reconstruire le schéma manuellement si une version ancienne
// d'un prompt doit être analysée des années plus tard.
// ============================================================================

const RC_ANALYSIS_ZOD = `z.object({
  pieces_demandees: z.array(z.object({
    nom: z.string(),
    format: z.string().optional(),
    signature_requise: z.boolean(),
    obligatoire: z.boolean(),
    provenance: z.object({ page: z.number(), citation: z.string() }),
  })),
  echeances: z.array(z.object({
    type: z.enum(['questions', 'visite', 'remise_plis', 'autre']),
    date: z.string(),
    heure: z.string().optional(),
    provenance: z.object({ page: z.number(), citation: z.string() }),
  })),
  criteres_jugement: z.array(z.object({
    critere: z.string(),
    ponderation_pct: z.number().min(0).max(100),
    sous_criteres: z.array(z.string()).optional(),
    provenance: z.object({ page: z.number(), citation: z.string() }),
  })),
  modalites_remise: z.object({
    plateforme: z.string().optional(),
    format_pli: z.string().optional(),
    signature: z.string().optional(),
    provenance: z.object({ page: z.number(), citation: z.string() }).optional(),
  }),
  clauses_specifiques: z.array(z.object({
    description: z.string(),
    provenance: z.object({ page: z.number(), citation: z.string() }),
  })),
  alertes: z.array(z.string()),
})`;

const MEMO_TECHNIQUE_ZOD = `z.object({
  sections: z.array(z.object({
    critere: z.string(),
    ponderation_pct: z.number(),
    contenu_markdown: z.string(),
    word_count: z.number(),
  })),
  total_word_count: z.number(),
  references_utilisees: z.array(z.string()),
})`;

const CERFA_FIELDS_ZOD = `z.object({
  cerfa_kind: z.enum(['DC1', 'DC2', 'DC4', 'ATTRI1']),
  fields: z.array(z.object({
    field_id: z.string(),
    field_label: z.string(),
    value: z.string(),
    source: z.enum(['biblio', 'company_data', 'tender_data', 'a_completer']),
    confidence: z.number().min(0).max(1),
  })),
  fields_a_completer: z.array(z.string()),
})`;

const SCORING_COMPLEMENTARY_ZOD = `z.object({
  ai_score: z.number().min(0).max(100),
  reasons: z.array(z.string()).max(3),
})`;

const MATCHING_RATIONALE_ZOD = `z.object({
  text: z.string().min(50).max(400),
  register: z.enum(['tu', 'vous']),
})`;

const EMAIL_SUBJECT_ZOD = `z.object({
  variants: z.array(z.string().max(60)).length(3),
})`;

const TENDER_SUMMARY_SHORT_ZOD = `z.object({
  text: z.string().max(140),
})`;

const DECLINE_MOTIF_ZOD = `z.object({
  category: z.enum(['mots_cles','type_marche','geo','montant','delai','acheteur','autre']),
  verbatim_clef: z.string().max(200).optional(),
})`;

const LIBRARY_MATCH_ZOD = `z.object({
  matched_library_id: z.string().uuid().nullable(),
  match_quality: z.enum(['vert', 'orange', 'rouge']),
  reason: z.string().max(200),
})`;

const EXPIRY_ALERT_ZOD = `z.object({
  text: z.string().max(200),
  urgence: z.enum(['informatif', 'alerte', 'urgent']),
})`;

const ACCROCHE_MEMO_ZOD = `z.object({
  text: z.string().min(150).max(500),
})`;

// ============================================================================
// Catalogue P1-P12
// ----------------------------------------------------------------------------
// UUIDs déterministes : `bbbbbbbb-0000-0000-0000-0000000000<NN>` où NN = numéro
// du prompt sur 2 digits hex. Permet aux tests de prédire les IDs.
// ============================================================================

export const AI_PROMPTS_V1_CATALOG: AiPromptSeed[] = [
  // ----- P1 : rc_analysis_full (sonnet-4-6) ---------------------------------
  {
    id: "bbbbbbbb-0000-0000-0000-000000000001",
    name: "rc_analysis_full",
    version: 1,
    model: "sonnet-4-6",
    systemPrompt:
      "Tu es un assistant expert en marchés publics français du BTP. Tu lis le " +
      "Règlement de Consultation (RC) d'un appel d'offres et tu en extrais une " +
      "structure JSON normalisée. Chaque champ extrait doit comporter sa " +
      "provenance (page + citation courte). Tu ne hallucines jamais : si une " +
      'information est absente, tu marques `"non_trouve"`.',
    userPromptTemplate:
      "Voici le RC complet d'un AO. Extrais la structure JSON conformément au " +
      "schéma fourni. Cite la page et un extrait littéral pour chaque champ. " +
      "RC : <<RC_TEXT>>",
    outputSchemaZod: RC_ANALYSIS_ZOD,
    active: true,
  },

  // ----- P2 : memo_technique_generation (sonnet-4-6) ------------------------
  {
    id: "bbbbbbbb-0000-0000-0000-000000000002",
    name: "memo_technique_generation",
    version: 1,
    model: "sonnet-4-6",
    systemPrompt:
      "Tu rédiges un mémoire technique structuré pour un appel d'offres BTP " +
      "en cotraitance. Tu pondères les sections selon les critères de jugement " +
      "fournis. Le ton est professionnel, factuel, sans superlatifs creux. Tu " +
      "cites les références fournies sans en inventer.",
    userPromptTemplate:
      "Critères de jugement (avec pondérations) : <<CRITERIA>>. Profil " +
      "entreprise : <<COMPANY_PROFILE>>. Références mobilisables : <<REFERENCES>>. " +
      "Spécificités de l'AO : <<TENDER_SPECS>>. Rédige le mémoire technique en " +
      "markdown structuré, une section par critère, taille proportionnelle à " +
      "la pondération.",
    outputSchemaZod: MEMO_TECHNIQUE_ZOD,
    active: true,
  },

  // ----- P3 : cerfa_field_inference (sonnet-4-6) ----------------------------
  {
    id: "bbbbbbbb-0000-0000-0000-000000000003",
    name: "cerfa_field_inference",
    version: 1,
    model: "sonnet-4-6",
    systemPrompt:
      "Tu pré-remplis les CERFA marchés publics (DC1, DC2, DC4, ATTRI1) en " +
      "t'appuyant sur les pièces de la bibliothèque entreprise et les données " +
      'fournies. Si une donnée est absente ou ambiguë, tu marques le champ `"a_completer"` ' +
      "plutôt que d'inventer.",
    userPromptTemplate:
      "Type de CERFA : <<CERFA_KIND>>. Données entreprise (extraits attestations + " +
      "références) : <<COMPANY_DATA>>. Tender : <<TENDER_DATA>>. Génère le mapping " +
      "champ-par-champ.",
    outputSchemaZod: CERFA_FIELDS_ZOD,
    active: true,
  },

  // ----- P4 : tender_scoring_complementary (haiku-4-5) ----------------------
  {
    id: "bbbbbbbb-0000-0000-0000-000000000004",
    name: "tender_scoring_complementary",
    version: 1,
    model: "haiku-4-5",
    systemPrompt:
      "Tu donnes un score complémentaire 0-100 sur un AO, après que le moteur " +
      "de règles a déjà appliqué ses filtres. Tu pondères : adéquation " +
      "sémantique au profil, qualité formelle du dossier source, signaux faibles " +
      "(acheteur récurrent, lots intéressants). Tu retournes uniquement le score " +
      "numérique et 1-2 raisons.",
    userPromptTemplate:
      "AO : <<TENDER_SUMMARY>>. Profil de recherche : <<PROFILE>>. Score règles : " +
      "<<RULE_SCORE>>. Donne ton score IA.",
    outputSchemaZod: SCORING_COMPLEMENTARY_ZOD,
    active: true,
  },

  // ----- P5 : architect_matching_rationale (haiku-4-5) ----------------------
  {
    id: "bbbbbbbb-0000-0000-0000-000000000005",
    name: "architect_matching_rationale",
    version: 1,
    model: "haiku-4-5",
    systemPrompt:
      "Tu rédiges le bloc « Pourquoi nous t'avons choisi » pour la page " +
      "tokenisée architecte. 2-3 phrases. Concret, factuel, basé sur les " +
      "données fournies (spécialité, géo, collaborations passées). Tutoyer ou " +
      "vouvoyer selon le drapeau fourni.",
    userPromptTemplate:
      "Architecte : <<ARCHITECT_DATA>>. Tender : <<TENDER_DATA>>. Score matching : " +
      "<<MATCH_SCORE>>. Registre : <<REGISTER>> (TU ou VOUS). Rédige le bloc.",
    outputSchemaZod: MATCHING_RATIONALE_ZOD,
    active: true,
  },

  // ----- P6 : email_subject_solicitation (haiku-4-5) ------------------------
  {
    id: "bbbbbbbb-0000-0000-0000-000000000006",
    name: "email_subject_solicitation",
    version: 1,
    model: "haiku-4-5",
    systemPrompt:
      "Tu génères un sujet d'email court (< 60 caractères) pour une " +
      "sollicitation d'architecte sur un AO. Pas de capitales superflues. Tu " +
      "adaptes au registre TU/VOUS et au type d'opération.",
    userPromptTemplate:
      "Tender : <<TENDER_TITLE>>. Registre : <<REGISTER>>. Génère 3 variantes de sujet.",
    outputSchemaZod: EMAIL_SUBJECT_ZOD,
    active: true,
  },

  // ----- P7 : email_subject_followup (haiku-4-5) ----------------------------
  {
    id: "bbbbbbbb-0000-0000-0000-000000000007",
    name: "email_subject_followup",
    version: 1,
    model: "haiku-4-5",
    systemPrompt:
      "Tu génères un sujet d'email court (< 60 caractères) pour une relance " +
      "d'architecte. Ton ferme mais courtois. Adaptation TU/VOUS.",
    userPromptTemplate:
      "Tender ref : <<TENDER_REF>>. Jours restants : <<DAYS_LEFT>>. Registre : " +
      "<<REGISTER>>. Génère 3 variantes.",
    outputSchemaZod: EMAIL_SUBJECT_ZOD,
    active: true,
  },

  // ----- P8 : tender_summary_short (haiku-4-5) ------------------------------
  {
    id: "bbbbbbbb-0000-0000-0000-000000000008",
    name: "tender_summary_short",
    version: 1,
    model: "haiku-4-5",
    systemPrompt:
      "Tu condenses un AO en 1-2 phrases (max 140 caractères) pour " +
      "notification PWA. Mentionne le type d'opération, le montant, et " +
      "l'échéance. Format direct.",
    userPromptTemplate: "<<TENDER_DATA>>",
    outputSchemaZod: TENDER_SUMMARY_SHORT_ZOD,
    active: true,
  },

  // ----- P9 : decline_motif_categorize (haiku-4-5) --------------------------
  {
    id: "bbbbbbbb-0000-0000-0000-000000000009",
    name: "decline_motif_categorize",
    version: 1,
    model: "haiku-4-5",
    systemPrompt:
      "Tu catégorises un motif libre de rejet d'AO par l'utilisateur en une " +
      "catégorie standardisée. Tu peux aussi extraire un verbatim utile.",
    userPromptTemplate:
      "Motif libre : <<USER_TEXT>>. Catégories possibles : `mots_cles` · " +
      "`type_marche` · `geo` · `montant` · `delai` · `acheteur` · `autre`.",
    outputSchemaZod: DECLINE_MOTIF_ZOD,
    active: true,
  },

  // ----- P10 : library_piece_match (haiku-4-5) ------------------------------
  {
    id: "bbbbbbbb-0000-0000-0000-00000000000a",
    name: "library_piece_match",
    version: 1,
    model: "haiku-4-5",
    systemPrompt:
      "Tu associes une pièce demandée par le RC à la pièce correspondante " +
      "dans la bibliothèque de l'entreprise. Si plusieurs candidates, tu " +
      "prends la plus récente non expirée. Si rien ne match, tu retournes `null`.",
    userPromptTemplate: "Pièce demandée : <<PIECE_RC>>. Bibliothèque : <<LIBRARY_ITEMS>>.",
    outputSchemaZod: LIBRARY_MATCH_ZOD,
    active: true,
  },

  // ----- P11 : attestation_expiry_alert_text (haiku-4-5) --------------------
  {
    id: "bbbbbbbb-0000-0000-0000-00000000000b",
    name: "attestation_expiry_alert_text",
    version: 1,
    model: "haiku-4-5",
    systemPrompt:
      "Tu rédiges un message d'alerte court (< 200 caractères) pour signaler " +
      "l'expiration prochaine d'une attestation. Tu adaptes le ton selon " +
      "l'urgence (J-30 informatif, J-7 alerte, J-1 urgent).",
    userPromptTemplate:
      "Attestation : <<ATTESTATION_NAME>>. Jours avant expiration : <<DAYS>>. " +
      "Registre : neutre.",
    outputSchemaZod: EXPIRY_ALERT_ZOD,
    active: true,
  },

  // ----- P12 : accroche_memo_intro (haiku-4-5) ------------------------------
  {
    id: "bbbbbbbb-0000-0000-0000-00000000000c",
    name: "accroche_memo_intro",
    version: 1,
    model: "haiku-4-5",
    systemPrompt:
      "Tu rédiges une accroche d'introduction de mémoire technique BTP " +
      "(3-5 phrases, < 500 caractères). Ton professionnel, montre la " +
      "compréhension du contexte client. Pas de phrase commerciale plate.",
    userPromptTemplate:
      "Opération : <<TENDER_TITLE>>. Acheteur : <<BUYER>>. Contexte (extrait " +
      "CCAP) : <<CONTEXT>>. Profil entreprise : <<COMPANY_PROFILE>>.",
    outputSchemaZod: ACCROCHE_MEMO_ZOD,
    active: true,
  },
];

/** Sanity-check à l'import : on doit avoir exactement 12 prompts. */
if (AI_PROMPTS_V1_CATALOG.length !== 12) {
  throw new Error(
    `[ai-prompts seed] catalogue attendu = 12 prompts, observé = ${AI_PROMPTS_V1_CATALOG.length}`,
  );
}
