/**
 * Parser pur — extrait les paramètres d'erreur d'un fragment URL Supabase.
 *
 * Format Supabase quand le flow recovery / magic-link échoue côté serveur
 * (token consommé par un scanner email, lien expiré, accès refusé, etc.) :
 *
 *   /#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
 *
 * Le fragment ne traverse pas la requête HTTP → impossible à lire côté
 * Server Component. Ce helper est utilisé par les Client Components
 * `HashErrorHandler` (home `/`) et `ClientCallbackHandler` (`/auth/callback`)
 * qui interceptent le fragment côté browser et redirigent vers `/auth/error`.
 *
 * Priorité de lecture : `error_code` (plus précis) > `error` (fallback).
 *
 * Cf. ADR-011 (specs/adr_011_reset_password_scanner.md).
 */

export interface HashError {
  /** Code stable de l'erreur — `otp_expired`, `access_denied`, `server_error`, etc. */
  code: string;
  /** Description en clair fournie par Supabase. Peut être vide. */
  description: string;
}

/**
 * Parse un fragment d'URL (sans le `#` initial) et renvoie l'erreur Supabase
 * s'il y en a une. Retourne `null` si le fragment n'est pas une erreur (par
 * ex. fragment `access_token=...` d'un implicit flow réussi).
 */
export function parseHashError(hash: string): HashError | null {
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const errorCode = params.get("error_code");
  const errorGeneric = params.get("error");
  const description = params.get("error_description");

  const code = errorCode ?? errorGeneric;
  if (!code) return null;

  return {
    code,
    description: description ?? "",
  };
}
