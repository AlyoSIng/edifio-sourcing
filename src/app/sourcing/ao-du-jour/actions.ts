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
import { tenderEvents, tenders } from "@/db/schema/tenders";
import { audit } from "@/lib/audit";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
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
 */
async function requireAlyosUser(
  authClient: AuthClientLike,
): Promise<{ ok: true; userId: string } | Exclude<ActionResult, { ok: true }>> {
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) return { ok: false, error: "forbidden_domain" };

  return { ok: true, userId: user.id };
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

async function lockAndFetchTender(tx: TxLike, tenderId: string): Promise<TenderSnapshot | null> {
  const rows = await tx
    .select({
      status: tenders.status,
      score: tenders.score,
      externalRef: tenders.externalRef,
    })
    .from(tenders)
    .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, ALYOS_ORG_ID)))
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
  mode: "solo" | "tandem",
  deps: ActionDeps = {},
): Promise<ActionResult> {
  const dbInstance = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? createSupabaseServerClient();
  const auditFn = deps.auditFn ?? audit;

  // 1. Auth + domaine
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  const { userId } = authResult;

  // 2. Validation input
  if (!UUID_SHAPE.test(tenderId)) return { ok: false, error: "invalid_input" };
  if (mode !== "solo" && mode !== "tandem") return { ok: false, error: "invalid_input" };

  // 3. Transaction métier
  let snapshot: TenderSnapshot | null = null;
  try {
    snapshot = await dbInstance.transaction(async (tx) => {
      const snap = await lockAndFetchTender(tx, tenderId);
      if (!snap) throw new BusinessError("tender_not_found");
      if (snap.status !== "sourced") throw new BusinessError("invalid_state");

      const newStatus = mode === "solo" ? "selected_solo" : "selected_tandem";
      await tx
        .update(tenders)
        .set({
          status: newStatus,
          // Sélectionner lève un éventuel différé : on remet à NULL.
          deferredUntil: null,
          updatedAt: sql`now()`,
        })
        .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, ALYOS_ORG_ID)));

      await tx.insert(tenderEvents).values({
        tenderId,
        organizationId: ALYOS_ORG_ID,
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
  const { userId } = authResult;

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
      const snap = await lockAndFetchTender(tx, tenderId);
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
        .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, ALYOS_ORG_ID)))
        .returning({ deferredUntil: tenders.deferredUntil });

      const newDeferredUntil = updated[0]?.deferredUntil ?? null;
      const iso = newDeferredUntil ? newDeferredUntil.toISOString() : null;

      await tx.insert(tenderEvents).values({
        tenderId,
        organizationId: ALYOS_ORG_ID,
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
 * Rejette un AO. Le statut passe à `dropped`. Le motif libre (optionnel,
 * max 280 chars) est stocké dans `tender_events.data.reason` ET dans
 * `audit_logs.data.reason`. Le score au moment du rejet est snapshotté
 * pour analyse a posteriori (delta scoring/jugement humain).
 *
 * Si `reason === ""`, on l'enregistre tel quel (chaîne vide). Le call-site
 * UI peut choisir de l'envoyer en `null` si rien n'a été saisi.
 */
export async function rejectTenderAction(
  tenderId: string,
  reason: string | null,
  deps: ActionDeps = {},
): Promise<ActionResult> {
  const dbInstance = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? createSupabaseServerClient();
  const auditFn = deps.auditFn ?? audit;

  // 1. Auth + domaine
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  const { userId } = authResult;

  // 2. Validation input
  if (!UUID_SHAPE.test(tenderId)) return { ok: false, error: "invalid_input" };
  if (reason !== null && (typeof reason !== "string" || reason.length > 280)) {
    return { ok: false, error: "invalid_input" };
  }

  // 3. Transaction métier
  let snapshot: TenderSnapshot | null = null;
  try {
    snapshot = await dbInstance.transaction(async (tx) => {
      const snap = await lockAndFetchTender(tx, tenderId);
      if (!snap) throw new BusinessError("tender_not_found");
      if (snap.status !== "sourced") throw new BusinessError("invalid_state");

      await tx
        .update(tenders)
        .set({
          status: "dropped",
          updatedAt: sql`now()`,
        })
        .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, ALYOS_ORG_ID)));

      await tx.insert(tenderEvents).values({
        tenderId,
        organizationId: ALYOS_ORG_ID,
        eventType: "rejected",
        actorId: userId,
        data: {
          to_status: "dropped",
          external_ref: snap.externalRef,
          note: reason ?? undefined,
          score: snapshotScore(snap.score) ?? undefined,
          extra: { reason },
        },
      });

      return snap;
    });
  } catch (err) {
    if (err instanceof BusinessError) return { ok: false, error: err.code };
    console.error("[tender-actions:reject:fail]", err);
    return { ok: false, error: "internal_error" };
  }

  // 4. Audit non-bloquant
  await auditFn({
    action: "tender_reject",
    subjectType: "tender",
    subjectId: tenderId,
    data: {
      tender_id: tenderId,
      tender_ref: snapshot.externalRef,
      reason,
      score_at_reject: snapshotScore(snapshot.score),
    },
  });

  // 5. Revalidate
  revalidatePath("/sourcing/ao-du-jour");

  return { ok: true };
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
