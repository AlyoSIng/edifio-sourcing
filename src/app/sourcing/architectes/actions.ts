"use server";

/**
 * Server Actions — module Architectes (liste, édition, RGPD opposition).
 *
 * Source de vérité :
 *  - `specs/architects_data_and_admin_v1.md` §3-4 (modèle de données + RGPD)
 *  - Décision CTO Sophie 2026-05-25 (migration Lot B) :
 *    Q1 : `active` ET `rgpd_opposition` / `rgpd_opposition_date` séparés
 *    Q3 : lecture tous rôles, écriture/RGPD admin uniquement
 *
 * Sécurité :
 *  - Auth check via helper local `requireAlyosUser`
 *  - Filtre tenant explicite `ALYOS_ORG_ID` sur toutes les requêtes
 *  - Écriture (upsertArchitect, setRgpdOpposition) : admin uniquement
 *  - Audit A17 `architect_edit` sur chaque modification fiche
 *  - Audit A19 `architect_export` sur chaque export (prévu)
 *
 * Pattern résilience : wrap try/catch absorbé avec `console.error` structuré.
 * Pas de propagation d'erreur BDD brute côté UI.
 */

import { and, count, eq, ilike, or, sql } from "drizzle-orm";

import { db as defaultDb } from "@/db/client";
import { architects } from "@/db/schema/architects";
import { audit } from "@/lib/audit";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Architect, NewArchitect } from "@/db/schema/architects";

// ============================================================================
// Types publics
// ============================================================================

export type DrizzleClient = typeof defaultDb;

export interface FetchArchitectsPageParams {
  /** Page courante (1-indexé). Défaut 1. */
  page?: number;
  /** Recherche libre — filtre sur `cabinet`, `contact_name`, `email` (ILIKE). */
  search?: string;
  /** Filtre sur département (contenu dans `geo_zones`). */
  departement?: string;
  /** Filtre booléen `tutoiement`. */
  tutoiement?: boolean;
  /** Filtre booléen `solicitable`. */
  solicitable?: boolean;
  /** Filtre booléen `rgpd_opposition`. */
  rgpdOpposition?: boolean;
}

export interface FetchArchitectsPageResult {
  /** Liste d'architectes pour la page courante. */
  architects: Architect[];
  /** Nombre total de lignes (avant pagination). */
  total: number;
  /** Page courante. */
  page: number;
  /** Taille de page (fixe). */
  pageSize: number;
  /** Nombre total de pages. */
  totalPages: number;
}

export type UpsertArchitectInput = Omit<
  NewArchitect,
  "id" | "organizationId" | "createdAt" | "updatedAt" | "solicitable"
>;

export type SetRgpdOppositionResult =
  | { ok: true; architect: Architect }
  | {
      ok: false;
      error:
        | "not_authenticated"
        | "forbidden_domain"
        | "forbidden_role"
        | "invalid_input"
        | "not_found"
        | "internal_error";
    };

export type UpsertArchitectResult =
  | { ok: true; architect: Architect }
  | {
      ok: false;
      error:
        | "not_authenticated"
        | "forbidden_domain"
        | "forbidden_role"
        | "invalid_input"
        | "not_found"
        | "internal_error";
    };

// ============================================================================
// Constantes
// ============================================================================

const PAGE_SIZE = 20;

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// ============================================================================
// Helpers internes
// ============================================================================

interface AuthClientLike {
  auth: {
    getUser: () => Promise<{ data: { user: import("@supabase/supabase-js").User | null } }>;
  };
}

/**
 * Vérifie l'authentification et le domaine @alyosingenierie.fr.
 * Retourne le profil utilisateur si valide.
 */
async function requireAlyosUser(
  authClient: AuthClientLike,
): Promise<
  | { ok: true; userId: string; profile: ReturnType<typeof toUserProfile> }
  | { ok: false; error: "not_authenticated" | "forbidden_domain" }
> {
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };
  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) return { ok: false, error: "forbidden_domain" };
  return { ok: true, userId: user.id, profile };
}

// ============================================================================
// 1. fetchArchitectsPage — lecture paginée (tous rôles)
// ============================================================================

/**
 * Récupère une page d'architectes du tenant AlyoS avec filtres optionnels.
 *
 * Accessible à tous les rôles authentifiés AlyoS (décision CTO Q3 : lecture
 * tous rôles). Pas d'audit log sur la lecture — usage fréquent.
 *
 * @param params — filtres + pagination
 * @param dbClient — injectable pour les tests (défaut : `db` global)
 */
export async function fetchArchitectsPage(
  params: FetchArchitectsPageParams = {},
  dbClient: DrizzleClient = defaultDb,
): Promise<FetchArchitectsPageResult> {
  const { page = 1, search, departement, tutoiement, solicitable, rgpdOpposition } = params;
  const offset = (Math.max(1, page) - 1) * PAGE_SIZE;

  // Construction dynamique des conditions WHERE
  const conditions = [eq(architects.organizationId, ALYOS_ORG_ID)];

  if (search && search.trim().length > 0) {
    const term = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(architects.cabinet, term),
        ilike(architects.contactName, term),
        ilike(architects.email, term),
      )!,
    );
  }

  if (departement && departement.trim().length > 0) {
    // Filtre sur l'array geo_zones : contient le département donné
    conditions.push(sql`${architects.geoZones} @> ARRAY[${departement.trim()}]::text[]`);
  }

  if (tutoiement !== undefined) {
    conditions.push(eq(architects.tutoiement, tutoiement));
  }

  if (solicitable !== undefined) {
    conditions.push(eq(architects.solicitable, solicitable));
  }

  if (rgpdOpposition !== undefined) {
    conditions.push(eq(architects.rgpdOpposition, rgpdOpposition));
  }

  const where = and(...conditions);

  // Requêtes parallèles : données + comptage total
  const [rows, countRows] = await Promise.all([
    dbClient
      .select()
      .from(architects)
      .where(where)
      .orderBy(architects.cabinet)
      .limit(PAGE_SIZE)
      .offset(offset),
    dbClient.select({ total: count() }).from(architects).where(where),
  ]);

  const total = countRows[0]?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  return {
    architects: rows,
    total,
    page: Math.max(1, page),
    pageSize: PAGE_SIZE,
    totalPages,
  };
}

// ============================================================================
// 2. upsertArchitect — création + mise à jour (admin uniquement)
// ============================================================================

/**
 * Crée ou met à jour un architecte du tenant AlyoS.
 *
 * - Création : pas d'`id` fourni → INSERT avec `uuid_generate_v4()`.
 * - Mise à jour : `id` fourni → UPDATE des champs non-null.
 *
 * Réservé aux admins (décision CTO Q3).
 * Audit A17 `architect_edit` après chaque modification réussie.
 *
 * @param input — champs de la fiche architecte
 * @param id — UUID existant (undefined = création)
 */
export async function upsertArchitect(
  input: UpsertArchitectInput,
  id?: string,
  dbClient: DrizzleClient = defaultDb,
): Promise<UpsertArchitectResult> {
  const authClient = createSupabaseServerClient();

  // 1. Auth + domaine
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  const { userId, profile } = authResult;

  // 2. Vérification rôle admin
  if (!isAdmin(profile)) {
    return { ok: false, error: "forbidden_role" };
  }

  // 3. Validation UUID si update
  if (id !== undefined && !UUID_SHAPE.test(id)) {
    return { ok: false, error: "invalid_input" };
  }

  // 4. Cabinet obligatoire
  if (!input.cabinet || input.cabinet.trim().length === 0) {
    return { ok: false, error: "invalid_input" };
  }

  try {
    let result: Architect;

    if (id) {
      // Mise à jour — on exclut les colonnes dérivées et les timestamps auto
      const rows = await dbClient
        .update(architects)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(and(eq(architects.id, id), eq(architects.organizationId, ALYOS_ORG_ID)))
        .returning();

      if (!rows[0]) return { ok: false, error: "not_found" as const };
      result = rows[0];
    } else {
      // Création
      const rows = await dbClient
        .insert(architects)
        .values({
          ...input,
          organizationId: ALYOS_ORG_ID,
        })
        .returning();

      if (!rows[0]) throw new Error("INSERT architects returned no row");
      result = rows[0];
    }

    // 5. Audit A17 architect_edit (best-effort)
    void userId;
    await audit({
      action: "architect_edit",
      subjectType: "architect",
      subjectId: result.id,
      data: {
        operation: id ? "update" : "create",
        architect_id: result.id,
        cabinet: result.cabinet,
      },
    });

    return { ok: true, architect: result };
  } catch (err) {
    console.error("[architects-actions:upsert:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// 3. setRgpdOpposition — toggle opposition RGPD art. 21 (admin uniquement)
// ============================================================================

/**
 * Pose ou lève l'opposition RGPD art. 21 sur un architecte.
 *
 * Effets :
 *  - `rgpd_opposition = true`  → `rgpd_opposition_date = now()` + `active = false`
 *    (l'archi est retiré du matching et des sollicitations futures, sans
 *    suppression dure — cf. `specs/architects_data_and_admin_v1.md` §4 RGPD).
 *  - `rgpd_opposition = false` → `rgpd_opposition_date = NULL` + `active = true`
 *    (levée d'opposition — doit être rare, réservé à une correction admin).
 *
 * Réservé aux admins (décision CTO Q3).
 * Audit A17 `architect_edit` après modification réussie.
 *
 * @param architectId — UUID de l'architecte
 * @param oppose — true = pose l'opposition, false = la lève
 */
export async function setRgpdOpposition(
  architectId: string,
  oppose: boolean,
  dbClient: DrizzleClient = defaultDb,
): Promise<SetRgpdOppositionResult> {
  const authClient = createSupabaseServerClient();

  // 1. Auth + domaine
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  const { profile } = authResult;

  // 2. Vérification rôle admin
  if (!isAdmin(profile)) {
    return { ok: false, error: "forbidden_role" };
  }

  // 3. Validation UUID
  if (!UUID_SHAPE.test(architectId)) {
    return { ok: false, error: "invalid_input" };
  }

  try {
    // 4. Mise à jour atomique : rgpd_opposition + rgpd_opposition_date + active
    const rows = await dbClient
      .update(architects)
      .set({
        rgpdOpposition: oppose,
        // Si opposition posée : date = now(). Si levée : date remise à NULL.
        rgpdOppositionDate: oppose ? new Date() : null,
        // L'opposition désactive l'architecte (retire du matching), la levée le réactive.
        active: !oppose,
        updatedAt: new Date(),
      })
      .where(and(eq(architects.id, architectId), eq(architects.organizationId, ALYOS_ORG_ID)))
      .returning();

    if (!rows[0]) return { ok: false, error: "not_found" };
    const updated = rows[0];

    // 5. Audit A17 architect_edit (best-effort)
    await audit({
      action: "architect_edit",
      subjectType: "architect",
      subjectId: updated.id,
      data: {
        operation: "update",
        architect_id: updated.id,
        cabinet: updated.cabinet,
        rgpd_opposition: oppose,
        rgpd_opposition_date: oppose ? updated.rgpdOppositionDate?.toISOString() : null,
      },
    });

    return { ok: true, architect: updated };
  } catch (err) {
    console.error("[architects-actions:rgpd-opposition:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}
