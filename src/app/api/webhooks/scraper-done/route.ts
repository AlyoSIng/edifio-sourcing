/**
 * POST /api/webhooks/scraper-done — Résultats du scraper Playwright (Fly.io)
 *
 * Reçoit le payload JSON du worker Fly.io, vérifie le Bearer, puis
 * exécute le pipeline normalize → dedup → filter → score → insert
 * sur les AOs scrapés.
 *
 * Authentification : header `Authorization: Bearer ${SCRAPER_TRIGGER_SECRET}`
 * (même secret que pour déclencher le scraper — contrat symétrique).
 *
 * Source de vérité :
 *  - Contrat API Fly.io worker (interface `ScrapeWebhookPayload`)
 *  - `specs/module_sourcing_engine_v1.md` §3 (pipeline sourcing)
 *  - `src/lib/sourcing/normalize.ts` (branche scrapers)
 */

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { searchProfiles } from "@/db/schema/config";
import { dedupBatch } from "@/lib/sourcing/dedup";
import { matchesProfile } from "@/lib/sourcing/filter";
import { insertTender } from "@/lib/sourcing/insert";
import { normalize } from "@/lib/sourcing/normalize";
import { scoreTender } from "@/lib/sourcing/scoring";
import type { RawTender } from "@/lib/sourcing/types";
import type { TenderRawData } from "@/db/types/jsonb";

// ============================================================================
// Types du contrat wire (envoyés par le worker Fly.io)
// ============================================================================

/** Un AO brut tel que renvoyé par le scraper Playwright. */
interface ScrapedTenderRecord {
  externalRef: string;
  title: string;
  buyer: string;
  cpv?: string[];
  amount?: number;
  deadline?: string;
  questionsDeadline?: string;
  dceUrl?: string;
  sourceUrl: string;
  procedure?: string;
  description?: string;
}

/** Corps complet du POST reçu par ce webhook. */
interface ScrapeWebhookPayload {
  runId: string;
  platform: "place" | "francmarches";
  profileId: string;
  orgId: string;
  tenders: ScrapedTenderRecord[] | null;
  error?: string;
  durationMs: number;
}

// ============================================================================
// Config route Next.js
// ============================================================================

/** 60 s — pipeline pouvant traiter plusieurs dizaines d'AOs. */
export const maxDuration = 60;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Vérifie le header `Authorization: Bearer ${SCRAPER_TRIGGER_SECRET}`.
 * Retourne `false` si le secret est absent en env (route refusée par défaut).
 */
function checkAuth(req: NextRequest): boolean {
  const secret = process.env.SCRAPER_TRIGGER_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// ============================================================================
// Handler principal
// ============================================================================

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: ScrapeWebhookPayload;
  try {
    payload = (await req.json()) as ScrapeWebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { runId, platform, profileId, orgId, tenders, error: scraperError } = payload;

  // Worker a signalé une erreur ou n'a rien trouvé — pas d'AOs à traiter
  if (scraperError || !tenders || tenders.length === 0) {
    console.log("[webhook:scraper-done] run terminé sans AOs", {
      runId,
      platform,
      profileId,
      error: scraperError,
    });
    return NextResponse.json({ ok: true, inserted: 0, updated: 0 });
  }

  // Charge le profil de recherche pour filter + score
  let profile;
  try {
    const rows = await db.select().from(searchProfiles).where(eq(searchProfiles.id, profileId));
    profile = rows[0];
  } catch (err) {
    console.error("[webhook:scraper-done] Erreur BDD profil", { profileId, err });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!profile) {
    console.warn("[webhook:scraper-done] Profil introuvable", { profileId });
    return NextResponse.json({ ok: true, inserted: 0, updated: 0 });
  }

  // Convertit ScrapedTenderRecord[] → RawTender[] pour entrer dans le pipeline
  const fetchedAt = new Date().toISOString();
  const raws: RawTender[] = tenders.map((t) => ({
    externalRef: t.externalRef,
    platformCode: platform,
    fetchedAt,
    rawData: {
      platform_code: platform,
      fetched_at: fetchedAt,
      record: {
        title: t.title,
        buyer: t.buyer,
        cpv: t.cpv ?? [],
        amount: t.amount,
        deadline: t.deadline,
        questionsDeadline: t.questionsDeadline,
        dceUrl: t.dceUrl,
        sourceUrl: t.sourceUrl,
        procedure: t.procedure,
        description: t.description,
      },
    } satisfies TenderRawData,
  }));

  // Pipeline : normalize → dedup → filter → score → insert
  let inserted = 0;
  let updated = 0;
  const errors: Array<{ externalRef: string; message: string }> = [];

  // Normalisation — on absorbe les erreurs par AO pour ne pas tout perdre
  // si un record malformé arrive (défense en profondeur, cf. spec §3.3)
  const normalized = raws.flatMap((raw) => {
    try {
      return [normalize(raw)];
    } catch (err) {
      errors.push({ externalRef: raw.externalRef, message: String(err) });
      return [];
    }
  });

  // Déduplication intra-batch (cross-platform safe — dedup par externalRef)
  const { unique } = dedupBatch(normalized);

  for (const tender of unique) {
    // Filtre profil — on ignore les AOs hors périmètre
    const match = matchesProfile(tender, profile);
    if (!match.matched) continue;

    try {
      const score = scoreTender(tender, profile);
      const result = await insertTender(tender, { organizationId: orgId, profileId, score }, db);
      if (result.isNew) inserted += 1;
      else updated += 1;
    } catch (err) {
      errors.push({ externalRef: tender.externalRef, message: String(err) });
    }
  }

  console.log("[webhook:scraper-done] done", {
    runId,
    platform,
    profileId,
    total: tenders.length,
    inserted,
    updated,
    errors: errors.length,
    durationMs: payload.durationMs,
  });

  return NextResponse.json({ ok: true, inserted, updated, errors: errors.length });
}
