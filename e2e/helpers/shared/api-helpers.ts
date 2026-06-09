/**
 * Helpers shared — appels API et seed BDD pour les tests E2E.
 *
 * Pourquoi `shared/` ? Ces helpers sont conçus pour être réutilisés par :
 *   1. Les specs multi-org Sourcing (présent : Camille, branche P1).
 *   2. Les specs du monorepo `alyos-suivi-chantier` (Sébastien — migration
 *      bascule 18 juillet 2026). Convention « shared » → ne JAMAIS dépendre
 *      d'un module spécifique au répertoire Sourcing ; uniquement de
 *      Playwright + supabase-js + de la couche `fixtures/`.
 *
 * Garde-fous :
 *   - Aucune dépendance vers `@/db/*` ou `@/lib/auth/*` (Sébastien n'aura pas
 *     ces alias dans le monorepo). On utilise UNIQUEMENT supabase-js + l'API
 *     `service_role` exposée via `getAdminClient` de la fixture multi-org.
 *   - Les helpers refusent de tourner si `E2E_TEST_ROUTES_ENABLED=1` n'est
 *     pas posé (anti-prod, alignement multi-org-seed).
 *   - Les seeds renvoient les IDs créés pour que le caller puisse asserter et
 *     nettoyer (idempotence ON CONFLICT DO NOTHING).
 */

import type { Page, APIRequestContext } from "@playwright/test";

import { getAdminClient, MULTI_ORG_IDS } from "../../fixtures/multi-org-seed";

// ─── Types publics ───────────────────────────────────────────────────────────

/**
 * Profil minimal d'un tender de test. Tous les champs sont optionnels — la
 * fonction `seedTender` pose des valeurs par défaut raisonnables (status
 * `sourced`, BOAMP, title et external_ref générés depuis l'UUID).
 */
export interface TenderProfile {
  /** UUID explicite. Par défaut généré via `crypto.randomUUID()`. */
  id?: string;
  title?: string;
  buyer?: string;
  externalRef?: string;
  /** Status SQL CHECK constraint — `sourced`, `selected_solo`, etc. */
  status?: string;
  matchingProfileId?: string;
}

/**
 * Profil minimal d'un partage cotraitant de test.
 */
export interface CotraitantShareProfile {
  /** UUID explicite (sinon généré). */
  id?: string;
  /** UUID du tender parent. Par défaut on prend le 1er tender de l'org. */
  tenderId?: string;
  /** UUID du créateur (auth.users.id). Par défaut admin de l'org. */
  createdBy?: string;
  contactName?: string;
  contactEmail?: string;
  /**
   * Durée de vie en jours par rapport à `now()`. Par défaut +30 jours.
   * Mettre une valeur négative pour créer un share déjà expiré (utile pour
   * S12 — Camille).
   */
  expiresInDays?: number;
  /** Si fourni, pose `revoked_at = now()`. */
  revoked?: boolean;
}

// ─── Anti-prod safety ────────────────────────────────────────────────────────

function assertE2EEnv(): void {
  if (process.env.E2E_TEST_ROUTES_ENABLED !== "1") {
    throw new Error(
      "shared/api-helpers : E2E_TEST_ROUTES_ENABLED=1 requis pour les seeds BDD. " +
        "Aligné multi-org-seed.ts — anti-prod safety.",
    );
  }
}

// ─── callServerAction ────────────────────────────────────────────────────────

/**
 * Helper pour invoquer une Server Action depuis un test E2E.
 *
 * Une Server Action Next.js est exposée comme un POST sur la route qui la
 * définit (`/sourcing/.../actions`). Playwright peut l'appeler via
 * `request.post()`. Ce helper unifie le pattern (Content-Type, parsing JSON
 * tolérant, propagation des cookies de session).
 *
 * **Limitation** : Next.js encode les Server Actions en multipart spécifique
 * (header `Next-Action`). Pour la plupart des cas de test où on veut juste
 * vérifier l'auth/RBAC, on peut taper la route POST directe : si l'auth est
 * KO on reçoit déjà 401/403 avant que Next ne parse l'action ID. Si on veut
 * exercer l'action métier, il vaut mieux passer par le browser
 * (`page.evaluate` qui rejoue la closure) — ce helper retourne donc la
 * réponse brute, le caller décide quoi en faire.
 *
 * @param requestCtx contexte Playwright (`page.request` ou `context.request`)
 * @param path chemin route POST
 * @param payload corps JSON (sera sérialisé)
 * @param cookieHeader optionnel — string « name=value; name=value » si appel
 *   sans page (typique S5 helper getCookieFor)
 */
export async function callServerAction<T = unknown>(
  requestCtx: APIRequestContext,
  path: string,
  payload: Record<string, unknown>,
  cookieHeader?: string,
): Promise<{ status: number; body: T | null; rawText: string }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (cookieHeader) {
    headers["cookie"] = cookieHeader;
  }
  const res = await requestCtx.post(path, {
    data: payload,
    headers,
  });
  const rawText = await res.text().catch(() => "");
  let body: T | null = null;
  try {
    body = rawText ? (JSON.parse(rawText) as T) : null;
  } catch {
    body = null;
  }
  return { status: res.status(), body, rawText };
}

// ─── seedTender ──────────────────────────────────────────────────────────────

/**
 * Insère un tender dans l'organisation cible via le client service_role
 * (BYPASSRLS). Idempotent par `id` UUID.
 *
 * Renvoie l'UUID du tender inséré pour qu'on puisse le réutiliser dans les
 * specs (cleanup, lecture, etc.).
 *
 * @throws si la fixture multi-org n'a pas seedé le platform `boamp`. Le
 *   caller doit appeler `seedMultiOrgFixtures()` en amont.
 */
export async function seedTender(orgId: string, profile?: TenderProfile): Promise<string> {
  assertE2EEnv();
  const admin = getAdminClient();

  // Récupère un platform_id BOAMP — aligné multi-org-seed.ts.
  const { data: platformRow, error: platformErr } = await admin
    .from("platforms")
    .select("id")
    .eq("code", "boamp")
    .limit(1)
    .single();
  if (platformErr || !platformRow) {
    throw new Error(
      `seedTender(${orgId}) : platform 'boamp' introuvable. ` +
        `Appelez seedMultiOrgFixtures() avant. (err=${platformErr?.message})`,
    );
  }

  const id = profile?.id ?? crypto.randomUUID();
  const externalRef = profile?.externalRef ?? `SHARED-SEED-${id.slice(0, 8)}`;
  const title = profile?.title ?? `Seed tender ${id.slice(0, 8)}`;
  const buyer = profile?.buyer ?? "Acheteur seed";
  const status = profile?.status ?? "sourced";

  const { error } = await admin.from("tenders").upsert(
    {
      id,
      organization_id: orgId,
      external_ref: externalRef,
      platform_id: platformRow.id,
      title,
      buyer,
      status,
      matching_profile_id: profile?.matchingProfileId ?? null,
    },
    { onConflict: "id" },
  );
  if (error) {
    throw new Error(`seedTender(${orgId}, ${id}) : ${error.message}`);
  }
  return id;
}

// ─── seedCotraitantShare ─────────────────────────────────────────────────────

/**
 * Insère un partage cotraitant pour l'organisation cible. Utile pour les
 * specs S12 (token expiré) et S13 (flow Tandem V2 complet).
 *
 * - Si `tenderId` n'est pas fourni : prend le 1er tender de l'org (et en
 *   crée un si la table est vide).
 * - Si `createdBy` n'est pas fourni : prend l'admin AlyoS (UUID résolu via
 *   listUsers — Sourcing seul). Pour les autres orgs, fournir explicitement.
 * - `expiresInDays < 0` → share déjà expiré (S12).
 * - `revoked = true` → `revoked_at = now()`.
 *
 * Retourne `{ id, token }` — le token est l'UUID utilisé dans l'URL publique
 * `/cotraitant/[token]`.
 */
export async function seedCotraitantShare(
  orgId: string,
  profile?: CotraitantShareProfile,
): Promise<{ id: string; token: string }> {
  assertE2EEnv();
  const admin = getAdminClient();

  // Résoudre tenderId (1er tender de l'org sinon seed à la volée).
  let tenderId = profile?.tenderId;
  if (!tenderId) {
    const { data: existing } = await admin
      .from("tenders")
      .select("id")
      .eq("organization_id", orgId)
      .limit(1)
      .maybeSingle();
    tenderId = existing?.id ?? (await seedTender(orgId));
  }

  // Résoudre createdBy (par défaut : admin de l'org AlyoS si on est sur
  // ALYOS, sinon caller doit fournir).
  let createdBy = profile?.createdBy;
  if (!createdBy) {
    if (orgId !== MULTI_ORG_IDS.ALYOS) {
      throw new Error(
        `seedCotraitantShare : 'createdBy' est requis pour les orgs autres qu'ALYOS ` +
          `(reçu orgId=${orgId}). Sinon on ne peut pas garantir une FK valide.`,
      );
    }
    const { data: page1 } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const alyosAdmin = (page1?.users ?? []).find((u) =>
      (u.email ?? "").startsWith("e2e-test+multiorg-alyos-admin@"),
    );
    if (!alyosAdmin) {
      throw new Error(
        "seedCotraitantShare : admin AlyoS de la fixture multi-org introuvable. " +
          "Appelez seedMultiOrgFixtures() avant.",
      );
    }
    createdBy = alyosAdmin.id;
  }

  // Compute expires_at — par défaut +30 jours, override par expiresInDays.
  const expiresInDays = profile?.expiresInDays ?? 30;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 3600 * 1000).toISOString();
  const revokedAt = profile?.revoked ? new Date().toISOString() : null;

  const id = profile?.id ?? crypto.randomUUID();
  const token = crypto.randomUUID();

  const { error } = await admin.from("cotraitant_shares").insert({
    id,
    tender_id: tenderId,
    organization_id: orgId,
    contact_name: profile?.contactName ?? "Cotraitant Seed",
    contact_email: profile?.contactEmail ?? `cotraitant+${id.slice(0, 8)}@example.com`,
    token,
    expires_at: expiresAt,
    revoked_at: revokedAt,
    created_by: createdBy,
  });
  if (error) {
    throw new Error(`seedCotraitantShare(${orgId}) : ${error.message}`);
  }
  return { id, token };
}

// ─── Cleanup helpers ─────────────────────────────────────────────────────────

/**
 * Supprime un share par id (cascade FK → cotraitant_share_items aussi).
 * Best-effort.
 */
export async function deleteCotraitantShare(id: string): Promise<void> {
  assertE2EEnv();
  const admin = getAdminClient();
  await admin.from("cotraitant_shares").delete().eq("id", id);
}

/**
 * Re-export pratique pour les specs.
 */
export { getAdminClient } from "../../fixtures/multi-org-seed";

/**
 * Helper trivial pour récupérer la session courante d'une `Page` sous forme
 * de cookie string (utilisé quand on veut appeler une route API depuis un
 * contexte browser sans tout réinjecter manuellement).
 */
export async function extractCookieHeader(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}
