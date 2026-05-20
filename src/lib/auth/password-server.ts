/**
 * Génération aléatoire — server-only (requiert `node:crypto`).
 *
 * Module séparé de `./password.ts` parce que webpack côté browser ne sait pas
 * gérer le scheme `node:`. Toute fonction qui utilise `randomBytes` doit
 * vivre ici. À importer **uniquement depuis du code serveur** (Server
 * Actions, Route Handlers, scripts). Une importation accidentelle depuis un
 * Client Component fera échouer le `next build` immédiatement (cf. l'erreur
 * webpack `UnhandledSchemeError: node:crypto`) — la séparation est donc
 * garantie par le bundler. On évite la dépendance `server-only` pour ne pas
 * polluer le package.json avec une lib d'1 ligne.
 */

import { randomBytes } from "node:crypto";

import { PROVISIONAL_PASSWORD_LENGTH, SYMBOL_CHARSET } from "./constants";
import { validatePasswordStrength } from "./password";

/** Alphabet utilisé pour la génération — lettres + chiffres + symboles autorisés. */
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const ALPHABET = UPPERCASE + LOWERCASE + DIGITS + SYMBOL_CHARSET;

/**
 * Tire `length` caractères de `alphabet` à partir d'une source d'aléa
 * cryptographique (Node `randomBytes`). On utilise un rejet de l'octet
 * tiré si `octet >= floor(256 / alphabet.length) * alphabet.length` pour
 * éviter le biais modulo classique.
 */
function pickRandomCharacters(alphabet: string, length: number): string {
  const range = alphabet.length;
  const maxValid = Math.floor(256 / range) * range;
  const out: string[] = [];
  while (out.length < length) {
    const buf = randomBytes(length * 2);
    for (let i = 0; i < buf.length && out.length < length; i += 1) {
      const byte = buf[i];
      if (byte === undefined) continue;
      if (byte >= maxValid) continue;
      out.push(alphabet[byte % range]!);
    }
  }
  return out.join("");
}

/**
 * Génère un mot de passe provisoire valide par construction. On boucle
 * jusqu'à ce que toutes les contraintes soient satisfaites.
 *
 * **INVARIANTE DE SÉCURITÉ (Board Q1/B 2026-05-12)** :
 * La chaîne retournée NE DOIT JAMAIS être :
 *   - logguée (`console.log`, `console.warn`, `console.error`)
 *   - persistée côté serveur sous quelque forme que ce soit
 *   - incluse dans l'audit log (cf. `route.ts` POST /api/admin/users : le
 *     champ `provisional_password` est volontairement ABSENT du payload)
 *   - exposée à un Client Component via une Server Action (le retour de la
 *     route handler ne contient JAMAIS le password en clair côté client)
 *
 * Cycle de vie autorisé :
 *   1. Généré en mémoire RAM ici (jamais persisté en clair)
 *   2. Passé à `supabase.auth.admin.createUser({password})` → hash bcrypt
 *      côté Supabase Auth (jamais stocké en clair en BDD)
 *   3. Injecté dans le HTML/text du template Resend (destinataire = user)
 *   4. La variable JS sort de scope → garbage collected
 *
 * Toute autre utilisation est une violation de la politique sécurité. Si
 * une feature future nécessite de réutiliser le provisoire (ex. afficher à
 * l'admin « copie ce password »), ouvrir un ticket et passer par Board.
 *
 * @returns une chaîne de longueur `PROVISIONAL_PASSWORD_LENGTH`.
 */
export function generateProvisionalPassword(): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = pickRandomCharacters(ALPHABET, PROVISIONAL_PASSWORD_LENGTH);
    const result = validatePasswordStrength(candidate);
    if (result.valid) return candidate;
  }
  throw new Error(
    "generateProvisionalPassword: impossible de produire un candidat valide après 50 tentatives.",
  );
}
