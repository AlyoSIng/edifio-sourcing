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
import { aiPrompts, aiRuns } from "@/db/schema/ai";
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

/**
 * Cache process-level du prompt_id seedé par la migration 0042. Évite un
 * SELECT par item indexé. Re-initialisé à chaque cold-start Vercel.
 */
let cachedLibraryIndexPromptId: string | null = null;

async function getOrFindLibraryIndexPromptId(): Promise<string> {
  if (cachedLibraryIndexPromptId) return cachedLibraryIndexPromptId;
  const [row] = await db
    .select({ id: aiPrompts.id })
    .from(aiPrompts)
    .where(and(eq(aiPrompts.name, "library_index"), eq(aiPrompts.active, true)))
    .limit(1);
  if (!row) {
    throw new Error("ai_prompts row 'library_index' missing — apply migration 0042");
  }
  cachedLibraryIndexPromptId = row.id;
  return row.id;
}

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

      // 2d. ai_runs audit structuré (G5 — Steve 2026-06-03). On enregistre
      //     chaque run Claude dans `ai_runs` avec le prompt_id du seed
      //     « library_index ». Si l'insert plante (cas tests sans seed), on
      //     ne casse pas l'indexation — best-effort.
      let aiRunId: string | undefined;
      try {
        const [run] = await db
          .insert(aiRuns)
          .values({
            organizationId: orgId,
            promptId: await getOrFindLibraryIndexPromptId(),
            inputHash: hash.slice(0, 64),
            output: claudeResult.output as never,
            model: "haiku-4-5",
            costUsd: String(claudeResult.costUsd),
            latencyMs: claudeResult.latencyMs,
            succeeded: true,
          })
          .returning({ id: aiRuns.id });
        aiRunId = run?.id;
      } catch (err) {
        console.warn("[library-index:ai_runs:insert:fail]", err);
      }
      console.info(
        `[library-index] item=${item.id} tokens_in=${claudeResult.tokensIn} tokens_out=${claudeResult.tokensOut} cost=${claudeResult.costUsd.toFixed(4)}$ latency=${claudeResult.latencyMs}ms ai_run=${aiRunId ?? "n/a"}`,
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
// Action — ré-indexation forcée d'un seul item (G1 Steve 2026-06-03)
// ---------------------------------------------------------------------------

export type ReindexLibraryItemError =
  | "not_authenticated"
  | "forbidden_domain"
  | "forbidden_role"
  | "invalid_input"
  | "item_not_found"
  | "storage_download_failed"
  | "anthropic_failed"
  | "db_upsert_failed"
  | "internal_error";

export type ReindexLibraryItemResult =
  | {
      ok: true;
      itemId: string;
      details: LibraryIndexDetail;
    }
  | { ok: false; error: ReindexLibraryItemError; message?: string };

const UUID_RE_REINDEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Force une nouvelle indexation Claude pour un seul item biblio.
 * Bypass la skip-si-hash-identique : utile si l'admin veut re-tester le prompt
 * ou si Claude avait renvoyé un mauvais résultat.
 */
export async function reindexLibraryItemAction(itemId: string): Promise<ReindexLibraryItemResult> {
  try {
    // 1. Auth + admin guard (mêmes vérifs que le batch).
    if (!UUID_RE_REINDEX.test(itemId)) {
      return { ok: false, error: "invalid_input" };
    }
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "not_authenticated" };
    const profile = toUserProfile(user);
    if (!isAuthorizedEmail(profile.email)) return { ok: false, error: "forbidden_domain" };
    if (!isAdmin(profile)) return { ok: false, error: "forbidden_role" };
    const orgId = await getRequiredOrgId(profile.id);

    // 2. Récupère l'item.
    const [item] = await db
      .select({
        id: presentationLibrary.id,
        name: presentationLibrary.name,
        kind: presentationLibrary.kind,
        storagePath: presentationLibrary.storagePath,
      })
      .from(presentationLibrary)
      .where(and(eq(presentationLibrary.id, itemId), eq(presentationLibrary.organizationId, orgId)))
      .limit(1);
    if (!item) return { ok: false, error: "item_not_found" };

    // 3. Download Storage + hash.
    const supabaseAdmin = createSupabaseAdminClient();
    let fileBytes: Uint8Array;
    try {
      const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(item.storagePath);
      if (error || !data) return { ok: false, error: "storage_download_failed" };
      fileBytes = new Uint8Array(await data.arrayBuffer());
    } catch (err) {
      return {
        ok: false,
        error: "storage_download_failed",
        message: err instanceof Error ? err.message : String(err),
      };
    }
    const hash = createHash("sha256").update(fileBytes).digest("hex");

    // 4. Claude (force — pas de skip hash).
    const isPdf = item.storagePath.toLowerCase().endsWith(".pdf");
    const claudeResult = await indexLibraryItem({
      itemName: item.name,
      itemKind: item.kind,
      pdfBytes: isPdf ? fileBytes : undefined,
    });
    if (!claudeResult.ok) {
      return {
        ok: false,
        error: "anthropic_failed",
        message: claudeResult.message ?? claudeResult.error,
      };
    }

    // 4b. ai_runs audit (G5 — best-effort).
    let aiRunIdReindex: string | undefined;
    try {
      const [run] = await db
        .insert(aiRuns)
        .values({
          organizationId: orgId,
          promptId: await getOrFindLibraryIndexPromptId(),
          inputHash: hash.slice(0, 64),
          output: claudeResult.output as never,
          model: "haiku-4-5",
          costUsd: String(claudeResult.costUsd),
          latencyMs: claudeResult.latencyMs,
          succeeded: true,
        })
        .returning({ id: aiRuns.id });
      aiRunIdReindex = run?.id;
    } catch (err) {
      console.warn("[library-reindex:ai_runs:insert:fail]", err);
    }

    console.info(
      `[library-reindex] item=${item.id} tokens_in=${claudeResult.tokensIn} tokens_out=${claudeResult.tokensOut} cost=${claudeResult.costUsd.toFixed(4)}$ latency=${claudeResult.latencyMs}ms ai_run=${aiRunIdReindex ?? "n/a"}`,
    );

    // 5. Upsert library_item_index.
    let indexedAt = new Date();
    try {
      const [row] = await db
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
          aiRunId: aiRunIdReindex ?? null,
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
            aiRunId: aiRunIdReindex ?? null,
            modelVersion: claudeResult.modelVersion,
            sourceHash: hash,
          },
        })
        .returning({ indexedAt: libraryItemIndex.indexedAt });
      if (row?.indexedAt) indexedAt = row.indexedAt;
    } catch (err) {
      return {
        ok: false,
        error: "db_upsert_failed",
        message: err instanceof Error ? err.message : String(err),
      };
    }

    revalidatePath("/sourcing/admin/bibliotheque");

    return {
      ok: true,
      itemId: item.id,
      details: {
        libraryItemId: item.id,
        extractedTitle: claudeResult.output.extracted_title ?? null,
        keywords: claudeResult.output.keywords,
        summary: claudeResult.output.summary ?? null,
        docType: claudeResult.output.doc_type ?? null,
        extractedEntities: claudeResult.output.extracted_entities,
        indexedAtIso: indexedAt.toISOString(),
        modelVersion: claudeResult.modelVersion,
        sourceHashStale: false,
      },
    };
  } catch (err) {
    console.error("[index-library:reindex-one:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ---------------------------------------------------------------------------
// Action lecture — sert à afficher l'état d'indexation
// ---------------------------------------------------------------------------

/**
 * Détails d'indexation d'un item biblio — sérialisable pour passer un payload
 * Server → Client (les Date sont remplacées par leur ISO string).
 */
export interface LibraryIndexDetail {
  libraryItemId: string;
  extractedTitle: string | null;
  keywords: string[];
  summary: string | null;
  docType: string | null;
  extractedEntities: Record<string, unknown>;
  indexedAtIso: string;
  modelVersion: string | null;
  /** Vrai si le hash stocké ne matche plus celui du fichier Storage actuel. */
  sourceHashStale: boolean;
}

/**
 * Retourne les détails d'indexation pour tous les items de l'organisation.
 * Le caller (page.tsx) passe ces détails au composant Client qui affiche
 * (a) le badge « ✓ Indexé » (b) le panneau dépliable au clic.
 *
 * Retourne `[]` si l'utilisateur n'est pas authentifié ou si la migration
 * n'a pas encore été appliquée — dégradation gracieuse.
 */
export async function loadLibraryIndexDetails(): Promise<LibraryIndexDetail[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const profile = toUserProfile(user);
    const orgId = await getRequiredOrgId(profile.id);

    // G4 — Steve 2026-06-03 : détection d'obsolescence par comparaison
    // `presentation_library.updated_at` vs `library_item_index.indexed_at`.
    // Si l'item a été ré-uploadé après la dernière indexation, l'index est
    // considéré obsolète. Plus léger que de recalculer le SHA-256 à chaque
    // page-load.
    const rows = await db
      .select({
        libraryItemId: libraryItemIndex.libraryItemId,
        extractedTitle: libraryItemIndex.extractedTitle,
        keywords: libraryItemIndex.keywords,
        summary: libraryItemIndex.summary,
        docType: libraryItemIndex.docType,
        extractedEntities: libraryItemIndex.extractedEntities,
        indexedAt: libraryItemIndex.indexedAt,
        modelVersion: libraryItemIndex.modelVersion,
        itemUpdatedAt: presentationLibrary.updatedAt,
      })
      .from(libraryItemIndex)
      .innerJoin(presentationLibrary, eq(presentationLibrary.id, libraryItemIndex.libraryItemId))
      .where(eq(libraryItemIndex.organizationId, orgId));

    return rows.map((r) => ({
      libraryItemId: r.libraryItemId,
      extractedTitle: r.extractedTitle,
      keywords: r.keywords ?? [],
      summary: r.summary,
      docType: r.docType,
      extractedEntities: (r.extractedEntities as Record<string, unknown> | null) ?? {},
      indexedAtIso: r.indexedAt.toISOString(),
      modelVersion: r.modelVersion,
      // Stale = item ré-uploadé après dernière indexation. Marge tampon
      // de 5s pour éviter les faux positifs liés aux timestamps drizzle
      // (created/updated peuvent être posés à la même milliseconde).
      sourceHashStale: r.itemUpdatedAt.getTime() > r.indexedAt.getTime() + 5000,
    }));
  } catch (err) {
    console.warn("[index-library:load-details:fail]", err);
    return [];
  }
}
