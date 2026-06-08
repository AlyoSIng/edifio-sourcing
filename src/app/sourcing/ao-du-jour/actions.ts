"use server";

/**
 * Server Actions — actions métier sur la `TenderCard` (PR n°5).
 *
 * Source de vérité :
 *  - `specs/audit_log_v1.md` §A4 / §A14 / §A15
 *  - `design/copy/onboarding_and_push_v1.md` lignes 68-70 (libellés boutons)
 *  - `design/maquettes/maquettes_v1.html` Maquette 3 (modale Solo/Tandem)
 *  - Arbitrages Board 2026-05-21 (A/B/C — cf. migration 0004)
 *
 * Périmètre :
 *  - `selectTenderAction`  : `sourced` → `selected_solo | selected_tandem` (A4)
 *  - `deferTenderAction`   : pose `deferred_until = now() + N hours` (A14)
 *  - `rejectTenderAction`  : `sourced` → `dropped` + reason optionnel (A15)
 *
 * Contrat commun :
 *  1. Auth check via `createSupabaseServerClient().auth.getUser()`
 *  2. Validation domaine `@alyosingenierie.fr` (defense in depth — le
 *     middleware filtre déjà, mais on re-vérifie côté server action)
 *  3. Validation input (UUID, mode enum, hours_offset positif, reason ≤ 280)
 *  4. **Transaction Drizzle** : SELECT FOR UPDATE → UPDATE tenders →
 *     INSERT tender_events
 *  5. **Hors transaction (post-commit)** : `audit()` non-bloquant (le helper
 *     est best-effort par contrat — cf. `src/lib/audit/index.ts`)
 *  6. `revalidatePath("/sourcing/ao-du-jour")` pour rafraîchir le RSC cache
 *  7. Return `{ ok: true } | { ok: false, error: <code> }`
 *
 * Codes erreur retournés (mappés UI dans `TenderCardActions`) :
 *  - `not_authenticated` : pas de session Supabase
 *  - `forbidden_domain`  : email hors `@alyosingenierie.fr`
 *  - `invalid_input`     : payload invalide (UUID mal formé, mode HS, etc.)
 *  - `tender_not_found`  : tender introuvable OU n'appartient pas à l'org
 *  - `invalid_state`     : tender pas en `sourced` (déjà traité)
 *  - `internal_error`    : erreur inattendue (BDD, etc.) — log structuré
 */

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";

import { db as defaultDb } from "@/db/client";
import { tenderBriefs } from "@/db/schema/ai";
import { learningEvents } from "@/db/schema/audit";
import { tenderEvents, tenders } from "@/db/schema/tenders";
import { audit } from "@/lib/audit";
import { generateBrief } from "@/lib/ai/generate-brief";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import {
  DEFAULT_REJECTION_REASON_CODE,
  isRejectionReasonCode,
  type RejectionReasonCode,
} from "@/lib/sourcing/learning/rejection-reasons";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ============================================================================
// Types publics
// ============================================================================

/** Type minimal du client Drizzle (mock-friendly côté tests). */
export type DrizzleClient = typeof defaultDb;

/**
 * Type minimal du client Supabase server (auth uniquement). Mock-friendly :
 * les tests injectent un faux client qui retourne le user voulu.
 */
export interface AuthClientLike {
  auth: {
    getUser: () => Promise<{ data: { user: import("@supabase/supabase-js").User | null } }>;
  };
}

/** Type minimal du helper audit pour injection en tests (best-effort, void). */
export type AuditFn = typeof audit;

/** Résultat unifié des 3 actions. */
export type ActionResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "not_authenticated"
        | "forbidden_domain"
        | "invalid_input"
        | "tender_not_found"
        | "invalid_state"
        | "internal_error";
    };

/** Dépendances injectables pour les tests (DI minimale, défauts en prod). */
interface ActionDeps {
  db?: DrizzleClient;
  authClient?: AuthClientLike;
  auditFn?: AuditFn;
}

// ============================================================================
// Helpers internes
// ============================================================================

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Whitelist stricte des `hoursOffset` autorisés par `deferTenderAction`.
 *
 * Source de vérité Board (2026-05-24, Addendum spec §Exigence 1) : la
 * décision « +1 / +3 / +7 j stricte » → seules ces 3 valeurs sont acceptées
 * côté server action. Le client UI déclare les mêmes valeurs dans
 * `TenderCardActions.tsx::DEFER_SHORTCUTS` ; on re-valide ici en
 * défense-en-profondeur (un utilisateur authentifié pourrait, via DevTools,
 * appeler `deferTenderAction(uuid, 87600)` et différer un AO de 10 ans →
 * bypass du filtre liste).
 *
 * Si la spec V1.x ouvre un "date picker custom", remplacer cette whitelist
 * par un bornage `0 < hoursOffset <= 720` (30 jours max).
 *
 * Cf. revue Hugo PR #39 → MEDIUM-1
 * (`notes-de-suivi/CC_260524_1657_HUGO_PR39_REVIEW.md`).
 */
const ALLOWED_HOURS_OFFSETS = [24, 72, 168] as const;
type AllowedHoursOffset = (typeof ALLOWED_HOURS_OFFSETS)[number];

function isAllowedHoursOffset(value: unknown): value is AllowedHoursOffset {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (ALLOWED_HOURS_OFFSETS as readonly number[]).includes(value)
  );
}

/**
 * Étape commune : auth + domaine. Retourne le profil utilisateur OU un
 * `ActionResult` d'échec à propager tel quel.
 *
 * Résout également l'orgId via `getRequiredOrgId` (lookup memberships —
 * Phase A multi-tenant, fallback ALYOS_ORG_ID pour retro-compat).
 */
async function requireAlyosUser(
  authClient: AuthClientLike,
): Promise<{ ok: true; userId: string; orgId: string } | Exclude<ActionResult, { ok: true }>> {
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) return { ok: false, error: "forbidden_domain" };

  const orgId = await getRequiredOrgId(user.id);
  return { ok: true, userId: user.id, orgId };
}

/**
 * Snapshot d'un tender utile aux actions : on lit `score`, `status`,
 * `external_ref` pour valider l'état et alimenter l'audit log.
 *
 * Le SELECT FOR UPDATE garantit qu'un double-clic optimiste UI ne génère
 * pas deux mutations concurrentes. RLS n'est PAS notre ligne de défense
 * ici (cf. JSDoc `src/lib/constants/organization.ts`) — c'est le filtre
 * `organization_id = ALYOS_ORG_ID` qui assure le multi-tenant côté app.
 */
interface TenderSnapshot {
  status: string;
  score: string | null;
  externalRef: string;
  /**
   * Champs snapshot pour le payload `learning_events` (Salve U — apprentissage
   * par écartement). Capturés au moment du rejet pour agréger les suggestions
   * d'ajustement de profil sans re-fetch des tenders.
   */
  buyer: string;
  cpv: string[];
  department: string | null;
  amount: string | null;
}

/**
 * Type structural minimal partagé entre `DrizzleClient` (db) et le `tx` interne
 * d'une transaction Drizzle. Le `tx` Drizzle (`PgTransaction`) n'a pas la même
 * shape complète que `PostgresJsDatabase` (manque `$client`) — d'où ce type
 * structural pour pouvoir réutiliser le helper `lockAndFetchTender` dans les
 * deux contextes sans `as` ni `any`.
 *
 * On expose ce qu'on consomme : `.select(...)`.
 */
type TxLike = {
  select: DrizzleClient["select"];
};

async function lockAndFetchTender(
  tx: TxLike,
  tenderId: string,
  organizationId: string,
): Promise<TenderSnapshot | null> {
  const rows = await tx
    .select({
      status: tenders.status,
      score: tenders.score,
      externalRef: tenders.externalRef,
      buyer: tenders.buyer,
      cpv: tenders.cpv,
      department: tenders.department,
      amount: tenders.amount,
    })
    .from(tenders)
    .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, organizationId)))
    .for("update")
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Convertit le score Postgres (`numeric` → string) en entier 0-100 pour
 * l'audit payload (A4/A15). `null` préservé si pas de score.
 */
function snapshotScore(rawScore: string | null): number | null {
  if (rawScore === null) return null;
  const parsed = Number(rawScore);
  if (Number.isNaN(parsed)) return null;
  const rounded = Math.round(parsed);
  return Math.max(0, Math.min(100, rounded));
}

// ============================================================================
// 1. selectTenderAction — A4 tender_select
// ============================================================================

/**
 * Sélectionne un AO en mode Solo ou Tandem. L'AO passe en
 * `selected_solo` ou `selected_tandem`. Si l'AO était différé, le différé
 * est levé (deferred_until = NULL) puisque l'utilisateur a clairement
 * statué.
 */
export async function selectTenderAction(
  tenderId: string,
  mode: "solo" | "tandem" | "conception_realisation",
  deps: ActionDeps = {},
): Promise<ActionResult> {
  const dbInstance = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? createSupabaseServerClient();
  const auditFn = deps.auditFn ?? audit;

  // 1. Auth + domaine
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  const { userId, orgId } = authResult;

  // 2. Validation input
  if (!UUID_SHAPE.test(tenderId)) return { ok: false, error: "invalid_input" };
  if (mode !== "solo" && mode !== "tandem" && mode !== "conception_realisation")
    return { ok: false, error: "invalid_input" };

  // 3. Transaction métier
  let snapshot: TenderSnapshot | null = null;
  try {
    snapshot = await dbInstance.transaction(async (tx) => {
      const snap = await lockAndFetchTender(tx, tenderId, orgId);
      if (!snap) throw new BusinessError("tender_not_found");
      if (snap.status !== "sourced") throw new BusinessError("invalid_state");

      // conception_realisation utilise selected_tandem (pas de statut DB dédié en V1 MVP).
      const newStatus = mode === "solo" ? "selected_solo" : "selected_tandem";
      await tx
        .update(tenders)
        .set({
          status: newStatus,
          // Sélectionner lève un éventuel différé : on remet à NULL.
          deferredUntil: null,
          updatedAt: sql`now()`,
        })
        .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, orgId)));

      await tx.insert(tenderEvents).values({
        tenderId,
        organizationId: orgId,
        eventType: "selected",
        actorId: userId,
        data: {
          to_status: newStatus,
          external_ref: snap.externalRef,
          score: snapshotScore(snap.score) ?? undefined,
          extra: { mode },
        },
      });

      return snap;
    });
  } catch (err) {
    if (err instanceof BusinessError) return { ok: false, error: err.code };
    console.error("[tender-actions:select:fail]", err);
    return { ok: false, error: "internal_error" };
  }

  // 4. Audit non-bloquant (post-commit)
  await auditFn({
    action: "tender_select",
    subjectType: "tender",
    subjectId: tenderId,
    data: {
      tender_id: tenderId,
      tender_ref: snapshot.externalRef,
      mode,
      score: snapshotScore(snapshot.score) ?? 0,
    },
  });

  // 5. Revalidate RSC cache
  revalidatePath("/sourcing/ao-du-jour");

  return { ok: true };
}

// ============================================================================
// 2. deferTenderAction — A14 tender_defer
// ============================================================================

/**
 * Différe un AO de `hoursOffset` heures (V1 : 24 / 72 / 168 — décision Board
 * 2026-05-24 « +1 / +3 / +7 j stricte »). Le statut tender reste `sourced`.
 * `getTendersOfTheDay` filtrera `(deferred_until IS NULL OR deferred_until <
 * now())` pour exclure l'AO de la vue jusqu'à expiration.
 *
 * Whitelist stricte côté serveur (cf. `ALLOWED_HOURS_OFFSETS`) : toute valeur
 * hors `{24, 72, 168}` retourne `invalid_input` sans aucune mutation BDD ni
 * insertion d'audit log. Défense-en-profondeur contre un client malicieux
 * qui forgeait `hoursOffset = 87600` (10 ans) pour bypass du filtre liste.
 *
 * Cas d'usage particulier : appliquer un nouveau différé (24 / 72 / 168 h)
 * sur un tender déjà différé est autorisé (on étend la durée).
 */
export async function deferTenderAction(
  tenderId: string,
  hoursOffset: number,
  deps: ActionDeps = {},
): Promise<ActionResult> {
  const dbInstance = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? createSupabaseServerClient();
  const auditFn = deps.auditFn ?? audit;

  // 1. Auth + domaine
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  const { userId, orgId } = authResult;

  // 2. Validation input
  if (!UUID_SHAPE.test(tenderId)) return { ok: false, error: "invalid_input" };
  // Whitelist stricte `{24, 72, 168}` — décision Board 2026-05-24 (+1/+3/+7 j),
  // revue Hugo MEDIUM-1. Toute valeur hors set (NaN, Infinity, 48, 720,
  // négatif, string, null, undefined, …) → invalid_input.
  if (!isAllowedHoursOffset(hoursOffset)) {
    return { ok: false, error: "invalid_input" };
  }

  // 3. Transaction métier
  let snapshot: TenderSnapshot | null = null;
  let deferredUntilIso: string | null = null;
  try {
    const txResult = await dbInstance.transaction(async (tx) => {
      const snap = await lockAndFetchTender(tx, tenderId, orgId);
      if (!snap) throw new BusinessError("tender_not_found");
      if (snap.status !== "sourced") throw new BusinessError("invalid_state");

      // Capture `deferred_until` calculé côté Postgres pour eviter tout skew
      // d'horloge entre Vercel et Supabase. Le RETURNING nous renvoie l'ISO.
      const updated = await tx
        .update(tenders)
        .set({
          deferredUntil: sql`now() + (${hoursOffset} * interval '1 hour')`,
          updatedAt: sql`now()`,
        })
        .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, orgId)))
        .returning({ deferredUntil: tenders.deferredUntil });

      const newDeferredUntil = updated[0]?.deferredUntil ?? null;
      const iso = newDeferredUntil ? newDeferredUntil.toISOString() : null;

      await tx.insert(tenderEvents).values({
        tenderId,
        organizationId: orgId,
        eventType: "deferred",
        actorId: userId,
        data: {
          external_ref: snap.externalRef,
          extra: {
            deferred_until: iso,
            hours_offset: hoursOffset,
          },
        },
      });

      return { snap, iso };
    });
    snapshot = txResult.snap;
    deferredUntilIso = txResult.iso;
  } catch (err) {
    if (err instanceof BusinessError) return { ok: false, error: err.code };
    console.error("[tender-actions:defer:fail]", err);
    return { ok: false, error: "internal_error" };
  }

  // 4. Audit non-bloquant
  if (deferredUntilIso) {
    await auditFn({
      action: "tender_defer",
      subjectType: "tender",
      subjectId: tenderId,
      data: {
        tender_id: tenderId,
        tender_ref: snapshot.externalRef,
        deferred_until: deferredUntilIso,
        hours_offset: hoursOffset,
      },
    });
  }

  // 5. Revalidate
  revalidatePath("/sourcing/ao-du-jour");

  return { ok: true };
}

// ============================================================================
// 3. rejectTenderAction — A15 tender_reject
// ============================================================================

/**
 * Rejette (« Écarter ») un AO. Le statut passe à `dropped`. Le motif est
 * désormais STRUCTURÉ (Salve U — apprentissage par écartement) :
 *  - `reasonCode` : l'un des 6 motifs de `REJECTION_REASONS` (radio obligatoire
 *    côté UI). Les motifs actionnables alimentent les suggestions d'ajustement
 *    du profil de recherche.
 *  - `verbatim`   : texte libre optionnel (max 280 chars), en complément.
 *
 * Effets :
 *  - `tenders.status = 'dropped'`
 *  - INSERT `tender_events` (eventType='rejected', data avec reasonCode/verbatim)
 *  - INSERT `learning_events` (eventType='rejected', reasonCode, verbatim,
 *    payload = snapshot {buyer, cpvCodes, geoZone, amount}) — BEST-EFFORT :
 *    une erreur sur cet INSERT ne fait JAMAIS échouer le rejet (try/catch
 *    absorbé). Le rejet métier prime sur l'apprentissage.
 *  - audit log A15 `tender_reject` (best-effort, post-commit).
 *
 * Distinction sémantique : « Écarter » ALIMENTE l'apprentissage. « Exclure »
 * (`excludeTenderAction`) reste NEUTRE, zéro effet algo.
 *
 * Rétrocompat : si `reasonCode` est absent / invalide (vieux call-sites), on
 * retombe sur `'other'` (motif non actionnable, simplement tracé).
 */
export async function rejectTenderAction(
  tenderId: string,
  reasonCode: RejectionReasonCode,
  verbatim: string | null,
  deps: ActionDeps = {},
): Promise<ActionResult> {
  const dbInstance = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? createSupabaseServerClient();
  const auditFn = deps.auditFn ?? audit;

  // 1. Auth + domaine
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  const { userId, orgId } = authResult;

  // 2. Validation input
  if (!UUID_SHAPE.test(tenderId)) return { ok: false, error: "invalid_input" };
  // Rétrocompat : un reasonCode absent/invalide → 'other' (jamais d'échec).
  const normalizedReasonCode: RejectionReasonCode = isRejectionReasonCode(reasonCode)
    ? reasonCode
    : DEFAULT_REJECTION_REASON_CODE;
  if (verbatim !== null && (typeof verbatim !== "string" || verbatim.length > 280)) {
    return { ok: false, error: "invalid_input" };
  }

  // 3. Transaction métier (statut + tender_events). L'écriture learning_events
  //    est faite DANS la transaction mais en best-effort (try/catch local) :
  //    elle ne doit jamais provoquer un rollback du rejet.
  let snapshot: TenderSnapshot | null = null;
  try {
    snapshot = await dbInstance.transaction(async (tx) => {
      const snap = await lockAndFetchTender(tx, tenderId, orgId);
      if (!snap) throw new BusinessError("tender_not_found");
      if (snap.status !== "sourced") throw new BusinessError("invalid_state");

      await tx
        .update(tenders)
        .set({
          status: "dropped",
          updatedAt: sql`now()`,
        })
        .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, orgId)));

      await tx.insert(tenderEvents).values({
        tenderId,
        organizationId: orgId,
        eventType: "rejected",
        actorId: userId,
        data: {
          to_status: "dropped",
          external_ref: snap.externalRef,
          note: verbatim ?? undefined,
          score: snapshotScore(snap.score) ?? undefined,
          extra: { reason: verbatim, reason_code: normalizedReasonCode },
        },
      });

      return snap;
    });
  } catch (err) {
    if (err instanceof BusinessError) return { ok: false, error: err.code };
    console.error("[tender-actions:reject:fail]", err);
    return { ok: false, error: "internal_error" };
  }

  // 3bis. Apprentissage par écartement (Salve U) — BEST-EFFORT, POST-COMMIT.
  //       Volontairement HORS de la transaction métier : un échec d'INSERT
  //       learning_events (ex. colonne manquante si migration 0050 pas encore
  //       appliquée, ou contrainte) ne doit JAMAIS faire échouer ni rollback
  //       le rejet déjà commité. Même contrat best-effort que l'audit log.
  try {
    await dbInstance.insert(learningEvents).values({
      tenderId,
      organizationId: orgId,
      userId,
      eventType: "rejected",
      reasonCode: normalizedReasonCode,
      verbatim: verbatim ?? null,
      payload: {
        buyer: snapshot.buyer,
        cpv_codes: snapshot.cpv,
        geo_zone: snapshot.department,
        amount: snapshot.amount !== null ? Number(snapshot.amount) : null,
      },
    });
  } catch (learningErr) {
    console.error("[tender-actions:reject:learning:fail]", learningErr);
  }

  // 4. Audit non-bloquant (A15). `reason` conserve le verbatim libre (schéma
  //    A15 inchangé) ; le motif structuré vit dans tender_events + learning_events.
  await auditFn({
    action: "tender_reject",
    subjectType: "tender",
    subjectId: tenderId,
    data: {
      tender_id: tenderId,
      tender_ref: snapshot.externalRef,
      reason: verbatim,
      score_at_reject: snapshotScore(snapshot.score),
    },
  });

  // 5. Revalidate
  revalidatePath("/sourcing/ao-du-jour");

  return { ok: true };
}

// ============================================================================
// 4. excludeTenderAction — exclusion réversible (migration 0013)
// ============================================================================

/**
 * Exclure / inclure un AO de façon réversible.
 *
 * exclude=true  → pose `excluded_at = now()` : l'AO disparaît du digest.
 * exclude=false → remet `excluded_at = NULL` : l'AO réapparaît dans le digest.
 *
 * Le statut tender reste `sourced` — l'exclusion est orthogonale au workflow
 * de traitement (Sélectionner / Différer / Écarter). Pas de transaction ni
 * de SELECT FOR UPDATE ici : l'exclusion ne dépend pas du statut courant,
 * et une double-action idempotente (exclure un AO déjà exclu) est sans effet.
 *
 * Pas d'entrée dans `tender_events` ni d'audit log A-série pour V1 (action
 * légère, réversible, non bloquante). À reconsidérer si l'exclusion fait
 * l'objet d'un reporting métier.
 */
export async function excludeTenderAction(
  tenderId: string,
  exclude: boolean,
  deps: ActionDeps = {},
): Promise<ActionResult> {
  const dbInstance = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? createSupabaseServerClient();

  // 1. Validation input
  if (!UUID_SHAPE.test(tenderId)) return { ok: false, error: "invalid_input" };

  // 2. Auth + domaine
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  const { orgId } = authResult;

  // 3. Mise à jour directe (pas de transaction — idempotente)
  try {
    await dbInstance
      .update(tenders)
      .set({
        excludedAt: exclude ? sql`now()` : null,
        updatedAt: sql`now()`,
      })
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, orgId)));
  } catch (err) {
    console.error("[tender-actions:exclude:fail]", err);
    return { ok: false, error: "internal_error" };
  }

  // 4. Revalidate RSC cache
  revalidatePath("/sourcing/ao-du-jour");

  return { ok: true };
}

// ============================================================================
// 5. trackDceDownload — A22 dce_download
// ============================================================================

/**
 * Enregistre en audit log (A22) le clic sur le lien « Accéder au DCE / RC »
 * d'une TenderCard. Action non-bloquante : retourne toujours `{ ok: true }`.
 *
 * Pourquoi une Server Action et pas un simple `<a href>` côté client ?
 * Le lien DCE est affiché côté RSC dans `TenderCard.tsx` mais la traçabilité
 * RGPD art. 5 (e) impose de logger les accès aux documents de procédure.
 * La Server Action est appelée en `onClick` avant l'ouverture de l'onglet.
 *
 * Guard SSRF minimal : on rejette les URLs non-http(s) et les IPs privées
 * (127.0.0.1, 10.x, 192.168.x, 172.16-31.x) pour ne pas exposer le réseau
 * interne Vercel/Supabase. En cas de rejet, l'audit est quand même émis avec
 * `download_status: "failed_ssrf"` pour visibilité.
 *
 * @param tenderId   UUID de l'AO concerné
 * @param tenderRef  Référence externe snapshot (ex. `25-AO-00142`)
 * @param dceUrl     URL DCE/RC à ouvrir (validée côté server)
 */
export async function trackDceDownload(
  tenderId: string,
  tenderRef: string,
  dceUrl: string,
  deps: ActionDeps = {},
): Promise<ActionResult> {
  const authClient = deps.authClient ?? createSupabaseServerClient();
  const auditFn = deps.auditFn ?? audit;

  // 1. Auth + domaine
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;

  // 2. Validation UUID + tenderRef
  if (!UUID_SHAPE.test(tenderId) || !tenderRef || tenderRef.trim().length === 0) {
    return { ok: false, error: "invalid_input" };
  }

  // 3. Guard SSRF minimal — rejette URLs non-http(s) et IPs privées/loopback
  let downloadStatus: "success" | "failed_ssrf" | "failed_fetch" | "no_url" = "success";
  try {
    const parsed = new URL(dceUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      downloadStatus = "failed_ssrf";
    } else {
      const hostname = parsed.hostname;
      const PRIVATE_RANGES =
        /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|::1$|localhost$)/i;
      if (PRIVATE_RANGES.test(hostname)) {
        downloadStatus = "failed_ssrf";
      }
    }
  } catch {
    // URL invalide → no_url (aucun accès réseau n'a lieu)
    downloadStatus = "no_url";
  }

  // 4. Audit A22 (best-effort — ne bloque jamais l'action métier)
  await auditFn({
    action: "dce_download",
    subjectType: "tender",
    subjectId: tenderId,
    data: {
      tender_id: tenderId,
      tender_ref: tenderRef.trim(),
      dce_url: dceUrl,
      download_status: downloadStatus,
    },
  });

  return { ok: true };
}

// ============================================================================
// 6. generateTenderBriefAction — brief IA à la demande
// ============================================================================

/**
 * Génère (ou regénère) le brief IA pour un AO donné.
 *
 * Workflow :
 *  1. Auth check (session + domaine)
 *  2. Charge le tender pour vérifier org_id + récupérer rawData
 *  3. Appelle generateBrief(rawData, tenderId, db)
 *  4. Désactive le brief actif précédent
 *  5. INSERT nouveau brief dans tender_briefs
 *  6. revalidatePath('/sourcing/ao-du-jour')
 *  7. Retourne { ok: true, briefText } ou { ok: false, error }
 *
 * Réf : SPEC_ADDENDUM_260524_AO_DU_JOUR_REPORT_ET_BRIEF.md §Exigence 2.
 */
export async function generateTenderBriefAction(
  tenderId: string,
  deps: ActionDeps = {},
): Promise<{ ok: boolean; briefText?: string; error?: string }> {
  const dbInstance = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? createSupabaseServerClient();

  // 1. Auth + domaine
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) {
    return { ok: false, error: authResult.error };
  }
  const { orgId } = authResult;

  // 2. Validation UUID
  if (!UUID_SHAPE.test(tenderId)) {
    return { ok: false, error: "invalid_input" };
  }

  // 3. Charge le tender (vérifie org_id + récupère rawData)
  const [tenderRow] = await dbInstance
    .select({
      id: tenders.id,
      rawData: tenders.rawData,
    })
    .from(tenders)
    .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, orgId)))
    .limit(1);

  if (!tenderRow) {
    return { ok: false, error: "tender_not_found" };
  }

  // 4. Appel au module IA
  const briefResult = await generateBrief(tenderRow.rawData, tenderId, orgId, dbInstance);

  if (!briefResult.ok) {
    console.error("[generateTenderBriefAction:generateBrief:fail]", briefResult);
    return {
      ok: false,
      error:
        briefResult.error === "no_raw_data"
          ? "Données brutes BOAMP absentes — brief impossible."
          : briefResult.error === "prompt_not_seeded"
            ? "Prompt ao_brief absent en BDD — relancer le seed."
            : (briefResult.message ?? briefResult.error),
    };
  }

  try {
    // 5. Désactiver l'éventuel brief actif précédent
    await dbInstance
      .update(tenderBriefs)
      .set({ isActive: false })
      .where(and(eq(tenderBriefs.tenderId, tenderId), eq(tenderBriefs.isActive, true)));

    // 6. INSERT nouveau brief actif
    await dbInstance.insert(tenderBriefs).values({
      tenderId,
      organizationId: orgId,
      aiRunId: briefResult.runId !== "unknown" ? briefResult.runId : null,
      content: briefResult.briefText,
      isActive: true,
    });
  } catch (err) {
    console.error("[generateTenderBriefAction:db:fail]", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur BDD lors de l'enregistrement du brief.",
    };
  }

  // 7. Revalidate RSC cache
  revalidatePath("/sourcing/ao-du-jour");

  return { ok: true, briefText: briefResult.briefText };
}

// ============================================================================
// Erreurs métier — propagation transaction → ActionResult
// ============================================================================

/**
 * Erreur métier propre à propager hors d'une transaction Drizzle. Drizzle
 * propage proprement les exceptions levées dans la callback `db.transaction`
 * (rollback automatique), on les catch ensuite pour mapper vers `ActionResult`.
 */
class BusinessError extends Error {
  constructor(public readonly code: "tender_not_found" | "invalid_state") {
    super(code);
    this.name = "BusinessError";
  }
}
