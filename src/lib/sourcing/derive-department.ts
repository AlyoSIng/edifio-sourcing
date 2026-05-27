/**
 * Dérive le code postal et le département depuis les données brutes BOAMP + buyer.
 *
 * Source de vérité : `BRIEF_CHANTIER_260527.md` §Tâche 1 — spec §Exigence 1.
 *
 * Ce module est **pur** (aucun effet de bord, aucun I/O). Il est appelé :
 *  - À l'ingest dans `insert.ts` (calcul à la création + mise à jour idempotente)
 *  - Dans `scripts/backfill-departments.ts` (rétroactivement sur lignes existantes)
 *
 * Règle de résolution département (ordre strict) :
 *   1. `rawData.record.code_departement` (BOAMP réel — tableau ["74"])
 *   2. `rawData.record.departement` (variante legacy)
 *   3. Dérivé du CP extrait via `extractDepartment()` de matching.ts
 *
 * Règle de résolution CP (ordre strict) :
 *   1. CP lieu d'exécution dans rawData.record (plusieurs chemins BOAMP)
 *   2. CP acheteur / MOA dans rawData.record (plusieurs chemins BOAMP)
 *   3. Regex /\b(\d{5})\b/ dans le champ buyer
 *   4. null (→ affiche "CP non précisé" côté UI)
 *
 * Note terrain 2026-05-27 : les AOs BOAMP en prod stockent le département
 * dans `code_departement` (array), pas dans `departement`. Le CP n'est pas
 * présent dans le payload Opendatasoft — `postalCode` restera null pour
 * la majorité des AOs sauf si le champ buyer contient un CP explicite.
 *
 * Département dérivé : réutilise `extractDepartment()` de `matching.ts`
 * (valide pour record.departement + fallback buyer). On NE recrée PAS la logique.
 */

import type { TenderRawData } from "@/db/types/jsonb";
import { extractDepartment } from "@/lib/tandem/matching";

/** Regex code postal français (exactement 5 chiffres, séparé par des mots-limites). */
const CP_REGEX = /\b(\d{5})\b/;

/** Regex pour valider qu'une valeur est bien un code postal français. */
const VALID_CP = /^\d{5}$/;

/**
 * Tente d'extraire une valeur de `obj[key]` si elle constitue un CP valide.
 * Retourne `null` si la clé est absente ou si la valeur ne passe pas la regex.
 */
function cpFrom(obj: Record<string, unknown>, key: string): string | null {
  const val = obj[key];
  if (typeof val === "string" && VALID_CP.test(val.trim())) return val.trim();
  return null;
}

/**
 * Dérive le code postal affiché et le département depuis rawData BOAMP + buyer.
 *
 * @param rawData — payload brut de la plateforme (peut être null)
 * @param buyer   — champ acheteur texte (toujours présent côté DB)
 * @returns `{ postalCode, department }` — l'un ou l'autre peut être null
 */
export function derivePostalCodeAndDepartment(
  rawData: TenderRawData | null | undefined,
  buyer: string,
): { postalCode: string | null; department: string | null } {
  let postalCode: string | null = null;

  if (rawData?.record) {
    const rec = rawData.record as Record<string, unknown>;

    // -------------------------------------------------------------------------
    // 1. CP lieu d'exécution — 3 variantes de nommage BOAMP
    // -------------------------------------------------------------------------
    const lieuExec =
      (typeof rec.lieu_execution === "object" && rec.lieu_execution !== null
        ? (rec.lieu_execution as Record<string, unknown>)
        : null) ??
      (typeof rec.lieuExecution === "object" && rec.lieuExecution !== null
        ? (rec.lieuExecution as Record<string, unknown>)
        : null) ??
      (typeof rec.lieu_exec === "object" && rec.lieu_exec !== null
        ? (rec.lieu_exec as Record<string, unknown>)
        : null);

    if (lieuExec) {
      postalCode = cpFrom(lieuExec, "code_postal") ?? cpFrom(lieuExec, "codePostal") ?? null;
    }

    // Direct sur le record (certaines versions BOAMP aplatissent le CP)
    if (!postalCode) {
      postalCode = cpFrom(rec, "code_postal") ?? cpFrom(rec, "codePostal") ?? null;
    }

    // -------------------------------------------------------------------------
    // 2. CP acheteur / MOA — plusieurs nommages BOAMP
    // -------------------------------------------------------------------------
    if (!postalCode) {
      const acheteur =
        typeof rec.acheteur === "object" && rec.acheteur !== null
          ? (rec.acheteur as Record<string, unknown>)
          : null;
      if (acheteur) {
        postalCode = cpFrom(acheteur, "code_postal") ?? cpFrom(acheteur, "codePostal") ?? null;
      }
    }

    if (!postalCode) {
      const moa =
        typeof rec.moa === "object" && rec.moa !== null
          ? (rec.moa as Record<string, unknown>)
          : null;
      if (moa) {
        postalCode = cpFrom(moa, "code_postal") ?? cpFrom(moa, "codePostal") ?? null;
      }
    }

    if (!postalCode) {
      const pouvAdj =
        (typeof rec.pouvoir_adjudicateur === "object" && rec.pouvoir_adjudicateur !== null
          ? (rec.pouvoir_adjudicateur as Record<string, unknown>)
          : null) ??
        (typeof rec.pouvAdjudicateur === "object" && rec.pouvAdjudicateur !== null
          ? (rec.pouvAdjudicateur as Record<string, unknown>)
          : null);
      if (pouvAdj) {
        postalCode = cpFrom(pouvAdj, "code_postal") ?? cpFrom(pouvAdj, "codePostal") ?? null;
      }
    }

    if (!postalCode) {
      const adresseAcheteur =
        (typeof rec.adresse_acheteur === "object" && rec.adresse_acheteur !== null
          ? (rec.adresse_acheteur as Record<string, unknown>)
          : null) ??
        (typeof rec.adresseAcheteur === "object" && rec.adresseAcheteur !== null
          ? (rec.adresseAcheteur as Record<string, unknown>)
          : null);
      if (adresseAcheteur) {
        postalCode =
          cpFrom(adresseAcheteur, "code_postal") ?? cpFrom(adresseAcheteur, "codePostal") ?? null;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Fallback regex buyer
  // ---------------------------------------------------------------------------
  if (!postalCode) {
    const match = buyer.match(CP_REGEX);
    if (match?.[1] && VALID_CP.test(match[1])) {
      postalCode = match[1];
    }
  }

  // ---------------------------------------------------------------------------
  // Département — délégué à extractDepartment() de matching.ts
  // NE PAS recréer la logique (valide rawData.record.departement + fallback buyer)
  // ---------------------------------------------------------------------------
  const department = extractDepartment({ buyer, rawData: rawData ?? null });

  return { postalCode, department };
}
