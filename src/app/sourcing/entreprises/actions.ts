"use server";

/**
 * Server Actions — module Entreprises/Majors (liste, édition, import CSV).
 *
 * Pattern calqué sur `src/app/sourcing/architectes/actions.ts`.
 *
 * Sécurité :
 *  - Auth check via `requireAlyosUser` (domaine @alyosingenierie.fr)
 *  - Filtre tenant explicite `orgId` sur toutes les requêtes
 *  - Écriture (upsertCompany, importCompanyFromCsv) : admin uniquement
 *
 * Créé dans feat/be-companies (Nadia, 2026-05-26).
 */

import { and, count, eq, ilike, or, sql } from "drizzle-orm";

import { db as defaultDb } from "@/db/client";
import { companies } from "@/db/schema/companies";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Company, NewCompany } from "@/db/schema/companies";

// ============================================================================
// Types
// ============================================================================

export type DrizzleClient = typeof defaultDb;

export interface FetchCompaniesPageParams {
  page?: number;
  search?: string;
  specialty?: string;
  implantation?: string;
  /** UUID organisation courante. Fallback ALYOS_ORG_ID pour retro-compat. */
  orgId?: string;
}

export interface FetchCompaniesPageResult {
  companyList: Company[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type UpsertCompanyInput = Omit<
  NewCompany,
  "id" | "organizationId" | "createdAt" | "updatedAt"
>;

export type UpsertCompanyResult =
  | { ok: true; company: Company }
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

export interface ImportCompanyResult {
  imported: number;
  updated: number;
  errors: string[];
}

// ============================================================================
// Constantes
// ============================================================================

const PAGE_SIZE = 25;
const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// ============================================================================
// Helper auth
// ============================================================================

interface AuthClientLike {
  auth: {
    getUser: () => Promise<{ data: { user: import("@supabase/supabase-js").User | null } }>;
  };
}

async function requireAlyosUser(
  authClient: AuthClientLike,
): Promise<
  | { ok: true; userId: string; orgId: string; profile: ReturnType<typeof toUserProfile> }
  | { ok: false; error: "not_authenticated" | "forbidden_domain" }
> {
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };
  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) return { ok: false, error: "forbidden_domain" };
  const orgId = await getRequiredOrgId(user.id);
  return { ok: true, userId: user.id, orgId, profile };
}

// ============================================================================
// 1. fetchCompaniesPage — lecture paginée (tous rôles)
// ============================================================================

export async function fetchCompaniesPage(
  params: FetchCompaniesPageParams = {},
  dbClient: DrizzleClient = defaultDb,
): Promise<FetchCompaniesPageResult> {
  const { page = 1, search, specialty, implantation, orgId: paramOrgId } = params;
  const resolvedOrgId = paramOrgId ?? ALYOS_ORG_ID;
  const offset = (Math.max(1, page) - 1) * PAGE_SIZE;

  const conditions = [eq(companies.organizationId, resolvedOrgId)];

  if (search && search.trim().length > 0) {
    const term = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(companies.name, term),
        ilike(companies.contactName, term),
        ilike(companies.email, term),
      )!,
    );
  }

  if (specialty && specialty.trim().length > 0) {
    conditions.push(sql`${companies.specialtyCodes} @> ARRAY[${specialty.trim()}]::text[]`);
  }

  if (implantation && implantation.trim().length > 0) {
    conditions.push(ilike(companies.zip, `${implantation.trim()}%`));
  }

  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    dbClient
      .select()
      .from(companies)
      .where(where)
      .orderBy(companies.name)
      .limit(PAGE_SIZE)
      .offset(offset),
    dbClient.select({ total: count() }).from(companies).where(where),
  ]);

  const total = countRows[0]?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  return {
    companyList: rows,
    total,
    page: Math.max(1, page),
    pageSize: PAGE_SIZE,
    totalPages,
  };
}

// ============================================================================
// 2. upsertCompany — création + mise à jour (admin uniquement)
// ============================================================================

export async function upsertCompany(
  input: UpsertCompanyInput,
  id?: string,
  dbClient: DrizzleClient = defaultDb,
): Promise<UpsertCompanyResult> {
  const authClient = createSupabaseServerClient();

  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  const { profile, orgId: upsertOrgId } = authResult;

  if (!isAdmin(profile)) return { ok: false, error: "forbidden_role" };

  if (id !== undefined && !UUID_SHAPE.test(id)) {
    return { ok: false, error: "invalid_input" };
  }

  if (!input.name || input.name.trim().length === 0) {
    return { ok: false, error: "invalid_input" };
  }

  try {
    let result: Company;

    if (id) {
      const rows = await dbClient
        .update(companies)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(companies.id, id), eq(companies.organizationId, upsertOrgId)))
        .returning();

      if (!rows[0]) return { ok: false, error: "not_found" };
      result = rows[0];
    } else {
      const rows = await dbClient
        .insert(companies)
        .values({ ...input, organizationId: upsertOrgId })
        .returning();

      if (!rows[0]) throw new Error("INSERT companies returned no row");
      result = rows[0];
    }

    return { ok: true, company: result };
  } catch (err) {
    console.error("[companies-actions:upsert:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// 3. importCompanyFromCsv — import CSV (admin uniquement)
// ============================================================================

/**
 * Colonnes CSV attendues (ligne 1 = header ignoré) :
 *   name,email,phone,siren,zip,city,specialty_codes,geo_zones,budget_min,budget_max,notes
 *
 * `specialty_codes` et `geo_zones` : split sur `;`.
 * Upsert par `(organizationId, siren)` si siren présent,
 * sinon upsert par `(organizationId, email)` si email présent,
 * sinon INSERT.
 */
export async function importCompanyFromCsv(formData: FormData): Promise<ImportCompanyResult> {
  const authClient = createSupabaseServerClient();

  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) {
    return { imported: 0, updated: 0, errors: ["Non authentifié ou domaine non autorisé."] };
  }
  const { profile, orgId: importOrgId } = authResult;

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
    return { imported: 0, updated: 0, errors: ["Le fichier CSV est vide ou n'a pas de données."] };
  }

  const dataLines = lines.slice(1);

  let imported = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    if (!line) continue;
    const cols = line.split(",");

    const name = cols[0]?.trim() ?? "";
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
    const notes = cols[10]?.trim() || null;

    if (!name) {
      errors.push(`Ligne ${i + 2} : name manquant, ligne ignorée.`);
      continue;
    }

    try {
      // Chercher un existant — priorité au SIREN, sinon email
      let existingId: string | null = null;

      if (siren) {
        const existing = await defaultDb
          .select({ id: companies.id })
          .from(companies)
          .where(and(eq(companies.organizationId, importOrgId), eq(companies.siren, siren)))
          .limit(1);
        existingId = existing[0]?.id ?? null;
      } else if (email) {
        const existing = await defaultDb
          .select({ id: companies.id })
          .from(companies)
          .where(and(eq(companies.organizationId, importOrgId), eq(companies.email, email)))
          .limit(1);
        existingId = existing[0]?.id ?? null;
      }

      if (existingId) {
        await defaultDb
          .update(companies)
          .set({
            name,
            email,
            phone,
            siren,
            zip,
            city,
            specialtyCodes,
            geoZones,
            budgetMin,
            budgetMax,
            notes,
            updatedAt: new Date(),
          })
          .where(and(eq(companies.id, existingId), eq(companies.organizationId, importOrgId)));
        updated++;
      } else {
        await defaultDb.insert(companies).values({
          organizationId: importOrgId,
          name,
          email,
          phone,
          siren,
          zip,
          city,
          specialtyCodes,
          geoZones,
          budgetMin,
          budgetMax,
          notes,
        });
        imported++;
      }
    } catch (err) {
      errors.push(
        `Ligne ${i + 2} (${name}) : ${err instanceof Error ? err.message : "erreur inconnue"}`,
      );
    }
  }

  return { imported, updated, errors };
}
