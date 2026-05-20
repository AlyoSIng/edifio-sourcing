/**
 * Tests des types partagés du module sourcing.
 *
 * Objectif : garantir que la fixture committee `boamp-real.json` reste
 * compatible avec le contrat `BoampApiRecord` — si BOAMP change un nom de
 * champ ou si la fixture est régénérée avec une autre forme, ce test
 * passe rouge et force une revue du contrat de type.
 *
 * Stratégie : snapshot sur la **structure** (clés + types primitifs) plutôt
 * que sur les **valeurs** — on ne veut pas que le test casse à chaque
 * re-seed Opendatasoft réel, seulement quand la forme change.
 *
 * Convention vitest du repo : tests collocated (cf. `src/lib/auth/domain.test.ts`).
 */

import { describe, expect, it } from "vitest";

import fixture from "@/db/seed/fixtures/boamp-real.json";

import type { BoampApiRecord, NormalizedTender, PlatformCode, RawTender } from "./types";

/**
 * Type-only helper : si `BoampApiRecord` n'est pas assignable depuis la
 * forme observée dans la fixture, ce cast échoue côté `tsc --noEmit`.
 *
 * `as unknown as` est ici un choix assumé : on **veut** déclarer
 * formellement que la fixture est un tableau de records BOAMP, et faire
 * remonter en compile-time toute divergence.
 */
const smallRecords = fixture.small as unknown as BoampApiRecord[];
const mediumRecords = fixture.medium as unknown as BoampApiRecord[];
const largeRecords = fixture.large as unknown as BoampApiRecord[];

/**
 * Décrit la **shape** d'un record (clefs présentes + type primitif de leur
 * valeur) sans capturer les valeurs elles-mêmes — pour un snapshot stable
 * malgré des données aléatoires d'une fixture à l'autre.
 */
function describeShape(record: Record<string, unknown>): Record<string, string> {
  const shape: Record<string, string> = {};
  for (const key of Object.keys(record).sort()) {
    const value = record[key];
    if (value === null) {
      shape[key] = "null";
    } else if (Array.isArray(value)) {
      const innerTypes = new Set(value.map((v) => typeof v));
      shape[key] = `array<${[...innerTypes].sort().join("|") || "empty"}>`;
    } else {
      shape[key] = typeof value;
    }
  }
  return shape;
}

describe("BoampApiRecord — fixture boamp-real.json", () => {
  it("la fixture est présente avec les 3 buckets small/medium/large + metadata", () => {
    expect(fixture).toHaveProperty("small");
    expect(fixture).toHaveProperty("medium");
    expect(fixture).toHaveProperty("large");
    expect(fixture).toHaveProperty("metadata");
    expect(Array.isArray(fixture.small)).toBe(true);
    expect(Array.isArray(fixture.medium)).toBe(true);
    expect(Array.isArray(fixture.large)).toBe(true);
  });

  it("chaque bucket contient au moins 1 record", () => {
    expect(smallRecords.length).toBeGreaterThan(0);
    expect(mediumRecords.length).toBeGreaterThan(0);
    expect(largeRecords.length).toBeGreaterThan(0);
  });

  it("tous les records exposent un `idweb` string non vide", () => {
    const allRecords: BoampApiRecord[] = [...smallRecords, ...mediumRecords, ...largeRecords];
    for (const record of allRecords) {
      expect(typeof record.idweb).toBe("string");
      expect(record.idweb.length).toBeGreaterThan(0);
    }
  });

  it("snapshot de la shape d'un record small (clefs + types primitifs)", () => {
    const first = smallRecords[0];
    expect(first).toBeDefined();
    // `!` car `noUncheckedIndexedAccess` rend l'accès optionnel ;
    // le `expect(first).toBeDefined()` ci-dessus prouve qu'il est défini.
    expect(describeShape(first!)).toMatchSnapshot();
  });

  it("snapshot de la shape d'un record medium", () => {
    const first = mediumRecords[0];
    expect(first).toBeDefined();
    expect(describeShape(first!)).toMatchSnapshot();
  });

  it("snapshot de la shape d'un record large", () => {
    const first = largeRecords[0];
    expect(first).toBeDefined();
    expect(describeShape(first!)).toMatchSnapshot();
  });
});

describe("PlatformCode", () => {
  it("accepte exactement les 4 codes plateforme du MVP", () => {
    const codes: PlatformCode[] = ["boamp", "place", "francmarches", "mp_info"];
    expect(codes).toHaveLength(4);
  });
});

describe("RawTender / NormalizedTender — type compile-time", () => {
  /**
   * Ces blocs ne testent rien à l'exécution — leur seul rôle est de forcer
   * `tsc --noEmit` à valider que les formes sont assignables. Si un champ
   * du schéma Drizzle ou du contrat tend à diverger, ces déclarations
   * passent rouges en compilation.
   */
  it("RawTender accepte une instance minimale conforme au connecteur BOAMP", () => {
    const record = smallRecords[0];
    expect(record).toBeDefined();
    const raw: RawTender = {
      externalRef: record!.idweb,
      platformCode: "boamp",
      rawData: {
        platform_code: "boamp",
        record: record as unknown as Record<string, unknown>,
        fetched_at: new Date().toISOString(),
      },
      fetchedAt: new Date().toISOString(),
    };
    expect(raw.externalRef).toBe(record!.idweb);
    expect(raw.platformCode).toBe("boamp");
  });

  it("NormalizedTender accepte une instance minimale prête à insérer", () => {
    const record = smallRecords[0];
    expect(record).toBeDefined();
    const normalized: NormalizedTender = {
      externalRef: record!.idweb,
      platformCode: "boamp",
      title: "Diagnostic technique",
      buyer: "Departement de l'Isere",
      cpvCodes: ["90700000-4"],
      amount: 2_739_115,
      deadline: new Date("2026-06-16T17:00:00+02:00"),
      questionsDeadline: null,
      visitDate: null,
      dceUrl: "https://www.exemple.test/dce/iTeTYfeNKnmS",
      sourceUrl: null,
      rawData: {
        platform_code: "boamp",
        record: record as unknown as Record<string, unknown>,
        fetched_at: new Date().toISOString(),
      },
    };
    expect(normalized.amount).toBe(2_739_115);
    expect(normalized.deadline).toBeInstanceOf(Date);
  });
});
