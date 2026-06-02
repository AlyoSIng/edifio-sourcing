"use server";

/**
 * Server Actions — page CERFA `/sourcing/ao/[id]/dossier/cerfa`.
 *
 * Action principale :
 *   `validateCerfa` : valide un formulaire DC1 ou DC2, sérialise les champs
 *   en JSON, upload vers Supabase Storage, insère un enregistrement
 *   `response_files` et revalide le cache de la page.
 *
 * Sécurité :
 *   - Auth check obligatoire (defense in depth)
 *   - Filtre `organizationId = orgId` sur tous les inserts
 *   - Validation des champs requis avant tout write
 *
 * Source de vérité : brief Board PR-C 2026-05-25.
 */

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { responseFiles } from "@/db/schema/library";
import { architectResponses } from "@/db/schema/selections";
import { tenders } from "@/db/schema/tenders";
import { toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import type { CerfaField } from "@/lib/dossier/cerfa-prefill";

// ---------------------------------------------------------------------------
// Constante bucket
// ---------------------------------------------------------------------------

/** Bucket Supabase Storage pour les pièces de réponse. */
const BUCKET = "response_files";

// ---------------------------------------------------------------------------
// Validation UUID (B-1) + Zod schema fields (B-2)
// ---------------------------------------------------------------------------

/** Regex UUID v4. Utilisée en défense profonde dans les Server Actions. */
const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Valeurs autorisées pour `cerfaKind`. */
const VALID_CERFA_KINDS = new Set(["DC1", "DC2"]);

/** Taille maximale du JSON sérialisé avant upload Storage (512 Ko). */
const MAX_JSON_SIZE_BYTES = 512 * 1024;

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
    | "missing_required_fields"
    | "storage_upload_failed"
    | "db_insert_failed"
    | "internal_error";
  /** Champs obligatoires manquants (présent si error = 'missing_required_fields'). */
  missing?: string[];
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
 */
export async function validateCerfa(
  tenderId: string,
  cerfaKind: "DC1" | "DC2",
  fields: CerfaField[],
  architectId: string | null = null,
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

    // B-2 : Validation Zod des champs reçus du client
    const fieldsResult = cerfaFieldsSchema.safeParse(fields);
    if (!fieldsResult.success) {
      console.warn("[cerfa:validate:fields:invalid]", fieldsResult.error.flatten());
      return { ok: false, error: "invalid_input" };
    }
    const validatedFields = fieldsResult.data;

    // 2. Vérification ownership du tender
    const [tender] = await db
      .select({ id: tenders.id })
      .from(tenders)
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, auth.orgId)))
      .limit(1);

    if (!tender) return { ok: false, error: "tender_not_found" };

    // 2bis. Phase 3 : defense in depth — l'archi doit avoir status='accepted'
    // sur ce tender pour cette org. Un UUID arbitraire (même celui d'un archi
    // existant) est rejeté s'il n'a pas accepté la sollicitation.
    if (architectId != null) {
      const [acceptedRow] = await db
        .select({ id: architectResponses.id })
        .from(architectResponses)
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
    }

    // 3. Validation des champs requis non remplis (sur le tableau validé Zod)
    const missing = validatedFields
      .filter((f) => f.required && f.source === "a_completer" && f.value.trim() === "")
      .map((f) => f.field_id);

    if (missing.length > 0) {
      return { ok: false, error: "missing_required_fields", missing };
    }

    // 4. Sérialisation JSON (avec les champs validés côté serveur)
    const payload = {
      cerfa_kind: cerfaKind,
      fields: validatedFields,
      validated_at: new Date().toISOString(),
    };
    const json = JSON.stringify(payload);
    const jsonBuffer = Buffer.from(json, "utf-8");

    // B-2 : Limite de taille globale du payload (anti-DoS Storage)
    if (jsonBuffer.byteLength > MAX_JSON_SIZE_BYTES) {
      console.warn("[cerfa:validate:payload:too-large]", jsonBuffer.byteLength);
      return { ok: false, error: "invalid_input" };
    }

    // 5. Upload Supabase Storage
    const filename = `${cerfaKind.toLowerCase()}_${Date.now()}.json`;
    const storagePath = `${auth.orgId}/${tenderId}/cerfa/${filename}`;

    // Storage admin : RLS bypass intentionnel — auth vérifiée L.133
    const supabaseAdmin = createSupabaseAdminClient();
    const { error: storageError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, jsonBuffer, {
        contentType: "application/json",
        upsert: false,
      });

    if (storageError) {
      console.error("[cerfa:validate:storage:fail]", storageError);
      return { ok: false, error: "storage_upload_failed" };
    }

    // 6. Insert response_files
    const label = cerfaKind === "DC1" ? "DC1 pré-rempli" : "DC2 pré-rempli";
    try {
      await db.insert(responseFiles).values({
        tenderId,
        organizationId: auth.orgId,
        kind: cerfaKind.toLowerCase(),
        name: label,
        storagePath,
        sizeBytes: jsonBuffer.byteLength,
        validated: true,
        // Phase 3 Tandem multi-archi — lien optionnel vers l'archi mandataire.
        architectId,
      });
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

    // 7. Revalidation cache
    revalidatePath(`/sourcing/ao/${tenderId}/dossier/cerfa`);
    return { ok: true };
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
