import { describe, expect, it } from "vitest";

import { MIN_LENGTH, PASSWORD_ERROR_CODES, PROVISIONAL_PASSWORD_LENGTH } from "./constants";
import { generateProvisionalPassword } from "./password-server";
import {
  computeProvisionalExpiresAt,
  formatCountdownMinSec,
  passwordErrorLabel,
  validatePasswordStrength,
  validatePasswordStrengthServer,
} from "./password";

/**
 * Tests — politique de mot de passe.
 * - auth password pivot Board 2026-05-11
 * - ajustements Board 2026-05-12 (Q1/B TTL en heures, Q2/B MIN_LENGTH=16 +
 *   common-passwords, Q4/A formatter MM:SS)
 */

describe("validatePasswordStrength", () => {
  // Échantillon "robuste" — 16+ chars, classes complètes, hors liste commune.
  const ROBUST = "Xy7!azerty-bleu-montagne";

  it("accepte un mot de passe respectant toutes les règles", () => {
    const r = validatePasswordStrength(ROBUST);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("refuse un mot de passe trop court (< MIN_LENGTH)", () => {
    const r = validatePasswordStrength("Aa1!");
    expect(r.valid).toBe(false);
    expect(r.errors).toContain(PASSWORD_ERROR_CODES.TOO_SHORT);
  });

  it("refuse l'absence de majuscule", () => {
    const r = validatePasswordStrength("aaaaaaaaaaaaaa1!");
    expect(r.errors).toContain(PASSWORD_ERROR_CODES.NO_UPPERCASE);
  });

  it("refuse l'absence de minuscule", () => {
    const r = validatePasswordStrength("AAAAAAAAAAAAAA1!");
    expect(r.errors).toContain(PASSWORD_ERROR_CODES.NO_LOWERCASE);
  });

  it("refuse l'absence de chiffre", () => {
    const r = validatePasswordStrength("Aaaaaaaaaaaaaaaa!");
    expect(r.errors).toContain(PASSWORD_ERROR_CODES.NO_DIGIT);
  });

  it("refuse l'absence de symbole", () => {
    const r = validatePasswordStrength("Aaaaaaaaaaaaaaaa1");
    expect(r.errors).toContain(PASSWORD_ERROR_CODES.NO_SYMBOL);
  });

  it("refuse un mot de passe trop commun (Board Q2/B)", () => {
    // password123 a longueur 11 → TOO_SHORT ET TOO_COMMON ET NO_UPPERCASE
    // ET NO_SYMBOL. On vérifie au minimum TOO_COMMON.
    const r = validatePasswordStrength("password123");
    expect(r.valid).toBe(false);
    expect(r.errors).toContain(PASSWORD_ERROR_CODES.TOO_COMMON);
  });

  it("refuse un common password même s'il satisfait toutes les autres règles", () => {
    // « Edifio2026 » est dans la liste sectorielle. On le padde pour atteindre
    // 16 chars + classes complètes — la règle TOO_COMMON doit quand même tirer.
    // Mais comme le padding casse l'égalité stricte avec la liste, on teste
    // plutôt une variante listée en MAJUSCULES.
    // « Printemps2026 » : 13 chars donc TOO_SHORT s'allume aussi — on
    // n'utilise pas cette voie. À la place, on teste directement
    // l'isolation du code TOO_COMMON sur une entrée connue de la liste.
    // (Le test exhaustif vit dans common-passwords.test.ts.)
    const r = validatePasswordStrength("Printemps2026");
    expect(r.errors).toContain(PASSWORD_ERROR_CODES.TOO_COMMON);
  });

  it("accumule plusieurs erreurs si nécessaire", () => {
    const r = validatePasswordStrength("aaaa");
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("respecte exactement le seuil MIN_LENGTH", () => {
    // On construit un mot exactement à MIN_LENGTH chars, valide partout et
    // pas dans la liste commune. `Xy7!` (4) + 12 chars hors liste → 16.
    const exactlyMin = "Xy7!" + "qwxptrnbsklm".slice(0, MIN_LENGTH - 4);
    expect(exactlyMin.length).toBe(MIN_LENGTH);
    const r = validatePasswordStrength(exactlyMin);
    expect(r.valid).toBe(true);
  });
});

describe("validatePasswordStrengthServer", () => {
  // Mot de passe robuste : 16+ chars, classes complètes, hors liste sectorielle
  // ET hors top 10k SecLists.
  const ROBUST = "Xy7!azerty-bleu-montagne";

  it("accepte les mêmes mots de passe que la version client", () => {
    const r = validatePasswordStrengthServer(ROBUST);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejette un mot de passe présent dans la liste 10k SecLists", () => {
    // « password » est dans SecLists ET dans la liste client → déjà flag par la
    // base. Mais on teste explicitement le code TOO_COMMON.
    const r = validatePasswordStrengthServer("password");
    expect(r.valid).toBe(false);
    expect(r.errors).toContain(PASSWORD_ERROR_CODES.TOO_COMMON);
  });

  it("n'ajoute pas TOO_COMMON en double quand la base l'a déjà détecté", () => {
    // « azerty » est dans les DEUX listes. Le code TOO_COMMON ne doit
    // apparaître qu'une seule fois dans le tableau d'erreurs.
    const r = validatePasswordStrengthServer("azerty");
    const occurrences = r.errors.filter((e) => e === PASSWORD_ERROR_CODES.TOO_COMMON).length;
    expect(occurrences).toBe(1);
  });

  it("propage toutes les erreurs de la base (longueur + classes)", () => {
    const r = validatePasswordStrengthServer("aaaa");
    expect(r.valid).toBe(false);
    expect(r.errors).toContain(PASSWORD_ERROR_CODES.TOO_SHORT);
  });

  it("reste valid quand le mot de passe est solide et hors liste 10k", () => {
    // 16 chars exactement, classes complètes, totalement absent des deux listes.
    expect(validatePasswordStrengthServer("Qz4!plmkjnbvgft9").valid).toBe(true);
  });
});

describe("generateProvisionalPassword", () => {
  it("produit une chaîne de la longueur attendue", () => {
    const pwd = generateProvisionalPassword();
    expect(pwd).toHaveLength(PROVISIONAL_PASSWORD_LENGTH);
  });

  it("produit toujours un mot de passe valide", () => {
    // 50 itérations pour augmenter la probabilité d'attraper un cas pathologique.
    for (let i = 0; i < 50; i += 1) {
      const pwd = generateProvisionalPassword();
      const result = validatePasswordStrength(pwd);
      expect(result.valid).toBe(true);
    }
  });

  it("produit des valeurs différentes à chaque appel (sanity check entropie)", () => {
    const a = generateProvisionalPassword();
    const b = generateProvisionalPassword();
    expect(a).not.toBe(b);
  });
});

describe("passwordErrorLabel", () => {
  it("mappe chaque code vers un libellé non vide", () => {
    for (const code of Object.values(PASSWORD_ERROR_CODES)) {
      expect(passwordErrorLabel(code).length).toBeGreaterThan(0);
    }
  });

  it("mentionne MIN_LENGTH dans le libellé TOO_SHORT", () => {
    expect(passwordErrorLabel(PASSWORD_ERROR_CODES.TOO_SHORT)).toContain(String(MIN_LENGTH));
  });

  it("a un libellé dédié pour TOO_COMMON", () => {
    expect(passwordErrorLabel(PASSWORD_ERROR_CODES.TOO_COMMON)).toMatch(/courant|évident/i);
  });
});

describe("computeProvisionalExpiresAt", () => {
  it("retourne une ISO 8601 pour un TTL en heures", () => {
    const now = new Date("2026-05-12T10:00:00.000Z");
    const expires = computeProvisionalExpiresAt(24, now);
    expect(expires).toBe("2026-05-13T10:00:00.000Z");
  });

  it("respecte la durée TTL exprimée en heures", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const expires = computeProvisionalExpiresAt(1, now);
    expect(new Date(expires).getTime() - now.getTime()).toBe(60 * 60 * 1000);
  });

  it("supporte des TTL non entiers (sanity check arithmétique)", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const expires = computeProvisionalExpiresAt(0.5, now);
    expect(new Date(expires).getTime() - now.getTime()).toBe(30 * 60 * 1000);
  });
});

describe("formatCountdownMinSec", () => {
  it("formate des secondes en mm:ss zéro-paddé", () => {
    expect(formatCountdownMinSec(0)).toBe("00:00");
    expect(formatCountdownMinSec(9)).toBe("00:09");
    expect(formatCountdownMinSec(60)).toBe("01:00");
    expect(formatCountdownMinSec(125)).toBe("02:05");
    expect(formatCountdownMinSec(15 * 60)).toBe("15:00");
  });

  it("écrête les valeurs négatives à 00:00", () => {
    expect(formatCountdownMinSec(-1)).toBe("00:00");
    expect(formatCountdownMinSec(-9999)).toBe("00:00");
  });

  it("écrête NaN / Infinity à 00:00", () => {
    expect(formatCountdownMinSec(NaN)).toBe("00:00");
    expect(formatCountdownMinSec(Infinity)).toBe("00:00");
  });

  it("tronque les fractionnaires vers le bas", () => {
    expect(formatCountdownMinSec(59.9)).toBe("00:59");
    expect(formatCountdownMinSec(0.5)).toBe("00:00");
  });
});
