import { describe, expect, it } from "vitest";

import { PROD_PROJECT_REF, assertNotProdUrl } from "./anti-prod-guard";

/**
 * Tests de la garde anti-prod des fixtures E2E (incident 2026-06-10 :
 * le job `ci-e2e` a seedé la BDD PROD via les secrets non préfixés).
 *
 * Invariant : toute URL contenant le project ref PROD doit lever, toute
 * autre URL (preview, localhost) doit passer.
 */
describe("assertNotProdUrl", () => {
  describe("URLs PROD — refusées (throw)", () => {
    it("refuse l'URL Supabase prod exacte", () => {
      expect(() => assertNotProdUrl(`https://${PROD_PROJECT_REF}.supabase.co`)).toThrow(
        /REFUS.*PROD/,
      );
    });

    it("refuse même si le ref prod est en majuscules dans l'URL (casse-insensible)", () => {
      expect(() =>
        assertNotProdUrl(`https://${PROD_PROJECT_REF.toUpperCase()}.supabase.co`),
      ).toThrow(/REFUS.*PROD/);
    });

    it("mentionne le project ref et DECISIONS.md dans le message d'erreur", () => {
      expect(() => assertNotProdUrl(`https://${PROD_PROJECT_REF}.supabase.co`)).toThrow(
        new RegExp(`${PROD_PROJECT_REF}.*DECISIONS\\.md`, "s"),
      );
    });
  });

  describe("URLs non-prod — acceptées (pas de throw)", () => {
    it("accepte une URL Supabase preview (autre project ref)", () => {
      expect(() => assertNotProdUrl("https://abcdefghijklmnopqrst.supabase.co")).not.toThrow();
    });

    it("accepte localhost (Supabase local dev)", () => {
      expect(() => assertNotProdUrl("http://127.0.0.1:54321")).not.toThrow();
    });

    it("accepte une chaîne vide (la présence de l'URL est validée en amont)", () => {
      expect(() => assertNotProdUrl("")).not.toThrow();
    });
  });
});
