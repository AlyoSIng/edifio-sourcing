"use server";

/**
 * Server Actions — page CERFA `/sourcing/ao/[id]/dossier/cerfa`.
 *
 * Actions principales :
 *   `validateCerfa` : valide un formulaire DC1 ou DC2, génère un PDF formaté
 *     via pdf-lib, upload vers Supabase Storage, insère un enregistrement
 *     `response_files` et revalide le cache de la page.
 *   `getCerfaSignedUrl` : retourne une URL signée Supabase Storage (1 heure)
 *     pour télécharger le PDF DC1/DC2 validé. Vérifie l'ownership tenant.
 *
 * Sécurité :
 *   - Auth check obligatoire (defense in depth)
 *   - Filtre `organizationId = orgId` sur tous les inserts et lectures
 *   - Validation des champs requis avant tout write
 *
 * Source de vérité : brief Board PR-C 2026-05-25 + brief Lot A 2026-06-02
 *   (passage JSON → PDF téléchargeable).
 */

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { organizations } from "@/db/schema/organizations";
import { responseFiles } from "@/db/schema/library";
import { architects } from "@/db/schema/architects";
import { bureauEtudes } from "@/db/schema/bureaux-etudes";
import { architectResponses } from "@/db/schema/selections";
import { tenderBeCotraitants } from "@/db/schema/tender-cotraitants";
import { tenders } from "@/db/schema/tenders";
import { toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import type { CerfaField } from "@/lib/dossier/cerfa-prefill";
import { generateCerfaPdf } from "@/lib/dossier/cerfa-pdf";

// ---------------------------------------------------------------------------
// Constante bucket
// ---------------------------------------------------------------------------

/** Bucket Supabase Storage pour les pièces de réponse. */
const BUCKET = "response_files";

/** Durée de validité de l'URL signée renvoyée par `getCerfaSignedUrl` (1 heure). */
const SIGNED_URL_SECONDS = 3600;

// ---------------------------------------------------------------------------
// Validation UUID (B-1) + Zod schema fields (B-2)
// ---------------------------------------------------------------------------

/** Regex UUID v4. Utilisée en défense profonde dans les Server Actions. */
const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Valeurs autorisées pour `cerfaKind`. */
const VALID_CERFA_KINDS = new Set(["DC1", "DC2"]);

/** Taille maximale du PDF généré avant upload Storage (1 Mo — large marge pour Helvetica + 2-3 pages). */
const MAX_PDF_SIZE_BYTES = 1024 * 1024;

/**
 * Schéma Zod pour un champ CERFA reçu du client.
 *
 * Surface réseau : la Server Action reçoit les `fields` directement du client
 * (Next.js ne valide pas les arguments à l'exécution). Ce schéma garantit :
 *  - `field_id` : format slug alphanumérique sécurisé (pas d'injection chemin)
 *  - `value` : bornée à 500 chars
 *  - `source` : enum strict (pas de valeur fantaisiste persistée)
 *  - Tableau max 50 éléments (anti-DoS mémoire / Storage)
 */
const cerfaFieldSchema = z.object({
  field_id: z
    .string()
    .regex(/^[a-z0-9_]+$/, "field_id doit être alphanumérique snake_case")
    .max(64),
  field_label: z.string().max(200),
  value: z.string().max(500),
  source: z.enum(["company_data", "tender_data", "a_completer"]),
  required: z.boolean(),
});

const cerfaFieldsSchema = z.array(cerfaFieldSchema).max(50, "Trop de champs CERFA (max 50)");

// ---------------------------------------------------------------------------
// Types retour
// ---------------------------------------------------------------------------

export interface ValidateCerfaResult {
  ok: boolean;
  error?:
    | "not_authenticated"
    | "tender_not_found"
    | "invalid_input"
    | "architect_not_accepted"
    | "be_not_cotraitant"
    | "missing_required_fields"
    | "storage_upload_failed"
    | "db_insert_failed"
    | "internal_error";
  /** Champs obligatoires manquants (présent si error = 'missing_required_fields'). */
  missing?: string[];
  /**
   * UUID du `response_files` créé en cas de succès — permet au client
   * d'appeler `getCerfaSignedUrl` pour proposer immédiatement le téléchargement
   * du PDF sans avoir à refetch la page.
   */
  responseFileId?: string;
}

// ---------------------------------------------------------------------------
// Helper : auth
// ---------------------------------------------------------------------------

async function getAuthenticatedUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const orgId = await getRequiredOrgId(user.id);
  return { supabase, profile: toUserProfile(user), orgId };
}

// ---------------------------------------------------------------------------
// Action : validateCerfa
// ---------------------------------------------------------------------------

/**
 * Valide un formulaire DC1 ou DC2 et persiste le résultat.
 *
 * Workflow :
 *   1. Auth check
 *   2. Vérification que le tender appartient à l'org
 *   2bis. (Phase 3 Tandem multi-archi) si `architectId` fourni : vérifie que
 *        cet archi a `architect_responses.status = 'accepted'` pour ce tender
 *        (defense in depth — un UUID arbitraire ne suffit pas).
 *   3. Validation des champs requis (tous les required + a_completer doivent avoir une value)
 *   4. Sérialisation JSON
 *   5. Upload Supabase Storage : `{orgId}/{tenderId}/cerfa/{kind}_{timestamp}.json`
 *   6. Insert `response_files` (avec `architect_id` si Phase 3)
 *   7. `revalidatePath`
 *
 * @param tenderId    UUID du tender
 * @param cerfaKind   'DC1' | 'DC2'
 * @param fields      État courant des champs (après saisie utilisateur)
 * @param architectId UUID de l'architecte mandataire (Phase 3 Tandem multi-archi).
 *                    NULL pour Solo / Cotraitance BE. La présence d'un UUID
 *                    sera validée contre `architect_responses.status='accepted'`.
 * @param beId        UUID du BE cotraitant (Lot B — Cotraitance BE). NULL pour
 *                    DC1 ou pour DC2 standard (AlyoS). La présence d'un UUID
 *                    sera validée contre `tender_be_cotraitants` pour ce tender.
 */
export async function validateCerfa(
  tenderId: string,
  cerfaKind: "DC1" | "DC2",
  fields: CerfaField[],
  architectId: string | null = null,
  beId: string | null = null,
): Promise<ValidateCerfaResult> {
  try {
    // 1. Auth check
    const auth = await getAuthenticatedUser();
    if (!auth) return { ok: false, error: "not_authenticated" };

    // B-1 : Validation UUID + cerfaKind contre liste blanche
    // (les Server Actions sont une surface réseau — le type TS ne suffit pas)
    if (!UUID_SHAPE.test(tenderId)) {
      return { ok: false, error: "tender_not_found" };
    }
    if (!VALID_CERFA_KINDS.has(cerfaKind)) {
      return { ok: false, error: "invalid_input" };
    }
    // Phase 3 : si `architectId` fourni, valider la forme UUID (défense profonde).
    if (architectId != null && !UUID_SHAPE.test(architectId)) {
      return { ok: false, error: "invalid_input" };
    }
    // Lot B : si `beId` fourni, valider la forme UUID (défense profonde).
    if (beId != null && !UUID_SHAPE.test(beId)) {
      return { ok: false, error: "invalid_input" };
    }

    // B-2 : Validation Zod des champs reçus du client
    const fieldsResult = cerfaFieldsSchema.safeParse(fields);
    if (!fieldsResult.success) {
      console.warn("[cerfa:validate:fields:invalid]", fieldsResult.error.flatten());
      return { ok: false, error: "invalid_input" };
    }
    const validatedFields = fieldsResult.data;

    // 2. Vérification ownership du tender + chargement title/buyer
    //    (nécessaires pour l'en-tête du PDF généré L.~268).
    const [tender] = await db
      .select({ id: tenders.id, title: tenders.title, buyer: tenders.buyer })
      .from(tenders)
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, auth.orgId)))
      .limit(1);

    if (!tender) return { ok: false, error: "tender_not_found" };

    // 2bis. Phase 3 : defense in depth — l'archi doit avoir status='accepted'
    // sur ce tender pour cette org. Un UUID arbitraire (même celui d'un archi
    // existant) est rejeté s'il n'a pas accepté la sollicitation.
    // On charge en même temps le `cabinet` pour l'afficher dans le PDF.
    let archiCabinet: string | null = null;
    if (architectId != null) {
      const [acceptedRow] = await db
        .select({
          id: architectResponses.id,
          cabinet: architects.cabinet,
        })
        .from(architectResponses)
        .innerJoin(architects, eq(architectResponses.architectId, architects.id))
        .where(
          and(
            eq(architectResponses.tenderId, tenderId),
            eq(architectResponses.organizationId, auth.orgId),
            eq(architectResponses.architectId, architectId),
            eq(architectResponses.status, "accepted"),
          ),
        )
        .limit(1);

      if (!acceptedRow) {
        console.warn("[cerfa:validate:archi:not-accepted]", { tenderId, architectId });
        return { ok: false, error: "architect_not_accepted" };
      }
      archiCabinet = acceptedRow.cabinet;
    }

    // 2ter. Lot B : defense in depth — le BE doit être présent dans
    // `tender_be_cotraitants` pour ce tender et cette org. Un UUID arbitraire
    // (même celui d'un BE valide de l'org) est rejeté s'il n'a pas été ajouté
    // explicitement comme cotraitant pour cet AO.
    let beCabinet: string | null = null;
    if (beId != null) {
      const [beRow] = await db
        .select({
          id: tenderBeCotraitants.id,
          cabinet: bureauEtudes.cabinet,
        })
        .from(tenderBeCotraitants)
        .innerJoin(bureauEtudes, eq(tenderBeCotraitants.beId, bureauEtudes.id))
        .where(
          and(
            eq(tenderBeCotraitants.tenderId, tenderId),
            eq(tenderBeCotraitants.organizationId, auth.orgId),
            eq(tenderBeCotraitants.beId, beId),
            eq(bureauEtudes.organizationId, auth.orgId),
          ),
        )
        .limit(1);

      if (!beRow) {
        console.warn("[cerfa:validate:be:not-cotraitant]", { tenderId, beId });
        return { ok: false, error: "be_not_cotraitant" };
      }
      beCabinet = beRow.cabinet;
    }

    // 3. Validation des champs requis non remplis (sur le tableau validé Zod)
    const missing = validatedFields
      .filter((f) => f.required && f.source === "a_completer" && f.value.trim() === "")
      .map((f) => f.field_id);

    if (missing.length > 0) {
      return { ok: false, error: "missing_required_fields", missing };
    }

    // 4. Chargement du nom d'organisation (pour le footer du PDF)
    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, auth.orgId))
      .limit(1);
    const organizationName = org?.name ?? "AlyoS Ingénierie";

    // 5. Génération du PDF formaté via pdf-lib (cf. cerfa-pdf.ts)
    //    On utilise `field_label` (issu de cerfa-prefill) comme libellé humain
    //    dans le PDF — il est cohérent avec ce que l'utilisateur a vu en saisie.
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await generateCerfaPdf({
        kind: cerfaKind === "DC1" ? "dc1" : "dc2",
        tenderTitle: tender.title,
        tenderBuyer: tender.buyer,
        organizationName,
        selectedArchitect: archiCabinet ? { cabinet: archiCabinet } : null,
        selectedBe: beCabinet ? { cabinet: beCabinet } : null,
        fields: validatedFields.map((f) => ({
          id: f.field_id,
          label: f.field_label,
          value: f.value,
          source: f.source,
        })),
        generatedAt: new Date(),
      });
    } catch (err) {
      console.error("[cerfa:validate:pdf:fail]", err);
      return { ok: false, error: "internal_error" };
    }

    // B-2 : Limite de taille globale du payload (anti-DoS Storage)
    if (pdfBytes.byteLength > MAX_PDF_SIZE_BYTES) {
      console.warn("[cerfa:validate:pdf:too-large]", pdfBytes.byteLength);
      return { ok: false, error: "invalid_input" };
    }

    // 6. Upload Supabase Storage (PDF)
    const filename = `${cerfaKind.toLowerCase()}_${Date.now()}.pdf`;
    const storagePath = `${auth.orgId}/${tenderId}/cerfa/${filename}`;

    // Storage admin : RLS bypass intentionnel — auth vérifiée L.133
    const supabaseAdmin = createSupabaseAdminClient();
    // Supabase Storage SDK accepte Uint8Array, Blob, File, Buffer. On caste en
    // Buffer pour rester homogène avec les autres uploads du module.
    const pdfBuffer = Buffer.from(pdfBytes);
    const { error: storageError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (storageError) {
      console.error("[cerfa:validate:storage:fail]", storageError);
      return { ok: false, error: "storage_upload_failed" };
    }

    // 7. Insert response_files (format PDF — l'ancien JSON n'est plus stocké :
    //    pour ré-éditer, l'utilisateur recommence depuis les pré-remplis,
    //    cf. décision pragmatique brief Lot A 2026-06-02).
    const label =
      cerfaKind === "DC1" ? "DC1 — Lettre de candidature" : "DC2 — Déclaration du candidat";
    let insertedId: string;
    try {
      const inserted = await db
        .insert(responseFiles)
        .values({
          tenderId,
          organizationId: auth.orgId,
          kind: cerfaKind.toLowerCase(),
          name: label,
          storagePath,
          sizeBytes: pdfBuffer.byteLength,
          validated: true,
          // Phase 3 Tandem multi-archi — lien optionnel vers l'archi mandataire.
          architectId,
          // Lot B Cotraitance BE — lien optionnel vers le BE cotraitant (DC2).
          beId,
        })
        .returning({ id: responseFiles.id });
      const row = inserted[0];
      if (!row) throw new Error("insert returned no row");
      insertedId = row.id;
    } catch (err) {
      console.error("[cerfa:validate:db:fail]", err);
      // Nettoyage Storage best-effort en cas d'échec BDD
      // Storage admin : RLS bypass intentionnel — auth vérifiée L.133
      const { error: removeErr } = await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
      if (removeErr) {
        console.error("[cerfa:validate:storage:cleanup:fail]", removeErr);
      }
      return { ok: false, error: "db_insert_failed" };
    }

    // 8. Revalidation cache + retour de l'ID pour le client (bouton télécharger)
    revalidatePath(`/sourcing/ao/${tenderId}/dossier/cerfa`);
    return { ok: true, responseFileId: insertedId };
  } catch (err) {
    console.error("[cerfa:validate:unhandled]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ---------------------------------------------------------------------------
// Helper exporté : charger les response_files existants DC1/DC2
// (utilisé dans le Server Component page.tsx)
// ---------------------------------------------------------------------------

export type ExistingCerfa = {
  id: string;
  kind: string;
  name: string;
  storagePath: string;
  createdAt: Date;
};

/**
 * Charge les derniers fichiers DC1 et DC2 validés pour un tender.
 * Retourne null pour chaque kind absent.
 *
 * @param tenderId UUID du tender
 * @param orgId    Organisation du tenant (résolu par l'appelant via getRequiredOrgId)
 */
export async function loadExistingCerfa(
  tenderId: string,
  orgId: string,
): Promise<{
  dc1: ExistingCerfa | null;
  dc2: ExistingCerfa | null;
}> {
  // B-1 : validation UUID défensive (loadExistingCerfa est exportée — peut être
  // appelée depuis d'autres contextes que le Server Component CerfaPage)
  if (!UUID_SHAPE.test(tenderId)) {
    return { dc1: null, dc2: null };
  }

  const rows = await db
    .select({
      id: responseFiles.id,
      kind: responseFiles.kind,
      name: responseFiles.name,
      storagePath: responseFiles.storagePath,
      createdAt: responseFiles.createdAt,
    })
    .from(responseFiles)
    .where(
      and(
        eq(responseFiles.tenderId, tenderId),
        eq(responseFiles.organizationId, orgId),
        inArray(responseFiles.kind, ["dc1", "dc2"]),
      ),
    )
    .orderBy(desc(responseFiles.createdAt));

  // On prend le plus récent par kind
  const dc1 = rows.find((r) => r.kind === "dc1") ?? null;
  const dc2 = rows.find((r) => r.kind === "dc2") ?? null;

  return { dc1, dc2 };
}

// ---------------------------------------------------------------------------
// Action : getCerfaSignedUrl
// ---------------------------------------------------------------------------

export interface GetCerfaSignedUrlResult {
  ok: boolean;
  error?: "not_authenticated" | "invalid_input" | "file_not_found" | "signed_url_failed";
  /** URL signée Supabase Storage valable 1 heure. */
  url?: string;
}

/**
 * Retourne une URL signée Supabase Storage (1 heure) pour télécharger le PDF
 * d'un `response_file` DC1/DC2.
 *
 * Sécurité :
 *   - Auth check obligatoire
 *   - UUID validation défensive
 *   - Filtre `organizationId = orgId` (un user ne peut pas obtenir une URL
 *     vers un fichier d'une autre org, même en connaissant l'UUID)
 *   - Filtre `kind IN ('dc1','dc2')` (cette action ne sert que pour les CERFA)
 *
 * @param responseFileId UUID du `response_files` ciblé
 */
export async function getCerfaSignedUrl(responseFileId: string): Promise<GetCerfaSignedUrlResult> {
  try {
    // 1. Auth check
    const auth = await getAuthenticatedUser();
    if (!auth) return { ok: false, error: "not_authenticated" };

    // 2. UUID validation défensive (surface réseau Server Action)
    if (!UUID_SHAPE.test(responseFileId)) {
      return { ok: false, error: "invalid_input" };
    }

    // 3. Lookup tenant-scoped — l'org doit matcher pour éviter
    //    qu'un user obtienne une URL vers le DC1 d'une autre organisation
    //    en devinant un UUID (defense in depth en plus de la RLS BDD).
    const [row] = await db
      .select({
        id: responseFiles.id,
        storagePath: responseFiles.storagePath,
        kind: responseFiles.kind,
      })
      .from(responseFiles)
      .where(
        and(
          eq(responseFiles.id, responseFileId),
          eq(responseFiles.organizationId, auth.orgId),
          inArray(responseFiles.kind, ["dc1", "dc2"]),
        ),
      )
      .limit(1);

    if (!row) {
      return { ok: false, error: "file_not_found" };
    }

    // 4. Signer l'URL côté admin (RLS bypass intentionnel — auth + tenant
    //    déjà vérifiés ci-dessus).
    const supabaseAdmin = createSupabaseAdminClient();
    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(row.storagePath, SIGNED_URL_SECONDS);

    if (signedError || !signed?.signedUrl) {
      console.error("[cerfa:signed-url:fail]", signedError);
      return { ok: false, error: "signed_url_failed" };
    }

    return { ok: true, url: signed.signedUrl };
  } catch (err) {
    console.error("[cerfa:signed-url:unhandled]", err);
    return { ok: false, error: "signed_url_failed" };
  }
}
