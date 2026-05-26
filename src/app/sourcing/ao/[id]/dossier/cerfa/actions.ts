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

export const runtime = "nodejs";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray } from "drizzle-orm";

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
// Types retour
// ---------------------------------------------------------------------------

export interface ValidateCerfaResult {
  ok: boolean;
  error?:
    | "not_authenticated"
    | "tender_not_found"
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

    // 2. Vérification ownership du tender
    const [tender] = await db
      .select({ id: tenders.id })
      .from(tenders)
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, ALYOS_ORG_ID)))
      .limit(1);

    if (!tender) return { ok: false, error: "tender_not_found" };

    // 3. Validation des champs requis non remplis
    const missing = fields
      .filter((f) => f.required && f.source === "a_completer" && f.value.trim() === "")
      .map((f) => f.field_id);

    if (missing.length > 0) {
      return { ok: false, error: "missing_required_fields", missing };
    }

    // 4. Sérialisation JSON
    const payload = {
      cerfa_kind: cerfaKind,
      fields,
      validated_at: new Date().toISOString(),
    };
    const json = JSON.stringify(payload);
    const jsonBuffer = Buffer.from(json, "utf-8");

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
      // Nettoyage Storage best-effort en cas d'échec BDD
      await auth.supabase.storage.from(BUCKET).remove([storagePath]);
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
