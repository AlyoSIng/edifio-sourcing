/**
 * Tests catalogue AI prompts v1 (P1-P13) — edifio Sourcing.
 *
 * Source : `src/db/seed/data/ai-prompts.ts` (chargé statiquement, pas
 * d'accès BDD).
 *
 * Étape 6/7 PR #2 + F.7 (P13 ao_brief). Garde-fous :
 *  - Cardinalité : 13 prompts P1-P13 exactement
 *  - Nommage : 13 `name` distincts, alignés `specs/ai_prompts_v1.md`
 *  - Version : toutes à 1 (livraison initiale)
 *  - active : tous à true (livraison initiale)
 *  - Modèle : P1-P3 + P13 = sonnet-4-6, P4-P12 = haiku-4-5 (cf. stratégie Gate 2 4/A)
 *  - UUID : pattern déterministe `bbbbbbbb-0000-0000-0000-0000000000XX` (hex)
 *  - Snapshot : verrouille toute modification (toute évolution passe par
 *    revue CTO + bump de version dans le fichier source — voir spec §Politique
 *    de versioning).
 */

import { describe, expect, it } from "vitest";

import { AI_PROMPTS_V1_CATALOG } from "./data/ai-prompts";

const EXPECTED_NAMES = [
  "rc_analysis_full",
  "memo_technique_generation",
  "cerfa_field_inference",
  "tender_scoring_complementary",
  "architect_matching_rationale",
  "email_subject_solicitation",
  "email_subject_followup",
  "tender_summary_short",
  "decline_motif_categorize",
  "library_piece_match",
  "attestation_expiry_alert_text",
  "accroche_memo_intro",
  "ao_brief",
] as const;

const SONNET_PROMPTS = new Set([
  "rc_analysis_full",
  "memo_technique_generation",
  "cerfa_field_inference",
  "ao_brief",
]);

describe("AI_PROMPTS_V1_CATALOG — cardinalité + nommage", () => {
  it("contient exactement 13 prompts (P1-P13)", () => {
    expect(AI_PROMPTS_V1_CATALOG).toHaveLength(13);
  });

  it("les 13 noms correspondent à ai_prompts_v1.md", () => {
    const names = AI_PROMPTS_V1_CATALOG.map((p) => p.name);
    expect(names).toEqual(EXPECTED_NAMES);
  });

  it("aucun doublon de name (contrainte UNIQUE (name, version))", () => {
    const names = AI_PROMPTS_V1_CATALOG.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("aucun doublon d'UUID", () => {
    const ids = AI_PROMPTS_V1_CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/** Map des versions courantes par nom de prompt. Mettre à jour à chaque bump. */
const EXPECTED_VERSIONS: Record<string, number> = {
  rc_analysis_full: 2, // v2 — ajout competences_demandees (2026-05-28)
  memo_technique_generation: 1,
  cerfa_field_inference: 1,
  tender_scoring_complementary: 1,
  architect_matching_rationale: 1,
  email_subject_solicitation: 1,
  email_subject_followup: 1,
  tender_summary_short: 1,
  decline_motif_categorize: 1,
  library_piece_match: 1,
  attestation_expiry_alert_text: 1,
  accroche_memo_intro: 1,
  ao_brief: 1,
};

describe("AI_PROMPTS_V1_CATALOG — versions et activation", () => {
  it("versions conformes à la map EXPECTED_VERSIONS", () => {
    for (const p of AI_PROMPTS_V1_CATALOG) {
      expect(p.version, `version de ${p.name}`).toBe(EXPECTED_VERSIONS[p.name] ?? 1);
    }
  });

  it("tous active=true (la v2 de rc_analysis_full remplace la v1 dans le catalogue courant)", () => {
    for (const p of AI_PROMPTS_V1_CATALOG) {
      expect(p.active, `active de ${p.name}`).toBe(true);
    }
  });
});

describe("AI_PROMPTS_V1_CATALOG — choix modèles (Gate 2 stratégie 4/A)", () => {
  it("P1-P3 + P13 utilisent sonnet-4-6 (tâches longues / structurées)", () => {
    for (const p of AI_PROMPTS_V1_CATALOG) {
      if (SONNET_PROMPTS.has(p.name as string)) {
        expect(p.model).toBe("sonnet-4-6");
      }
    }
  });

  it("P4-P12 utilisent haiku-4-5 (tâches courtes / pré-classification)", () => {
    for (const p of AI_PROMPTS_V1_CATALOG) {
      if (!SONNET_PROMPTS.has(p.name as string)) {
        expect(p.model).toBe("haiku-4-5");
      }
    }
  });
});

describe("AI_PROMPTS_V1_CATALOG — UUIDs déterministes", () => {
  it("tous les UUIDs suivent le pattern bbbbbbbb-0000-0000-0000-0000000000XX (hex)", () => {
    const pattern = /^bbbbbbbb-0000-0000-0000-0000000000[0-9a-f]{2}$/i;
    for (const p of AI_PROMPTS_V1_CATALOG) {
      expect(p.id).toMatch(pattern);
    }
  });
});

describe("AI_PROMPTS_V1_CATALOG — contenu requis (system + user template + zod)", () => {
  it("chaque prompt a un systemPrompt non vide", () => {
    for (const p of AI_PROMPTS_V1_CATALOG) {
      expect(p.systemPrompt).toBeDefined();
      expect((p.systemPrompt ?? "").length).toBeGreaterThan(0);
    }
  });

  it("chaque prompt a un userPromptTemplate non vide", () => {
    for (const p of AI_PROMPTS_V1_CATALOG) {
      expect(p.userPromptTemplate).toBeDefined();
      expect((p.userPromptTemplate ?? "").length).toBeGreaterThan(0);
    }
  });

  it("chaque prompt structuré a un outputSchemaZod non vide (sérialisation Zod)", () => {
    // P13 (ao_brief) retourne du texte libre — outputSchemaZod intentionnellement null.
    const promptsWithSchema = AI_PROMPTS_V1_CATALOG.filter((p) => p.name !== "ao_brief");
    for (const p of promptsWithSchema) {
      expect(p.outputSchemaZod).toBeDefined();
      expect((p.outputSchemaZod ?? "").length).toBeGreaterThan(0);
      // Sanity-check : le source TS doit au moins contenir `z.object`.
      expect(p.outputSchemaZod).toMatch(/z\.object/);
    }
  });

  it("ao_brief a outputSchemaZod null (sortie texte libre)", () => {
    const aoBrief = AI_PROMPTS_V1_CATALOG.find((p) => p.name === "ao_brief");
    expect(aoBrief).toBeDefined();
    expect(aoBrief?.outputSchemaZod).toBeNull();
  });
});

// ----------------------------------------------------------------------------
// Snapshot — verrouille tout changement silencieux
// ----------------------------------------------------------------------------

describe("AI_PROMPTS_V1_CATALOG — snapshot (verrou versioning)", () => {
  it("snapshot conforme (toute modification = revue CTO + bump version)", () => {
    // Snapshot uniquement (name, version, model, active) pour rester lisible
    // — le contenu textuel des prompts évolue plus souvent que la structure,
    // un snapshot exhaustif serait trop lourd à mettre à jour. Pour le full
    // verrouillage du contenu, voir le pgTAP 06_ai_prompts_seed.sql qui assert
    // aussi les `system_prompt` non vides côté BDD post-seed.
    const summary = AI_PROMPTS_V1_CATALOG.map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      model: p.model,
      active: p.active,
    }));
    expect(summary).toMatchSnapshot();
  });
});
