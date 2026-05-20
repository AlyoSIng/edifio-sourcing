/**
 * Tests catalogue AI prompts v1 (P1-P12) — edifio Sourcing.
 *
 * Source : `src/db/seed/data/ai-prompts.ts` (chargé statiquement, pas
 * d'accès BDD).
 *
 * Étape 6/7 PR #2. Garde-fous :
 *  - Cardinalité : 12 prompts P1-P12 exactement
 *  - Nommage : 12 `name` distincts, alignés `specs/ai_prompts_v1.md`
 *  - Version : toutes à 1 (livraison initiale)
 *  - active : tous à true (livraison initiale)
 *  - Modèle : P1-P3 = sonnet-4-6, P4-P12 = haiku-4-5 (cf. stratégie Gate 2 4/A)
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
] as const;

const SONNET_PROMPTS = new Set([
  "rc_analysis_full",
  "memo_technique_generation",
  "cerfa_field_inference",
]);

describe("AI_PROMPTS_V1_CATALOG — cardinalité + nommage", () => {
  it("contient exactement 12 prompts (P1-P12)", () => {
    expect(AI_PROMPTS_V1_CATALOG).toHaveLength(12);
  });

  it("les 12 noms correspondent à ai_prompts_v1.md", () => {
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

describe("AI_PROMPTS_V1_CATALOG — versions et activation", () => {
  it("toutes les versions = 1 (livraison initiale)", () => {
    for (const p of AI_PROMPTS_V1_CATALOG) {
      expect(p.version).toBe(1);
    }
  });

  it("tous active=true (livraison initiale, anciennes versions inexistantes)", () => {
    for (const p of AI_PROMPTS_V1_CATALOG) {
      expect(p.active).toBe(true);
    }
  });
});

describe("AI_PROMPTS_V1_CATALOG — choix modèles (Gate 2 stratégie 4/A)", () => {
  it("P1-P3 utilisent sonnet-4-6 (tâches longues / structurées)", () => {
    for (const p of AI_PROMPTS_V1_CATALOG) {
      if (SONNET_PROMPTS.has(p.name)) {
        expect(p.model).toBe("sonnet-4-6");
      }
    }
  });

  it("P4-P12 utilisent haiku-4-5 (tâches courtes / pré-classification)", () => {
    for (const p of AI_PROMPTS_V1_CATALOG) {
      if (!SONNET_PROMPTS.has(p.name)) {
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

  it("chaque prompt a un outputSchemaZod non vide (sérialisation Zod)", () => {
    for (const p of AI_PROMPTS_V1_CATALOG) {
      expect(p.outputSchemaZod).toBeDefined();
      expect((p.outputSchemaZod ?? "").length).toBeGreaterThan(0);
      // Sanity-check : le source TS doit au moins contenir `z.object`.
      expect(p.outputSchemaZod).toMatch(/z\.object/);
    }
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
