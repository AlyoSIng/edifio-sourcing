/**
 * Client Pappers API v2 — moulinette enrichissement fiches architectes.
 *
 * Utilise le fetch natif Next.js (pas de librairie tierce).
 * Timeout 5 secondes via AbortSignal.timeout.
 * Pas de cache côté Next.js (revalidate: 0) — données à jour à chaque appel.
 *
 * Référence API : https://api.pappers.fr/documentation
 */

import type { PappersEntreprise, PappersRechercheResponse } from "./types";

const PAPPERS_BASE = "https://api.pappers.fr/v2";

/**
 * Lookup Pappers par SIREN — retourne null si non trouvé ou erreur réseau/HTTP.
 *
 * @param siren  - SIREN 9 chiffres de l'entreprise
 * @param apiKey - Clé API Pappers (PAPPERS_API_KEY)
 */
export async function getPappersBySiren(
  siren: string,
  apiKey: string,
): Promise<PappersEntreprise | null> {
  const url = `${PAPPERS_BASE}/entreprise?api_token=${encodeURIComponent(apiKey)}&siren=${encodeURIComponent(siren)}&champs=siren,denomination,tranche_effectif_salarie,chiffre_affaires,forme_juridique`;

  try {
    const res = await fetch(url, {
      // Pas de cache Next.js — on veut les données fraîches à chaque appel
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      if (res.status !== 404) {
        console.warn(`[pappers:getSiren] HTTP ${res.status} pour SIREN ${siren}`);
      }
      return null;
    }

    const data = (await res.json()) as PappersEntreprise;
    return data;
  } catch (err) {
    console.warn(`[pappers:getSiren] Erreur fetch SIREN ${siren}:`, err);
    return null;
  }
}

/**
 * Recherche par nom d'entreprise — retourne null si erreur réseau/HTTP.
 *
 * @param name   - Nom ou raison sociale à rechercher
 * @param apiKey - Clé API Pappers (PAPPERS_API_KEY)
 */
export async function searchPappersByName(
  name: string,
  apiKey: string,
): Promise<PappersRechercheResponse | null> {
  const url = `${PAPPERS_BASE}/recherche?api_token=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(name)}&precision=standard&nb_resultats=5`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.warn(`[pappers:searchByName] HTTP ${res.status} pour nom "${name}"`);
      return null;
    }

    const data = (await res.json()) as PappersRechercheResponse;
    return data;
  } catch (err) {
    console.warn(`[pappers:searchByName] Erreur fetch nom "${name}":`, err);
    return null;
  }
}

/**
 * Convertit un code tranche effectif salarié INSEE en effectif médian (entier).
 *
 * Mapping officiel INSEE :
 *   "NN" → 0      (unité non employeuse)
 *   "01" → 2      (1 ou 2 salariés)
 *   "02" → 4      (3 à 5 salariés)
 *   "03" → 7      (6 à 9 salariés)
 *   "11" → 14     (10 à 19 salariés)
 *   "12" → 34     (20 à 49 salariés)
 *   "21" → 74     (50 à 99 salariés)
 *   "22" → 149    (100 à 199 salariés)
 *   "31" → 224    (200 à 249 salariés)
 *   "32" → 374    (250 à 499 salariés)
 *   "41" → 749    (500 à 999 salariés)
 *   "42" → 1499   (1 000 à 1 999 salariés)
 *   "51" → 3499   (2 000 à 4 999 salariés)
 *   "52" → 7499   (5 000 à 9 999 salariés)
 *   "53" → 10000  (10 000 salariés et plus)
 *
 * @param tranche - Code tranche effectif INSEE (ex: "02", "11")
 * @returns Effectif médian arrondi, ou null si tranche inconnue/absente
 */
export function mapTrancheToHeadcount(tranche?: string): number | null {
  if (!tranche) return null;

  const mapping: Record<string, number> = {
    NN: 0,
    "01": 2,
    "02": 4,
    "03": 7,
    "11": 14,
    "12": 34,
    "21": 74,
    "22": 149,
    "31": 224,
    "32": 374,
    "41": 749,
    "42": 1499,
    "51": 3499,
    "52": 7499,
    "53": 10000,
  };

  return mapping[tranche] ?? null;
}
