/**
 * JWT RS256 architecte — page tokenisée `/archi/[token]` (module Tandem).
 *
 * Source de vérité :
 *  - `specs/module_tandem_engine_v1.md` §3.3, §3.4, §3.5
 *  - `DECISIONS.md` 2026-05-22 (b) — code audit A16 alloué
 *  - `handoff/NOTE_260524_ARCHITECT_JWT_KEYS.md` — paire RS256 dédiée
 *  - Décision Q5 Board (2026-05-24) : clé dédiée, `aud=architect`, exp 30j
 *
 * Format de clés (figé Nadia 2026-05-24, étape 2 Tandem) :
 *  - **base64 mono-ligne** (recommandé Vercel) — décodé au runtime via
 *    `Buffer.from(env, 'base64').toString('utf8')`. Pas de `\n` échappés.
 *  - PEM brut accepté en fallback (détection auto : commence par `-----BEGIN`).
 *
 * Claims :
 *  - `iss = 'edifio-sourcing'`
 *  - `aud = 'architect'` (vérifié au verify — évite la confusion avec
 *    d'éventuels JWT Supabase Auth)
 *  - `sub = architectId` (UUID)
 *  - `jti = crypto.randomUUID()` (unique — stocké en BDD pour révocation)
 *  - `tenderId`, `organizationId` (claims custom pour la page tokenisée)
 *  - `exp = now + 30d`, `iat = now`
 *
 * Révocation : un token est révoqué quand `architect_tokens.revoked = TRUE`
 * (admin) — verifyArchitectToken consulte la BDD si `dbCheck` est fourni.
 * La signature + l'audience + l'expiration sont vérifiées avant tout
 * accès BDD (fail-fast sécurité — pas d'oracle de révocation accessible
 * via brute-force).
 *
 * Implémentation : `node:crypto` natif (Node 22+). Pas de dépendance ajoutée.
 * Si on bascule en Edge runtime plus tard, switcher à `jose` (Web Crypto).
 */

import crypto from "node:crypto";

const ALGO = "RS256" as const;
const ISSUER = "edifio-sourcing" as const;
const AUDIENCE = "architect" as const;
const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 jours

/** Payload signé dans le JWT architecte. */
export interface ArchitectTokenPayload {
  /** UUID architecte (claim `sub`). */
  architectId: string;
  /** UUID AO. */
  tenderId: string;
  /** UUID organisation (multi-tenant — assert côté verify). */
  organizationId: string;
}

/** Payload décodé + claims standards. */
export interface DecodedArchitectToken extends ArchitectTokenPayload {
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

/** Erreur typée pour le routing UI (page tokenisée). */
export type VerifyTokenError =
  | "invalid_signature"
  | "invalid_audience"
  | "invalid_issuer"
  | "expired"
  | "malformed"
  | "revoked"
  | "unknown_jti";

export type VerifyResult =
  | { ok: true; payload: DecodedArchitectToken }
  | { ok: false; error: VerifyTokenError };

/* -------------------------------------------------------------------------- */
/*  Helpers — encodage base64url + chargement clés                            */
/* -------------------------------------------------------------------------- */

/**
 * Encodage base64url (RFC 7515) — variante base64 sans padding `=` ni `+`/`/`.
 * Node 16+ supporte `Buffer.toString('base64url')` nativement.
 */
function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function fromBase64Url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

/**
 * Décode une clé d'env. Détection auto :
 *  - commence par `-----BEGIN` → PEM brut (peut contenir `\n` littéraux qu'on
 *    convertit en vraies newlines).
 *  - sinon → base64 mono-ligne, on décode en UTF-8 (le résultat est un PEM).
 *
 * Cette tolérance évite la friction ops (Vercel UI vs `.env.local` vs CI).
 */
export function decodeKeyFromEnv(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("-----BEGIN")) {
    // PEM brut — convertir les éventuels `\n` littéraux en newlines réelles.
    return trimmed.replace(/\\n/g, "\n");
  }
  // base64 mono-ligne → décodage en UTF-8 (le résultat est un PEM standard).
  return Buffer.from(trimmed, "base64").toString("utf8");
}

interface ArchitectKeys {
  privateKey: string;
  publicKey: string;
}

let cachedKeys: ArchitectKeys | null = null;

/**
 * Charge les clés depuis les vars d'env. Cache mémoire pour éviter le décodage
 * répété (la décode est pure mais on évite l'overhead sur chaque sign/verify).
 *
 * Throw `Error` explicite si les vars manquent — fail-fast au boot du module.
 * En production, le throw remonte côté Server Component (catché + ErrorBanner
 * selon la mémoire `feedback_nextjs_runtime_page_resilience`).
 */
export function loadArchitectKeys(): ArchitectKeys {
  if (cachedKeys) return cachedKeys;
  const privateRaw = process.env.ARCHITECT_JWT_PRIVATE_KEY;
  const publicRaw = process.env.ARCHITECT_JWT_PUBLIC_KEY;
  if (!privateRaw || !publicRaw) {
    throw new Error(
      "ARCHITECT_JWT_PRIVATE_KEY / ARCHITECT_JWT_PUBLIC_KEY non définis. " +
        "Voir handoff/NOTE_260524_ARCHITECT_JWT_KEYS.md.",
    );
  }
  cachedKeys = {
    privateKey: decodeKeyFromEnv(privateRaw),
    publicKey: decodeKeyFromEnv(publicRaw),
  };
  return cachedKeys;
}

/** Reset cache — usage tests uniquement. */
export function __resetKeyCache(): void {
  cachedKeys = null;
}

/* -------------------------------------------------------------------------- */
/*  Sign / Verify                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Signe un JWT architecte RS256. Retourne `{ token, jti, expiresAt }` — le
 * `jti` est généré ici (UUID v4) et doit être persisté en BDD côté caller
 * (`architect_tokens.jwtId`) pour révocation.
 *
 * @param payload — claims custom (architectId, tenderId, organizationId)
 * @param ttlSeconds — durée de vie en secondes (défaut 30 j)
 */
export function signArchitectToken(
  payload: ArchitectTokenPayload,
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
    tenderId: payload.tenderId,
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
 * Vérifie un JWT architecte. Ordre des contrôles (fail-fast) :
 *  1. format (3 segments)
 *  2. header `alg=RS256`
 *  3. signature
 *  4. issuer + audience
 *  5. expiration
 *  6. (optionnel) révocation en BDD via `dbCheck(jti)` — caller responsable
 *     de la requête BDD (ce module reste pur, pas de couplage Drizzle).
 *
 * Pas de leak d'info entre `invalid_signature` et `revoked` — un attaquant
 * sans la clé privée ne peut pas atteindre la couche BDD.
 */
export async function verifyArchitectToken(
  token: string,
  dbCheck?: (jti: string) => Promise<"valid" | "revoked" | "unknown">,
): Promise<VerifyResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "malformed" };
  const headerB64 = parts[0]!;
  const payloadB64 = parts[1]!;
  const signatureB64 = parts[2]!;

  // 1. Header
  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(fromBase64Url(headerB64).toString("utf8"));
  } catch {
    return { ok: false, error: "malformed" };
  }
  if (header.alg !== ALGO) return { ok: false, error: "invalid_signature" };

  // 2. Signature
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

  // 3. Payload
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(fromBase64Url(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, error: "malformed" };
  }
  if (body.iss !== ISSUER) return { ok: false, error: "invalid_issuer" };
  if (body.aud !== AUDIENCE) return { ok: false, error: "invalid_audience" };

  // 4. Expiration
  const now = Math.floor(Date.now() / 1000);
  if (typeof body.exp !== "number" || body.exp < now) {
    return { ok: false, error: "expired" };
  }

  // 5. Champs custom
  const { sub, jti, tenderId, organizationId, iat, exp } = body as {
    sub?: string;
    jti?: string;
    tenderId?: string;
    organizationId?: string;
    iat?: number;
    exp: number;
  };
  if (
    typeof sub !== "string" ||
    typeof jti !== "string" ||
    typeof tenderId !== "string" ||
    typeof organizationId !== "string" ||
    typeof iat !== "number"
  ) {
    return { ok: false, error: "malformed" };
  }

  // 6. Révocation BDD (optionnel — caller fournit la fonction)
  if (dbCheck) {
    const status = await dbCheck(jti);
    if (status === "revoked") return { ok: false, error: "revoked" };
    if (status === "unknown") return { ok: false, error: "unknown_jti" };
  }

  return {
    ok: true,
    payload: {
      architectId: sub,
      tenderId,
      organizationId,
      jti,
      iat,
      exp,
      iss: ISSUER,
      aud: AUDIENCE,
    },
  };
}
