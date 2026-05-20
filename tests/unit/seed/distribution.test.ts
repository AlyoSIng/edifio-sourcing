/**
 * Tests unitaires -- logique pure de distribution + sanity check fixture.
 *
 * Periodicite : critique condition 2 ADR-013. Si la fonction de distribution
 * regresse, le seed plante avec une mediane hors fourchette en CI (et donc
 * tout merge bloque sur la PR).
 *
 * NE PAS connecter a Postgres dans ce fichier : Vitest s'execute en process
 * Node pur, sans Postgres. Le test e2e du seed est valide en CI via
 * `pnpm db:migrate && pnpm db:seed`.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { emptyStats, anonymize } from "@/db/seed/lib/anonymize";
import {
  assertDistribution,
  bucketOf,
  computeDistribution,
  DEFAULT_BUCKETS,
  medianKb,
  MEDIAN_MAX_KB,
  MEDIAN_MIN_KB,
  rangeKb,
  recordSizeKb,
  resampleToTarget,
  TARGET_RATIOS,
} from "@/db/seed/lib/distribution";
import { buildMockFixture } from "@/db/seed/lib/fixture-mock";

describe("distribution -- recordSizeKb", () => {
  it("renvoie la taille JSON en KB", () => {
    const tiny = { x: 1 };
    expect(recordSizeKb(tiny)).toBeLessThan(0.1);
    // 10 KB de string ~ 10240 chars
    const fat = { data: "a".repeat(10240) };
    expect(recordSizeKb(fat)).toBeGreaterThan(10);
    expect(recordSizeKb(fat)).toBeLessThan(11);
  });
});

describe("distribution -- bucketOf", () => {
  it("renvoie small / medium / large / null selon la plage par defaut", () => {
    expect(bucketOf({ data: "a".repeat(10 * 1024) })).toBe("small");
    expect(bucketOf({ data: "a".repeat(25 * 1024) })).toBe("medium");
    expect(bucketOf({ data: "a".repeat(45 * 1024) })).toBe("large");
    // 15 KB tombe dans le trou entre small (max 11) et medium (min 22)
    expect(bucketOf({ data: "a".repeat(15 * 1024) })).toBeNull();
  });
});

describe("distribution -- computeDistribution", () => {
  it("regroupe les records par bucket et compte les exclus", () => {
    const records = [
      { data: "a".repeat(10 * 1024) }, // small
      { data: "a".repeat(10 * 1024) }, // small
      { data: "a".repeat(25 * 1024) }, // medium
      { data: "a".repeat(45 * 1024) }, // large
      { data: "a".repeat(15 * 1024) }, // exclu
    ];
    const d = computeDistribution(records);
    expect(d.small).toHaveLength(2);
    expect(d.medium).toHaveLength(1);
    expect(d.large).toHaveLength(1);
    expect(d.excluded).toBe(1);
  });
});

describe("distribution -- medianKb", () => {
  it("calcule la mediane des tailles d'un set de records", () => {
    const records = [
      { data: "a".repeat(10 * 1024) }, // ~10 KB
      { data: "a".repeat(25 * 1024) }, // ~25 KB
      { data: "a".repeat(45 * 1024) }, // ~45 KB
    ];
    const m = medianKb(records);
    expect(m).toBeGreaterThan(24);
    expect(m).toBeLessThan(26);
  });

  it("renvoie 0 sur un set vide (garde-fou)", () => {
    expect(medianKb([])).toBe(0);
  });
});

describe("distribution -- assertDistribution", () => {
  it("passe quand la distribution respecte les ratios cibles +/- tolerance", () => {
    expect(() => assertDistribution({ small: 30, medium: 120, large: 50 }, 25, 200)).not.toThrow();
  });

  it("throw si la mediane est hors bornes [20, 30] KB", () => {
    expect(() => assertDistribution({ small: 30, medium: 120, large: 50 }, 15, 200)).toThrow(
      /Mediane raw_data hors bornes/,
    );
    expect(() => assertDistribution({ small: 30, medium: 120, large: 50 }, 35, 200)).toThrow(
      /Mediane raw_data hors bornes/,
    );
  });

  it("throw si un bucket sort de la tolerance ratio (+/- 5%)", () => {
    // medium devrait etre 60% +/- 5%, donc entre 55% et 65%. 80% sort.
    // small 15% +/- 5% donc [10%, 20%].
    // Cas : 10 small (5%), 160 medium (80%), 30 large (15%) -> small et medium hors
    expect(() => assertDistribution({ small: 10, medium: 160, large: 30 }, 25, 200)).toThrow(
      /Ratio bucket "small" hors tolerance/,
    );
  });
});

describe("distribution -- resampleToTarget", () => {
  it("renvoie l'array d'origine si deja >= target", () => {
    const arr = [1, 2, 3, 4, 5];
    expect(resampleToTarget(arr, 3)).toEqual([1, 2, 3]);
  });

  it("complete avec resampling deterministe si < target", () => {
    const arr = [1, 2];
    const out = resampleToTarget(arr, 10);
    expect(out).toHaveLength(10);
    // Les 2 premiers sont les originaux preserves
    expect(out.slice(0, 2)).toEqual([1, 2]);
  });

  it("throw si le pool source est vide", () => {
    expect(() => resampleToTarget([], 10)).toThrow(/empty source array/);
  });
});

describe("distribution -- rangeKb", () => {
  it("renvoie min/max KB d'un set de records", () => {
    const records = [{ data: "a".repeat(5 * 1024) }, { data: "a".repeat(20 * 1024) }];
    const r = rangeKb(records);
    expect(r.min).toBeGreaterThan(4);
    expect(r.min).toBeLessThan(6);
    expect(r.max).toBeGreaterThan(19);
    expect(r.max).toBeLessThan(21);
  });

  it("renvoie {0, 0} sur un set vide", () => {
    expect(rangeKb([])).toEqual({ min: 0, max: 0 });
  });
});

describe("anonymize -- PII scrubbing", () => {
  it("remplace les emails par contact-{i}-{n}@exemple.test", () => {
    const stats = emptyStats();
    const input = { foo: "bar contact: jean@dupont.fr autres dupont@example.com" };
    const out = anonymize(input, stats, 42);
    expect(stats.emails).toBe(2);
    expect((out as { foo: string }).foo).not.toContain("jean@dupont.fr");
    expect((out as { foo: string }).foo).not.toContain("dupont@example.com");
    expect((out as { foo: string }).foo).toMatch(/contact-42-1@exemple\.test/);
    expect((out as { foo: string }).foo).toMatch(/contact-42-2@exemple\.test/);
  });

  it("remplace les telephones FR par 01 23 45 67 89", () => {
    const stats = emptyStats();
    const input = { tel: "Appelez le 06.12.34.56.78 ou 0123456789" };
    const out = anonymize(input, stats, 0);
    expect(stats.phones).toBe(2);
    expect((out as { tel: string }).tel).not.toContain("06.12.34.56.78");
    expect((out as { tel: string }).tel).not.toContain("0123456789");
    expect((out as { tel: string }).tel.match(/01 23 45 67 89/g)?.length).toBe(2);
  });

  it("remplace les noms personnes physiques dans les champs PERSON_NAME_FIELDS", () => {
    const stats = emptyStats();
    const input = { contact: "Jean Dupont", signataire: "Marie Curie" };
    const out = anonymize(input, stats, 0) as { contact: string; signataire: string };
    expect(stats.names).toBe(2);
    expect(out.contact).not.toBe("Jean Dupont");
    expect(out.signataire).not.toBe("Marie Curie");
  });

  it("PRESERVE les libelles d'organismes publics dans les champs PERSON_NAME_FIELDS", () => {
    const stats = emptyStats();
    const input = { contact: "Mairie de Bordeaux" };
    const out = anonymize(input, stats, 0) as { contact: string };
    // Mairie est dans PUBLIC_ENTITY_HINTS -> conserve
    expect(out.contact).toBe("Mairie de Bordeaux");
    expect(stats.names).toBe(0);
  });

  it("recurse dans les arrays + objets imbriques", () => {
    const stats = emptyStats();
    const input = {
      level1: {
        level2: ["contact@dupont.fr", { contact: "Bob Smith" }],
      },
    };
    anonymize(input, stats, 0);
    expect(stats.emails).toBe(1);
    expect(stats.names).toBe(1);
  });
});

describe("fixture-mock -- buildMockFixture sanity", () => {
  it("genere 60 small + 240 medium + 100 large records aux bonnes tailles", () => {
    const f = buildMockFixture();
    expect(f.small).toHaveLength(60);
    expect(f.medium).toHaveLength(240);
    expect(f.large).toHaveLength(100);

    // Verifie que chaque record tombe bien dans son bucket cible
    for (const rec of f.small) {
      const kb = recordSizeKb(rec);
      expect(kb).toBeGreaterThanOrEqual(DEFAULT_BUCKETS.small.minKb);
      expect(kb).toBeLessThanOrEqual(DEFAULT_BUCKETS.small.maxKb);
    }
    for (const rec of f.medium) {
      const kb = recordSizeKb(rec);
      expect(kb).toBeGreaterThanOrEqual(DEFAULT_BUCKETS.medium.minKb);
      expect(kb).toBeLessThanOrEqual(DEFAULT_BUCKETS.medium.maxKb);
    }
    for (const rec of f.large) {
      const kb = recordSizeKb(rec);
      expect(kb).toBeGreaterThanOrEqual(DEFAULT_BUCKETS.large.minKb);
      expect(kb).toBeLessThanOrEqual(DEFAULT_BUCKETS.large.maxKb);
    }
  });

  it("la mediane globale tombe dans [20, 30] KB (cible Board)", () => {
    const f = buildMockFixture();
    const all = [...f.small, ...f.medium, ...f.large];
    const m = medianKb(all);
    expect(m).toBeGreaterThanOrEqual(MEDIAN_MIN_KB);
    expect(m).toBeLessThanOrEqual(MEDIAN_MAX_KB);
  });

  it("aucun email PII reel dans les records mock (toutes les valeurs @ sont @exemple.test)", () => {
    const f = buildMockFixture();
    const allJson = JSON.stringify(f);
    // Toute occurrence "@" doit etre suivie d'un domaine *exemple.test ou exemple.com etc.
    // On verifie surtout qu'aucun .fr / .com / .org reel n'apparait avec un user-like prefix.
    const realEmailMatches = allJson.match(/[\w.+-]+@(?!exemple\.test)[\w.-]+\.[A-Za-z]{2,}/g);
    expect(realEmailMatches).toBeNull();
  });
});

describe("fixture committee -- sanity (si fichier present)", () => {
  const FIXTURE_PATH = resolve(process.cwd(), "src/db/seed/fixtures/boamp-real.json");

  it.runIf(existsSync(FIXTURE_PATH))(
    "respecte la structure {small, medium, large, metadata}",
    () => {
      const raw = readFileSync(FIXTURE_PATH, "utf8");
      const parsed = JSON.parse(raw) as {
        small: unknown[];
        medium: unknown[];
        large: unknown[];
        metadata: { distribution: { small: number; medium: number; large: number } };
      };
      expect(Array.isArray(parsed.small)).toBe(true);
      expect(Array.isArray(parsed.medium)).toBe(true);
      expect(Array.isArray(parsed.large)).toBe(true);
      expect(parsed.metadata.distribution.small).toBe(parsed.small.length);
      expect(parsed.metadata.distribution.medium).toBe(parsed.medium.length);
      expect(parsed.metadata.distribution.large).toBe(parsed.large.length);
    },
  );

  it.runIf(existsSync(FIXTURE_PATH))("respecte les ratios cibles +/- tolerance", () => {
    const raw = readFileSync(FIXTURE_PATH, "utf8");
    const parsed = JSON.parse(raw) as {
      small: unknown[];
      medium: unknown[];
      large: unknown[];
    };
    const total = parsed.small.length + parsed.medium.length + parsed.large.length;
    expect(total).toBeGreaterThan(0);
    expect(parsed.small.length / total).toBeGreaterThan(TARGET_RATIOS.small - 0.05);
    expect(parsed.medium.length / total).toBeGreaterThan(TARGET_RATIOS.medium - 0.05);
    expect(parsed.large.length / total).toBeGreaterThan(TARGET_RATIOS.large - 0.05);
  });

  it.runIf(existsSync(FIXTURE_PATH))("aucun email PII reel dans la fixture", () => {
    const raw = readFileSync(FIXTURE_PATH, "utf8");
    const matches = raw.match(/[\w.+-]+@(?!exemple\.test)[\w.-]+\.[A-Za-z]{2,}/g);
    // Tolerance : pas d'email non-exemple.test
    expect(matches).toBeNull();
  });
});
