/**
 * Tests unitaires — resolveBrevoTemplate + assertRgpdGuardrails.
 *
 * Couvre :
 *  - Résolution depuis la BDD (db retourne une ligne)
 *  - Fallback sur défaut si absent en BDD (db retourne null)
 *  - Fallback silencieux si table n'existe pas (erreur Postgres 42P01)
 *  - Throw `rgpd_lien_opposition_manquant` si lien_opposition absent
 *    dans un template solicitation_*
 *  - Throw `rgpd_art14_mention_manquante` si mention art.14 absente
 *  - Pas de garde-fou sur les templates neutres (decline_ack, etc.)
 *  - Throw `template_introuvable` si clé inconnue et pas en BDD
 *  - `source` correctement renseignée selon l'origine
 */

import { describe, expect, it } from "vitest";

import { assertRgpdGuardrails, resolveBrevoTemplate } from "./template-resolver";
import type { DrizzleClient } from "./template-resolver";

/* -------------------------------------------------------------------------- */
/*  Helpers de mock DrizzleClient                                              */
/* -------------------------------------------------------------------------- */

/**
 * Crée un mock DrizzleClient dont `execute` retourne les rows fournies.
 */
function dbReturning(rows: Array<{ subject: string; body: string }>): DrizzleClient {
  return {
    execute: async () => rows,
  } as unknown as DrizzleClient;
}

/**
 * Crée un mock DrizzleClient dont `execute` lève une erreur Postgres 42P01
 * (undefined_table — table n'existe pas encore).
 */
function dbTableMissing(): DrizzleClient {
  return {
    execute: async () => {
      const err = new Error('relation "message_templates" does not exist') as Error & {
        code: string;
      };
      err.code = "42P01";
      throw err;
    },
  } as unknown as DrizzleClient;
}

/**
 * Crée un mock DrizzleClient dont `execute` lève une erreur générique
 * (pas une 42P01 — doit être re-throwée).
 */
function dbGenericError(): DrizzleClient {
  return {
    execute: async () => {
      throw new Error("connection refused");
    },
  } as unknown as DrizzleClient;
}

const VALID_ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/* -------------------------------------------------------------------------- */
/*  resolveBrevoTemplate — résolution BDD                                      */
/* -------------------------------------------------------------------------- */

describe("resolveBrevoTemplate — résolution BDD", () => {
  it("retourne le template BDD si disponible (source='db')", async () => {
    const db = dbReturning([
      {
        subject: "Sujet custom BDD {{ao_objet}}",
        body: "Corps custom {{lien_opposition}} art. 14 obligatoire {{rgpd_block}}",
      },
    ]);
    const result = await resolveBrevoTemplate("architect_solicitation_VOUS", VALID_ORG_ID, db);
    expect(result.source).toBe("db");
    expect(result.subject).toBe("Sujet custom BDD {{ao_objet}}");
    expect(result.body).toContain("Corps custom");
  });

  it("retourne la première ligne si plusieurs (LIMIT 1 géré côté SQL)", async () => {
    const db = dbReturning([
      { subject: "Premier", body: "Corps {{lien_opposition}} art. 14 {{rgpd_block}}" },
      { subject: "Second", body: "Ignoré" },
    ]);
    const result = await resolveBrevoTemplate("architect_solicitation_TU", VALID_ORG_ID, db);
    expect(result.subject).toBe("Premier");
  });
});

/* -------------------------------------------------------------------------- */
/*  resolveBrevoTemplate — fallback défaut                                     */
/* -------------------------------------------------------------------------- */

describe("resolveBrevoTemplate — fallback défaut", () => {
  it("retourne le contenu par défaut si BDD retourne [] (source='default')", async () => {
    const db = dbReturning([]);
    const result = await resolveBrevoTemplate("architect_solicitation_VOUS", VALID_ORG_ID, db);
    expect(result.source).toBe("default");
    expect(result.subject).toContain("cotraitance");
    expect(result.body).toContain("{{ params.nom_commercial }}");
  });

  it("fallback silencieux si table n'existe pas (erreur 42P01)", async () => {
    const db = dbTableMissing();
    // Ne doit pas throw — fallback sur défaut
    const result = await resolveBrevoTemplate("architect_solicitation_VOUS", VALID_ORG_ID, db);
    expect(result.source).toBe("default");
  });

  it("propage les erreurs BDD non-42P01", async () => {
    const db = dbGenericError();
    await expect(
      resolveBrevoTemplate("architect_solicitation_VOUS", VALID_ORG_ID, db),
    ).rejects.toThrow("connection refused");
  });

  it("throw template_introuvable si clé inconnue et pas en BDD", async () => {
    const db = dbReturning([]);
    await expect(resolveBrevoTemplate("unknown_key_xyz", VALID_ORG_ID, db)).rejects.toThrow(
      /template_introuvable/,
    );
  });
});

/* -------------------------------------------------------------------------- */
/*  assertRgpdGuardrails — lien_opposition                                     */
/* -------------------------------------------------------------------------- */

describe("assertRgpdGuardrails — lien_opposition absent", () => {
  it("throw rgpd_lien_opposition_manquant si lien_opposition absent (solicitation)", () => {
    const body = "Corps sans lien opposition art. 14 RGPD seulement";
    expect(() => assertRgpdGuardrails("architect_solicitation_VOUS", body)).toThrow(
      "rgpd_lien_opposition_manquant",
    );
  });

  it("throw rgpd_lien_opposition_manquant si lien absent (followup)", () => {
    const body = "Corps relance art. 14 sans lien";
    expect(() => assertRgpdGuardrails("architect_followup_TU", body)).toThrow(
      "rgpd_lien_opposition_manquant",
    );
  });

  it("ne throw pas si {{lien_opposition}} présent (syntaxe simple)", () => {
    const body = "Corps {{lien_opposition}} art. 14 RGPD";
    expect(() => assertRgpdGuardrails("architect_solicitation_VOUS", body)).not.toThrow();
  });

  it("ne throw pas si {{ params.lien_opposition }} présent (syntaxe params)", () => {
    const body = "Corps {{ params.lien_opposition }} art. 14 mention";
    expect(() => assertRgpdGuardrails("architect_solicitation_TU", body)).not.toThrow();
  });

  it("ne throw pas si {{rgpd_block}} présent (contient lien + art.14)", () => {
    const body = "Corps {{rgpd_block}} intégral";
    expect(() => assertRgpdGuardrails("architect_solicitation_VOUS", body)).not.toThrow();
  });

  it("ne throw pas si {{ params.rgpd_block }} présent", () => {
    const body = "Corps {{ params.rgpd_block }} intégral";
    expect(() => assertRgpdGuardrails("architect_solicitation_VOUS", body)).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/*  assertRgpdGuardrails — mention art.14                                      */
/* -------------------------------------------------------------------------- */

describe("assertRgpdGuardrails — mention art.14 absente", () => {
  it("throw rgpd_art14_mention_manquante si art.14 absent mais lien présent", () => {
    // Lien présent mais pas la mention art.14
    const body = "Corps {{lien_opposition}} uniquement, sans mention RGPD article";
    expect(() => assertRgpdGuardrails("architect_solicitation_VOUS", body)).toThrow(
      "rgpd_art14_mention_manquante",
    );
  });

  it("ne throw pas si 'art. 14' présent (avec espace)", () => {
    const body = "Corps {{lien_opposition}} et mention art. 14 du RGPD";
    expect(() => assertRgpdGuardrails("architect_solicitation_VOUS", body)).not.toThrow();
  });

  it("ne throw pas si 'art.14' présent (sans espace)", () => {
    const body = "Corps {{lien_opposition}} et mention art.14 du RGPD";
    expect(() => assertRgpdGuardrails("architect_solicitation_VOUS", body)).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/*  assertRgpdGuardrails — templates non soumis aux gardes                    */
/* -------------------------------------------------------------------------- */

describe("assertRgpdGuardrails — templates neutres (non soumis)", () => {
  it("ne throw pas pour architect_decline_acknowledgment (corps sans lien)", () => {
    expect(() =>
      assertRgpdGuardrails("architect_decline_acknowledgment", "Pas de souci. À très vite."),
    ).not.toThrow();
  });

  it("ne throw pas pour tender_summary_to_user (template interne)", () => {
    expect(() =>
      assertRgpdGuardrails("tender_summary_to_user", "Corps interne quelconque"),
    ).not.toThrow();
  });

  it("ne throw pas pour welcome_provisional_password", () => {
    expect(() =>
      assertRgpdGuardrails("welcome_provisional_password", "Corps quelconque"),
    ).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/*  resolveBrevoTemplate — garde-fous RGPD intégrés                           */
/* -------------------------------------------------------------------------- */

describe("resolveBrevoTemplate — garde-fous RGPD appliqués après résolution", () => {
  it("throw si template BDD ne contient pas lien_opposition (solicitation)", async () => {
    const db = dbReturning([
      {
        subject: "Sujet valide",
        // Corps sans lien opposition ni rgpd_block
        body: "Corps sans lien art. 14 seulement",
      },
    ]);
    await expect(
      resolveBrevoTemplate("architect_solicitation_VOUS", VALID_ORG_ID, db),
    ).rejects.toThrow("rgpd_lien_opposition_manquant");
  });

  it("throw si template BDD contient lien mais pas mention art.14", async () => {
    const db = dbReturning([
      {
        subject: "Sujet valide",
        body: "Corps {{lien_opposition}} sans mention article RGPD",
      },
    ]);
    await expect(
      resolveBrevoTemplate("architect_solicitation_TU", VALID_ORG_ID, db),
    ).rejects.toThrow("rgpd_art14_mention_manquante");
  });

  it("le template par défaut passe les garde-fous (sollicitation_VOUS)", async () => {
    const db = dbReturning([]);
    // Le template par défaut contient {{ params.rgpd_block }} → satisfait les deux gardes
    await expect(
      resolveBrevoTemplate("architect_solicitation_VOUS", VALID_ORG_ID, db),
    ).resolves.toMatchObject({ source: "default" });
  });

  it("le template par défaut passe les garde-fous (sollicitation_TU)", async () => {
    const db = dbReturning([]);
    await expect(
      resolveBrevoTemplate("architect_solicitation_TU", VALID_ORG_ID, db),
    ).resolves.toMatchObject({ source: "default" });
  });
});
