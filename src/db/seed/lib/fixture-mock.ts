/**
 * Generateur de fixture BOAMP MOCK -- edifio Sourcing
 * ---------------------------------------------------------------------------
 * Pourquoi : la branche de developpement n'a pas toujours acces a data.boamp.fr
 * (pare-feu entreprise, environnement Claude Code sandboxe). Ce module genere
 * une fixture synthetiquement plausible avec la meme structure JSON qu'un
 * record Opendatasoft BOAMP v2.1, et la meme distribution de tailles.
 *
 * Utilisation :
 *   - Au build de la fixture si fetch-boamp-fixture.ts detecte une 0xx HTTP.
 *   - En CI au cas ou la fixture committee est manquante.
 *
 * 100% PII-free (jamais d'email reel, jamais de tel reel). Tous les noms sont
 * generes via faker fr-FR ou sont des organismes publics fictifs explicites.
 *
 * Structure du record imite l'API BOAMP : champ `record` (Opendatasoft enveloppe
 * chaque ligne d'un object {id, record: {fields: {...}, ...}}), avec les
 * champs principaux du dataset BOAMP : `idweb`, `nomacheteur`, `objet`,
 * `dateparution`, `datelimitereponse`, `codecpv_*`, `descripteur_*`, etc.
 */

import { faker } from "@faker-js/faker";

faker.seed(20260518);

const ORGANISMES_PUBLICS = [
  "Mairie de Saint-Denis",
  "Communaute de communes du Pays Vert",
  "Departement de l'Isere",
  "Region Nouvelle-Aquitaine",
  "Ministere des Armees",
  "Centre Hospitalier de Bordeaux",
  "Syndicat mixte des transports lyonnais",
  "Etablissement public foncier d'Occitanie",
  "Prefecture du Var",
  "Commune de Bagnolet",
] as const;

const CPV_CODES = [
  "45000000-7",
  "45200000-9",
  "45211000-9",
  "45261000-4",
  "71200000-0",
  "71300000-1",
  "71311000-1",
  "71500000-3",
  "71540000-5",
  "90700000-4",
] as const;

const TYPES_MARCHE = [
  "travaux",
  "services",
  "fournitures",
  "maitrise d'oeuvre",
  "concession",
] as const;

const DESCRIPTEURS = [
  "Renovation thermique",
  "Construction d'un equipement scolaire",
  "Refection de voirie",
  "Amenagement paysager",
  "Etude de faisabilite",
  "Mission de maitrise d'oeuvre",
  "Diagnostic technique",
  "Construction neuve",
  "Rehabilitation lourde",
  "Demolition selective",
] as const;

function pick<T>(arr: readonly T[]): T {
  const idx = faker.number.int({ min: 0, max: arr.length - 1 });
  const v = arr[idx];
  if (v === undefined) throw new Error("pick: empty array");
  return v;
}

/**
 * Genere un descripteur textuel d'une certaine longueur en padding avec des
 * elements legitimes (criteres d'attribution, conditions, etc.). Permet
 * d'atteindre les tailles cibles small/medium/large sans pad artificiel
 * (chaque "filler" est du texte semanticement coherent).
 */
function lorem(targetChars: number): string {
  const segments: string[] = [];
  let total = 0;
  while (total < targetChars) {
    const s = faker.lorem.paragraph({ min: 3, max: 8 });
    segments.push(s);
    total += s.length;
  }
  return segments.join("\n\n").slice(0, targetChars);
}

/**
 * Construit un record BOAMP MOCK plausible. La taille KB est pilotee par la
 * variable `extraTextChars` (texte legitime, jamais du padding artificiel).
 */
function buildMockRecord(extraTextChars: number, indexHint: number): Record<string, unknown> {
  const acheteur = pick(ORGANISMES_PUBLICS);
  const dateParution = faker.date.recent({ days: 60 }).toISOString().slice(0, 10);
  const dateLimite = faker.date.soon({ days: 45 }).toISOString().slice(0, 10);
  const cpvs = Array.from({ length: faker.number.int({ min: 1, max: 4 }) }, () => pick(CPV_CODES));
  return {
    idweb: `MOCK-${20260518000000 + indexHint}`,
    nomacheteur: acheteur,
    objet: `${pick(DESCRIPTEURS)} -- ${acheteur}`,
    descripteur: pick(DESCRIPTEURS),
    type_marche: pick(TYPES_MARCHE),
    dateparution: dateParution,
    datelimitereponse: `${dateLimite}T17:00:00+02:00`,
    codecpv_principal: cpvs[0],
    codecpv_secondaire: cpvs.slice(1),
    departement: faker.location.zipCode("##").slice(0, 2),
    region: faker.location.state(),
    montant_estime: faker.number.int({ min: 50000, max: 8000000 }),
    procedure: pick(["adapte", "ouvert", "restreint", "negocie"]),
    famille_supports: pick(["batiment", "infrastructure", "espaces publics"]),
    contact_nom: faker.person.fullName(),
    contact_email: `marches-publics-${indexHint}@exemple.test`,
    contact_telephone: "01 23 45 67 89",
    description_marche: lorem(extraTextChars),
    criteres_attribution: ["Prix : 40%", "Valeur technique : 50%", "Delai d'execution : 10%"],
    url_dce: `https://www.exemple.test/dce/${faker.string.alphanumeric(12)}`,
  };
}

/**
 * Calibrage : pour atteindre les tailles cibles, on choisit `extraTextChars` :
 *   - small  ~10 KB total -> ~8500 chars de description (rest = headers)
 *   - medium ~25 KB total -> ~23000 chars de description
 *   - large  ~45 KB total -> ~43000 chars de description
 * Mesures empiriques sur le schema ci-dessus (overhead ~1.5 KB de structure).
 */
const TARGETS = {
  small: { count: 60, textChars: 8700 },
  medium: { count: 240, textChars: 23200 },
  large: { count: 100, textChars: 43200 },
} as const;

export function buildMockFixture(): {
  small: Record<string, unknown>[];
  medium: Record<string, unknown>[];
  large: Record<string, unknown>[];
} {
  const out = {
    small: [] as Record<string, unknown>[],
    medium: [] as Record<string, unknown>[],
    large: [] as Record<string, unknown>[],
  };
  let counter = 0;
  for (const [label, cfg] of Object.entries(TARGETS) as [
    "small" | "medium" | "large",
    typeof TARGETS.small,
  ][]) {
    for (let i = 0; i < cfg.count; i += 1) {
      out[label].push(buildMockRecord(cfg.textChars, counter));
      counter += 1;
    }
  }
  return out;
}
