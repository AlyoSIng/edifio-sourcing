"use server";

/**
 * Server Actions — module Bureaux d'Études (liste, édition, import CSV, RGPD, documents).
 *
 * Pattern calqué sur `src/app/sourcing/architectes/actions.ts`.
 *
 * Sécurité :
 *  - Auth check via `requireAlyosUser` (domaine @alyosingenierie.fr)
 *  - Filtre tenant explicite sur toutes les requêtes (orgId résolu via memberships)
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
import { audit } from "@/lib/audit";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import {
  getPappersBySiren,
  mapTrancheToHeadcount,
  searchPappersByName,
} from "@/lib/pappers/client";
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
  implantation?: string;
  /**
   * UUID de l'organisation courante (résolu par la page appelante via
   * `getRequiredOrgId`). **Requis** depuis le Lot 1.6-bis (Hugo 2026-06-09) —
   * plus de fallback `ALYOS_ORG_ID` silencieux qui fuyait cross-tenant
   * (vuln CC-2). Le caller doit gérer le `NoOrganizationMembershipError`
   * et rediriger vers `/no-org` avant d'appeler.
   */
  orgId: string;
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
  | { ok: true; userId: string; orgId: string; profile: ReturnType<typeof toUserProfile> }
  | { ok: false; error: "not_authenticated" | "forbidden_domain" }
> {
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };
  // ADR-014 (2026-06-05) — garde domaine retirée : ouverture multi-tenant.
  const profile = toUserProfile(user);
  const orgId = await getRequiredOrgId(user.id);
  return { ok: true, userId: user.id, orgId, profile };
}

// ============================================================================
// 1. fetchBEPage — lecture paginée (tous rôles)
// ============================================================================

export async function fetchBEPage(
  params: FetchBEPageParams,
  dbClient: DrizzleClient = defaultDb,
): Promise<FetchBEPageResult> {
  const { page = 1, search, specialty, implantation, orgId: resolvedOrgId } = params;
  const offset = (Math.max(1, page) - 1) * PAGE_SIZE;

  const conditions = [eq(bureauEtudes.organizationId, resolvedOrgId)];

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

  if (implantation && implantation.trim().length > 0) {
    conditions.push(ilike(bureauEtudes.zip, `${implantation.trim()}%`));
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
  const authClient = await createSupabaseServerClient();

  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  const { profile, orgId } = authResult;

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
        .where(and(eq(bureauEtudes.id, id), eq(bureauEtudes.organizationId, orgId)))
        .returning();

      if (!rows[0]) return { ok: false, error: "not_found" };
      result = rows[0];
    } else {
      const rows = await dbClient
        .insert(bureauEtudes)
        .values({ ...input, organizationId: orgId })
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
  const authClient = await createSupabaseServerClient();

  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) {
    return { imported: 0, updated: 0, errors: ["Non authentifié ou domaine non autorisé."] };
  }
  const { profile, orgId } = authResult;

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
          .where(and(eq(bureauEtudes.organizationId, orgId), eq(bureauEtudes.email, email)))
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
              and(eq(bureauEtudes.id, existing[0].id), eq(bureauEtudes.organizationId, orgId)),
            );
          updated++;
        } else {
          await defaultDb.insert(bureauEtudes).values({
            organizationId: orgId,
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
          organizationId: orgId,
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
  const authClient = await createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  if (!isAdmin(authResult.profile)) return { ok: false, error: "forbidden_role" };
  const { orgId: uploadOrgId } = authResult;

  if (!UUID_SHAPE.test(beId)) return { ok: false, error: "invalid_input" };
  if (!label.trim()) return { ok: false, error: "invalid_input" };

  const rawFile = file.get("file");
  if (!(rawFile instanceof File)) return { ok: false, error: "invalid_input" };

  try {
    // Construction du chemin Storage
    const timestamp = Date.now();
    const sanitizedFilename = rawFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${uploadOrgId}/${beId}/${timestamp}_${sanitizedFilename}`;

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
        organizationId: uploadOrgId,
        kind,
        label: label.trim(),
        storagePath,
        filename: rawFile.name,
        uploadedBy: authResult.userId,
        expiresAt: expiresAt ?? null,
      })
      .returning({ id: beDocuments.id });

    if (!rows[0]) throw new Error("INSERT be_documents returned no row");

    // Audit A20 — library_doc_upload (best-effort, hors transaction)
    await audit({
      action: "library_doc_upload",
      subjectType: "bureau_etudes",
      subjectId: beId,
      data: {
        subject_type: "bureau_etudes",
        subject_id: beId,
        kind,
        file_name: rawFile.name,
        size_bytes: rawFile.size,
        storage_path: storagePath,
      },
    });

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
  const authClient = await createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  if (!isAdmin(authResult.profile)) return { ok: false, error: "forbidden_role" };
  const { orgId: deleteOrgId } = authResult;

  if (!UUID_SHAPE.test(documentId)) return { ok: false, error: "invalid_input" };

  try {
    // Récupération du chemin Storage + métadonnées avant suppression
    const docs = await dbClient
      .select({
        storagePath: beDocuments.storagePath,
        beId: beDocuments.beId,
        kind: beDocuments.kind,
      })
      .from(beDocuments)
      .where(and(eq(beDocuments.id, documentId), eq(beDocuments.organizationId, deleteOrgId)))
      .limit(1);

    if (!docs[0]) return { ok: false, error: "not_found" };

    const { storagePath, beId, kind } = docs[0];

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
      .where(and(eq(beDocuments.id, documentId), eq(beDocuments.organizationId, deleteOrgId)));

    // Audit A21 — library_doc_delete (best-effort, hors transaction)
    await audit({
      action: "library_doc_delete",
      subjectType: "bureau_etudes",
      subjectId: beId,
      data: {
        subject_type: "bureau_etudes",
        subject_id: beId,
        document_id: documentId,
        kind,
        storage_path: storagePath,
      },
    });

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
  const authClient = await createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  const { orgId: urlOrgId } = authResult;

  if (!UUID_SHAPE.test(documentId)) return { ok: false, error: "invalid_input" };

  try {
    // Vérification tenant + récupération du chemin Storage
    const docs = await dbClient
      .select({ storagePath: beDocuments.storagePath })
      .from(beDocuments)
      .where(and(eq(beDocuments.id, documentId), eq(beDocuments.organizationId, urlOrgId)))
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
  const authClient = await createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return [];
  const { orgId: listOrgId } = authResult;

  if (!UUID_SHAPE.test(beId)) return [];

  try {
    const rows = await dbClient
      .select()
      .from(beDocuments)
      .where(and(eq(beDocuments.beId, beId), eq(beDocuments.organizationId, listOrgId)))
      .orderBy(beDocuments.uploadedAt);

    return rows;
  } catch (err) {
    console.error("[be-actions:list-docs:fail]", err);
    return [];
  }
}

// ============================================================================
// 8. enrichSingleBEFromPappers — enrichissement unitaire (admin)
// ============================================================================

/**
 * Résultat de l'enrichissement unitaire Pappers (architecte ou BE).
 * Note : le schema BE n'a pas de colonne `annualRevenue` — seuls `siren`
 * et `headcount` sont enrichis.
 */
export type EnrichSingleResult =
  | {
      ok: true;
      updated: boolean;
      /** Champs effectivement mis à jour (pour affichage UI). */
      changes: {
        siren?: string;
        headcount?: number;
      };
      /** Message résumé à afficher (ex: "SIREN 123456789 · Effectif 14"). */
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
 * Enrichit la fiche d'un seul bureau d'études depuis l'API Pappers.
 *
 * Stratégie identique à la moulinette bulk architectes :
 *  1. SIREN direct si renseigné
 *  2. Sinon recherche par nom cabinet (score ≥ 0.6 + NAF 711x)
 * Ne met à jour que les champs NULL (préserve les corrections manuelles).
 * Audit `architect_edit` après modification (action commune fiches partenaires).
 *
 * Note : le schema BE n'expose pas de colonne `annualRevenue` — seuls
 * `siren` et `headcount` sont enrichis.
 *
 * @param beId UUID du bureau d'études à enrichir
 */
export async function enrichSingleBEFromPappers(beId: string): Promise<EnrichSingleResult> {
  const authClient = await createSupabaseServerClient();

  // 1. Auth + domaine
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  const { profile, orgId: enrichOrgId } = authResult;

  // 2. Vérification rôle admin
  if (!isAdmin(profile)) {
    return { ok: false, error: "forbidden_role" };
  }

  // 3. Validation UUID
  if (!UUID_SHAPE.test(beId)) {
    return { ok: false, error: "invalid_input" };
  }

  // 4. Vérification clé API Pappers
  const apiKey = process.env.PAPPERS_API_KEY;
  if (!apiKey) {
    console.error("[pappers-enrich-single-be] PAPPERS_API_KEY manquante.");
    return { ok: false, error: "pappers_unavailable" };
  }

  try {
    // 5. Récupération du BE (filtré tenant)
    const rows = await defaultDb
      .select()
      .from(bureauEtudes)
      .where(and(eq(bureauEtudes.id, beId), eq(bureauEtudes.organizationId, enrichOrgId)))
      .limit(1);

    const be = rows[0];
    if (!be) return { ok: false, error: "not_found" };

    // 6. Appel Pappers (même logique que le bulk architectes)
    let foundSiren: string | null = null;
    let pappers: { tranche_effectif_salarie?: string; chiffre_affaires?: number } | null = null;

    if (be.siren) {
      // Stratégie 1 : lookup direct par SIREN
      const result = await getPappersBySiren(be.siren, apiKey);
      if (result) {
        foundSiren = be.siren;
        pappers = result;
      }
    } else if (be.cabinet) {
      // Stratégie 2 : recherche par nom cabinet
      const searchResult = await searchPappersByName(be.cabinet, apiKey);
      const resultats = searchResult?.resultats_entreprises ?? [];

      if (resultats.length === 1 && resultats[0]) {
        const hit = resultats[0];
        const score = hit.score ?? 0;
        const codeNaf = hit.siege?.code_naf ?? "";

        // Retenir si score suffisant ET activité ingénierie/architecture (NAF 711x)
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

    const needsUpdate =
      (be.siren === null && foundSiren !== null) ||
      (be.headcount === null && newHeadcount !== null);

    if (!needsUpdate) {
      return {
        ok: true,
        updated: false,
        changes: {},
        summary: "Fiche déjà complète.",
      };
    }

    // 9. Construction des changements effectifs
    const changes: { siren?: string; headcount?: number } = {};
    if (be.siren === null && foundSiren !== null) changes.siren = foundSiren;
    if (be.headcount === null && newHeadcount !== null) changes.headcount = newHeadcount;

    // 10. UPDATE BDD
    await defaultDb
      .update(bureauEtudes)
      .set({
        siren: be.siren ?? foundSiren,
        headcount: be.headcount ?? newHeadcount,
        updatedAt: new Date(),
      })
      .where(and(eq(bureauEtudes.id, be.id), eq(bureauEtudes.organizationId, enrichOrgId)));

    // 11. Audit (best-effort)
    await audit({
      action: "architect_edit",
      subjectType: "architect",
      subjectId: be.id,
      data: {
        operation: "update",
        be_id: be.id,
        cabinet: be.cabinet,
        enriched_fields: Object.keys(changes),
        source: "pappers_single",
      },
    });

    // 12. Construction du résumé lisible
    const summaryParts: string[] = [];
    if (changes.siren) summaryParts.push(`SIREN ${changes.siren}`);
    if (changes.headcount !== undefined)
      summaryParts.push(`Effectif ${changes.headcount.toLocaleString("fr-FR")}`);
    const summary = summaryParts.join(" · ");

    return { ok: true, updated: true, changes, summary };
  } catch (err) {
    console.error("[be-actions:enrich-single:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// deleteBEAction — suppression hard (admin uniquement)
// ============================================================================

export type DeleteBEResult =
  | { ok: true }
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

/**
 * Supprime définitivement un bureau d'études du tenant AlyoS.
 *
 * Guards :
 *  - UUID valide
 *  - Admin uniquement (domaine @alyosingenierie.fr)
 *  - Filtre tenant sur le DELETE (orgId résolu via memberships)
 *
 * Note : pas de guard `has_active_solicitations` — la table `be_responses`
 * n'existe pas encore (Phase 2 Tandem BE).
 *
 * Audit `architect_edit` avec `operation: 'delete'` après suppression.
 *
 * @param beId — UUID du bureau d'études à supprimer
 */
export async function deleteBEAction(
  beId: string,
  dbClient: DrizzleClient = defaultDb,
): Promise<DeleteBEResult> {
  const authClient = await createSupabaseServerClient();

  // 1. Auth + domaine
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  const { profile, orgId: deleteBeOrgId } = authResult;

  // 2. Vérification rôle admin
  if (!isAdmin(profile)) {
    return { ok: false, error: "forbidden_role" };
  }

  // 3. Validation UUID
  if (!UUID_SHAPE.test(beId)) {
    return { ok: false, error: "invalid_input" };
  }

  try {
    // 4. DELETE tenant-scoped
    const deleted = await dbClient
      .delete(bureauEtudes)
      .where(and(eq(bureauEtudes.id, beId), eq(bureauEtudes.organizationId, deleteBeOrgId)))
      .returning({ id: bureauEtudes.id });

    if (!deleted[0]) {
      return { ok: false, error: "not_found" };
    }

    // 5. Audit (best-effort)
    await audit({
      action: "architect_edit",
      subjectType: "architect",
      subjectId: beId,
      data: {
        operation: "delete",
        be_id: beId,
      },
    });

    return { ok: true };
  } catch (err) {
    console.error("[be-actions:delete:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}
