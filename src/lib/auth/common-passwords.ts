/**
 * Mots de passe communs interdits — VERSION CLIENT (~100 entrées sectorielles).
 *
 * Module isomorphique : importable côté client pour feedback live dans
 * `ResetPasswordForm` (indicateur de force à chaque keystroke). Contient les
 * entrées AlyoS/edifio + variantes françaises courantes qui passent souvent
 * `MIN_LENGTH = 16` sans détection (saisons + années, motdepasse123, etc.).
 *
 * Architecture du split (Board 2026-05-29, Lot 3 v2) :
 * - `common-passwords.ts`        → ce fichier, ~100 entrées sectorielles, client-safe
 * - `common-passwords-full.ts`   → 10k SecLists, server-only (~85 KB), auto-généré
 *
 * Le check client donne un feedback immédiat sur les pires cas (sectoriels
 * + variantes FR). Le check serveur (`validatePasswordStrengthServer` dans
 * `./password.ts`) ajoute la liste complète SecLists en filet de sécurité.
 *
 * Liste normalisée en lowercase + trim. Couvre :
 *   - les 30 passwords les plus utilisés (123456, password, qwerty…)
 *   - leurs variantes triviales (password1, p@ssword, password!)
 *   - les mots clavier (qwerty, azerty, 1q2w3e4r…)
 *   - les références sectorielles (admin, alyos, edifio, sourcing)
 *   - les noms de saisons + années (printemps2025, été2024…)
 *
 * Maintenance : si une heuristique manuelle révèle un trou (un user
 * choisit `Edifio2026!` par exemple), ajouter ici et committer. Le check
 * est case-insensitive donc on stocke en lowercase une seule fois.
 */

const COMMON_PASSWORDS_ARRAY: readonly string[] = [
  // Top universel
  "123456",
  "123456789",
  "12345",
  "12345678",
  "1234567",
  "1234567890",
  "1234",
  "111111",
  "000000",
  "654321",
  "password",
  "password1",
  "password123",
  "password!",
  "passw0rd",
  "p@ssword",
  "p@ssw0rd",
  "qwerty",
  "qwerty123",
  "qwertyuiop",
  "azerty",
  "azertyuiop",
  "1q2w3e4r",
  "1q2w3e4r5t",
  "qwerty1",
  "abc123",
  "abcdef",
  "abcdefg",
  "abcdefgh",
  "letmein",
  "letmein1",
  "welcome",
  "welcome1",
  "welcome123",
  "monkey",
  "monkey123",
  "dragon",
  "master",
  "shadow",
  "superman",
  "batman",
  "starwars",
  "michael",
  "jordan",
  "trustno1",
  "iloveyou",
  "loveyou",
  "princess",
  "sunshine",
  "ashley",
  "bailey",
  "freedom",

  // Admin / sys
  "admin",
  "administrator",
  "admin123",
  "admin1",
  "root",
  "toor",
  "test",
  "test123",
  "guest",
  "default",
  "changeme",
  "login",
  "user",
  "user123",
  "demo",

  // Sectoriel AlyoS / edifio (heuristique défensive)
  "alyos",
  "alyos123",
  "alyos2026",
  "edifio",
  "edifio2026",
  "edifio123",
  "sourcing",
  "sourcing2026",
  "ingenierie",

  // Mots clavier français + variantes
  "motdepasse",
  "motdepasse1",
  "motdepasse123",
  "secret",
  "secret123",
  "soleil",
  "bonjour",
  "salut",

  // Saisons + années récentes
  "printemps2024",
  "printemps2025",
  "printemps2026",
  "ete2024",
  "ete2025",
  "ete2026",
  "automne2024",
  "automne2025",
  "automne2026",
  "hiver2024",
  "hiver2025",
  "hiver2026",
  "summer2024",
  "summer2025",
  "summer2026",
  "winter2024",
  "winter2025",
  "winter2026",
];

/** Set indexé pour lookup O(1). Normalisation lowercase déjà appliquée. */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set(COMMON_PASSWORDS_ARRAY);

/**
 * Retourne `true` si le mot de passe figure dans la liste des plus communs.
 * Normalise (trim + lowercase) avant lookup — un attaquant qui essaie
 * `Password123` ou ` password123 ` doit aussi être bloqué.
 */
export function isCommonPassword(pwd: string): boolean {
  if (!pwd) return false;
  const normalised = pwd.trim().toLowerCase();
  if (normalised.length === 0) return false;
  return COMMON_PASSWORDS.has(normalised);
}
