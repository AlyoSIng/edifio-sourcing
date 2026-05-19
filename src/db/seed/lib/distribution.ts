/**
 * Distribution par taille des records BOAMP -- edifio Sourcing
 *
 * Condition 2 ADR-013 (CTO) : la fixture doit etre re-seedable a une mediane
 * raw_data de 25 KB +/- 5 KB. La distribution cible est :
 *   - 15% small  (~10 KB)  -- 30 enregistrements par org (60 total)
 *   - 60% medium (~25 KB)  -- 120 enregistrements par org (240 total)
 *   - 25% large  (~45 KB)  -- 50 enregistrements par org (100 total)
 *
 * NB : la cible globale du seed (200 tenders, 100 par org) ne couvre PAS les
 * 60 small / 240 medium / 100 large -- la fixture en stocke plus pour resampling
 * (deux orgs partagent une meme fixture, on tire 100 records par org).
 *
 * Bornes des buckets : on prend des plages KB englobantes (cf. specs etape 5
 * du prompt Board). Les valeurs sont parametrables pour le test unit.
 *
 * Module pur (zero IO) -- testable unitairement.
 */

/** Plage de taille [min, max] en KB pour un bucket de records. */
export interface BucketRange {
  /** Borne basse incluse, en KB */
  minKb: number;
  /** Borne haute incluse, en KB */
  maxKb: number;
}

/**
 * Configuration par defaut des 3 buckets. Valide la cible Board :
 *   small  10 KB +/- 1 KB
 *   medium 25 KB +/- 3 KB
 *   large  45 KB +/- 3 KB
 * Mediane attendue : 25 KB (le bucket medium represente 60% du total).
 */
export const DEFAULT_BUCKETS: { small: BucketRange; medium: BucketRange; large: BucketRange } = {
  small: { minKb: 9, maxKb: 11 },
  medium: { minKb: 22, maxKb: 28 },
  large: { minKb: 42, maxKb: 48 },
};

/** Ratios cibles -- somme = 1.0. */
export const TARGET_RATIOS = {
  small: 0.15,
  medium: 0.6,
  large: 0.25,
} as const;

/** Tolerance acceptee sur chaque bucket (en proportion absolue). */
export const RATIO_TOLERANCE = 0.05;

/** Bornes acceptees pour la mediane globale du seed. */
export const MEDIAN_MIN_KB = 20;
export const MEDIAN_MAX_KB = 30;

export type BucketLabel = "small" | "medium" | "large";

/**
 * Calcule la taille en KB d'un record JSON-serialisable.
 * Convention : `JSON.stringify(record).length / 1024` (taille UTF-8 approximee
 * en pratique sur du texte FR, les caracteres accentues comptent pour 2 octets
 * mais on simplifie -- cible Board parle de "JSON.stringify length").
 */
export function recordSizeKb(record: unknown): number {
  return JSON.stringify(record).length / 1024;
}

/**
 * Classe un record dans son bucket selon DEFAULT_BUCKETS. Renvoie null si le
 * record tombe en dehors des 3 plages (a ecarter du seed).
 */
export function bucketOf(
  record: unknown,
  ranges: typeof DEFAULT_BUCKETS = DEFAULT_BUCKETS,
): BucketLabel | null {
  const kb = recordSizeKb(record);
  if (kb >= ranges.small.minKb && kb <= ranges.small.maxKb) return "small";
  if (kb >= ranges.medium.minKb && kb <= ranges.medium.maxKb) return "medium";
  if (kb >= ranges.large.minKb && kb <= ranges.large.maxKb) return "large";
  return null;
}

/**
 * Regroupe un array de records en 3 buckets selon leur taille.
 * Les records hors plages sont ignores (logges en console par l'appelant).
 */
export function computeDistribution<T>(
  records: T[],
  ranges: typeof DEFAULT_BUCKETS = DEFAULT_BUCKETS,
): {
  small: T[];
  medium: T[];
  large: T[];
  excluded: number;
} {
  const out = {
    small: [] as T[],
    medium: [] as T[],
    large: [] as T[],
    excluded: 0,
  };
  for (const rec of records) {
    const b = bucketOf(rec, ranges);
    if (b === null) {
      out.excluded += 1;
    } else {
      out[b].push(rec);
    }
  }
  return out;
}

/**
 * Calcule la mediane des tailles KB d'un set de records.
 */
export function medianKb(records: unknown[]): number {
  if (records.length === 0) return 0;
  const sizes = records.map(recordSizeKb).sort((a, b) => a - b);
  const mid = Math.floor(sizes.length / 2);
  if (sizes.length % 2 === 0) {
    const lo = sizes[mid - 1];
    const hi = sizes[mid];
    if (lo === undefined || hi === undefined) return 0; // unreachable, garde noUncheckedIndexedAccess
    return (lo + hi) / 2;
  }
  const value = sizes[mid];
  return value ?? 0;
}

/**
 * Donne la plage observee [min, max] en KB d'un set de records (utile pour le
 * rapport distribution-report.json).
 */
export function rangeKb(records: unknown[]): { min: number; max: number } {
  if (records.length === 0) return { min: 0, max: 0 };
  let min = Infinity;
  let max = -Infinity;
  for (const r of records) {
    const kb = recordSizeKb(r);
    if (kb < min) min = kb;
    if (kb > max) max = kb;
  }
  return { min, max };
}

/**
 * Echantillonne avec remise un array de records pour atteindre exactement
 * `target` elements. Utile quand la distribution naturelle BOAMP ne fournit
 * pas assez de records dans un bucket (acceptable pour un seed dev/CI).
 *
 * Determinisme : utilise un PRNG seede en entree pour reproductibilite des
 * tests. La cle de seed par defaut est constante.
 */
export function resampleToTarget<T>(records: T[], target: number, seed = 42): T[] {
  if (records.length === 0) {
    throw new Error("resampleToTarget: empty source array");
  }
  if (records.length >= target) {
    return records.slice(0, target);
  }
  // PRNG Mulberry32 -- minimal, deterministe, suffisant pour echantillonnage.
  let state = seed >>> 0;
  const rand = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: T[] = [...records];
  while (out.length < target) {
    const idx = Math.floor(rand() * records.length);
    const picked = records[idx];
    if (picked === undefined) continue; // garde noUncheckedIndexedAccess
    out.push(picked);
  }
  return out;
}

/**
 * Verifie qu'une distribution observee respecte les ratios cibles +/- tolerance
 * et que la mediane tombe dans [MEDIAN_MIN_KB, MEDIAN_MAX_KB].
 * Throw un Error explicite en cas d'echec -- assertion bloquante condition 2 CTO.
 */
export function assertDistribution(
  observed: { small: number; medium: number; large: number },
  medianValueKb: number,
  total: number,
): void {
  if (medianValueKb < MEDIAN_MIN_KB || medianValueKb > MEDIAN_MAX_KB) {
    throw new Error(
      `[seed] Mediane raw_data hors bornes (condition 2 CTO ADR-013) : ${medianValueKb.toFixed(2)} KB, attendu [${MEDIAN_MIN_KB}, ${MEDIAN_MAX_KB}].`,
    );
  }
  for (const [label, ratio] of Object.entries(TARGET_RATIOS) as [BucketLabel, number][]) {
    const obs = observed[label] / total;
    const diff = Math.abs(obs - ratio);
    if (diff > RATIO_TOLERANCE) {
      throw new Error(
        `[seed] Ratio bucket "${label}" hors tolerance : observe ${(obs * 100).toFixed(1)}%, cible ${(ratio * 100).toFixed(0)}% +/- ${(RATIO_TOLERANCE * 100).toFixed(0)}%.`,
      );
    }
  }
}
