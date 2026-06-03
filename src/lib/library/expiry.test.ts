/**
 * Tests unitaires — helpers expiry biblio.
 */

import { describe, expect, it } from "vitest";

import { EXPIRING_SOON_WINDOW_DAYS, classifyLibraryExpiry } from "./expiry";
import type { PresentationLibraryItem } from "@/db/schema/library";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makeItem(id: string, validUntilIso: string | null): PresentationLibraryItem {
  return {
    id,
    organizationId: "org-1",
    kind: "urssaf",
    name: `Doc ${id}`,
    storagePath: `lib/${id}.pdf`,
    sizeBytes: null,
    validUntil: validUntilIso as unknown as string | null,
    notes: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

const NOW = new Date("2026-06-03T10:00:00Z");

describe("classifyLibraryExpiry", () => {
  it("met les valid_until null dans validLong", () => {
    const items = [makeItem("a", null), makeItem("b", null)];
    const result = classifyLibraryExpiry(items, NOW);
    expect(result.expired).toHaveLength(0);
    expect(result.expiringSoon).toHaveLength(0);
    expect(result.validLong).toHaveLength(2);
  });

  it("met les valid_until passés dans expired", () => {
    const items = [makeItem("urssaf-old", "2026-05-30"), makeItem("dgfip-old", "2026-01-01")];
    const result = classifyLibraryExpiry(items, NOW);
    expect(result.expired.map((i) => i.id)).toEqual(["urssaf-old", "dgfip-old"]);
    expect(result.expiringSoon).toHaveLength(0);
  });

  it("met les valid_until à J+29 dans expiringSoon", () => {
    const items = [
      makeItem("urssaf-soon", "2026-06-15"), // J+12
      makeItem("dgfip-edge", "2026-07-02"), // J+29
    ];
    const result = classifyLibraryExpiry(items, NOW);
    expect(result.expiringSoon.map((i) => i.id)).toEqual(["urssaf-soon", "dgfip-edge"]);
    expect(result.expired).toHaveLength(0);
    expect(result.validLong).toHaveLength(0);
  });

  it("met les valid_until >= J+30 dans validLong (bornage strict)", () => {
    const items = [
      makeItem("urssaf-far", "2026-07-03"), // J+30 → safe (limite stricte <)
      makeItem("kbis-very-far", "2027-01-01"),
    ];
    const result = classifyLibraryExpiry(items, NOW);
    expect(result.validLong.map((i) => i.id)).toEqual(["urssaf-far", "kbis-very-far"]);
  });

  it("met les valid_until = today dans expiringSoon (encore valide aujourd'hui)", () => {
    // valid_until = today → "2026-06-03" >= today → soon (pas expired).
    const items = [makeItem("today", "2026-06-03")];
    const result = classifyLibraryExpiry(items, NOW);
    expect(result.expiringSoon).toHaveLength(1);
    expect(result.expired).toHaveLength(0);
  });

  it("paramètre windowDays modifie la fenêtre soon", () => {
    const items = [
      makeItem("a", "2026-06-10"), // J+7
      makeItem("b", "2026-06-30"), // J+27
    ];
    const result7 = classifyLibraryExpiry(items, NOW, 7);
    // a est à J+7 strict → exclu de soon (< 7 = false)
    expect(result7.expiringSoon).toHaveLength(0);
    expect(result7.validLong).toHaveLength(2);

    const result8 = classifyLibraryExpiry(items, NOW, 8);
    expect(result8.expiringSoon.map((i) => i.id)).toEqual(["a"]);
  });

  it("EXPIRING_SOON_WINDOW_DAYS exporté = 30", () => {
    expect(EXPIRING_SOON_WINDOW_DAYS).toBe(30);
  });

  it("mélange d'items", () => {
    const items = [
      makeItem("expired-1", "2026-04-30"),
      makeItem("expired-2", "2025-12-31"),
      makeItem("soon-1", "2026-06-10"),
      makeItem("safe-1", "2027-01-01"),
      makeItem("safe-noexpiry", null),
    ];
    const result = classifyLibraryExpiry(items, NOW);
    expect(result.expired.map((i) => i.id)).toEqual(["expired-1", "expired-2"]);
    expect(result.expiringSoon.map((i) => i.id)).toEqual(["soon-1"]);
    expect(result.validLong.map((i) => i.id)).toEqual(["safe-1", "safe-noexpiry"]);
  });
});
