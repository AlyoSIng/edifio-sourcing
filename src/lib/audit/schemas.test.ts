/**
 * Tests Zod — schémas audit log (`schemas.ts`).
 *
 * Couvre :
 *  - A4 `tender_select` STRICT : validation positive + 5 cas négatifs (un par
 *    contrainte). C'est l'action implémentée pour la PR #2.
 *  - Les 12 autres actions en placeholder : 1 test smoke par action (accepte
 *    objet vide + accepte champs arbitraires via `passthrough()`).
 *  - Coverage `AUDIT_ACTIONS` : la liste contient bien 13 entrées et chacune
 *    a un schéma dans `AUDIT_SCHEMAS`.
 */

import { describe, expect, it } from "vitest";

import { AUDIT_ACTIONS, AUDIT_SCHEMAS, tenderSelectSchema } from "./schemas";
import type { AuditAction } from "./schemas";

// ----------------------------------------------------------------------------
// A4 — tender_select STRICT
// ----------------------------------------------------------------------------

describe("tenderSelectSchema (A4 strict)", () => {
  it("valide un payload conforme (solo)", () => {
    const result = tenderSelectSchema.safeParse({
      tender_id: "11111111-1111-1111-1111-111111111111",
      tender_ref: "25-AO-00142",
      mode: "solo",
      score: 87,
    });
    expect(result.success).toBe(true);
  });

  it("valide un payload conforme (tandem, score 0)", () => {
    const result = tenderSelectSchema.safeParse({
      tender_id: "22222222-2222-2222-2222-222222222222",
      tender_ref: "BOAMP-abc",
      mode: "tandem",
      score: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejette tender_id non-UUID", () => {
    const result = tenderSelectSchema.safeParse({
      tender_id: "not-a-uuid",
      tender_ref: "ref",
      mode: "solo",
      score: 50,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["tender_id"]);
    }
  });

  it("rejette tender_ref vide", () => {
    const result = tenderSelectSchema.safeParse({
      tender_id: "11111111-1111-1111-1111-111111111111",
      tender_ref: "",
      mode: "solo",
      score: 50,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["tender_ref"]);
    }
  });

  it("rejette mode autre que solo|tandem", () => {
    const result = tenderSelectSchema.safeParse({
      tender_id: "11111111-1111-1111-1111-111111111111",
      tender_ref: "ref",
      mode: "studio",
      score: 50,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["mode"]);
    }
  });

  it("rejette score hors 0-100", () => {
    const res1 = tenderSelectSchema.safeParse({
      tender_id: "11111111-1111-1111-1111-111111111111",
      tender_ref: "ref",
      mode: "solo",
      score: 150,
    });
    expect(res1.success).toBe(false);

    const res2 = tenderSelectSchema.safeParse({
      tender_id: "11111111-1111-1111-1111-111111111111",
      tender_ref: "ref",
      mode: "solo",
      score: -1,
    });
    expect(res2.success).toBe(false);
  });

  it("rejette score non-entier (float)", () => {
    const result = tenderSelectSchema.safeParse({
      tender_id: "11111111-1111-1111-1111-111111111111",
      tender_ref: "ref",
      mode: "solo",
      score: 87.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejette payload incomplet (manque score)", () => {
    const result = tenderSelectSchema.safeParse({
      tender_id: "11111111-1111-1111-1111-111111111111",
      tender_ref: "ref",
      mode: "solo",
    });
    expect(result.success).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// Placeholders — 12 actions non-strictes (smoke tests)
// ----------------------------------------------------------------------------

const PLACEHOLDER_ACTIONS = [
  "login",
  "membership_change",
  "search_profile_change",
  "architect_solicit",
  "dossier_diffuse",
  "ai_run",
  "odoo_opportunity_create",
  "architect_change",
  "rgpd_export",
  "token_revoke",
  "data_delete",
  "access_attempt",
] as const satisfies readonly AuditAction[];

describe("placeholders (12 actions non-strictes)", () => {
  // Test smoke : chaque placeholder accepte un objet vide ET un objet arbitraire
  // via `passthrough()`. Garantit qu'on peut déjà coder `audit({action: 'login',
  // data: {...}})` côté call-site sans attendre l'implémentation stricte.
  for (const action of PLACEHOLDER_ACTIONS) {
    it(`${action} : accepte un objet vide`, () => {
      const schema = AUDIT_SCHEMAS[action];
      expect(schema.safeParse({}).success).toBe(true);
    });

    it(`${action} : accepte des champs arbitraires (passthrough)`, () => {
      const schema = AUDIT_SCHEMAS[action];
      const result = schema.safeParse({
        arbitrary_field: "value",
        nested: { foo: 42 },
        array: [1, 2, 3],
      });
      expect(result.success).toBe(true);
    });
  }
});

// ----------------------------------------------------------------------------
// Coverage globale — AUDIT_ACTIONS et AUDIT_SCHEMAS sont alignés
// ----------------------------------------------------------------------------

describe("AUDIT_ACTIONS + AUDIT_SCHEMAS — couverture", () => {
  it("AUDIT_ACTIONS contient exactement 13 actions (spec)", () => {
    expect(AUDIT_ACTIONS).toHaveLength(13);
  });

  it("chaque action dans AUDIT_ACTIONS a un schéma dans AUDIT_SCHEMAS", () => {
    for (const action of AUDIT_ACTIONS) {
      expect(AUDIT_SCHEMAS[action]).toBeDefined();
    }
  });

  it("AUDIT_SCHEMAS n'a pas de clef en plus que les 13 actions", () => {
    const schemaKeys = Object.keys(AUDIT_SCHEMAS).sort();
    const expectedKeys = [...AUDIT_ACTIONS].sort();
    expect(schemaKeys).toEqual(expectedKeys);
  });
});
