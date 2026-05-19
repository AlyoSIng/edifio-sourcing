/**
 * Anonymisation PII des records BOAMP -- edifio Sourcing
 *
 * Source : decision Board etape 5 (Gate 6). La fixture BOAMP committee doit
 * etre PII-free : aucun email, telephone ou nom de personne physique reel ne
 * doit transiter dans le repo. Les noms d'organismes publics (mairies, CT) sont
 * conserves : info publique, pas de PII au sens RGPD.
 *
 * Strategie : balayage recursif d'un objet JSON arbitraire, remplacement par
 * regex sur toute valeur de type string. Conserve la structure mais reecrit les
 * chaines contenant des PII.
 *
 * Module pur (zero IO) -- testable unitairement.
 */

import { faker } from "@faker-js/faker";

faker.seed(20260518); // determinisme inter-runs

/** Compteur d'occurrences anonymisees -- expose pour le rapport final. */
export interface AnonymizationStats {
  emails: number;
  phones: number;
  names: number;
}

/**
 * Regex email RFC simplifie. Capture la chaine entiere si elle ressemble a un
 * email (suffit pour BOAMP qui contient typiquement des "X@Y.Z" en clair).
 */
const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g;

/**
 * Regex telephone FR : 0[1-9] suivi de 4 paires de chiffres avec separateurs
 * optionnels (espace, point, tiret). Couvre 01 23 45 67 89, 01.23.45.67.89,
 * 0123456789, 01-23-45-67-89.
 */
const PHONE_FR_RE = /0[1-9](?:[\s.-]?\d{2}){4}/g;

/**
 * Champs typiquement porteurs de noms de personnes physiques cote BOAMP. Si la
 * valeur d'un de ces champs est un string, on remplace entierement par un nom
 * faker fr-FR -- on ne tente PAS de detecter le nom dans un champ libre.
 */
const PERSON_NAME_FIELDS = new Set([
  "contact",
  "contact_nom",
  "contact_prenom",
  "signataire",
  "signature",
  "nom_signataire",
  "responsable",
  "interlocuteur",
  "personne_contact",
  "nom_contact",
  "prenom_contact",
]);

/**
 * Indices d'organismes publics a CONSERVER (info publique, pas PII).
 * Pattern : si la valeur contient un de ces tokens, on ne touche pas au champ
 * (les emails / tels internes a la chaine sont quand meme rewrittes).
 */
const PUBLIC_ENTITY_HINTS = [
  "mairie",
  "commune",
  "communaute",
  "departement",
  "region",
  "ministere",
  "prefecture",
  "syndicat",
  "etablissement public",
  "centre hospitalier",
];

/**
 * Reecrit une chaine en remplacant emails + telephones par des placeholders
 * deterministes. Les noms ne sont touches que via la passe `replaceFieldName`.
 */
function scrubString(input: string, stats: AnonymizationStats, indexHint: number): string {
  let out = input;

  out = out.replace(EMAIL_RE, () => {
    stats.emails += 1;
    return `contact-${indexHint}-${stats.emails}@exemple.test`;
  });

  out = out.replace(PHONE_FR_RE, () => {
    stats.phones += 1;
    return "01 23 45 67 89";
  });

  return out;
}

/**
 * Detecte si une chaine ressemble a un libelle d'organisme public a preserver.
 * Heuristique : presence d'un token de PUBLIC_ENTITY_HINTS.
 */
function looksLikePublicEntity(value: string): boolean {
  const lower = value.toLowerCase();
  return PUBLIC_ENTITY_HINTS.some((token) => lower.includes(token));
}

/**
 * Remplace recursivement les PII dans un objet/array JSON arbitraire.
 *
 * Regles :
 *   - email match     -> contact-{i}-{n}@exemple.test
 *   - tel FR match    -> 01 23 45 67 89
 *   - champ dans PERSON_NAME_FIELDS dont la valeur ne ressemble pas a un
 *     organisme public -> faker.person.fullName() fr-FR
 *
 * @param value      Donnee JSON quelconque (objet, array, scalar)
 * @param stats      Mutable counter (in/out)
 * @param indexHint  Pour suffixer les emails substitues -- typiquement l'index
 *                   du record dans le batch
 */
export function anonymize<T>(value: T, stats: AnonymizationStats, indexHint: number): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => anonymize(item, stats, indexHint)) as unknown as T;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (
        typeof val === "string" &&
        PERSON_NAME_FIELDS.has(key.toLowerCase()) &&
        !looksLikePublicEntity(val)
      ) {
        // Remplacement complet par un nom faker FR
        stats.names += 1;
        out[key] = faker.person.fullName();
      } else {
        out[key] = anonymize(val, stats, indexHint);
      }
    }
    return out as T;
  }

  if (typeof value === "string") {
    return scrubString(value, stats, indexHint) as T;
  }

  return value;
}

/**
 * Factory de stats vides -- pour usage initial dans le batch fetch.
 */
export function emptyStats(): AnonymizationStats {
  return { emails: 0, phones: 0, names: 0 };
}
