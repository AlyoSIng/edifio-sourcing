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

import {
  AUDIT_ACTIONS,
  AUDIT_SCHEMAS,
  tenderDeferSchema,
  tenderRejectSchema,
  tenderSelectSchema,
} from "./schemas";
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

// `membership_change` retiré de la liste : implémenté STRICT par la PR
// auth-password-pivot (2026-05-20) — couvert par son propre describe block
// plus bas. Reste 11 placeholders.
const PLACEHOLDER_ACTIONS = [
  "login",
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

describe("membershipChangeSchema (A2 strict)", () => {
  const validBase = {
    target_user_id: "11111111-1111-1111-1111-111111111111",
    target_email: "newbie@alyosingenierie.fr",
    to_role: "user" as const,
    operation: "invite" as const,
  };

  it("accepte un invite valide (sans from_role)", () => {
    const schema = AUDIT_SCHEMAS.membership_change;
    expect(schema.safeParse(validBase).success).toBe(true);
  });

  it("accepte un update avec from_role et to_role", () => {
    const schema = AUDIT_SCHEMAS.membership_change;
    expect(
      schema.safeParse({
        ...validBase,
        from_role: "user",
        to_role: "admin",
        operation: "update",
      }).success,
    ).toBe(true);
  });

  it("accepte un revoke (to_role omis acceptable)", () => {
    const schema = AUDIT_SCHEMAS.membership_change;
    const { to_role: _drop, ...withoutToRole } = validBase;
    void _drop;
    expect(
      schema.safeParse({
        ...withoutToRole,
        from_role: "admin",
        operation: "revoke",
      }).success,
    ).toBe(true);
  });

  it("accepte regenerate_provisional avec from_role === to_role (convention CTO Sophie 2026-05-20)", () => {
    const schema = AUDIT_SCHEMAS.membership_change;
    expect(
      schema.safeParse({
        ...validBase,
        from_role: "user",
        to_role: "user",
        operation: "regenerate_provisional",
      }).success,
    ).toBe(true);
  });

  it("rejette un operation hors enum", () => {
    const schema = AUDIT_SCHEMAS.membership_change;
    expect(
      schema.safeParse({
        ...validBase,
        operation: "promote",
      }).success,
    ).toBe(false);
  });

  it("rejette un target_user_id non-UUID", () => {
    const schema = AUDIT_SCHEMAS.membership_change;
    expect(
      schema.safeParse({
        ...validBase,
        target_user_id: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("rejette un target_email invalide", () => {
    const schema = AUDIT_SCHEMAS.membership_change;
    expect(
      schema.safeParse({
        ...validBase,
        target_email: "no-at-sign",
      }).success,
    ).toBe(false);
  });

  it("rejette un from_role hors enum membership_role", () => {
    const schema = AUDIT_SCHEMAS.membership_change;
    expect(
      schema.safeParse({
        ...validBase,
        from_role: "superuser",
        operation: "update",
      }).success,
    ).toBe(false);
  });
});

describe("placeholders (11 actions non-strictes)", () => {
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
  it("AUDIT_ACTIONS contient exactement 15 actions (spec post-PR n°5)", () => {
    expect(AUDIT_ACTIONS).toHaveLength(15);
  });

  it("chaque action dans AUDIT_ACTIONS a un schéma dans AUDIT_SCHEMAS", () => {
    for (const action of AUDIT_ACTIONS) {
      expect(AUDIT_SCHEMAS[action]).toBeDefined();
    }
  });

  it("AUDIT_SCHEMAS n'a pas de clef en plus que les 15 actions", () => {
    const schemaKeys = Object.keys(AUDIT_SCHEMAS).sort();
    const expectedKeys = [...AUDIT_ACTIONS].sort();
    expect(schemaKeys).toEqual(expectedKeys);
  });

  it("AUDIT_ACTIONS contient bien tender_defer (A14) et tender_reject (A15)", () => {
    expect(AUDIT_ACTIONS).toContain("tender_defer");
    expect(AUDIT_ACTIONS).toContain("tender_reject");
  });
});

// ----------------------------------------------------------------------------
// A14 — tender_defer STRICT
// ----------------------------------------------------------------------------

describe("tenderDeferSchema (A14 strict)", () => {
  const validBase = {
    tender_id: "11111111-1111-1111-1111-111111111111",
    tender_ref: "25-AO-00142",
    deferred_until: "2026-05-22T06:30:00.000Z",
    hours_offset: 24,
  };

  it("valide un payload conforme (24h offset)", () => {
    expect(tenderDeferSchema.safeParse(validBase).success).toBe(true);
  });

  it("valide un autre offset positif (168h = 1 semaine)", () => {
    expect(tenderDeferSchema.safeParse({ ...validBase, hours_offset: 168 }).success).toBe(true);
  });

  it("rejette un tender_id non-UUID", () => {
    expect(tenderDeferSchema.safeParse({ ...validBase, tender_id: "not-a-uuid" }).success).toBe(
      false,
    );
  });

  it("rejette un tender_ref vide", () => {
    expect(tenderDeferSchema.safeParse({ ...validBase, tender_ref: "" }).success).toBe(false);
  });

  it("rejette un deferred_until non-ISO", () => {
    expect(tenderDeferSchema.safeParse({ ...validBase, deferred_until: "demain" }).success).toBe(
      false,
    );
  });

  it("rejette un hours_offset négatif", () => {
    expect(tenderDeferSchema.safeParse({ ...validBase, hours_offset: -1 }).success).toBe(false);
  });

  it("rejette un hours_offset zéro (positive strict)", () => {
    expect(tenderDeferSchema.safeParse({ ...validBase, hours_offset: 0 }).success).toBe(false);
  });

  it("rejette un hours_offset non-entier", () => {
    expect(tenderDeferSchema.safeParse({ ...validBase, hours_offset: 24.5 }).success).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// A15 — tender_reject STRICT
// ----------------------------------------------------------------------------

describe("tenderRejectSchema (A15 strict)", () => {
  const validBase = {
    tender_id: "22222222-2222-2222-2222-222222222222",
    tender_ref: "25-AO-00142",
    reason: "Hors zone géo (Île-de-France, hors périmètre AlyoS)",
    score_at_reject: 87,
  };

  it("valide un payload conforme avec motif", () => {
    expect(tenderRejectSchema.safeParse(validBase).success).toBe(true);
  });

  it("valide un payload sans motif (reason = null)", () => {
    expect(tenderRejectSchema.safeParse({ ...validBase, reason: null }).success).toBe(true);
  });

  it("valide un payload sans score (score_at_reject = null)", () => {
    expect(tenderRejectSchema.safeParse({ ...validBase, score_at_reject: null }).success).toBe(
      true,
    );
  });

  it("valide un motif vide string (autorisé : c'est nullable, pas non-vide)", () => {
    // Distinct de reason=null : ici l'utilisateur a soumis "" -- on accepte.
    // Le côté UI peut transformer "" en null avant audit si voulu.
    expect(tenderRejectSchema.safeParse({ ...validBase, reason: "" }).success).toBe(true);
  });

  it("rejette un tender_id non-UUID", () => {
    expect(tenderRejectSchema.safeParse({ ...validBase, tender_id: "not-uuid" }).success).toBe(
      false,
    );
  });

  it("rejette un tender_ref vide", () => {
    expect(tenderRejectSchema.safeParse({ ...validBase, tender_ref: "" }).success).toBe(false);
  });

  it("rejette un motif > 280 caractères", () => {
    const longReason = "x".repeat(281);
    expect(tenderRejectSchema.safeParse({ ...validBase, reason: longReason }).success).toBe(false);
  });

  it("valide un motif pile à 280 caractères (borne incluse)", () => {
    const reason280 = "x".repeat(280);
    expect(tenderRejectSchema.safeParse({ ...validBase, reason: reason280 }).success).toBe(true);
  });

  it("rejette un score_at_reject hors 0-100", () => {
    expect(tenderRejectSchema.safeParse({ ...validBase, score_at_reject: 150 }).success).toBe(
      false,
    );
    expect(tenderRejectSchema.safeParse({ ...validBase, score_at_reject: -1 }).success).toBe(false);
  });

  it("rejette un score_at_reject non-entier", () => {
    expect(tenderRejectSchema.safeParse({ ...validBase, score_at_reject: 87.5 }).success).toBe(
      false,
    );
  });
});
