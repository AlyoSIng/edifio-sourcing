/**
 * Tests computeTrialState — Steve 2026-06-05 (Stripe minimal MVP).
 */

import { describe, expect, it } from "vitest";

import { computeTrialState } from "./trial";

const NOW = new Date("2026-06-05T12:00:00Z");

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("computeTrialState", () => {
  it("status none → pas de bannière, pas de verrou", () => {
    const r = computeTrialState({ subscriptionStatus: "none", trialEndsAt: null }, NOW);
    expect(r.shouldShowBanner).toBe(false);
    expect(r.isLocked).toBe(false);
  });

  it("status active → pas de bannière, pas de verrou (client payant)", () => {
    const r = computeTrialState({ subscriptionStatus: "active", trialEndsAt: null }, NOW);
    expect(r.shouldShowBanner).toBe(false);
    expect(r.isLocked).toBe(false);
  });

  it("trial avec 20 jours restants → pas de bannière (essai serein)", () => {
    const r = computeTrialState({ subscriptionStatus: "trial", trialEndsAt: daysFromNow(20) }, NOW);
    expect(r.shouldShowBanner).toBe(false);
    expect(r.daysLeft).toBe(20);
  });

  it("trial avec 10 jours restants → bannière info (orange)", () => {
    const r = computeTrialState({ subscriptionStatus: "trial", trialEndsAt: daysFromNow(10) }, NOW);
    expect(r.shouldShowBanner).toBe(true);
    expect(r.bannerSeverity).toBe("info");
    expect(r.isLocked).toBe(false);
    expect(r.daysLeft).toBe(10);
  });

  it("trial avec 2 jours restants → bannière warning", () => {
    const r = computeTrialState({ subscriptionStatus: "trial", trialEndsAt: daysFromNow(2) }, NOW);
    expect(r.shouldShowBanner).toBe(true);
    expect(r.bannerSeverity).toBe("warning");
    expect(r.isLocked).toBe(false);
  });

  it("trial avec 0 jour restant → bannière danger + verrou", () => {
    const r = computeTrialState({ subscriptionStatus: "trial", trialEndsAt: daysFromNow(0) }, NOW);
    expect(r.shouldShowBanner).toBe(true);
    expect(r.bannerSeverity).toBe("danger");
    expect(r.isLocked).toBe(true);
  });

  it("trial expiré il y a 5 jours → bannière danger + verrou", () => {
    const r = computeTrialState({ subscriptionStatus: "trial", trialEndsAt: daysFromNow(-5) }, NOW);
    expect(r.shouldShowBanner).toBe(true);
    expect(r.bannerSeverity).toBe("danger");
    expect(r.isLocked).toBe(true);
    expect(r.daysLeft).toBe(-5);
  });

  it("status expired → bannière danger + verrou (peu importe les dates)", () => {
    const r = computeTrialState({ subscriptionStatus: "expired", trialEndsAt: null }, NOW);
    expect(r.shouldShowBanner).toBe(true);
    expect(r.bannerSeverity).toBe("danger");
    expect(r.isLocked).toBe(true);
  });

  it("status cancelled → bannière danger + verrou", () => {
    const r = computeTrialState({ subscriptionStatus: "cancelled", trialEndsAt: null }, NOW);
    expect(r.shouldShowBanner).toBe(true);
    expect(r.bannerSeverity).toBe("danger");
    expect(r.isLocked).toBe(true);
  });

  it("status trial sans trialEndsAt → pas de bannière (edge case)", () => {
    const r = computeTrialState({ subscriptionStatus: "trial", trialEndsAt: null }, NOW);
    expect(r.shouldShowBanner).toBe(false);
    expect(r.isLocked).toBe(false);
  });

  it("accepte trialEndsAt en string ISO", () => {
    const r = computeTrialState(
      { subscriptionStatus: "trial", trialEndsAt: "2026-06-10T12:00:00Z" },
      NOW,
    );
    expect(r.daysLeft).toBe(5);
    expect(r.bannerSeverity).toBe("info"); // 5 jours → info (entre 3 et 15)
  });
});
