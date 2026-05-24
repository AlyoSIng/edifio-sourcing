/**
 * JWT RS256 d'opposition RGPD — page tokenisée `/archi/opposition/[token]`
 * (module Tandem, sous-étape 4).
 *
 * **Pourquoi un JWT séparé du JWT architecte ?** (sécurité brief 24/05)
 *
 *   Le token de réponse architecte (`aud=architect`) et le token d'opposition
 *   RGPD (`aud=opposition`) sont **deux capacités distinctes** :
 *     - le 1er permet de répondre OUI/NON à un AO précis pour 30 j ;
 *     - le 2nd permet de désactiver l'architecte pour 5 ans (single-use).
 *
 *   Si on partageait le même JWT, un attaquant qui chope le mail Brevo (ou
 *   le lien de réponse forwardé) pourrait aussi exercer le droit d'opposition
 *   et désactiver l'architecte — escalade non souhaitée. La séparation par
 *   audience (vérifiée strict côté verify) bloque ce vecteur : un JWT signé
 *   pour `aud=architect` est rejeté quand on vise la route opposition, et
 *   réciproquement.
 *
 *   On RÉUTILISE la même paire RS256 (`ARCHITECT_JWT_PRIVATE_KEY` /
 *   `ARCHITECT_JWT_PUBLIC_KEY`) — pas besoin d'une 3e paire, l'audience suffit
 *   à séparer les capacités tant que `aud` est vérifié strict (cf. attaques
 *   « confused deputy » documentées dans RFC 8725 §3.7).
 *
 * Stockage BDD : `architect_opposition_tokens.jti` (table posée étape 1). Le
 * `jti` est la clé unique : on retrouve la ligne BDD pour vérifier
 * `usedAt IS NULL` (single-use) et `expiresAt > now()`. Pas de colonne JWT
 * séparée — le JWT n'est jamais stocké, seul son `jti` l'est.
 *
 * Durée de vie : 5 ans (aligné rétention RGPD spec architects_data_and_admin_v1
 * §7). Configurable via `ttlSeconds` (utile pour tests).
 *
 * Source de vérité :
 *  - `specs/architects_data_and_admin_v1.md` §5 (RGPD dans l'app)
 *  - `specs/module_tandem_engine_v1.md` §3 (lien opposition dans chaque mail)
 *  - Brief Board 2026-05-24 : « token d'opposition doit être un JWT séparé »
 */

import crypto from "node:crypto";

import { decodeKeyFromEnv, loadArchitectKeys } from "./jwt";

const ALGO = "RS256" as const;
const ISSUER = "edifio-sourcing" as const;
const AUDIENCE = "opposition" as const;
const DEFAULT_TTL_SECONDS = 5 * 365 * 24 * 60 * 60; // 5 ans

/** Payload signé dans le JWT d'opposition. */
export interface OppositionTokenPayload {
  /** UUID architecte cible (claim `sub`). */
  architectId: string;
  /** UUID organisation (multi-tenant — assert côté verify). */
  organizationId: string;
}

/** Payload décodé + claims standards. */
export interface DecodedOppositionToken extends OppositionTokenPayload {
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

/** Erreurs typées (mêmes catégories que verifyArchitectToken). */
export type VerifyOppositionError =
  | "invalid_signature"
  | "invalid_audience"
  | "invalid_issuer"
  | "expired"
  | "malformed"
  | "revoked"
  | "already_used"
  | "unknown_jti";

export type VerifyOppositionResult =
  | { ok: true; payload: DecodedOppositionToken }
  | { ok: false; error: VerifyOppositionError };

/* -------------------------------------------------------------------------- */
/*  Helpers — re-export du décodage clé pour cohérence                        */
/* -------------------------------------------------------------------------- */

export { decodeKeyFromEnv };

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function fromBase64Url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

/* -------------------------------------------------------------------------- */
/*  Sign / Verify                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Signe un JWT d'opposition RS256. Retourne `{ token, jti, expiresAt }` — le
 * caller persiste `jti` + `expiresAt` dans `architect_opposition_tokens` AVANT
 * d'envoyer le mail Brevo (sinon un token signé non persisté ne pourrait être
 * vérifié côté `verifyOppositionToken`, qui exige le lookup BDD).
 *
 * @param payload — claims custom (architectId, organizationId)
 * @param ttlSeconds — durée de vie en secondes (défaut 5 ans)
 */
export function signOppositionToken(
  payload: OppositionTokenPayload,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): { token: string; jti: string; expiresAt: Date } {
  const { privateKey } = loadArchitectKeys();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;
  const jti = crypto.randomUUID();

  const header = { alg: ALGO, typ: "JWT" };
  const body = {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: payload.architectId,
    jti,
    iat: now,
    exp,
    organizationId: payload.organizationId,
  };

  const headerB64 = toBase64Url(JSON.stringify(header));
  const payloadB64 = toBase64Url(JSON.stringify(body));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey);
  const signatureB64 = signature.toString("base64url");

  return {
    token: `${signingInput}.${signatureB64}`,
    jti,
    expiresAt: new Date(exp * 1000),
  };
}

/**
 * Vérifie un JWT d'opposition. Ordre des contrôles (fail-fast) :
 *  1. format (3 segments)
 *  2. header `alg=RS256`
 *  3. signature
 *  4. issuer + audience (`aud=opposition` STRICT)
 *  5. expiration
 *  6. (optionnel) lookup BDD via `dbCheck(jti)` — caller responsable. Retourne
 *     l'état du token (`valid` | `already_used` | `revoked` | `unknown`). Pas
 *     de fuite d'info entre `invalid_signature` et `already_used` — un
 *     attaquant sans la clé privée ne peut pas atteindre la couche BDD.
 *
 * **Différence avec verifyArchitectToken** : `aud` strict `opposition`. Un
 * JWT signé avec `aud=architect` est rejeté ici (et inversement). C'est le
 * cœur de la défense en profondeur contre l'escalade de capacité.
 */
export async function verifyOppositionToken(
  token: string,
  dbCheck?: (jti: string) => Promise<"valid" | "already_used" | "revoked" | "unknown">,
): Promise<VerifyOppositionResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "malformed" };
  const headerB64 = parts[0]!;
  const payloadB64 = parts[1]!;
  const signatureB64 = parts[2]!;

  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(fromBase64Url(headerB64).toString("utf8"));
  } catch {
    return { ok: false, error: "malformed" };
  }
  if (header.alg !== ALGO) return { ok: false, error: "invalid_signature" };

  const { publicKey } = loadArchitectKeys();
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  let signatureValid = false;
  try {
    signatureValid = verifier.verify(publicKey, fromBase64Url(signatureB64));
  } catch {
    return { ok: false, error: "invalid_signature" };
  }
  if (!signatureValid) return { ok: false, error: "invalid_signature" };

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(fromBase64Url(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, error: "malformed" };
  }
  if (body.iss !== ISSUER) return { ok: false, error: "invalid_issuer" };
  if (body.aud !== AUDIENCE) return { ok: false, error: "invalid_audience" };

  const now = Math.floor(Date.now() / 1000);
  if (typeof body.exp !== "number" || body.exp < now) {
    return { ok: false, error: "expired" };
  }

  const { sub, jti, organizationId, iat, exp } = body as {
    sub?: string;
    jti?: string;
    organizationId?: string;
    iat?: number;
    exp: number;
  };
  if (
    typeof sub !== "string" ||
    typeof jti !== "string" ||
    typeof organizationId !== "string" ||
    typeof iat !== "number"
  ) {
    return { ok: false, error: "malformed" };
  }

  if (dbCheck) {
    const status = await dbCheck(jti);
    if (status === "already_used") return { ok: false, error: "already_used" };
    if (status === "revoked") return { ok: false, error: "revoked" };
    if (status === "unknown") return { ok: false, error: "unknown_jti" };
  }

  return {
    ok: true,
    payload: {
      architectId: sub,
      organizationId,
      jti,
      iat,
      exp,
      iss: ISSUER,
      aud: AUDIENCE,
    },
  };
}
