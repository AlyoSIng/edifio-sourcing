/**
 * Vérification HMAC SHA-256 des webhooks Brevo.
 *
 * Source de vérité :
 *  - `specs/module_tandem_engine_v1.md` §3.6
 *  - Brief Board 2026-05-24 (sous-étape 4 — HMAC obligatoire, timing-safe)
 *  - `.env.example` lignes 70-73 (`BREVO_WEBHOOK_SECRET`)
 *
 * **Algorithme** : HMAC-SHA-256 (choix Nadia étape 2 sous-3 — documenté dans
 * le plan §Zone de risque flaggée). Le secret est `BREVO_WEBHOOK_SECRET`,
 * posé côté Brevo Account → Settings → Webhooks → Signature secret.
 *
 * **Header attendu** : `x-brevo-signature` (hex-encoded HMAC du body brut).
 *
 *   Brevo ne documente PAS publiquement un header standardisé (au 2026-05-24).
 *   On reste tolérant : on accepte aussi `x-mailin-signature` (header
 *   historique de l'API Sendinblue, parfois renvoyé en plus). Si Brevo
 *   impose un autre nom au moment de la mise en service réelle, on ajuste.
 *
 * **Sécurité critique** :
 *  - `crypto.timingSafeEqual` OBLIGATOIRE (brief 24/05) — pas de `===` qui
 *    fuiterait l'index du 1er byte différent via timing attack.
 *  - Le body est lu EN BRUT (string, pas re-stringifié) — toute reformatage
 *    JSON casserait la signature. Cf. JSDoc `parseAndVerifyBrevoWebhook`.
 *  - Si `BREVO_WEBHOOK_SECRET` est absent en env, le verify renvoie `false`
 *    fail-closed (PAS de bypass dev pour ne pas tromper en prod par erreur).
 */

import crypto from "node:crypto";

const SUPPORTED_HEADERS = ["x-brevo-signature", "x-mailin-signature", "x-webhook-signature"];

/** Lit la signature dans n'importe lequel des headers supportés. */
export function readBrevoSignatureHeader(headers: Headers): string | null {
  for (const name of SUPPORTED_HEADERS) {
    const value = headers.get(name);
    if (value) return value.trim();
  }
  return null;
}

/**
 * Vérifie qu'une signature HMAC SHA-256 hex correspond au body brut + secret.
 * Timing-safe via `crypto.timingSafeEqual`.
 *
 * @param body — body HTTP brut (string — pas re-parsé)
 * @param signature — header `x-brevo-signature` (hex-encoded HMAC)
 * @param secret — secret HMAC partagé avec Brevo
 * @returns `true` si la signature est valide, `false` sinon (timing-safe)
 */
export function verifyBrevoHmac(body: string, signature: string, secret: string): boolean {
  if (!body || !signature || !secret) return false;

  const computed = crypto.createHmac("sha256", secret).update(body).digest("hex");

  // `timingSafeEqual` exige des buffers de même longueur — on convertit
  // d'abord en bytes hex. Si la signature reçue n'a pas la longueur d'un
  // SHA-256 hex (64 chars), on rejette d'emblée pour éviter une exception
  // levée par `timingSafeEqual` (qui leak via le throw vs ok=false).
  if (signature.length !== computed.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(computed, "utf8"), Buffer.from(signature, "utf8"));
  } catch {
    return false;
  }
}

/** Lit `BREVO_WEBHOOK_SECRET` — null si absent (fail-closed). */
export function loadBrevoWebhookSecret(): string | null {
  const raw = process.env.BREVO_WEBHOOK_SECRET;
  if (!raw || !raw.trim()) return null;
  return raw.trim();
}

/**
 * Forme d'un événement webhook Brevo. Sur-ensemble — Brevo envoie selon
 * l'event un nombre variable de champs. On reste permissif.
 *
 * Sources : https://developers.brevo.com/docs/transactional-webhooks
 */
export interface BrevoWebhookEvent {
  event: string; // 'delivered' | 'opened' | 'click' | 'soft_bounce' | 'hard_bounce' | 'spam' | 'unsubscribed' | ...
  "message-id"?: string;
  email?: string;
  date?: string; // ISO 8601
  ts?: number; // timestamp Unix (fallback)
  reason?: string;
  link?: string;
  // Header custom envoyé à l'appel POST initial — utilisé pour join tender+archi
  // si `message-id` est perdu (Brevo le retourne dans le payload).
  "X-Mailin-custom"?: string;
  [key: string]: unknown;
}

/**
 * Liste des events qu'on persiste dans `brevo_messages.events` (JSONB).
 * Les autres sont ignorés (best-effort idempotent — Brevo retry parfois).
 */
export const TRACKED_EVENTS = new Set([
  "delivered",
  "opened",
  "click",
  "clicked",
  "soft_bounce",
  "hard_bounce",
  "bounce",
  "spam",
  "unsubscribed",
  "blocked",
  "error",
  "deferred",
] as const);

export type TrackedEventName = typeof TRACKED_EVENTS extends Set<infer T> ? T : never;

/** Filtre les events trackés (case-insensitive). */
export function isTrackedEvent(eventName: string | undefined | null): boolean {
  if (!eventName) return false;
  return (TRACKED_EVENTS as Set<string>).has(eventName.toLowerCase());
}
