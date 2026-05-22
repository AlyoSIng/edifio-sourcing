/**
 * Schéma Zod — payload d'édition du profil de recherche (P2 Gate 6).
 *
 * Consommé par la Server Action `updateProfileAction` (`actions.ts`) côté
 * `/sourcing/admin/profil`. La validation est **côté serveur uniquement** —
 * le client envoie un payload brut typé `unknown` ; on ne fait confiance qu'à
 * ce module.
 *
 * Contraintes source :
 *  - Q3 Board 22/05 : `exact_keywords` case-insensitive → on normalise via
 *    `.toLowerCase()` + trim au parsing (cohérent matcher `filter.ts` PR #26
 *    qui fait `normalizeForMatching` côté lecture). Les `positive` / `negative`
 *    suivent la même règle pour cohérence (l'utilisateur a un seul espace de
 *    saisie mental). NB : `filter.ts` re-normalise lui-même de toute façon,
 *    donc la normalisation au save est *redondante mais utile* pour stocker
 *    une donnée propre en BDD et éviter les doublons casse-divergents.
 *  - Q4 Board 22/05 : `market_types` enum fermé `travaux | services |
 *    fournitures | moe`.
 *  - Q5 Board 22/05 : `geo_zones` codes département FR V1 → regex
 *    `/^(2[AB]|\d{2,3})$/` (couvre 2A/2B Corse + 01-95 métropole + 971-976
 *    DROM en 3 digits).
 *  - CPV : `/^\d{2,8}$/` (2 digits = wildcard famille, 8 = code exact).
 *    Pas de wildcard `*` saisi explicitement — `filter.ts` traite déjà
 *    `startsWith()` (cf. spec §3.5).
 *  - Bornes : array ≤ 100 items, chaque string ≤ 100 chars (anti-DOS payload),
 *    trim systématique, dedup post-normalisation.
 *  - Montants : `≥ 0`, optionnels, `amountMin ≤ amountMax` quand les deux
 *    posés (refine final).
 *
 * Convention de retour : `SearchProfileUpdateInput` = type inféré, prêt à
 * être passé tel quel à `updateSearchProfile()` après conversion `number →
 * string` pour les montants (numeric Postgres → string côté Drizzle).
 */

import { z } from "zod";

// ============================================================================
// 1. Constantes — limites et enum fermé
// ============================================================================

/** Max d'items par array — anti-DOS payload + UI raisonnable. */
const MAX_ARRAY_ITEMS = 100;
/** Max de chars par string (keyword, CPV, geo zone, market type). */
const MAX_STRING_LENGTH = 100;

/**
 * Enum fermé `market_types` — Q4 Board 22/05.
 *
 * Valeurs alignées avec le seed prod (`src/db/seed/prod.ts:185`) qui
 * historiquement contenait `"maitrise d'oeuvre"` (libellé libre). On normalise
 * en `moe` côté V1 — la migration data (re-write des rows existants) est hors
 * scope de cette PR. NB : le seed sera ajusté en PR séparée si besoin
 * (REQUEST documentée dans la note de suivi).
 */
export const MARKET_TYPES = ["travaux", "services", "fournitures", "moe"] as const;
export type MarketType = (typeof MARKET_TYPES)[number];

/**
 * Regex codes département FR — Q5 Board 22/05.
 *
 * Couvre :
 *  - `01` à `95` (métropole, 2 digits) — la plage est plus large que
 *    strictement nécessaire (ex. `00` accepté regex) mais on délègue la
 *    validation fine à un set Postgres ailleurs si besoin. Pragmatique V1.
 *  - `2A`, `2B` (Corse, lettre majuscule)
 *  - `971`, `972`, `973`, `974`, `976` (DROM, 3 digits — Mayotte=976)
 */
const FR_DEPT_REGEX = /^(2[AB]|\d{2,3})$/;

/** Regex CPV — 2 à 8 digits sans wildcard explicite. */
const CPV_REGEX = /^\d{2,8}$/;

// ============================================================================
// 2. Helpers réutilisables
// ============================================================================

/**
 * Builder d'array Zod avec :
 *  - `.trim()` sur chaque string
 *  - rejet des strings vides post-trim
 *  - max `MAX_STRING_LENGTH` chars
 *  - max `MAX_ARRAY_ITEMS` items
 *  - dedup automatique (Set) — pas une erreur de saisie, juste un dedup
 *    silencieux côté serveur pour idempotence.
 *
 * Optionnellement, un `regex` est appliqué par item (CPV / geo).
 * Optionnellement, une normalisation (`lowercase`) avant dedup (keywords).
 */
function arrayOfStrings(opts: {
  /** Regex appliquée par item — facultative (keywords libre). */
  itemRegex?: RegExp;
  /** Message si itemRegex échoue. */
  regexMessage?: string;
  /** Si true, applique `.toLowerCase()` après trim avant dedup. */
  lowercase?: boolean;
}) {
  let stringSchema = z.string().trim().min(1).max(MAX_STRING_LENGTH);
  if (opts.itemRegex) {
    const re = opts.itemRegex;
    const msg = opts.regexMessage ?? "format invalide";
    stringSchema = stringSchema.regex(re, msg);
  }
  return z
    .array(stringSchema)
    .max(MAX_ARRAY_ITEMS)
    .transform((arr) => {
      const normalized = opts.lowercase ? arr.map((s) => s.toLowerCase()) : arr;
      // dedup en préservant l'ordre d'apparition (utile pour stabilité UI/audit)
      const seen = new Set<string>();
      const out: string[] = [];
      for (const item of normalized) {
        if (!seen.has(item)) {
          seen.add(item);
          out.push(item);
        }
      }
      return out;
    });
}

// ============================================================================
// 3. Schéma principal — searchProfileUpdateSchema
// ============================================================================

/**
 * Schéma Zod du payload `updateProfileAction`. Strict côté serveur — toute
 * propriété inconnue est rejetée par défaut (`z.object` strict implicite avec
 * Zod 4) car on contrôle 100 % de la surface saisissable.
 *
 * Champs :
 *  - `keywords` : objet `{ positive[], negative[], exact[] }` (lowercase + dedup)
 *  - `cpv_codes` : array regex `^\d{2,8}$`
 *  - `geo_zones` : array regex `^(2[AB]|\d{2,3})$`
 *  - `market_types` : array enum fermé (dedup)
 *  - `amount_min` / `amount_max` : `number ≥ 0` ou `null`, refine `min ≤ max`
 *
 * NB sur naming : on garde **snake_case** dans le payload pour cohérence avec
 * la colonne SQL et l'audit log A3 (cf. `specs/audit_log_v1.md` §A3 diff
 * `keywords.positive`). Le mapping vers Drizzle (`keywords` → `keywords`,
 * `cpv_codes` → `cpvCodes`, etc.) est fait côté Server Action.
 */
export const searchProfileUpdateSchema = z
  .object({
    keywords: z.object({
      positive: arrayOfStrings({ lowercase: true }),
      negative: arrayOfStrings({ lowercase: true }),
      exact: arrayOfStrings({ lowercase: true }),
    }),
    cpv_codes: arrayOfStrings({
      itemRegex: CPV_REGEX,
      regexMessage: "Code CPV invalide (2 à 8 chiffres attendus)",
    }),
    geo_zones: arrayOfStrings({
      itemRegex: FR_DEPT_REGEX,
      regexMessage: "Zone géographique invalide (département FR : 01-95, 2A/2B, 971-976)",
    }),
    market_types: z
      .array(z.enum(MARKET_TYPES))
      .max(MAX_ARRAY_ITEMS)
      .transform((arr) => {
        // Dedup en préservant l'ordre.
        const seen = new Set<MarketType>();
        const out: MarketType[] = [];
        for (const item of arr) {
          if (!seen.has(item)) {
            seen.add(item);
            out.push(item);
          }
        }
        return out;
      }),
    amount_min: z.number().min(0).nullable(),
    amount_max: z.number().min(0).nullable(),
  })
  .refine(
    (data) => {
      if (data.amount_min === null || data.amount_max === null) return true;
      return data.amount_min <= data.amount_max;
    },
    {
      message: "Le montant minimum doit être inférieur ou égal au montant maximum.",
      path: ["amount_min"],
    },
  );

/**
 * Type inféré du payload validé. Exporté pour signer la Server Action et les
 * tests.
 */
export type SearchProfileUpdateInput = z.infer<typeof searchProfileUpdateSchema>;
