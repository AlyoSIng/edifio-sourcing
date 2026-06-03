"use server";

/**
 * Server Action — indexation IA des items presentation_library (chantier E).
 *
 * Décision Steve 2026-06-03 — MVP minimaliste :
 *  - Bouton « Indexer la biblio » sur la page admin.
 *  - L'action parcourt en séquence tous les items NON indexés (ou dont le
 *    `source_hash` a changé) et appelle Claude Haiku 4.5 pour chacun.
 *  - Limite hard : 15 items par call pour éviter le timeout Vercel 60s
 *    (Haiku ≈ 3-5s par doc → ~60s pour 15 docs).
 *  - Tous les items sont stockés dans `library_item_index` (upsert).
 *
 * Sécurité :
 *  - Admin only (requireAdmin).
 *  - Filtre tenant strict (orgId).
 *  - Storage admin (service_role) pour télécharger les PDF.
 *
 * Audit : 1 entrée `ai_runs` par item indexé. Côté UI on remonte les compteurs
 * { indexed, failed, skipped }.
 */

import { createHash } from "crypto";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { libraryItemIndex } from "@/db/schema/library-index";
import { presentationLibrary } from "@/db/schema/library";
import { toUserProfile, isAdmin } from "@/lib/auth/types";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { indexLibraryItem } from "@/lib/library/index-item";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Hard limit Vercel (60s timeout pour Server Actions). */
const MAX_ITEMS_PER_RUN = 15;

const BUCKET = "company_library";

// ---------------------------------------------------------------------------
// Types de retour
// ---------------------------------------------------------------------------

export type IndexLibraryError =
  | "not_authenticated"
  | "forbidden_domain"
  | "forbidden_role"
  | "internal_error";

export interface IndexLibraryResult {
  ok: boolean;
  error?: IndexLibraryError;
  /** Items indexés avec succès (premier lot — si > limit, les autres restent à traiter). */
  indexed: number;
  /** Items pour lesquels Claude a planté ou parsé invalide. */
  failed: number;
  /** Items sautés car déjà indexés et inchangés. */
  skipped: number;
  /** Items restants après ce batch (pour permettre à l'UI de relancer). */
  remaining: number;
  /** Liste des erreurs détaillées (nom de l'item + message court). */
  errors?: Array<{ name: string; message: string }>;
}

// ---------------------------------------------------------------------------
// Action principale
// ---------------------------------------------------------------------------

/**
 * Indexe (ou ré-indexe) les items biblio non encore traités ou dont le contenu
 * Storage a changé depuis la dernière indexation.
 */
export async function indexLibraryBatchAction(): Promise<IndexLibraryResult> {
  try {
    // 1. Auth + admin guard.
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: "not_authenticated",
        indexed: 0,
        failed: 0,
        skipped: 0,
        remaining: 0,
      };
    }
    const profile = toUserProfile(user);
    if (!isAuthorizedEmail(profile.email)) {
      return {
        ok: false,
        error: "forbidden_domain",
        indexed: 0,
        failed: 0,
        skipped: 0,
        remaining: 0,
      };
    }
    if (!isAdmin(profile)) {
      return {
        ok: false,
        error: "forbidden_role",
        indexed: 0,
        failed: 0,
        skipped: 0,
        remaining: 0,
      };
    }
    const orgId = await getRequiredOrgId(profile.id);

    // 2. Liste de tous les items biblio + leur index (LEFT JOIN pour avoir
    //    les non-indexés). On ne prend pas les templates DC1/DC2/Pouvoir
    //    (peu utile d'indexer du squelette CERFA).
    const NON_INDEXABLE_KINDS = ["dc1", "dc2", "dc4", "pouvoir_mandataire"];
    const items = await db
      .select({
        id: presentationLibrary.id,
        name: presentationLibrary.name,
        kind: presentationLibrary.kind,
        storagePath: presentationLibrary.storagePath,
        updatedAt: presentationLibrary.updatedAt,
        existingHash: libraryItemIndex.sourceHash,
      })
      .from(presentationLibrary)
      .leftJoin(libraryItemIndex, eq(libraryItemIndex.libraryItemId, presentationLibrary.id))
      .where(
        and(
          eq(presentationLibrary.organizationId, orgId),
          sql`${presentationLibrary.kind} NOT IN (${sql.join(
            NON_INDEXABLE_KINDS.map((k) => sql`${k}`),
            sql`, `,
          )})`,
        ),
      )
      .orderBy(presentationLibrary.updatedAt);

    const result: IndexLibraryResult = {
      ok: true,
      indexed: 0,
      failed: 0,
      skipped: 0,
      remaining: 0,
      errors: [],
    };

    const supabaseAdmin = createSupabaseAdminClient();
    let processedCount = 0;

    for (const item of items) {
      // Hard stop pour rester sous le timeout Vercel.
      if (processedCount >= MAX_ITEMS_PER_RUN) {
        result.remaining += 1;
        continue;
      }

      // 2a. Téléchargement du fichier pour calculer le hash + payload Claude.
      let fileBytes: Uint8Array | null = null;
      try {
        const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(item.storagePath);
        if (error || !data) {
          result.failed += 1;
          result.errors?.push({ name: item.name, message: `storage download failed` });
          continue;
        }
        fileBytes = new Uint8Array(await data.arrayBuffer());
      } catch (err) {
        result.failed += 1;
        result.errors?.push({
          name: item.name,
          message: `download exception: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }

      const hash = createHash("sha256").update(fileBytes).digest("hex");

      // 2b. Skip si déjà indexé et hash identique.
      if (item.existingHash && item.existingHash === hash) {
        result.skipped += 1;
        continue;
      }

      processedCount += 1;

      // 2c. Appel Claude.
      const isPdf = item.storagePath.toLowerCase().endsWith(".pdf");
      const claudeResult = await indexLibraryItem({
        itemName: item.name,
        itemKind: item.kind,
        pdfBytes: isPdf ? fileBytes : undefined,
      });

      if (!claudeResult.ok) {
        result.failed += 1;
        result.errors?.push({
          name: item.name,
          message: claudeResult.message ?? claudeResult.error,
        });
        continue;
      }

      // 2d. ai_runs audit — désactivé V1.
      //
      // ai_runs.prompt_id est NOT NULL et exige un row dans ai_prompts. On
      // ne seed pas de prompt « library_index » pour ce MVP — l'audit IA
      // structuré sera posé en V2 quand on versionnera le prompt. Pour le
      // moment, les métadonnées de cost/tokens sont préservées dans le
      // payload Claude lui-même (extracted_entities ne contient pas l'audit
      // mais on peut le retrouver via le log applicatif si besoin).
      const aiRunId: string | undefined = undefined;
      console.info(
        `[library-index] item=${item.id} tokens_in=${claudeResult.tokensIn} tokens_out=${claudeResult.tokensOut} cost=${claudeResult.costUsd.toFixed(4)}$ latency=${claudeResult.latencyMs}ms`,
      );

      // 2e. Upsert library_item_index.
      try {
        await db
          .insert(libraryItemIndex)
          .values({
            libraryItemId: item.id,
            organizationId: orgId,
            extractedTitle: claudeResult.output.extracted_title ?? null,
            keywords: claudeResult.output.keywords,
            summary: claudeResult.output.summary ?? null,
            docType: claudeResult.output.doc_type ?? null,
            extractedEntities: claudeResult.output.extracted_entities,
            indexedBy: profile.id,
            aiRunId: aiRunId ?? null,
            modelVersion: claudeResult.modelVersion,
            sourceHash: hash,
          })
          .onConflictDoUpdate({
            target: libraryItemIndex.libraryItemId,
            set: {
              extractedTitle: claudeResult.output.extracted_title ?? null,
              keywords: claudeResult.output.keywords,
              summary: claudeResult.output.summary ?? null,
              docType: claudeResult.output.doc_type ?? null,
              extractedEntities: claudeResult.output.extracted_entities,
              indexedAt: new Date(),
              indexedBy: profile.id,
              aiRunId: aiRunId ?? null,
              modelVersion: claudeResult.modelVersion,
              sourceHash: hash,
            },
          });
        result.indexed += 1;
      } catch (err) {
        result.failed += 1;
        result.errors?.push({
          name: item.name,
          message: `db upsert failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    revalidatePath("/sourcing/admin/bibliotheque");

    return result;
  } catch (err) {
    console.error("[index-library:unhandled]", err);
    return {
      ok: false,
      error: "internal_error",
      indexed: 0,
      failed: 0,
      skipped: 0,
      remaining: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Action lecture — sert à afficher l'état d'indexation
// ---------------------------------------------------------------------------

/**
 * Retourne les `library_item_id` indexés pour l'org courante (UI badge
 * « ✓ Indexé » sur chaque item). `null` si l'utilisateur n'est pas authentifié.
 */
export async function loadIndexedLibraryItemIds(): Promise<Set<string> | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const profile = toUserProfile(user);
    const orgId = await getRequiredOrgId(profile.id);

    const rows = await db
      .select({ libraryItemId: libraryItemIndex.libraryItemId })
      .from(libraryItemIndex)
      .where(eq(libraryItemIndex.organizationId, orgId));

    return new Set(rows.map((r) => r.libraryItemId));
  } catch (err) {
    console.error("[index-library:load-indexed-ids:fail]", err);
    return new Set();
  }
}
