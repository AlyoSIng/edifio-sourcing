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
import { architectResponses, matchProposals } from "@/db/schema/selections";
import { audit } from "@/lib/audit";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import {
  getPappersBySiren,
  mapTrancheToHeadcount,
  searchPappersByName,
} from "@/lib/pappers/client";
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
// 3. importArchitectsFromCsv — import CSV (admin uniquement)
// ============================================================================

export interface ImportArchitectsResult {
  imported: number;
  updated: number;
  errors: string[];
}

/**
 * Importe des architectes depuis un CSV (admin uniquement).
 *
 * Colonnes CSV attendues (ligne 1 = header ignoré) :
 *   cabinet,email,phone,siren,zip,city,specialty_codes,geo_zones,
 *   budget_min,budget_max,concours_only,tutoiement,notes,headcount,annual_revenue
 *
 * `specialty_codes` et `geo_zones` : split sur `;` (pour éviter conflit avec la virgule CSV).
 * `headcount` : parseInt ou null.
 * `annual_revenue` : parseInt ou null.
 * Upsert par `(organizationId, email)` si email présent, sinon INSERT.
 */
export async function importArchitectsFromCsv(formData: FormData): Promise<ImportArchitectsResult> {
  const authClient = createSupabaseServerClient();

  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) {
    return { imported: 0, updated: 0, errors: ["Non authentifié ou domaine non autorisé."] };
  }
  const { profile } = authResult;

  if (!isAdmin(profile)) {
    return { imported: 0, updated: 0, errors: ["Action réservée aux administrateurs."] };
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return { imported: 0, updated: 0, errors: ["Aucun fichier CSV fourni."] };
  }

  const text = await (file as Blob).text();
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return {
      imported: 0,
      updated: 0,
      errors: ["Le fichier CSV est vide ou n'a pas de données."],
    };
  }

  // Ignorer la ligne de header
  const dataLines = lines.slice(1);

  let imported = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    if (!line) continue;
    // Parsing simple : split virgule (pas de support guillemets complexes au MVP)
    const cols = line.split(",");

    const cabinet = cols[0]?.trim() ?? "";
    const email = cols[1]?.trim() || null;
    const phone = cols[2]?.trim() || null;
    const siren = cols[3]?.trim() || null;
    const zip = cols[4]?.trim() || null;
    const city = cols[5]?.trim() || null;
    const specialtyCodes = cols[6]
      ? cols[6]
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const geoZones = cols[7]
      ? cols[7]
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const budgetMin = cols[8] ? parseInt(cols[8].trim(), 10) || null : null;
    const budgetMax = cols[9] ? parseInt(cols[9].trim(), 10) || null : null;
    const concoursOnly = cols[10]?.trim().toLowerCase() === "true";
    const tutoiement = cols[11]?.trim().toLowerCase() === "true";
    const notes = cols[12]?.trim() || null;
    const headcount = cols[13] ? parseInt(cols[13].trim(), 10) || null : null;
    const annualRevenue = cols[14] ? parseInt(cols[14].trim(), 10) || null : null;

    if (!cabinet) {
      errors.push(`Ligne ${i + 2} : cabinet manquant, ligne ignorée.`);
      continue;
    }

    try {
      if (email) {
        // Upsert par (organizationId, email)
        const existing = await defaultDb
          .select({ id: architects.id })
          .from(architects)
          .where(and(eq(architects.organizationId, ALYOS_ORG_ID), eq(architects.email, email)))
          .limit(1);

        if (existing[0]) {
          await defaultDb
            .update(architects)
            .set({
              cabinet,
              phone,
              siren,
              zip,
              city,
              specialtyCodes,
              geoZones,
              budgetMin,
              budgetMax,
              concoursOnly,
              tutoiement,
              notes,
              headcount,
              annualRevenue,
              updatedAt: new Date(),
            })
            .where(
              and(eq(architects.id, existing[0].id), eq(architects.organizationId, ALYOS_ORG_ID)),
            );
          updated++;
        } else {
          await defaultDb.insert(architects).values({
            organizationId: ALYOS_ORG_ID,
            cabinet,
            email,
            phone,
            siren,
            zip,
            city,
            specialtyCodes,
            geoZones,
            budgetMin,
            budgetMax,
            concoursOnly,
            tutoiement,
            notes,
            headcount,
            annualRevenue,
          });
          imported++;
        }
      } else {
        // Pas d'email → INSERT simple
        await defaultDb.insert(architects).values({
          organizationId: ALYOS_ORG_ID,
          cabinet,
          email: null,
          phone,
          siren,
          zip,
          city,
          specialtyCodes,
          geoZones,
          budgetMin,
          budgetMax,
          concoursOnly,
          tutoiement,
          notes,
          headcount,
          annualRevenue,
        });
        imported++;
      }
    } catch (err) {
      errors.push(
        `Ligne ${i + 2} (${cabinet}) : ${err instanceof Error ? err.message : "erreur inconnue"}`,
      );
    }
  }

  return { imported, updated, errors };
}

// ============================================================================
// 4. setRgpdOpposition — toggle opposition RGPD art. 21 (admin uniquement)
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

// ============================================================================
// 5. enrichArchitectsFromPappers — moulinette Pappers (admin uniquement)
// ============================================================================

export interface PappersEnrichResult {
  /** Fiches mises à jour (au moins un champ enrichi). */
  updated: number;
  /** Fiches sans modification (données déjà présentes ou Pappers sans réponse). */
  skipped: number;
  /** Architectes non trouvés dans Pappers (ni par SIREN, ni par nom). */
  notFound: number;
  /** Offset à passer pour le batch suivant (= offset + limit si encore des architectes). */
  nextOffset: number;
  /** Nombre total d'architectes dans l'organisation. */
  total: number;
}

/**
 * Enrichit les fiches architectes depuis l'API Pappers (admin uniquement).
 *
 * Mode batch : traite `limit` architectes à partir de `offset`.
 * Appeler en boucle côté client jusqu'à `nextOffset >= total`.
 *
 * Stratégie d'enrichissement :
 *   1. Si `architect.siren` est renseigné → lookup direct par SIREN
 *   2. Sinon si `architect.cabinet` est renseigné → recherche par nom
 *      → retenir si 1 seul résultat ET score ≥ 0.6 ET code NAF contient "711"
 *      (activités d'architecture — NAF 7111Z, 7112B, etc.)
 *      → renseigner le SIREN trouvé
 *
 * Champs mis à jour : `headcount` (si NULL), `annual_revenue` (si NULL),
 * `siren` (si NULL). Les données existantes ne sont JAMAIS écrasées
 * (préserve les corrections manuelles de l'admin).
 *
 * @param params.limit   - Taille du batch (défaut 50)
 * @param params.offset  - Décalage (défaut 0)
 * @param params.dryRun  - Si true, calcule les stats sans rien écrire en BDD
 */
export async function enrichArchitectsFromPappers(params: {
  limit?: number;
  offset?: number;
  dryRun?: boolean;
}): Promise<PappersEnrichResult> {
  const { limit = 50, offset = 0, dryRun = false } = params;

  // Vérification clé API Pappers
  const apiKey = process.env.PAPPERS_API_KEY;
  if (!apiKey) {
    console.error("[pappers-enrich] PAPPERS_API_KEY manquante — enrichissement impossible.");
    return { updated: 0, skipped: 0, notFound: 0, nextOffset: 0, total: 0 };
  }

  // Auth + domaine
  const authClient = createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) {
    return { updated: 0, skipped: 0, notFound: 0, nextOffset: 0, total: 0 };
  }
  const { profile } = authResult;

  // Réservé aux admins
  if (!isAdmin(profile)) {
    return { updated: 0, skipped: 0, notFound: 0, nextOffset: 0, total: 0 };
  }

  const orgFilter = eq(architects.organizationId, ALYOS_ORG_ID);

  // Récupération du total et du batch en parallèle
  const [batch, totalRows] = await Promise.all([
    defaultDb
      .select()
      .from(architects)
      .where(orgFilter)
      .orderBy(architects.cabinet)
      .limit(limit)
      .offset(offset),
    defaultDb
      .select({ total: sql<number>`count(*)::int` })
      .from(architects)
      .where(orgFilter),
  ]);

  const total = totalRows[0]?.total ?? 0;

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const arch of batch) {
    let foundSiren: string | null = null;
    let pappers: { tranche_effectif_salarie?: string; chiffre_affaires?: number } | null = null;

    if (arch.siren) {
      // Stratégie 1 : lookup direct par SIREN
      const result = await getPappersBySiren(arch.siren, apiKey);
      if (result) {
        foundSiren = arch.siren;
        pappers = result;
      }
    } else if (arch.cabinet) {
      // Stratégie 2 : recherche par nom cabinet
      const searchResult = await searchPappersByName(arch.cabinet, apiKey);
      const resultats = searchResult?.resultats_entreprises ?? [];

      if (resultats.length === 1 && resultats[0]) {
        const hit = resultats[0];
        const score = hit.score ?? 0;
        const codeNaf = hit.siege?.code_naf ?? "";

        // Retenir uniquement si score suffisant ET activité architecture (NAF 711x)
        if (score >= 0.6 && codeNaf.startsWith("711")) {
          foundSiren = hit.siren;
          // Lookup détaillé pour récupérer CA + effectif
          const detail = await getPappersBySiren(foundSiren, apiKey);
          if (detail) {
            pappers = detail;
          }
        }
      }
    }

    if (!pappers && !foundSiren) {
      // Aucune donnée Pappers trouvée pour cet architecte
      notFound++;
      // Pause respectueuse des rate limits
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }

    // Calcul des nouvelles valeurs (uniquement pour les champs NULL)
    const newHeadcount = pappers ? mapTrancheToHeadcount(pappers.tranche_effectif_salarie) : null;
    const newAnnualRevenue = pappers?.chiffre_affaires ?? null;

    // Détecter si au moins un champ NULL peut être enrichi
    const needsUpdate =
      (arch.siren === null && foundSiren !== null) ||
      (arch.headcount === null && newHeadcount !== null) ||
      (arch.annualRevenue === null && newAnnualRevenue !== null);

    if (!needsUpdate) {
      skipped++;
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }

    if (!dryRun) {
      // Mise à jour uniquement des champs NULL — préserve les corrections manuelles
      await defaultDb
        .update(architects)
        .set({
          siren: arch.siren ?? foundSiren,
          headcount: arch.headcount ?? newHeadcount,
          annualRevenue: arch.annualRevenue ?? newAnnualRevenue,
          updatedAt: new Date(),
        })
        .where(and(eq(architects.id, arch.id), orgFilter));
    }

    updated++;

    // Pause entre chaque appel API pour respecter les rate limits Pappers
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return {
    updated,
    skipped,
    notFound,
    nextOffset: offset + limit,
    total,
  };
}

// ============================================================================
// 6. enrichSingleArchitectFromPappers — enrichissement unitaire (admin)
// ============================================================================

export type EnrichSingleResult =
  | {
      ok: true;
      updated: boolean;
      /** Champs effectivement mis à jour (pour affichage UI). */
      changes: {
        siren?: string;
        headcount?: number;
        annualRevenue?: number;
      };
      /** Message résumé à afficher (ex: "SIREN 123456789 · Effectif 14 · CA 450 000 €"). */
      summary: string;
    }
  | {
      ok: false;
      error:
        | "not_authenticated"
        | "forbidden_domain"
        | "forbidden_role"
        | "invalid_input"
        | "not_found"
        | "pappers_unavailable"
        | "internal_error";
    };

/**
 * Enrichit la fiche d'un seul architecte depuis l'API Pappers.
 *
 * Stratégie identique à `enrichArchitectsFromPappers` mais pour un UUID unique :
 *  1. SIREN direct si renseigné
 *  2. Sinon recherche par nom cabinet (score ≥ 0.6 + NAF 711x)
 * Ne met à jour que les champs NULL (préserve les corrections manuelles).
 * Audit `architect_edit` après modification.
 *
 * @param architectId UUID de l'architecte à enrichir
 */
export async function enrichSingleArchitectFromPappers(
  architectId: string,
): Promise<EnrichSingleResult> {
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

  // 4. Vérification clé API Pappers
  const apiKey = process.env.PAPPERS_API_KEY;
  if (!apiKey) {
    console.error("[pappers-enrich-single] PAPPERS_API_KEY manquante.");
    return { ok: false, error: "pappers_unavailable" };
  }

  try {
    // 5. Récupération de l'architecte (filtré tenant)
    const rows = await defaultDb
      .select()
      .from(architects)
      .where(and(eq(architects.id, architectId), eq(architects.organizationId, ALYOS_ORG_ID)))
      .limit(1);

    const arch = rows[0];
    if (!arch) return { ok: false, error: "not_found" };

    // 6. Appel Pappers (même logique que le bulk)
    let foundSiren: string | null = null;
    let pappers: { tranche_effectif_salarie?: string; chiffre_affaires?: number } | null = null;

    if (arch.siren) {
      // Stratégie 1 : lookup direct par SIREN
      const result = await getPappersBySiren(arch.siren, apiKey);
      if (result) {
        foundSiren = arch.siren;
        pappers = result;
      }
    } else if (arch.cabinet) {
      // Stratégie 2 : recherche par nom cabinet
      const searchResult = await searchPappersByName(arch.cabinet, apiKey);
      const resultats = searchResult?.resultats_entreprises ?? [];

      if (resultats.length === 1 && resultats[0]) {
        const hit = resultats[0];
        const score = hit.score ?? 0;
        const codeNaf = hit.siege?.code_naf ?? "";

        if (score >= 0.6 && codeNaf.startsWith("711")) {
          foundSiren = hit.siren;
          const detail = await getPappersBySiren(foundSiren, apiKey);
          if (detail) {
            pappers = detail;
          }
        }
      }
    }

    // 7. Aucune donnée Pappers trouvée
    if (!pappers && !foundSiren) {
      return {
        ok: true,
        updated: false,
        changes: {},
        summary: "Aucune donnée trouvée dans Pappers.",
      };
    }

    // 8. Calcul des champs à mettre à jour (uniquement NULL)
    const newHeadcount = pappers ? mapTrancheToHeadcount(pappers.tranche_effectif_salarie) : null;
    const newAnnualRevenue = pappers?.chiffre_affaires ?? null;

    const needsUpdate =
      (arch.siren === null && foundSiren !== null) ||
      (arch.headcount === null && newHeadcount !== null) ||
      (arch.annualRevenue === null && newAnnualRevenue !== null);

    if (!needsUpdate) {
      return {
        ok: true,
        updated: false,
        changes: {},
        summary: "Fiche déjà complète.",
      };
    }

    // 9. Construction des changements effectifs
    const changes: { siren?: string; headcount?: number; annualRevenue?: number } = {};
    if (arch.siren === null && foundSiren !== null) changes.siren = foundSiren;
    if (arch.headcount === null && newHeadcount !== null) changes.headcount = newHeadcount;
    if (arch.annualRevenue === null && newAnnualRevenue !== null)
      changes.annualRevenue = newAnnualRevenue;

    // 10. UPDATE BDD
    await defaultDb
      .update(architects)
      .set({
        siren: arch.siren ?? foundSiren,
        headcount: arch.headcount ?? newHeadcount,
        annualRevenue: arch.annualRevenue ?? newAnnualRevenue,
        updatedAt: new Date(),
      })
      .where(and(eq(architects.id, arch.id), eq(architects.organizationId, ALYOS_ORG_ID)));

    // 11. Audit A17 architect_edit (best-effort)
    await audit({
      action: "architect_edit",
      subjectType: "architect",
      subjectId: arch.id,
      data: {
        operation: "update",
        architect_id: arch.id,
        cabinet: arch.cabinet,
        enriched_fields: Object.keys(changes),
        source: "pappers_single",
      },
    });

    // 12. Construction du résumé lisible
    const summaryParts: string[] = [];
    if (changes.siren) summaryParts.push(`SIREN ${changes.siren}`);
    if (changes.headcount !== undefined)
      summaryParts.push(`Effectif ${changes.headcount.toLocaleString("fr-FR")}`);
    if (changes.annualRevenue !== undefined)
      summaryParts.push(`CA ${changes.annualRevenue.toLocaleString("fr-FR")} €`);
    const summary = summaryParts.join(" · ");

    return { ok: true, updated: true, changes, summary };
  } catch (err) {
    console.error("[architects-actions:enrich-single:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// 7. deleteArchitectAction — suppression hard (admin uniquement)
// ============================================================================

export type DeleteArchitectResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "not_authenticated"
        | "forbidden_domain"
        | "forbidden_role"
        | "invalid_input"
        | "not_found"
        | "has_active_solicitations"
        | "internal_error";
    };

/**
 * Supprime définitivement un architecte du tenant AlyoS.
 *
 * Guards métier :
 *  - UUID valide
 *  - Admin uniquement
 *  - Aucune sollicitation `architect_responses` avec status `pending`
 *  - Aucune proposition `match_proposals` avec status `proposed` ou `accepted`
 *
 * Audit A17 `architect_edit` avec `operation: 'delete'` après suppression.
 *
 * @param architectId — UUID de l'architecte à supprimer
 */
export async function deleteArchitectAction(
  architectId: string,
  dbClient: DrizzleClient = defaultDb,
): Promise<DeleteArchitectResult> {
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
    // 4. Guard : sollicitations en cours (architect_responses status = 'pending')
    const pendingResponses = await dbClient
      .select({ total: count() })
      .from(architectResponses)
      .where(
        and(
          eq(architectResponses.architectId, architectId),
          eq(architectResponses.status, "pending"),
        ),
      );

    if ((pendingResponses[0]?.total ?? 0) > 0) {
      return { ok: false, error: "has_active_solicitations" };
    }

    // 5. Guard : propositions de matching liées
    // `match_proposals` n'a pas de colonne `status` dans le schéma V1 —
    // on bloque préventivement si des propositions existent (ON DELETE CASCADE
    // gérera la suppression automatique mais on préfère lever l'erreur pour
    // que l'admin soit conscient de l'impact).
    const linkedProposals = await dbClient
      .select({ total: count() })
      .from(matchProposals)
      .where(eq(matchProposals.architectId, architectId));

    if ((linkedProposals[0]?.total ?? 0) > 0) {
      return { ok: false, error: "has_active_solicitations" };
    }

    // 6. DELETE tenant-scoped
    const deleted = await dbClient
      .delete(architects)
      .where(and(eq(architects.id, architectId), eq(architects.organizationId, ALYOS_ORG_ID)))
      .returning({ id: architects.id });

    if (!deleted[0]) {
      return { ok: false, error: "not_found" };
    }

    // 7. Audit A17 architect_edit avec operation = 'delete' (best-effort)
    await audit({
      action: "architect_edit",
      subjectType: "architect",
      subjectId: architectId,
      data: {
        operation: "delete",
        architect_id: architectId,
      },
    });

    return { ok: true };
  } catch (err) {
    console.error("[architects-actions:delete:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}
