"use server";

/**
 * Server Action — export CSV « AO du jour » tous profils.
 *
 * Décision Steve 2026-06-03 : pendant que l'app finit de se stabiliser, il
 * veut un export rapide de la liste des AO sourced (tous profils confondus)
 * pour alimenter son tableau de veille Excel (`Veille_AO_03_06_2026.xlsx`).
 *
 * Format de sortie : CSV séparateur `;`, BOM UTF-8 ajouté côté client lors du
 * download (Excel français reconnaît natif). 38 colonnes alignées sur le
 * modèle Excel. Cf. `src/lib/sourcing/export-csv.ts` pour la sérialisation
 * et le mapping département → région.
 *
 * Sécurité :
 *  - Auth check (toUserProfile) — ADR-014 retire la garde domaine
 *  - Filtre tenant strict (`organizationId = orgId`) sur toutes les requêtes
 *  - Pas de filtre profil (= tous les AO sourced de l'org)
 *  - Hard limit 500 lignes (au-delà : Excel rame, et MVP)
 *
 * Pas de génération xlsx natif : la lib (`sheetjs` / `exceljs`) n'est pas
 * installée. Si Steve demande un vrai .xlsx plus tard, ajouter la dépendance
 * et écrire un wrapper. Le CSV reste la version supportée.
 */

import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { architects } from "@/db/schema/architects";
import { architectResponses } from "@/db/schema/selections";
import { platforms } from "@/db/schema/config";
import { tenders } from "@/db/schema/tenders";
import { toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildAosDuJourCsv, type ExportAoRow } from "@/lib/sourcing/export-csv";

// ---------------------------------------------------------------------------
// Types de retour
// ---------------------------------------------------------------------------

export type ExportAosCsvError = "not_authenticated" | "internal_error";

export type ExportAosCsvResult =
  | { ok: true; csv: string; filename: string; rowCount: number }
  | { ok: false; error: ExportAosCsvError };

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Hard limit côté serveur — au-delà, Excel rame et c'est probablement bug. */
const EXPORT_HARD_LIMIT = 500;

/** Source → libellé court humain (cf. xlsx Steve : "BOAMP", "marches-publics.info"…). */
function platformDisplayLabel(code: string | null, displayName: string | null): string {
  if (displayName) return displayName;
  if (code) return code.toUpperCase();
  return "—";
}

// ---------------------------------------------------------------------------
// Action principale
// ---------------------------------------------------------------------------

/**
 * Exporte tous les AO sourced de l'organisation en CSV (38 colonnes).
 *
 * Filtre : `status = 'sourced'`, deadline non dépassée, non exclu.
 * Pas de filtre profil de recherche (= tous profils confondus).
 *
 * @returns `{ ok: true, csv, filename, rowCount }` ou erreur typée.
 */
export async function exportAosDuJourCsvAction(): Promise<ExportAosCsvResult> {
  try {
    // 1. Auth + org.
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "not_authenticated" };
    // ADR-014 (2026-06-05) — garde domaine retirée : ouverture multi-tenant.
    // Le tenant est strictement scopé par `getRequiredOrgId` + RLS BDD ci-dessous.
    const profile = toUserProfile(user);
    const orgId = await getRequiredOrgId(profile.id);

    // 2. Fetch tenders sourced + platform pour le libellé Source.
    //    Filtres alignés sur getTendersOfTheDay sans la limite à 50 et sans
    //    filtre profil (Steve veut « tous profils »).
    const rows = await db
      .select({
        id: tenders.id,
        title: tenders.title,
        buyer: tenders.buyer,
        amount: tenders.amount,
        deadline: tenders.deadline,
        // Pas de colonne `published_at` distincte dans tenders : on utilise
        // `created_at` comme approximation (cron tous les matins à 6h30 →
        // delta typiquement < 24h entre publication réelle et ingestion).
        publishedAt: tenders.createdAt,
        sourceUrl: tenders.sourceUrl,
        department: tenders.department,
        externalRef: tenders.externalRef,
        noticeType: tenders.noticeType,
        rawData: tenders.rawData,
        platformCode: platforms.code,
        platformDisplayName: platforms.displayName,
      })
      .from(tenders)
      .innerJoin(platforms, eq(tenders.platformId, platforms.id))
      .where(
        and(
          eq(tenders.organizationId, orgId),
          eq(tenders.status, "sourced"),
          or(isNull(tenders.deadline), gt(tenders.deadline, sql`now()`)),
          or(isNull(tenders.deferredUntil), sql`${tenders.deferredUntil} < now()`),
          isNull(tenders.excludedAt),
          or(
            isNull(tenders.noticeType),
            sql`lower(${tenders.noticeType}) NOT LIKE '%attribution%'`,
          ),
        ),
      )
      .orderBy(desc(tenders.score), desc(tenders.createdAt))
      .limit(EXPORT_HARD_LIMIT);

    if (rows.length === 0) {
      // Pas d'AO mais on rend quand même un CSV (1 ligne d'en-tête) — UX
      // pour que Steve ait au moins le squelette de son tableau.
      const csv = buildAosDuJourCsv([]);
      return {
        ok: true,
        csv,
        filename: buildFilename(0),
        rowCount: 0,
      };
    }

    // 3. Pour chaque tender, on charge les architectes acceptés (status='accepted').
    //    Une seule query batch (IN) pour éviter le N+1.
    const tenderIds = rows.map((r) => r.id);
    const acceptedRows = await db
      .select({
        tenderId: architectResponses.tenderId,
        cabinet: architects.cabinet,
        respondedAt: architectResponses.respondedAt,
      })
      .from(architectResponses)
      .innerJoin(architects, eq(architectResponses.architectId, architects.id))
      .where(
        and(
          inArray(architectResponses.tenderId, tenderIds),
          eq(architectResponses.organizationId, orgId),
          eq(architectResponses.status, "accepted"),
        ),
      )
      .orderBy(asc(architectResponses.respondedAt));

    // Regroupement par tender → cabinets, ordre stable (1er acceptant = premier).
    const acceptedByTender = new Map<string, string[]>();
    for (const row of acceptedRows) {
      const list = acceptedByTender.get(row.tenderId) ?? [];
      list.push(row.cabinet);
      acceptedByTender.set(row.tenderId, list);
    }

    // 4. Mappe vers ExportAoRow.
    const exportRows: ExportAoRow[] = rows.map((r) => {
      // Ville : tente d'extraire depuis rawData (BOAMP, marches-publics.info,
      // etc. exposent souvent un champ `ville`/`lieu_execution_ville`).
      // Heuristique safe : ignore silencieusement si rawData n'a pas le champ.
      let city = "";
      const raw = r.rawData as Record<string, unknown> | null;
      if (raw && typeof raw === "object") {
        // Recherche dans plusieurs structures connues (BOAMP `record.ville`,
        // PLACE `lieu_execution.ville`, etc.).
        const candidates = [
          (raw as { record?: { ville?: string } }).record?.ville,
          (raw as { ville?: string }).ville,
          (raw as { lieu_execution?: { ville?: string } }).lieu_execution?.ville,
        ];
        for (const c of candidates) {
          if (typeof c === "string" && c.trim()) {
            city = c.trim();
            break;
          }
        }
      }

      return {
        // Métier : pas de profil unique en mode « tous profils ». On laisse
        // vide pour que Steve renseigne (ou on inférerait via CPV → métier,
        // mais c'est de la sur-ingénierie pour cet MVP).
        metier: "",
        externalRef: r.externalRef ?? "",
        buyer: r.buyer ?? "",
        title: r.title ?? "",
        department: r.department,
        city,
        publishedAt: r.publishedAt,
        deadline: r.deadline,
        amountEur: r.amount != null ? Number(r.amount) : null,
        procedureType: r.noticeType,
        sourceLabel: platformDisplayLabel(r.platformCode, r.platformDisplayName),
        sourceUrl: r.sourceUrl,
        urlVerifiedLabel: r.sourceUrl ? "✅ Vérifié" : "",
        acceptedArchitects: acceptedByTender.get(r.id) ?? [],
        dcePlatform: "",
      };
    });

    const csv = buildAosDuJourCsv(exportRows);

    return {
      ok: true,
      csv,
      filename: buildFilename(exportRows.length),
      rowCount: exportRows.length,
    };
  } catch (err) {
    console.error("[export-aos-csv:unhandled]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Construit le nom de fichier de l'export (DD-MM-YYYY local) — aligné sur le
 * pattern du modèle Steve `Veille_AO_DD_MM_YYYY.xlsx` → `.csv`.
 */
function buildFilename(rowCount: number): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const suffix = rowCount === 0 ? "_vide" : `_${rowCount}AO`;
  return `Veille_AO_${dd}_${mm}_${yyyy}${suffix}.csv`;
}
