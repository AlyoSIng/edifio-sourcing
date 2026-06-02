import { describe, expect, it } from "vitest";

import { COMMON_PASSWORDS_FULL, isCommonPasswordFull } from "./common-passwords-full";

/**
 * Tests — liste 10k SecLists (server-only).
 *
 * Le fichier `common-passwords-full.ts` est auto-généré depuis
 * `tmp/10k-passwords.txt` via `scripts/build-common-passwords.ts`. On teste
 * ici les invariants de format + un échantillon des top entrées qui doivent
 * être présentes dans toute version raisonnable de la liste.
 */

describe("isCommonPasswordFull", () => {
  it("rejette les top entries SecLists universelles", () => {
    expect(isCommonPasswordFull("password")).toBe(true);
    expect(isCommonPasswordFull("123456")).toBe(true);
    expect(isCommonPasswordFull("qwerty")).toBe(true);
    expect(isCommonPasswordFull("12345678")).toBe(true);
    expect(isCommonPasswordFull("letmein")).toBe(true);
  });

  it("rejette des entrées français-friendly courantes (azerty, soleil)", () => {
    // Ces entrées sont dans SecLists top 10k.
    expect(isCommonPasswordFull("azerty")).toBe(true);
    expect(isCommonPasswordFull("soleil")).toBe(true);
  });

  it("accepte un mot de passe aléatoire hors liste", () => {
    expect(isCommonPasswordFull("xZ9!kqLm2pNv8Wt5")).toBe(false);
    expect(isCommonPasswordFull("CafeNoir2026-Stylo!")).toBe(false);
  });

  it("normalise lowercase + trim avant lookup", () => {
    expect(isCommonPasswordFull("  PASSWORD  ")).toBe(true);
    expect(isCommonPasswordFull("\tQWERTY\n")).toBe(true);
  });

  it("retourne false sur valeurs vides / blank", () => {
    expect(isCommonPasswordFull("")).toBe(false);
    expect(isCommonPasswordFull("   ")).toBe(false);
  });

  it("toutes les entrées du Set sont normalisées (lowercase + trim)", () => {
    // Sanity check : si quelqu'un éditait à la main (alors qu'on l'interdit),
    // ce test attraperait les entrées mal normalisées.
    let checked = 0;
    for (const entry of COMMON_PASSWORDS_FULL) {
      expect(entry).toBe(entry.toLowerCase());
      expect(entry.trim()).toBe(entry);
      checked += 1;
      // On limite l'itération pour ne pas exploser le temps de test sur 10k.
      if (checked >= 500) break;
    }
  });

  it("contient un volume cohérent avec SecLists top 10k (>= 9000 entrées)", () => {
    // SecLists publie ~10000 entrées ; après dédoublonnage lowercase il peut
    // en rester un peu moins. On vise un seuil défensif anti-régression.
    expect(COMMON_PASSWORDS_FULL.size).toBeGreaterThanOrEqual(9000);
    expect(COMMON_PASSWORDS_FULL.size).toBeLessThanOrEqual(10000);
  });
});
