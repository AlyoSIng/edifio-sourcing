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
 *   - Filtre `organizationId = ALYOS_ORG_ID` sur tous les inserts
 *   - Validation des champs requis avant tout write
 *
 * Source de vérité : brief Board PR-C 2026-05-25.
 */

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { responseFiles } from "@/db/schema/library";
import { tenders } from "@/db/schema/tenders";
import { toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  return { supabase, profile: toUserProfile(user) };
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
 *   3. Validation des champs requis (tous les required + a_completer doivent avoir une value)
 *   4. Sérialisation JSON
 *   5. Upload Supabase Storage : `{orgId}/{tenderId}/cerfa/{kind}_{timestamp}.json`
 *   6. Insert `response_files`
 *   7. `revalidatePath`
 *
 * @param tenderId  UUID du tender
 * @param cerfaKind 'DC1' | 'DC2'
 * @param fields    État courant des champs (après saisie utilisateur)
 */
export async function validateCerfa(
  tenderId: string,
  cerfaKind: "DC1" | "DC2",
  fields: CerfaField[],
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
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, ALYOS_ORG_ID)))
      .limit(1);

    if (!tender) return { ok: false, error: "tender_not_found" };

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
    const storagePath = `${ALYOS_ORG_ID}/${tenderId}/cerfa/${filename}`;

    const { error: storageError } = await auth.supabase.storage
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
        organizationId: ALYOS_ORG_ID,
        kind: cerfaKind.toLowerCase(),
        name: label,
        storagePath,
        sizeBytes: jsonBuffer.byteLength,
        validated: true,
      });
    } catch (err) {
      console.error("[cerfa:validate:db:fail]", err);
      // Nettoyage Storage best-effort en cas d'échec BDD (W-4 : on logue le résultat)
      const { error: removeErr } = await auth.supabase.storage.from(BUCKET).remove([storagePath]);
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
 */
export async function loadExistingCerfa(tenderId: string): Promise<{
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
        eq(responseFiles.organizationId, ALYOS_ORG_ID),
        inArray(responseFiles.kind, ["dc1", "dc2"]),
      ),
    )
    .orderBy(desc(responseFiles.createdAt));

  // On prend le plus récent par kind
  const dc1 = rows.find((r) => r.kind === "dc1") ?? null;
  const dc2 = rows.find((r) => r.kind === "dc2") ?? null;

  return { dc1, dc2 };
}
