/**
 * GET / POST /api/cron/dossier-zip-cleanup — cleanup quotidien des ZIPs
 * de dossier orphelins (chantier H4, Steve 2026-06-04).
 *
 * Schedule : `vercel.json` (lundi-vendredi 4 h UTC).
 *
 * Auth : `CRON_SECRET` Bearer header, comparé en `timingSafeEqual`
 * (même pattern que les 3 autres crons).
 */

import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { withCronRunLog } from "@/lib/cron/log-cron-run";
import { notifyCronError } from "@/lib/cron/notify-error";
import { runDossierZipCleanup } from "@/lib/storage/dossier-zip-cleanup";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const maxDuration = 60;

function checkCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron:dossier-zip-cleanup] CRON_SECRET non configuré — route refusée");
    return new NextResponse("unauthorized", { status: 401 });
  }
  const header = req.headers.get("authorization");
  if (!header) return new NextResponse("unauthorized", { status: 401 });
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return new NextResponse("unauthorized", { status: 401 });
  if (!crypto.timingSafeEqual(a, b)) return new NextResponse("unauthorized", { status: 401 });
  return null;
}

async function handleCronRequest(req: NextRequest): Promise<NextResponse> {
  const authError = checkCronAuth(req);
  if (authError) return authError;

  // I3 — observabilité cron_run_log.
  const outcome = await withCronRunLog(
    db,
    "dossier-zip-cleanup",
    async () => {
      const supabaseAdmin = createSupabaseAdminClient();
      return await runDossierZipCleanup({ db, supabaseAdmin });
    },
    { onError: (err) => notifyCronError(db, "dossier-zip-cleanup", err) },
  );

  if (outcome.ok) {
    const result = outcome.result;
    console.log("[cron:dossier-zip-cleanup] done", {
      total_candidates: result.totalCandidates,
      rows_deleted: result.rowsDeleted,
      storage_deleted: result.storageDeleted,
      storage_failures: result.storageFailures,
      duration_ms: result.durationMs,
    });
    return NextResponse.json({ ok: true, ...result });
  }

  const err = outcome.error;
  console.error("[cron:dossier-zip-cleanup] unhandled", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : null,
  });
  return NextResponse.json(
    { ok: false, message: "Erreur serveur durant le cleanup." },
    { status: 500 },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handleCronRequest(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleCronRequest(req);
}
