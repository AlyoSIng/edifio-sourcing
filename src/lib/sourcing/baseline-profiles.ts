/**
 * Snapshot de la baseline « profil de recherche AlyoS BTP » du 2026-05-22 17h03.
 *
 * Source : MEMORY Steve TEISSIER —
 * `project_alyos_btp_profile_baseline.md`. Steve a noté que ce profil
 * matchait des AOs et insérait des records en production. À conserver pour
 * détecter une dérive : si la config actuelle s'éloigne trop, c'est probable
 * que le cron 6h30 va recommencer à insérer 0 records (cas observé le
 * 2026-06-04 16:23 — 1482 fetched / 0 inserted).
 *
 * Utilisé par `/sourcing/admin/sourcing-debug` pour afficher un diff visuel
 * entre le profil actif et cette baseline.
 *
 * Si Steve fait évoluer son profil sciemment (élargir les positifs, etc.) et
 * que la nouvelle config marche, mettre à jour cette baseline avec un
 * nouveau snapshot daté.
 */

export interface BaselineProfile {
  /** Date du snapshot (information). */
  capturedAt: string;
  /** Nom attendu du profil pour matching. */
  name: string;
  /** Mots-clés positifs comptés (24 dans la baseline 22/05). */
  positiveCount: number;
  /** Mots-clés négatifs comptés (9). */
  negativeCount: number;
  /** Codes CPV comptés (0 = pas de filtre CPV). */
  cpvCount: number;
  /** Départements / zones géo (23). */
  geoCount: number;
  /** Types de marché autorisés (3 : moe / services / fournitures). */
  marketTypes: string[];
}

export const ALYOS_BTP_BASELINE_2026_05_22: BaselineProfile = {
  capturedAt: "2026-05-22T17:03:00Z",
  name: "Profil AlyoS BTP",
  positiveCount: 24,
  negativeCount: 9,
  cpvCount: 0,
  geoCount: 23,
  marketTypes: ["moe", "services", "fournitures"],
};

/**
 * Comparaison visuelle attendu vs actuel. Renvoie un statut par champ :
 *  - `ok` : valeur identique ou compatible (le profil actuel inclut au moins
 *    autant que la baseline)
 *  - `drift` : valeur différente (potentiellement bénin si évolution
 *    consciente, mais à signaler)
 *  - `regression` : valeur INFÉRIEURE à la baseline (probable cause d'un
 *    0 inserted alors que la baseline en produisait)
 *
 * Heuristique « regression » :
 *  - positiveCount actuel < baseline → regression (moins de matches possibles)
 *  - cpvCount actuel > baseline → drift (la baseline ne filtrait pas par
 *    CPV ; ajouter un filtre durcit le sourcing)
 *  - marketTypes : si l'un des marketTypes de la baseline manque → regression
 */
export type DiffSeverity = "ok" | "drift" | "regression";

export interface FieldDiff {
  field: string;
  baseline: string | number;
  current: string | number;
  severity: DiffSeverity;
  hint?: string;
}

export function compareWithBaseline(
  current: {
    name: string;
    positiveCount: number;
    negativeCount: number;
    cpvCount: number;
    geoCount: number;
    marketTypes: string[];
  },
  baseline: BaselineProfile = ALYOS_BTP_BASELINE_2026_05_22,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  diffs.push({
    field: "Mots-clés positifs",
    baseline: baseline.positiveCount,
    current: current.positiveCount,
    severity:
      current.positiveCount === baseline.positiveCount
        ? "ok"
        : current.positiveCount < baseline.positiveCount
          ? "regression"
          : "drift",
    hint:
      current.positiveCount < baseline.positiveCount
        ? `${baseline.positiveCount - current.positiveCount} mot(s)-clé(s) en moins → moins de matches possibles. C'est la cause n°1 du « 0 inserted ».`
        : current.positiveCount > baseline.positiveCount
          ? `${current.positiveCount - baseline.positiveCount} mot(s)-clé(s) ajouté(s) — devrait élargir le sourcing.`
          : undefined,
  });

  diffs.push({
    field: "Mots-clés négatifs",
    baseline: baseline.negativeCount,
    current: current.negativeCount,
    severity:
      current.negativeCount === baseline.negativeCount
        ? "ok"
        : current.negativeCount > baseline.negativeCount
          ? "drift"
          : "drift",
    hint:
      current.negativeCount > baseline.negativeCount
        ? `${current.negativeCount - baseline.negativeCount} mot(s)-clé(s) exclu(s) en plus — durcit le filtre.`
        : undefined,
  });

  diffs.push({
    field: "Codes CPV",
    baseline: baseline.cpvCount,
    current: current.cpvCount,
    severity:
      current.cpvCount === baseline.cpvCount
        ? "ok"
        : current.cpvCount > 0 && baseline.cpvCount === 0
          ? "drift"
          : "drift",
    hint:
      current.cpvCount > 0 && baseline.cpvCount === 0
        ? `La baseline ne filtrait pas par CPV. Ajouter un filtre CPV durcit le sourcing : seuls les records BOAMP dont le CPV est dans cette liste passent.`
        : undefined,
  });

  diffs.push({
    field: "Zones géo (départements)",
    baseline: baseline.geoCount,
    current: current.geoCount,
    severity:
      current.geoCount === baseline.geoCount
        ? "ok"
        : current.geoCount < baseline.geoCount
          ? "regression"
          : "drift",
    hint:
      current.geoCount < baseline.geoCount
        ? `${baseline.geoCount - current.geoCount} département(s) en moins — sourcing géographiquement plus restreint.`
        : undefined,
  });

  const missingMarketTypes = baseline.marketTypes.filter((mt) => !current.marketTypes.includes(mt));
  const extraMarketTypes = current.marketTypes.filter((mt) => !baseline.marketTypes.includes(mt));
  diffs.push({
    field: "Types de marché",
    baseline: baseline.marketTypes.join(", "),
    current: current.marketTypes.join(", ") || "—",
    severity:
      missingMarketTypes.length === 0 && extraMarketTypes.length === 0
        ? "ok"
        : missingMarketTypes.length > 0
          ? "regression"
          : "drift",
    hint:
      missingMarketTypes.length > 0
        ? `Manque : ${missingMarketTypes.join(", ")} — la baseline matchait ces types, le profil actuel les exclut.`
        : extraMarketTypes.length > 0
          ? `En plus : ${extraMarketTypes.join(", ")} — devrait élargir le sourcing.`
          : undefined,
  });

  return diffs;
}
