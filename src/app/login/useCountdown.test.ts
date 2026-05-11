import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { computeRemaining, msToCeilSeconds } from "./useCountdown";

/**
 * Tests des helpers purs du hook `useCountdown`.
 *
 * NB : `useCountdown` lui-même (le hook React) ne peut pas être testé ici
 * sans `@testing-library/react` + jsdom, qui ne font pas partie des
 * dépendances autorisées au scope de la PR `feat/login-ux-polish`. La
 * couverture comportementale du hook est assurée par le test E2E
 * Playwright (`e2e/login-cooldown.spec.ts`), qui exécute le composant
 * dans un vrai navigateur avec timers réels.
 *
 * Cible ici : les deux helpers purs `computeRemaining` et `msToCeilSeconds`
 * qui contiennent l'arithmétique de bord — c'est là que les bugs subtils
 * peuvent se glisser (off-by-one, négatif, null, division).
 */
describe("computeRemaining", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T21:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retourne 0 quand la deadline est null (countdown inactif)", () => {
    expect(computeRemaining(null)).toBe(0);
  });

  it("retourne le nombre de ms exact entre Date.now() et deadlineMs", () => {
    const now = Date.now();
    expect(computeRemaining(now + 47_000)).toBe(47_000);
  });

  it("retourne 0 quand la deadline est dans le passé (pas de valeur négative)", () => {
    const now = Date.now();
    expect(computeRemaining(now - 5_000)).toBe(0);
  });

  it("retourne 0 quand la deadline est exactement maintenant", () => {
    const now = Date.now();
    expect(computeRemaining(now)).toBe(0);
  });

  it("évolue correctement après avancement des fake timers", () => {
    const deadline = Date.now() + 60_000;
    expect(computeRemaining(deadline)).toBe(60_000);
    vi.advanceTimersByTime(13_500);
    expect(computeRemaining(deadline)).toBe(46_500);
    vi.advanceTimersByTime(60_000);
    expect(computeRemaining(deadline)).toBe(0);
  });
});

describe("msToCeilSeconds", () => {
  it("arrondit vers le haut (un reste de 500 ms compte comme 1 s)", () => {
    expect(msToCeilSeconds(46_500)).toBe(47);
    expect(msToCeilSeconds(46_001)).toBe(47);
    expect(msToCeilSeconds(46_000)).toBe(46);
  });

  it("retourne 0 quand l'entrée est 0", () => {
    expect(msToCeilSeconds(0)).toBe(0);
  });

  it("retourne 1 pour une valeur très faible (1 ms)", () => {
    expect(msToCeilSeconds(1)).toBe(1);
  });

  it("retourne 60 pour exactement 60 000 ms (le cooldown par défaut)", () => {
    expect(msToCeilSeconds(60_000)).toBe(60);
  });
});
