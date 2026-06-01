/**
 * GET / POST /api/cron/sourcing-run — déclencheur quotidien du sourcing AO.
 *
 * Étape 5/5 de la PR #3 scoring V1 + cron.
 *
 * Source de vérité :
 *  - `specs/module_sourcing_engine_v1.md` §3.8 (cron Vercel + auth secret)
 *  - `vercel.json` (schedule `30 4 * * 1-5` UTC = 6h30 Europe/Paris en été
 *    CEST / 5h30 en hiver CET — voir DECISIONS.md 2026-05-20)
 *  - `src/lib/sourcing/orchestrator.ts` (pipeline complet)
 *
 * Méthodes HTTP exposées :
 *  - **GET** : utilisé par Vercel Cron Jobs (doc Vercel : les crons tapent
 *    exclusivement GET). C'est la méthode principale en prod.
 *  - **POST** : conservé pour le déclenchement manuel (curl, scripts ops,
 *    tests d'intégration historiques). Comportement strictement identique.
 *
 * Authentification :
 *  - Vercel Cron pose automatiquement le header `Authorization: Bearer
 *    ${CRON_SECRET}` quand `vercel.json` déclare un cron et que la variable
 *    `CRON_SECRET` est configurée côté Vercel project settings.
 *  - En local : `curl -H "Authorization: Bearer $CRON_SECRET"
 *    http://localhost:3000/api/cron/sourcing-run`.
 *  - Toute requête sans header valide → **401**.
 *
 * Comportement :
 *  1. Auth header
 *  2. SELECT `search_profiles WHERE active=true`
 *  3. Pour chaque profil : `runSourcingForProfile()` (BOAMP → normalize →
 *     dedup → filter → score → insert idempotent)
 *  4. Retourne un summary JSON avec les compteurs par profil + total
 *
 * **Hors scope PR #3** (à venir dans PRs ultérieures) :
 *  - Filtrage par `cron_time` du profil (V1 : tous les profils actifs au
 *    même cron Vercel 04:30 UTC)
 *  - Scoring IA Haiku complémentaire
 *  - Push notifications Realtime
 *
 * **Ajout PR scraping PLACE/Francmarchés :**
 *  4. Déclenche les jobs scraping PLACE + Francmarchés en fire-and-forget
 *     via `triggerScrapeJob` → worker Fly.io POST les résultats vers
 *     `POST /api/webhooks/scraper-done` (même secret `SCRAPER_TRIGGER_SECRET`).
 */

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { searchProfiles } from "@/db/schema/config";

import { createBoampConnector } from "@/lib/sourcing/connectors/boamp";
import {
  ScraperUnavailableError,
  triggerScrapeJob,
} from "@/lib/sourcing/connectors/scraping-client";
import { runSourcingForProfiles } from "@/lib/sourcing/orchestrator";
import { getSiteUrl } from "@/lib/site-url";

/** Durée max raisonnable pour le pipeline complet (toutes les org, tous profils). */
export const maxDuration = 60;

/**
 * Vérifie le header `Authorization: Bearer ${CRON_SECRET}`. Retourne `null`
 * si OK, sinon un `NextResponse 401` à retourner immédiatement.
 *
 * Le secret est lu à chaque appel (pas en module-scope) pour rester compatible
 * avec le Proxy lazy de `@/db/client` — `next build` ne doit pas lire l'env.
 *
 * Si `CRON_SECRET` n'est pas défini côté env, la route répond toujours 401 :
 * on refuse explicitement de tourner ouverte (pire qu'un 500 visible côté
 * caller : un cron qui ne tourne pas est immédiatement remonté par les logs
 * Vercel, là où une route ouverte exposerait l'orchestrateur).
 */
function checkCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron:sourcing-run] CRON_SECRET non configuré — route refusée par défaut");
    return new NextResponse("unauthorized", { status: 401 });
  }
  const header = req.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  return null;
}

/**
 * Handler partagé GET + POST — toute la logique métier vit ici. Les deux
 * exports délèguent directement, ce qui garantit une parité comportementale
 * stricte (Vercel cron en GET et déclenchement manuel en POST exécutent
 * exactement le même code).
 */
async function handleCronRequest(req: NextRequest): Promise<NextResponse> {
  const authError = checkCronAuth(req);
  if (authError) return authError;

  try {
    // 1. Charge tous les profils actifs (1 seule org AlyoS en MVP — petit
    //    volume, pas de pagination nécessaire). Multi-org viendra Phase 2.
    const profiles = await db.select().from(searchProfiles).where(eq(searchProfiles.active, true));

    if (profiles.length === 0) {
      console.log("[cron:sourcing-run] aucun profil actif — skip");
      return NextResponse.json({ ok: true, totalProfiles: 0, results: [], failedProfiles: [] });
    }

    // 2. Connecteur BOAMP (fetch global Node ≥ 20)
    const connector = createBoampConnector();

    // 3. Pipeline pour tous les profils
    const batch = await runSourcingForProfiles(profiles, { connector, db });

    // 4. Déclencher scraping PLACE + Francmarchés (async — résultats via webhook)
    const scraperTriggered: Array<{ platform: string; runId?: string; error?: string }> = [];
    const webhookUrl = `${getSiteUrl()}/api/webhooks/scraper-done`;

    for (const profile of profiles) {
      const profileFilters = {
        keywords: profile.keywords?.positive ?? [],
        geoZones: profile.geoZones ?? [],
      };
      const lastRunAt = new Date(Date.now() - 24 * 60 * 60 * 1000);

      for (const platform of ["francmarches", "place", "marchespublicsinfo"] as const) {
        try {
          const ack = await triggerScrapeJob({
            platform,
            profileFilters,
            lastRunAt,
            profileId: profile.id,
            orgId: profile.organizationId,
            webhookUrl,
          });
          scraperTriggered.push({ platform, runId: ack.runId });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (!(err instanceof ScraperUnavailableError)) {
            console.error("[cron:sourcing-run] scraper error", { platform, message });
          } else {
            console.log("[cron:sourcing-run] scraper unavailable (skip)", { platform, message });
          }
          scraperTriggered.push({ platform, error: message });
        }
      }
    }

    console.log("[cron:sourcing-run] scrapers triggered", scraperTriggered);

    // 5. Trace structurée des métriques (Vercel logs / Datadog)
    console.log("[cron:sourcing-run] done", {
      total_profiles: batch.totalProfiles,
      profiles_ok: batch.results.length,
      profiles_failed: batch.failedProfiles.length,
      tenders_inserted: batch.results.reduce((acc, r) => acc + r.inserted, 0),
      tenders_updated: batch.results.reduce((acc, r) => acc + r.updated, 0),
      duration_ms: batch.durationMs,
    });

    return NextResponse.json({ ok: true, ...batch, scraperTriggered });
  } catch (err) {
    console.error("[cron:sourcing-run] unhandled", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : null,
    });
    return NextResponse.json(
      { ok: false, message: "Erreur serveur durant le sourcing." },
      { status: 500 },
    );
  }
}

/**
 * GET — méthode utilisée par Vercel Cron Jobs (déclenchement automatique
 * quotidien selon `vercel.json`). Sans cet export, Next.js App Router
 * répondrait `405 Method Not Allowed` aux ticks cron.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  return handleCronRequest(req);
}

/**
 * POST — méthode de déclenchement manuel (curl, scripts ops, tests). Conserve
 * la compatibilité descendante avec les tests d'intégration historiques.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleCronRequest(req);
}
