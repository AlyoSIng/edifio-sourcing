/**
 * Tests de `normalize` et de ses helpers — edifio Sourcing.
 *
 * Source de vérité : `notes-de-suivi/DRAFT_PR2_BOAMP_CONNECTOR.md` §Étape 3/7 +
 * `specs/module_sourcing_engine_v1.md` §3.3.
 *
 * Couvre :
 *  - 15+ cas réels extraits de la fixture (titres avec espaces multiples,
 *    montants FR, dates mixtes, CPV avec doublons, URLs sans schéma)
 *  - cas dégénérés (raw vide, fields undefined, montant non parsable → null safe)
 *  - 1 snapshot bout-en-bout sur un record complet de la fixture
 */

import { describe, expect, it } from "vitest";

import fixture from "@/db/seed/fixtures/boamp-real.json";

import type { BoampApiRecord, RawTender } from "./types";
import {
  normalize,
  normalizeUrl,
  parseAmount,
  parseCpvCodes,
  parseDate,
  trimAndCapitalize,
} from "./normalize";

const fixtureBuckets = fixture as {
  small: BoampApiRecord[];
  medium: BoampApiRecord[];
  large: BoampApiRecord[];
};

/**
 * Accès indexé non-undefined — `noUncheckedIndexedAccess` exige le narrow.
 */
function at<T>(arr: T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`fixture out-of-range: index ${i}`);
  return v;
}

/**
 * Construit un `RawTender` à partir d'un `BoampApiRecord` fixture (helper test).
 */
function rawFromFixture(record: BoampApiRecord): RawTender {
  return {
    externalRef: record.idweb,
    platformCode: "boamp",
    rawData: {
      platform_code: "boamp",
      record: record as unknown as Record<string, unknown>,
      fetched_at: "2026-05-19T12:00:00.000Z",
    },
    fetchedAt: "2026-05-19T12:00:00.000Z",
  };
}

// ============================================================================
// trimAndCapitalize
// ============================================================================

describe("trimAndCapitalize", () => {
  it("trim simple + majuscule initiale", () => {
    expect(trimAndCapitalize("  hello world  ")).toBe("Hello world");
  });

  it("compresse les espaces multiples internes", () => {
    expect(trimAndCapitalize("mairie    de   paris")).toBe("Mairie de paris");
  });

  it("préserve la suite après la première lettre (pas de Title Case)", () => {
    expect(trimAndCapitalize("département de l'Isère")).toBe("Département de l'Isère");
  });

  it("renvoie '' sur null / undefined / chaîne vide / espaces", () => {
    expect(trimAndCapitalize(null)).toBe("");
    expect(trimAndCapitalize(undefined)).toBe("");
    expect(trimAndCapitalize("")).toBe("");
    expect(trimAndCapitalize("   ")).toBe("");
  });

  it("majuscule sans changer la casse du reste (déjà capitalisé)", () => {
    expect(trimAndCapitalize("Hello")).toBe("Hello");
  });
});

// ============================================================================
// parseCpvCodes
// ============================================================================

describe("parseCpvCodes", () => {
  it("extrait les 8 digits du code principal `XXXXXXXX-Y`", () => {
    expect(parseCpvCodes("71300000-1", [])).toEqual(["71300000"]);
  });

  it("agrège principal + secondaires + dédupliqué", () => {
    expect(parseCpvCodes("71300000-1", ["71300000-1", "45000000-7"])).toEqual([
      "71300000",
      "45000000",
    ]);
  });

  it("supporte un tableau secondaire vide", () => {
    expect(parseCpvCodes("90700000-4", [])).toEqual(["90700000"]);
  });

  it("renvoie [] sur principal null + secondaires null", () => {
    expect(parseCpvCodes(null, null)).toEqual([]);
  });

  it("filtre les codes < 8 digits (parasites)", () => {
    expect(parseCpvCodes("123", ["45-X"])).toEqual([]);
  });

  it("supporte un code sans check digit", () => {
    expect(parseCpvCodes("71500000", null)).toEqual(["71500000"]);
  });
});

// ============================================================================
// parseAmount
// ============================================================================

describe("parseAmount", () => {
  it("accepte un number natif", () => {
    expect(parseAmount(1234567)).toBe(1234567);
    expect(parseAmount(0)).toBe(0);
  });

  it("renvoie null pour NaN / Infinity / valeur falsy non-zéro", () => {
    expect(parseAmount(Number.NaN)).toBeNull();
    expect(parseAmount(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });

  it("parse un montant FR avec espaces et virgule", () => {
    expect(parseAmount("1 234 567,89 €")).toBeCloseTo(1234567.89, 2);
  });

  it("parse un montant US avec point décimal", () => {
    expect(parseAmount("1234567.89")).toBeCloseTo(1234567.89, 2);
  });

  it("retire HT/TTC/EUR éventuels", () => {
    expect(parseAmount("250 000 € HT")).toBe(250000);
    expect(parseAmount("1500 EUR")).toBe(1500);
  });

  it("renvoie null si la chaîne ne contient pas de nombre", () => {
    expect(parseAmount("non communiqué")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("   ")).toBeNull();
  });

  it("renvoie null pour les types non supportés", () => {
    expect(parseAmount({})).toBeNull();
    expect(parseAmount([])).toBeNull();
    expect(parseAmount(true)).toBeNull();
  });
});

// ============================================================================
// parseDate
// ============================================================================

describe("parseDate", () => {
  it("parse l'ISO 8601 avec timezone (format BOAMP majoritaire)", () => {
    const d = parseDate("2026-05-21T17:00:00+02:00");
    expect(d).toBeInstanceOf(Date);
    expect(d?.toISOString()).toBe("2026-05-21T15:00:00.000Z");
  });

  it("parse un ISO date seul `YYYY-MM-DD`", () => {
    const d = parseDate("2026-04-02");
    expect(d).toBeInstanceOf(Date);
    expect(d?.getUTCFullYear()).toBe(2026);
    expect(d?.getUTCMonth()).toBe(3);
    expect(d?.getUTCDate()).toBe(2);
  });

  it("parse le format FR `JJ/MM/AAAA`", () => {
    const d = parseDate("21/05/2026");
    expect(d).toBeInstanceOf(Date);
    expect(d?.getUTCFullYear()).toBe(2026);
  });

  it("parse le format FR `JJ/MM/AAAA HH:MM`", () => {
    const d = parseDate("21/05/2026 17:00");
    expect(d).toBeInstanceOf(Date);
  });

  it("accepte un Date déjà construit (idempotent)", () => {
    const orig = new Date("2026-01-01");
    expect(parseDate(orig)).toBe(orig);
  });

  it("renvoie null sur formats non reconnus / valeurs invalides", () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate("")).toBeNull();
    expect(parseDate("hier")).toBeNull();
    expect(parseDate("2026-13-99")).toBeNull(); // mois invalide
    expect(parseDate(123)).toBeNull();
  });
});

// ============================================================================
// normalizeUrl
// ============================================================================

describe("normalizeUrl", () => {
  it("préserve une URL https valide", () => {
    expect(normalizeUrl("https://www.exemple.test/dce/abc")).toBe(
      "https://www.exemple.test/dce/abc",
    );
  });

  it("force https sur une URL http://", () => {
    expect(normalizeUrl("http://www.exemple.test/dce/abc")).toBe(
      "https://www.exemple.test/dce/abc",
    );
  });

  it("ajoute https:// si schéma manquant", () => {
    expect(normalizeUrl("www.exemple.test/dce/abc")).toBe("https://www.exemple.test/dce/abc");
  });

  it("trim l'entrée", () => {
    expect(normalizeUrl("  https://x.test  ")).toBe("https://x.test/");
  });

  it("renvoie null sur entrée vide / invalide", () => {
    expect(normalizeUrl(null)).toBeNull();
    expect(normalizeUrl(undefined)).toBeNull();
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
  });
});

// ============================================================================
// normalize (bout-en-bout)
// ============================================================================

describe("normalize — cas dégénérés", () => {
  it("supporte un record vide (fields tous undefined → champs string vides + null)", () => {
    const raw: RawTender = {
      externalRef: "ID-EMPTY",
      platformCode: "boamp",
      rawData: {
        platform_code: "boamp",
        record: {},
        fetched_at: "2026-05-19T12:00:00.000Z",
      },
      fetchedAt: "2026-05-19T12:00:00.000Z",
    };
    const n = normalize(raw);
    expect(n.externalRef).toBe("ID-EMPTY");
    expect(n.title).toBe("");
    expect(n.buyer).toBe("");
    expect(n.cpvCodes).toEqual([]);
    expect(n.amount).toBeNull();
    expect(n.deadline).toBeNull();
    expect(n.questionsDeadline).toBeNull();
    expect(n.visitDate).toBeNull();
    expect(n.dceUrl).toBeNull();
    expect(n.sourceUrl).toBe("https://www.boamp.fr/avis/detail/ID-EMPTY");
  });

  it("encode l'externalRef dans sourceUrl (idweb avec espaces fixture)", () => {
    const s0 = at(fixtureBuckets.small, 0);
    const raw = rawFromFixture(s0);
    const n = normalize(raw);
    // L'idweb fixture contient des espaces — encode en %20
    expect(n.sourceUrl).toBe(`https://www.boamp.fr/avis/detail/${encodeURIComponent(s0.idweb)}`);
    expect(n.sourceUrl).toContain("%20");
  });
});

describe("normalize — cas réels fixture", () => {
  it("small[0] : titre / buyer / cpv / amount / deadline / dceUrl", () => {
    const record = at(fixtureBuckets.small, 0);
    const n = normalize(rawFromFixture(record));

    expect(n.title).toBe("Diagnostic technique -- Departement de l'Isere");
    expect(n.buyer).toBe("Departement de l'Isere");
    expect(n.cpvCodes).toEqual(["90700000"]);
    expect(n.amount).toBe(record.montant_estime);
    expect(n.deadline?.toISOString()).toBe("2026-06-16T15:00:00.000Z");
    expect(n.dceUrl).toBe("https://www.exemple.test/dce/iTeTYfeNKnmS");
  });

  it("small[1] : cpv principal + 2 secondaires dédupliqués", () => {
    const record = at(fixtureBuckets.small, 1);
    const n = normalize(rawFromFixture(record));
    expect(n.cpvCodes).toEqual(["71300000", "71311000", "45000000"]);
  });

  it("medium[0] : ministère + concession + plusieurs CPV", () => {
    const record = at(fixtureBuckets.medium, 0);
    const n = normalize(rawFromFixture(record));
    expect(n.buyer).toBe("Ministere des Armees");
    expect(n.title).toContain("Mission de maitrise d'oeuvre");
    expect(n.cpvCodes.length).toBeGreaterThanOrEqual(2);
    expect(n.amount).toBe(record.montant_estime);
  });

  it("large[0] : bucket large produit toujours une normalisation valide", () => {
    const record = at(fixtureBuckets.large, 0);
    const n = normalize(rawFromFixture(record));
    expect(n.externalRef).toBe(record.idweb);
    expect(n.title.length).toBeGreaterThan(0);
    expect(n.buyer.length).toBeGreaterThan(0);
    expect(n.deadline).toBeInstanceOf(Date);
  });

  it("100 records fixture : pas de throw, structure stable, sourceUrl toujours présent", () => {
    const all = [...fixtureBuckets.small, ...fixtureBuckets.medium, ...fixtureBuckets.large];
    for (const record of all) {
      const n = normalize(rawFromFixture(record));
      expect(typeof n.externalRef).toBe("string");
      expect(n.externalRef.length).toBeGreaterThan(0);
      expect(typeof n.sourceUrl).toBe("string");
      expect(n.sourceUrl?.startsWith("https://www.boamp.fr/avis/detail/")).toBe(true);
    }
  });
});

// ============================================================================
// normalize — cascade montant BOAMP (5B)
// ============================================================================

describe("normalize — cascade montant BOAMP", () => {
  function makeRaw(fields: Partial<BoampApiRecord>): RawTender {
    return {
      externalRef: "TEST-CASCADE",
      platformCode: "boamp",
      rawData: {
        platform_code: "boamp",
        record: fields as unknown as Record<string, unknown>,
        fetched_at: "2026-05-26T12:00:00.000Z",
      },
      fetchedAt: "2026-05-26T12:00:00.000Z",
    };
  }

  it("utilise montant_estime en priorité", () => {
    const n = normalize(
      makeRaw({
        idweb: "TEST-CASCADE",
        montant_estime: 500000,
        valeur_estimee: 999999,
      }),
    );
    expect(n.amount).toBe(500000);
  });

  it("fallback sur valeur_estimee si montant_estime absent", () => {
    const n = normalize(
      makeRaw({
        idweb: "TEST-CASCADE",
        valeur_estimee: 350000,
        valeur_globale: 999999,
      }),
    );
    expect(n.amount).toBe(350000);
  });

  it("fallback sur valeur_globale si montant_estime et valeur_estimee absents", () => {
    const n = normalize(
      makeRaw({
        idweb: "TEST-CASCADE",
        valeur_globale: 750000,
        montant_global: 999999,
      }),
    );
    expect(n.amount).toBe(750000);
  });

  it("fallback sur montant_global si les précédents absents", () => {
    const n = normalize(
      makeRaw({
        idweb: "TEST-CASCADE",
        montant_global: 1200000,
        montant_minimum: 999999,
      }),
    );
    expect(n.amount).toBe(1200000);
  });

  it("fallback ultime sur montant_minimum (marché à bon de commande)", () => {
    const n = normalize(
      makeRaw({
        idweb: "TEST-CASCADE",
        montant_minimum: 80000,
      }),
    );
    expect(n.amount).toBe(80000);
  });

  it("retourne null si tous les champs montant sont absents", () => {
    const n = normalize(
      makeRaw({
        idweb: "TEST-CASCADE",
      }),
    );
    expect(n.amount).toBeNull();
  });
});

describe("normalize — snapshot bout-en-bout (small[0])", () => {
  it("produit la forme NormalizedTender attendue pour small[0]", () => {
    const record = at(fixtureBuckets.small, 0);
    const n = normalize(rawFromFixture(record));

    // Snapshot ciblé : on évite la jsonb rawData (volumineuse) pour ne
    // figer que la forme finale métier.
    expect({
      externalRef: n.externalRef,
      platformCode: n.platformCode,
      title: n.title,
      buyer: n.buyer,
      cpvCodes: n.cpvCodes,
      amount: n.amount,
      deadline: n.deadline?.toISOString() ?? null,
      questionsDeadline: n.questionsDeadline?.toISOString() ?? null,
      visitDate: n.visitDate?.toISOString() ?? null,
      dceUrl: n.dceUrl,
      sourceUrl: n.sourceUrl,
    }).toMatchInlineSnapshot(`
      {
        "amount": 2739115,
        "buyer": "Departement de l'Isere",
        "cpvCodes": [
          "90700000",
        ],
        "dceUrl": "https://www.exemple.test/dce/iTeTYfeNKnmS",
        "deadline": "2026-06-16T15:00:00.000Z",
        "externalRef": "MOCK-201 23 45 67 89000",
        "platformCode": "boamp",
        "questionsDeadline": null,
        "sourceUrl": "https://www.boamp.fr/avis/detail/MOCK-201%2023%2045%2067%2089000",
        "title": "Diagnostic technique -- Departement de l'Isere",
        "visitDate": null,
      }
    `);
  });
});
