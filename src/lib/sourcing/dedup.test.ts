/**
 * Tests de `dedupHash` + `dedupBatch` — edifio Sourcing.
 *
 * Couvre :
 *  - Déterminisme du hash (même entrée → même sortie)
 *  - Sensibilité aux 3 segments (buyer, title, deadline)
 *  - Insensibilité aux variations cosmétiques (case, espaces, diacritiques)
 *  - Troncature title à 100 caractères (post-normalisation)
 *  - Politique « première occurrence gagne » + ordre préservé
 *  - Cas deadline null (segment vide, n'empêche pas la dédup)
 */

import { describe, expect, it } from "vitest";

import { dedupBatch, dedupHash, removeDiacritics } from "./dedup";
import type { NormalizedTender } from "./types";

function makeTender(overrides: Partial<NormalizedTender> = {}): NormalizedTender {
  return {
    externalRef: "25-XYZ-00001",
    platformCode: "boamp",
    title: "Rénovation thermique groupe scolaire Jules Ferry",
    buyer: "Mairie de Bordeaux",
    cpvCodes: ["45211350"],
    amount: 500000,
    deadline: new Date("2026-06-30T17:00:00+02:00"),
    questionsDeadline: null,
    visitDate: null,
    dceUrl: null,
    sourceUrl: null,
    rawData: {
      platform_code: "boamp",
      record: {},
      fetched_at: "2026-05-20T12:00:00.000Z",
    },
    ...overrides,
  };
}

// ============================================================================
// removeDiacritics
// ============================================================================

describe("removeDiacritics", () => {
  it("retire les accents français usuels", () => {
    expect(removeDiacritics("éèêëàâäîïôöùûüç")).toBe("eeeeaaaiioouuuc");
  });
  it("laisse les caractères ASCII inchangés", () => {
    expect(removeDiacritics("abcXYZ 123-_'")).toBe("abcXYZ 123-_'");
  });
  it("préserve les ligatures non-accentuées (œ, æ)", () => {
    // Pas des lettres accentuées au sens NFD → pas modifiées
    expect(removeDiacritics("œuvre cœur sœur")).toBe("œuvre cœur sœur");
  });
});

// ============================================================================
// dedupHash — déterminisme et sensibilité
// ============================================================================

describe("dedupHash — déterminisme", () => {
  it("retourne le même hash pour le même tender (idempotence)", () => {
    const t = makeTender();
    expect(dedupHash(t)).toBe(dedupHash(t));
  });

  it("retourne un hex de 64 caractères", () => {
    expect(dedupHash(makeTender())).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("dedupHash — sensibilité aux 3 segments", () => {
  it("buyer différent → hash différent", () => {
    const a = makeTender({ buyer: "Mairie de Bordeaux" });
    const b = makeTender({ buyer: "Mairie de Lyon" });
    expect(dedupHash(a)).not.toBe(dedupHash(b));
  });

  it("title différent → hash différent", () => {
    const a = makeTender({ title: "Rénovation école" });
    const b = makeTender({ title: "Construction collège" });
    expect(dedupHash(a)).not.toBe(dedupHash(b));
  });

  it("deadline différente (jour ≠) → hash différent", () => {
    const a = makeTender({ deadline: new Date("2026-06-30T17:00:00+02:00") });
    const b = makeTender({ deadline: new Date("2026-07-01T17:00:00+02:00") });
    expect(dedupHash(a)).not.toBe(dedupHash(b));
  });
});

describe("dedupHash — insensibilité aux variations cosmétiques", () => {
  it("même hash si la casse diffère", () => {
    const a = makeTender({ title: "RÉNOVATION THERMIQUE", buyer: "MAIRIE BX" });
    const b = makeTender({ title: "rénovation thermique", buyer: "mairie bx" });
    expect(dedupHash(a)).toBe(dedupHash(b));
  });

  it("même hash si les diacritiques diffèrent (é vs e)", () => {
    const a = makeTender({ title: "Rénovation école" });
    const b = makeTender({ title: "Renovation ecole" });
    expect(dedupHash(a)).toBe(dedupHash(b));
  });

  it("même hash si les espaces multiples diffèrent", () => {
    const a = makeTender({ title: "Rénovation  thermique\técole" });
    const b = makeTender({ title: "Rénovation thermique école" });
    expect(dedupHash(a)).toBe(dedupHash(b));
  });

  it("même hash si la deadline diffère uniquement par l'heure (même jour UTC)", () => {
    const a = makeTender({ deadline: new Date("2026-06-30T17:00:00Z") });
    const b = makeTender({ deadline: new Date("2026-06-30T08:00:00Z") });
    expect(dedupHash(a)).toBe(dedupHash(b));
  });
});

describe("dedupHash — cas particuliers", () => {
  it("tronque le title à 100 caractères (post-normalisation)", () => {
    const longSuffix = "X".repeat(200);
    const a = makeTender({ title: `Rénovation ${longSuffix}A` });
    const b = makeTender({ title: `Rénovation ${longSuffix}B` });
    // Les 100 premiers caractères sont identiques → même hash malgré
    // la divergence au-delà du 100ᵉ caractère.
    expect(dedupHash(a)).toBe(dedupHash(b));
  });

  it("deadline null → segment vide, dedup possible sur buyer+title seuls", () => {
    const a = makeTender({ deadline: null });
    const b = makeTender({ deadline: null });
    expect(dedupHash(a)).toBe(dedupHash(b));
  });

  it("deadline null vs deadline présente → hash différent", () => {
    const a = makeTender({ deadline: null });
    const b = makeTender({ deadline: new Date("2026-06-30T17:00:00Z") });
    expect(dedupHash(a)).not.toBe(dedupHash(b));
  });
});

// ============================================================================
// dedupBatch
// ============================================================================

describe("dedupBatch", () => {
  it("préserve l'ordre d'entrée et retire les doublons stricts", () => {
    const t1 = makeTender({ externalRef: "A", title: "Rénovation A" });
    const t2 = makeTender({ externalRef: "B", title: "Rénovation B" });
    const t3 = makeTender({ externalRef: "C", title: "Rénovation A" }); // doublon de t1

    const result = dedupBatch([t1, t2, t3]);
    expect(result.unique.map((t) => t.externalRef)).toEqual(["A", "B"]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.tender.externalRef).toBe("C");
    expect(result.skipped[0]?.keptExternalRef).toBe("A");
  });

  it("dédup cross-plateforme : même AO sur BOAMP et PLACE → 1 seule entrée", () => {
    const boamp = makeTender({
      externalRef: "25-BOAMP-001",
      platformCode: "boamp",
      title: "Rénovation école",
      buyer: "Mairie de Bordeaux",
      deadline: new Date("2026-06-30T17:00:00+02:00"),
    });
    const place = makeTender({
      externalRef: "PLACE-XYZ-42",
      platformCode: "place",
      title: "Rénovation école", // Même title
      buyer: "Mairie de Bordeaux", // Même buyer
      deadline: new Date("2026-06-30T15:00:00Z"), // Même jour UTC (15:00 = 17:00 Paris été)
    });

    const result = dedupBatch([boamp, place]);
    expect(result.unique).toHaveLength(1);
    expect(result.unique[0]?.externalRef).toBe("25-BOAMP-001");
    expect(result.skipped[0]?.tender.platformCode).toBe("place");
  });

  it("batch vide → résultat vide, pas d'erreur", () => {
    expect(dedupBatch([])).toEqual({ unique: [], skipped: [] });
  });

  it("aucun doublon → tous conservés, skipped vide", () => {
    const tenders = [
      makeTender({ externalRef: "A", title: "Rénovation A" }),
      makeTender({ externalRef: "B", title: "Rénovation B" }),
      makeTender({ externalRef: "C", title: "Rénovation C" }),
    ];
    const result = dedupBatch(tenders);
    expect(result.unique).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
  });
});
