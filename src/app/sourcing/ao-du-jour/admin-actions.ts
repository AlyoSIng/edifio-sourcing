"use server";

/**
 * Server Actions admin de la page « AO du jour ».
 *
 * Périmètre actuel :
 *  - `triggerSourcingRunAction` : relance manuelle du cron sourcing
 *    (superadmin uniquement).
 *
 * Historique :
 *  - V1 : la Server Action faisait un `fetch` HTTP vers
 *    `/api/cron/sourcing-run` avec `Authorization: Bearer ${CRON_SECRET}`
 *    pour garder le secret server-side et déléguer au handler cron.
 *  - V2 (2026-06-02) : Vercel Deployment Protection intercepte tout
 *    `fetch` self-call avec une page HTML 401 « Authentication Required ».
 *    Conséquence : `Cron a répondu 401: <!doctype html>...`. Solution :
 *    on inline la logique métier de `handleCronRequest` directement.
 *    L'auth (superadmin) est déjà rejouée ici, donc plus besoin de
 *    `CRON_SECRET` ni de roundtrip HTTP.
 */

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { searchProfiles } from "@/db/schema/config";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { getSiteUrl } from "@/lib/site-url";
import { createBoampConnector } from "@/lib/sourcing/connectors/boamp";
import {
  ScraperUnavailableError,
  triggerScrapeJob,
} from "@/lib/sourcing/connectors/scraping-client";
import { runSourcingForProfiles } from "@/lib/sourcing/orchestrator";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Déclenche manuellement le pipeline sourcing complet (équivalent au cron
 * quotidien `/api/cron/sourcing-run`, mais exécuté inline pour contourner
 * la Vercel Deployment Protection sur les self-calls HTTP).
 *
 * Réservé strictement aux superadmins (cf. CLAUDE.md / Gate 7 — accès
 * exclusif `/sourcing/superadmin`). Les admins classiques sont rejetés.
 *
 * Pipeline reproduit (parité stricte avec `handleCronRequest`) :
 *   1. SELECT `search_profiles WHERE active=true`
 *   2. Connecteur BOAMP
 *   3. `runSourcingForProfiles` (normalize → dedup → filter → score → insert)
 *   4. `triggerScrapeJob` fire-and-forget sur PLACE / Francmarchés /
 *      marchespublicsinfo (résultats reçus plus tard via webhook)
 */
export async function triggerSourcingRunAction(): Promise<
  | { ok: true; inserted: number; totalProfiles: number; durationMs: number }
  | { ok: false; error: string }
> {
  // Guard superadmin
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentification requise." };
  if (!isSuperAdmin(toUserProfile(user))) {
    return { ok: false, error: "Réservé aux superadmins." };
  }

  const startedAt = Date.now();
  try {
    // 1. Charge tous les profils actifs (1 seule org AlyoS en MVP — petit
    //    volume, pas de pagination nécessaire). Multi-org viendra Phase 2.
    const profiles = await db.select().from(searchProfiles).where(eq(searchProfiles.active, true));

    if (profiles.length === 0) {
      return {
        ok: true,
        inserted: 0,
        totalProfiles: 0,
        durationMs: Date.now() - startedAt,
      };
    }

    // 2. Connecteur BOAMP (fetch global Node ≥ 20)
    const connector = createBoampConnector();

    // 3. Pipeline pour tous les profils
    const batch = await runSourcingForProfiles(profiles, { connector, db });

    // 4. Déclencher scraping PLACE + Francmarchés + marchespublicsinfo
    //    (fire-and-forget — résultats arrivent via webhook)
    const webhookUrl = `${getSiteUrl()}/api/webhooks/scraper-done`;
    for (const profile of profiles) {
      const profileFilters = {
        keywords: profile.keywords?.positive ?? [],
        geoZones: profile.geoZones ?? [],
      };
      const lastRunAt = new Date(Date.now() - 24 * 60 * 60 * 1000);

      for (const platform of ["francmarches", "place", "marchespublicsinfo"] as const) {
        try {
          await triggerScrapeJob({
            platform,
            profileFilters,
            lastRunAt,
            profileId: profile.id,
            orgId: profile.organizationId,
            webhookUrl,
          });
        } catch (err) {
          // ScraperUnavailableError = worker Fly.io down ou non configuré
          // → skip silencieux (le pipeline BOAMP ne doit pas en pâtir).
          if (!(err instanceof ScraperUnavailableError)) {
            console.error("[admin-actions:scraper:fail]", { platform, err });
          }
        }
      }
    }

    // 5. Total inserted = somme des inserted par profil
    const inserted = batch.results.reduce((acc, r) => acc + r.inserted, 0);

    return {
      ok: true,
      inserted,
      totalProfiles: profiles.length,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    console.error("[admin-actions:trigger-sourcing:fail]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Erreur interne: ${msg}` };
  }
}
