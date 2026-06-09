/**
 * POST/GET /api/admin/crons/smoke-sourcing-run — smoke test cron sourcing-run.
 *
 * Mitigation R12 (Steve 2026-06-09) : déclenche `sourcing-run` immédiatement
 * et renvoie un verdict OK/KO + durée + nombre de tenders insérés.
 *
 * À utiliser le lundi matin 7h (post-bascule 18/7) pour valider que le cron
 * quotidien a tourné, ou pour le déclencher manuellement s'il ne l'a pas fait.
 *
 * Sécurité :
 *  - Restreint au rôle `superadmin` (cf. ADR-014 + types.ts isSuperAdmin).
 *  - Le `CRON_SECRET` est ajouté côté serveur uniquement (header Authorization)
 *    et n'est jamais exposé au client.
 *
 * Réponse JSON :
 *   {
 *     ok: true | false,
 *     verdict: "ok" | "ko",
 *     durationMs: number,
 *     httpStatus: number,
 *     tendersInserted: number,
 *     tendersUpdated: number,
 *     totalProfiles: number,
 *     profilesFailed: number,
 *     responsePreview: string, // 500 premiers chars du body sourcing-run
 *     message: string,
 *   }
 *
 * NB : on ne wrappe PAS l'appel dans `withCronRunLog`. Le cron sourcing-run
 * ciblé maintient déjà son propre log via son withCronRunLog interne — un
 * second wrappage écrirait une row parasite dans cron_run_log et fausserait
 * les agrégats /admin/crons. Le smoke est juste une « façade » qui invoque
 * la vraie route.
 */

import { type NextRequest, NextResponse } from "next/server";

import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
// Le sourcing-run peut prendre 2-3 min — on aligne sur sa propre maxDuration.
export const maxDuration = 300;

interface SourcingRunResponseShape {
  ok: boolean;
  totalProfiles?: number;
  results?: Array<{ inserted?: number; updated?: number }>;
  failedProfiles?: Array<{ profileId?: string; error?: string }>;
  durationMs?: number;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  void req;

  // 1. Auth + superadmin (alignement avec actions.ts du panel /admin/crons).
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, verdict: "ko", message: "Non authentifié" },
      { status: 401 },
    );
  }
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) {
    return NextResponse.json(
      { ok: false, verdict: "ko", message: "Réservé aux superadmins." },
      { status: 403 },
    );
  }

  // 2. Récupère le CRON_SECRET côté serveur.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[smoke-sourcing-run] CRON_SECRET non configuré");
    return NextResponse.json(
      {
        ok: false,
        verdict: "ko",
        message: "CRON_SECRET non configuré côté serveur — impossible de déclencher.",
      },
      { status: 500 },
    );
  }

  // 3. POST sur la route sourcing-run avec le secret. On bypass aucune
  //    logique : on tape exactement la même URL que Vercel Cron, le pipeline
  //    réel tourne (BOAMP → normalize → filter → score → insert), et on
  //    relit la réponse JSON pour extraire les compteurs.
  const url = `${getSiteUrl()}/api/cron/sourcing-run`;
  const startedAt = Date.now();
  let httpStatus = 0;
  let bodyText = "";
  let parsed: SourcingRunResponseShape | null = null;
  let fetchError: string | null = null;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "user-agent": "edifio-smoke-sourcing-run/1.0",
      },
      // Pas de body — la route cron ignore la payload.
    });
    httpStatus = res.status;
    bodyText = await res.text().catch(() => "");
    try {
      parsed = bodyText ? (JSON.parse(bodyText) as SourcingRunResponseShape) : null;
    } catch {
      parsed = null;
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
    console.error("[smoke-sourcing-run:fetch:fail]", { url, err: fetchError });
  }

  const durationMs = Date.now() - startedAt;

  // 4. Construit le verdict.
  const tendersInserted = (parsed?.results ?? []).reduce((acc, r) => acc + (r.inserted ?? 0), 0);
  const tendersUpdated = (parsed?.results ?? []).reduce((acc, r) => acc + (r.updated ?? 0), 0);
  const totalProfiles = parsed?.totalProfiles ?? 0;
  const profilesFailed = (parsed?.failedProfiles ?? []).length;

  const httpOk = httpStatus >= 200 && httpStatus < 300;
  const verdict: "ok" | "ko" =
    !fetchError && httpOk && parsed?.ok === true && profilesFailed === 0 ? "ok" : "ko";

  const message = (() => {
    if (fetchError) return `Échec fetch interne : ${fetchError}`;
    if (!httpOk) return `Route sourcing-run a répondu HTTP ${httpStatus}.`;
    if (parsed?.ok !== true) return `Route sourcing-run a répondu ok=false.`;
    if (profilesFailed > 0)
      return `Pipeline OK mais ${profilesFailed} profil(s) en échec — voir failedProfiles.`;
    return `Smoke OK — ${tendersInserted} tender(s) inséré(s), ${tendersUpdated} mis à jour sur ${totalProfiles} profil(s) en ${(durationMs / 1000).toFixed(1)} s.`;
  })();

  const responsePreview = bodyText.slice(0, 500);

  // 5. Log structuré (visible dans Vercel logs).
  console.log("[smoke-sourcing-run] done", {
    user_email: user.email ?? "unknown",
    verdict,
    http_status: httpStatus,
    duration_ms: durationMs,
    tenders_inserted: tendersInserted,
    tenders_updated: tendersUpdated,
    total_profiles: totalProfiles,
    profiles_failed: profilesFailed,
  });

  return NextResponse.json(
    {
      ok: verdict === "ok",
      verdict,
      durationMs,
      httpStatus,
      tendersInserted,
      tendersUpdated,
      totalProfiles,
      profilesFailed,
      responsePreview,
      message,
    },
    { status: verdict === "ok" ? 200 : 502 },
  );
}

/**
 * GET — pratique pour les opérations « curl rapide » depuis un terminal
 * avec un cookie session valide (ou les bookmarklets de Steve).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}

/**
 * POST — méthode privilégiée pour le déclenchement manuel (aligné avec
 * la convention du panel /admin/crons).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}
