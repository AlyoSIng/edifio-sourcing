/**
 * Constantes — politique de mot de passe et provisoires (auth password pivot
 * Board 2026-05-11, ajustements Board 2026-05-12 Q1/Q2/Q4).
 *
 * Politique : exigences strictes alignées sur les pratiques internes AlyoS
 * (parité UX avec edifio Suivi). Si Léa / IT veulent assouplir, modifier ici
 * sera la source unique.
 *
 * Décisions figées DECISIONS.md (Q1/B Q2/B Q3/A Q4/A) — toute modification
 * ultérieure passe par escalade Board.
 */

/**
 * Durée de vie (en HEURES) du mot de passe provisoire envoyé à un nouvel
 * utilisateur. Board Q1/B 2026-05-12 : 24 h (était 7 jours).
 *
 * Justification : un lien sensible ne doit pas dormir une semaine dans une
 * boîte mail. Si le collaborateur n'active pas son compte dans la journée, un
 * admin lui regénère un lien (bouton « Renvoyer » dans /sourcing/admin/users).
 */
export const PROVISIONAL_PASSWORD_TTL_HOURS = 24;

/** Longueur du mot de passe provisoire généré (caractères). */
export const PROVISIONAL_PASSWORD_LENGTH = 16;

/**
 * Règles de force du mot de passe choisi par l'utilisateur.
 * Board Q2/B 2026-05-12 : `MIN_LENGTH` passe à 16 (était 12).
 *
 * Justification : à exigences de classes inchangées, allonger est ce qui paie
 * le plus en entropie. 16 caractères encouragent les passphrases — qui sont
 * plus mémorisables qu'un mot de passe court complexe.
 */
export const MIN_LENGTH = 16;
export const REQUIRE_UPPERCASE = true;
export const REQUIRE_LOWERCASE = true;
export const REQUIRE_DIGIT = true;
export const REQUIRE_SYMBOL = true;

/**
 * Jeu de symboles autorisés pour la validation et la génération.
 * Volontairement restreint pour éviter les caractères ambigus (`'`, `"`, `` ` ``)
 * qui posent souvent problème en copier-coller depuis un email.
 */
export const SYMBOL_CHARSET = "!@#$%^&*()-_=+[]{};:,.<>?";

/** Code d'erreur stable utilisé entre Server Actions et UI. */
export const PASSWORD_ERROR_CODES = {
  TOO_SHORT: "too_short",
  NO_UPPERCASE: "no_uppercase",
  NO_LOWERCASE: "no_lowercase",
  NO_DIGIT: "no_digit",
  NO_SYMBOL: "no_symbol",
  /** Board Q2/B 2026-05-12 — top-N passwords les plus communs refusés. */
  TOO_COMMON: "too_common",
} as const;

export type PasswordErrorCode = (typeof PASSWORD_ERROR_CODES)[keyof typeof PASSWORD_ERROR_CODES];

/**
 * Rate-limit login — durée du blocage côté UI quand Supabase répond 429.
 * Board Q4/A 2026-05-12 : 5 tentatives échouées / 15 min → blocage 15 min.
 *
 * La config réelle (compteur de tentatives + fenêtre glissante) vit dans le
 * dashboard Supabase Auth. Côté code, on ne fait que **réagir** au 429 reçu :
 * on connait alors la durée d'attente côté UI.
 */
export const LOGIN_RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000;
