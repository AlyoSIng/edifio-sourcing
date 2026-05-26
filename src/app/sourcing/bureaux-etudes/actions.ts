"use server";

/**
 * Server Actions — module Bureaux d'Études (liste, édition, import CSV, RGPD, documents).
 *
 * Pattern calqué sur `src/app/sourcing/architectes/actions.ts`.
 *
 * Sécurité :
 *  - Auth check via `requireAlyosUser` (domaine @alyosingenierie.fr)
 *  - Filtre tenant explicite `ALYOS_ORG_ID` sur toutes les requêtes
 *  - Écriture (upsertBE, importBEFromCsv, upload/deleteBeDocument) : admin uniquement
 *
 * Créé dans feat/be-companies (Nadia, 2026-05-26).
 * Documents BE ajoutés dans feat/be-documents (Alex, 2026-05-26).
 */

import { and, count, eq, ilike, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db as defaultDb } from "@/db/client";
import { bureauEtudes } from "@/db/schema/bureaux-etudes";
import { beDocuments, type BeDocument, type BeDocumentKind } from "@/db/schema/be-documents";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import type { BureauEtudes, NewBureauEtudes } from "@/db/schema/bureaux-etudes";

// ============================================================================
// Types
// ============================================================================

export type DrizzleClient = typeof defaultDb;

export interface FetchBEPageParams {
  page?: number;
  search?: string;
  specialty?: string;
}

export interface FetchBEPageResult {
  bureaux: BureauEtudes[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type UpsertBEInput = Omit<
  NewBureauEtudes,
  "id" | "organizationId" | "createdAt" | "updatedAt" | "solicitable"
>;

export type UpsertBEResult =
  | { ok: true; bureauEtudes: BureauEtudes }
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

export interface ImportBEResult {
  imported: number;
  updated: number;
  errors: string[];
}

// ============================================================================
// Constantes
// ============================================================================

const PAGE_SIZE = 25;
const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const BE_DOCS_BUCKET = "be-docs";

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
// 1. fetchBEPage — lecture paginée (tous rôles)
// ============================================================================

export async function fetchBEPage(
  params: FetchBEPageParams = {},
  dbClient: DrizzleClient = defaultDb,
): Promise<FetchBEPageResult> {
  const { page = 1, search, specialty } = params;
  const offset = (Math.max(1, page) - 1) * PAGE_SIZE;

  const conditions = [eq(bureauEtudes.organizationId, ALYOS_ORG_ID)];

  if (search && search.trim().length > 0) {
    const term = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(bureauEtudes.cabinet, term),
        ilike(bureauEtudes.contactName, term),
        ilike(bureauEtudes.email, term),
      )!,
    );
  }

  if (specialty && specialty.trim().length > 0) {
    conditions.push(sql`${bureauEtudes.specialtyCodes} @> ARRAY[${specialty.trim()}]::text[]`);
  }

  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    dbClient
      .select()
      .from(bureauEtudes)
      .where(where)
      .orderBy(bureauEtudes.cabinet)
      .limit(PAGE_SIZE)
      .offset(offset),
    dbClient.select({ total: count() }).from(bureauEtudes).where(where),
  ]);

  const total = countRows[0]?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  return {
    bureaux: rows,
    total,
    page: Math.max(1, page),
    pageSize: PAGE_SIZE,
    totalPages,
  };
}

// ============================================================================
// 2. upsertBE — création + mise à jour (admin uniquement)
// ============================================================================

export async function upsertBE(
  input: UpsertBEInput,
  id?: string,
  dbClient: DrizzleClient = defaultDb,
): Promise<UpsertBEResult> {
  const authClient = createSupabaseServerClient();

  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  const { profile } = authResult;

  if (!isAdmin(profile)) return { ok: false, error: "forbidden_role" };

  if (id !== undefined && !UUID_SHAPE.test(id)) {
    return { ok: false, error: "invalid_input" };
  }

  if (!input.cabinet || input.cabinet.trim().length === 0) {
    return { ok: false, error: "invalid_input" };
  }

  try {
    let result: BureauEtudes;

    if (id) {
      const rows = await dbClient
        .update(bureauEtudes)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(bureauEtudes.id, id), eq(bureauEtudes.organizationId, ALYOS_ORG_ID)))
        .returning();

      if (!rows[0]) return { ok: false, error: "not_found" };
      result = rows[0];
    } else {
      const rows = await dbClient
        .insert(bureauEtudes)
        .values({ ...input, organizationId: ALYOS_ORG_ID })
        .returning();

      if (!rows[0]) throw new Error("INSERT bureaux_etudes returned no row");
      result = rows[0];
    }

    return { ok: true, bureauEtudes: result };
  } catch (err) {
    console.error("[be-actions:upsert:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// 3. importBEFromCsv — import CSV (admin uniquement)
// ============================================================================

/**
 * Colonnes CSV attendues (ligne 1 = header ignoré) :
 *   cabinet,email,phone,siren,zip,city,specialty_codes,geo_zones,
 *   budget_min,budget_max,concours_only,tutoiement,notes
 *
 * `specialty_codes` et `geo_zones` : split sur `;` (pour éviter conflit avec la virgule CSV).
 * Upsert par `(organizationId, email)` si email présent, sinon INSERT.
 */
export async function importBEFromCsv(formData: FormData): Promise<ImportBEResult> {
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
    return { imported: 0, updated: 0, errors: ["Le fichier CSV est vide ou n'a pas de données."] };
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

    if (!cabinet) {
      errors.push(`Ligne ${i + 2} : cabinet manquant, ligne ignorée.`);
      continue;
    }

    try {
      if (email) {
        // Upsert par (organizationId, email)
        const existing = await defaultDb
          .select({ id: bureauEtudes.id })
          .from(bureauEtudes)
          .where(and(eq(bureauEtudes.organizationId, ALYOS_ORG_ID), eq(bureauEtudes.email, email)))
          .limit(1);

        if (existing[0]) {
          await defaultDb
            .update(bureauEtudes)
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
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(bureauEtudes.id, existing[0].id),
                eq(bureauEtudes.organizationId, ALYOS_ORG_ID),
              ),
            );
          updated++;
        } else {
          await defaultDb.insert(bureauEtudes).values({
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
          });
          imported++;
        }
      } else {
        // Pas d'email → INSERT simple
        await defaultDb.insert(bureauEtudes).values({
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
// Types publics documents BE
// ============================================================================

/** Résultat standard d'une mutation document BE. */
export type BeDocumentActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
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

export type BeDocumentRow = BeDocument;
export type { BeDocumentKind };

// ============================================================================
// 4. uploadBeDocument — upload Storage + enregistrement BDD (admin)
// ============================================================================

/**
 * Upload un document administratif vers le bucket Supabase Storage "be-docs"
 * (privé) et insère la métadonnée en BDD.
 *
 * Le chemin Storage est : `{organizationId}/{beId}/{timestamp}_{filename}`.
 * Réservé aux admins.
 *
 * @param beId      UUID du bureau d'études propriétaire
 * @param file      FormData contenant le champ "file" (File)
 * @param kind      Catégorie du document (BeDocumentKind)
 * @param label     Nom lisible affiché (ex. "DC1 — AO EDM 26 S 01")
 * @param expiresAt Date d'expiration optionnelle (null = pas d'expiration)
 */
export async function uploadBeDocument(
  beId: string,
  file: FormData,
  kind: BeDocumentKind,
  label: string,
  expiresAt?: Date | null,
  dbClient: DrizzleClient = defaultDb,
): Promise<BeDocumentActionResult<{ id: string }>> {
  const authClient = createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  if (!isAdmin(authResult.profile)) return { ok: false, error: "forbidden_role" };

  if (!UUID_SHAPE.test(beId)) return { ok: false, error: "invalid_input" };
  if (!label.trim()) return { ok: false, error: "invalid_input" };

  const rawFile = file.get("file");
  if (!(rawFile instanceof File)) return { ok: false, error: "invalid_input" };

  try {
    // Construction du chemin Storage
    const timestamp = Date.now();
    const sanitizedFilename = rawFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${ALYOS_ORG_ID}/${beId}/${timestamp}_${sanitizedFilename}`;

    // Upload vers Supabase Storage
    const supabaseAdmin = createSupabaseAdminClient();
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BE_DOCS_BUCKET)
      .upload(storagePath, rawFile, {
        contentType: rawFile.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      console.error("[be-actions:upload:storage:fail]", uploadError);
      return { ok: false, error: "internal_error" };
    }

    // Enregistrement BDD
    const rows = await dbClient
      .insert(beDocuments)
      .values({
        beId,
        organizationId: ALYOS_ORG_ID,
        kind,
        label: label.trim(),
        storagePath,
        filename: rawFile.name,
        uploadedBy: authResult.userId,
        expiresAt: expiresAt ?? null,
      })
      .returning({ id: beDocuments.id });

    if (!rows[0]) throw new Error("INSERT be_documents returned no row");

    revalidatePath(`/sourcing/bureaux-etudes/${beId}`);
    return { ok: true, data: { id: rows[0].id } };
  } catch (err) {
    console.error("[be-actions:upload:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// 5. deleteBeDocument — suppression Storage + BDD (admin)
// ============================================================================

/**
 * Supprime un document BE (fichier Storage + ligne BDD).
 * Réservé aux admins.
 *
 * @param documentId UUID du document à supprimer
 */
export async function deleteBeDocument(
  documentId: string,
  dbClient: DrizzleClient = defaultDb,
): Promise<BeDocumentActionResult> {
  const authClient = createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  if (!isAdmin(authResult.profile)) return { ok: false, error: "forbidden_role" };

  if (!UUID_SHAPE.test(documentId)) return { ok: false, error: "invalid_input" };

  try {
    // Récupération du chemin Storage + beId avant suppression
    const docs = await dbClient
      .select({
        storagePath: beDocuments.storagePath,
        beId: beDocuments.beId,
      })
      .from(beDocuments)
      .where(and(eq(beDocuments.id, documentId), eq(beDocuments.organizationId, ALYOS_ORG_ID)))
      .limit(1);

    if (!docs[0]) return { ok: false, error: "not_found" };

    const { storagePath, beId } = docs[0];

    // Suppression Storage (best-effort — on continue même si le fichier est déjà absent)
    const supabaseAdmin = createSupabaseAdminClient();
    const { error: storageError } = await supabaseAdmin.storage
      .from(BE_DOCS_BUCKET)
      .remove([storagePath]);

    if (storageError) {
      console.error("[be-actions:delete-doc:storage:fail]", storageError);
      // On continue quand même pour supprimer la métadonnée BDD
    }

    // Suppression BDD
    await dbClient
      .delete(beDocuments)
      .where(and(eq(beDocuments.id, documentId), eq(beDocuments.organizationId, ALYOS_ORG_ID)));

    revalidatePath(`/sourcing/bureaux-etudes/${beId}`);
    return { ok: true };
  } catch (err) {
    console.error("[be-actions:delete-doc:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// 6. getBeDocumentUrl — URL signée 60 min (tous rôles)
// ============================================================================

/**
 * Génère une URL signée Supabase Storage valable 60 minutes pour télécharger
 * un document BE.
 * Accessible à tous les rôles authentifiés AlyoS.
 *
 * @param documentId UUID du document
 */
export async function getBeDocumentUrl(
  documentId: string,
  dbClient: DrizzleClient = defaultDb,
): Promise<BeDocumentActionResult<{ url: string }>> {
  const authClient = createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;

  if (!UUID_SHAPE.test(documentId)) return { ok: false, error: "invalid_input" };

  try {
    // Vérification tenant + récupération du chemin Storage
    const docs = await dbClient
      .select({ storagePath: beDocuments.storagePath })
      .from(beDocuments)
      .where(and(eq(beDocuments.id, documentId), eq(beDocuments.organizationId, ALYOS_ORG_ID)))
      .limit(1);

    if (!docs[0]) return { ok: false, error: "not_found" };

    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error } = await supabaseAdmin.storage
      .from(BE_DOCS_BUCKET)
      .createSignedUrl(docs[0].storagePath, 60 * 60); // 60 minutes

    if (error || !data?.signedUrl) {
      console.error("[be-actions:download-url:fail]", error);
      return { ok: false, error: "internal_error" };
    }

    return { ok: true, data: { url: data.signedUrl } };
  } catch (err) {
    console.error("[be-actions:download-url:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// 7. listBeDocuments — lecture des documents d'un BE (tous rôles)
// ============================================================================

/**
 * Liste tous les documents d'un bureau d'études, triés par date d'upload.
 * Accessible à tous les rôles authentifiés.
 *
 * @param beId UUID du bureau d'études
 */
export async function listBeDocuments(
  beId: string,
  dbClient: DrizzleClient = defaultDb,
): Promise<BeDocumentRow[]> {
  const authClient = createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return [];

  if (!UUID_SHAPE.test(beId)) return [];

  try {
    const rows = await dbClient
      .select()
      .from(beDocuments)
      .where(and(eq(beDocuments.beId, beId), eq(beDocuments.organizationId, ALYOS_ORG_ID)))
      .orderBy(beDocuments.uploadedAt);

    return rows;
  } catch (err) {
    console.error("[be-actions:list-docs:fail]", err);
    return [];
  }
}
