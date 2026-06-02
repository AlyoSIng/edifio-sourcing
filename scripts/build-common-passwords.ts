/**
 * Génère `src/lib/auth/common-passwords-full.ts` depuis le snapshot SecLists.
 *
 * Source : https://github.com/danielmiessler/SecLists (MIT)
 *   Passwords/Common-Credentials/10-million-password-list-top-10000.txt
 *
 * Workflow de mise à jour (à refaire tous les ~12 mois ou quand un nouvel
 * incident justifie la rotation) :
 *
 *   1. Download :
 *      Invoke-WebRequest -Uri "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10-million-password-list-top-10000.txt" \
 *                        -OutFile "tmp/10k-passwords.txt"
 *
 *   2. Régénère le module TS :
 *      npx tsx scripts/build-common-passwords.ts
 *
 *   3. Vérifie + commit le fichier `src/lib/auth/common-passwords-full.ts`
 *      (le `.txt` source reste dans `tmp/`, ignoré par `.gitignore`).
 *
 * Notes :
 * - On normalise lowercase + trim, puis on dédoublonne (SecLists contient
 *   quelques doublons après normalisation).
 * - Le fichier généré pèse ~85 KB ; il ne doit JAMAIS être importé côté client
 *   (cf. commentaire en tête du module généré).
 */

import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..");
const TXT = path.join(REPO_ROOT, "tmp", "10k-passwords.txt");
const OUT = path.join(REPO_ROOT, "src", "lib", "auth", "common-passwords-full.ts");

function main(): void {
  if (!fs.existsSync(TXT)) {
    console.error(`[build-common-passwords] introuvable: ${TXT}`);
    console.error("  → Télécharge d'abord le fichier (cf. JSDoc en tête de ce script).");
    process.exit(1);
  }

  const raw = fs.readFileSync(TXT, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l.length > 0);

  const unique = Array.from(new Set(lines));
  const escaped = unique.map((p) => JSON.stringify(p));

  const today = new Date().toISOString().slice(0, 10);

  const content = `/**
 * Liste 10k mots de passe communs — SERVER-ONLY (~85 KB).
 *
 * AUTO-GÉNÉRÉ — ne pas éditer à la main. Cf. \`scripts/build-common-passwords.ts\`
 * pour régénérer (download SecLists puis \`npx tsx scripts/build-common-passwords.ts\`).
 *
 * Source : SecLists \`10-million-password-list-top-10000.txt\` (licence MIT,
 * danielmiessler/SecLists). Snapshot pris le ${today}.
 *
 * **NE PAS importer côté client** : ce module pèse ~85 KB de Set en clair.
 * À consommer strictement depuis du code serveur (Server Actions, Route
 * Handlers) via \`validatePasswordStrengthServer\` dans \`./password.ts\`.
 *
 * Architecture (split client / server) :
 * - \`common-passwords.ts\`        → ~100 entrées sectorielles AlyoS/edifio (client-safe)
 * - \`common-passwords-full.ts\`   → 10k SecLists (ce fichier, server-only)
 *
 * Le check server applique d'abord la liste client (qui couvre les variantes
 * sectorielles invisibles dans SecLists), puis vérifie la liste complète.
 */

/** Set indexé pour lookup O(1). Toutes les entrées sont déjà lowercase + trim. */
export const COMMON_PASSWORDS_FULL: ReadonlySet<string> = new Set([
  ${escaped.join(",\n  ")},
]);

/**
 * Retourne \`true\` si le mot de passe figure dans le top 10k SecLists.
 * Normalise (trim + lowercase) avant lookup — un attaquant qui tente
 * \` Password1\` doit aussi être bloqué.
 */
export function isCommonPasswordFull(input: string): boolean {
  if (!input) return false;
  const normalised = input.trim().toLowerCase();
  if (normalised.length === 0) return false;
  return COMMON_PASSWORDS_FULL.has(normalised);
}
`;

  fs.writeFileSync(OUT, content, "utf8");
  const sizeKb = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log(
    `[build-common-passwords] OK — ${unique.length} entrées uniques → ${OUT} (${sizeKb} KB)`,
  );
}

main();
