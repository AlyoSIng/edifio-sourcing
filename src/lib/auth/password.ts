/**
 * Politique de mot de passe — validation isomorphique (client + server).
 *
 * Ce module reste **pur** (aucune dépendance Node-only) pour être consommable
 * depuis un Client Component (`ResetPasswordForm` — indicateur de force) ET
 * depuis une Server Action. La génération aléatoire (qui requiert `node:crypto`)
 * vit dans `./password-server.ts`.
 *
 * Ajustements Board 2026-05-12 :
 *   - Q1/B : TTL provisoire en HEURES (au lieu de jours). Helper renommé.
 *   - Q2/B : `MIN_LENGTH = 16` + check liste des mots de passe communs.
 *   - Q4/A : helper formatter MM:SS pour le countdown rate-limit login.
 *
 * TODO post-MVP : intégrer un check « have I been pwned » (k-anonymity sur les
 * 5 premiers hex du SHA-1) — non bloquant Gate 6.
 */

import { isCommonPassword } from "./common-passwords";
import {
  MIN_LENGTH,
  PASSWORD_ERROR_CODES,
  REQUIRE_DIGIT,
  REQUIRE_LOWERCASE,
  REQUIRE_SYMBOL,
  REQUIRE_UPPERCASE,
  SYMBOL_CHARSET,
  type PasswordErrorCode,
} from "./constants";

/** Résultat de la validation côté serveur ET côté indicateur UI. */
export interface PasswordValidationResult {
  valid: boolean;
  /** Codes d'erreur stables — l'UI mappe vers un libellé FR. */
  errors: PasswordErrorCode[];
}

/**
 * Applique les règles de force définies dans `constants.ts`. Pure, testable
 * sans Node.js (utilise uniquement des regex standard).
 *
 * Le check "trop commun" est appliqué EN PLUS des règles de classes / longueur.
 * Si la longueur est OK et que les classes sont OK mais que le password
 * figure dans la liste, on rejette quand même.
 */
export function validatePasswordStrength(pwd: string): PasswordValidationResult {
  const errors: PasswordErrorCode[] = [];

  if (pwd.length < MIN_LENGTH) {
    errors.push(PASSWORD_ERROR_CODES.TOO_SHORT);
  }
  if (REQUIRE_UPPERCASE && !/[A-Z]/.test(pwd)) {
    errors.push(PASSWORD_ERROR_CODES.NO_UPPERCASE);
  }
  if (REQUIRE_LOWERCASE && !/[a-z]/.test(pwd)) {
    errors.push(PASSWORD_ERROR_CODES.NO_LOWERCASE);
  }
  if (REQUIRE_DIGIT && !/\d/.test(pwd)) {
    errors.push(PASSWORD_ERROR_CODES.NO_DIGIT);
  }
  if (REQUIRE_SYMBOL) {
    const symbolRegex = new RegExp(`[${SYMBOL_CHARSET.replace(/[-\\\]^]/g, (m) => "\\" + m)}]`);
    if (!symbolRegex.test(pwd)) {
      errors.push(PASSWORD_ERROR_CODES.NO_SYMBOL);
    }
  }
  if (isCommonPassword(pwd)) {
    errors.push(PASSWORD_ERROR_CODES.TOO_COMMON);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Mappe un code d'erreur stable vers un libellé FR utilisateur.
 * Mutualisé pour Server Action + UI indicateur de force.
 */
export function passwordErrorLabel(code: PasswordErrorCode): string {
  switch (code) {
    case PASSWORD_ERROR_CODES.TOO_SHORT:
      return `Au moins ${MIN_LENGTH} caractères.`;
    case PASSWORD_ERROR_CODES.NO_UPPERCASE:
      return "Au moins une majuscule.";
    case PASSWORD_ERROR_CODES.NO_LOWERCASE:
      return "Au moins une minuscule.";
    case PASSWORD_ERROR_CODES.NO_DIGIT:
      return "Au moins un chiffre.";
    case PASSWORD_ERROR_CODES.NO_SYMBOL:
      return "Au moins un caractère spécial (par ex. ! @ # $).";
    case PASSWORD_ERROR_CODES.TOO_COMMON:
      return "Mot de passe trop courant, choisis-en un moins évident.";
    default:
      return "Mot de passe non conforme.";
  }
}

/**
 * Calcule la date d'expiration d'un mot de passe provisoire en ISO 8601.
 * Pur, isomorphique. Mutualisé entre la route handler admin et les tests.
 *
 * Board Q1/B 2026-05-12 : exprimé en HEURES (était en jours).
 *
 * @param ttlHours — défaut côté caller `PROVISIONAL_PASSWORD_TTL_HOURS` (24 h).
 * @param now — injectable pour tests.
 */
export function computeProvisionalExpiresAt(ttlHours: number, now: Date = new Date()): string {
  const expires = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
  return expires.toISOString();
}

/**
 * Formate un nombre de secondes en `mm:ss` (zero-padded). Helper UI pour le
 * countdown rate-limit login (Board Q4/A 2026-05-12).
 *
 * Valeurs négatives écrêtées à 0. Valeurs >= 1h restent affichées en minutes
 * (`123:45`) — le cas n'arrive pas en pratique (cooldown = 15 min) mais
 * l'extrapolation est plus lisible qu'une exception.
 */
export function formatCountdownMinSec(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
