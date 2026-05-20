import { describe, expect, it } from "vitest";

import { computeRemaining } from "./useCountdown";

/**
 * Tests — fonction pure `computeRemaining` (cœur du hook `useCountdown`).
 *
 * Le hook lui-même nécessite un DOM (`useState` / `useEffect` / `setInterval`)
 * — il sera validé en E2E Playwright sur le formulaire login (Board Q4/A
 * 2026-05-12). Ici on garantit l'arithmétique du countdown.
 */

describe("computeRemaining", () => {
  const NOW = 1_700_000_000_000; // arbitraire mais déterministe

  it("retourne 0 si deadline est null", () => {
    expect(computeRemaining(null, NOW)).toBe(0);
  });

  it("retourne 0 si la deadline est dans le passé", () => {
    expect(computeRemaining(NOW - 5000, NOW)).toBe(0);
  });

  it("retourne 0 si la deadline est strictement égale à now", () => {
    expect(computeRemaining(NOW, NOW)).toBe(0);
  });

  it("retourne 1 seconde si delta de 500 ms (arrondi supérieur)", () => {
    // Math.ceil(500 / 1000) = 1 — on préfère afficher « 00:01 » pendant
    // la dernière demi-seconde plutôt que sauter directement à 00:00.
    expect(computeRemaining(NOW + 500, NOW)).toBe(1);
  });

  it("retourne 15 secondes si delta de 15 s exactes", () => {
    expect(computeRemaining(NOW + 15_000, NOW)).toBe(15);
  });

  it("retourne 900 secondes pour un cooldown de 15 minutes", () => {
    expect(computeRemaining(NOW + 15 * 60 * 1000, NOW)).toBe(900);
  });

  it("arrondit au plafond pour les fractions de seconde", () => {
    expect(computeRemaining(NOW + 1499, NOW)).toBe(2);
    expect(computeRemaining(NOW + 1001, NOW)).toBe(2);
    expect(computeRemaining(NOW + 1, NOW)).toBe(1);
  });

  it("ne renvoie jamais de valeur négative", () => {
    for (const delta of [-1, -500, -10_000, -1_000_000]) {
      expect(computeRemaining(NOW + delta, NOW)).toBe(0);
    }
  });
});
