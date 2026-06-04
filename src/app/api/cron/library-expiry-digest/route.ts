/**
 * GET / POST /api/cron/library-expiry-digest — déclencheur hebdo du
 * digest des documents bibliothèque expirés.
 *
 * Source de vérité :
 *  - `vercel.json` (schedule cron hebdo)
 *  - `src/lib/library/expiry-digest.ts` (logique métier)
 *  - Steve 2026-06-03 — chantier G2.2.
 *
 * Méthodes HTTP exposées :
 *  - **GET** : utilisé par Vercel Cron Jobs.
 *  - **POST** : déclenchement manuel (curl, scripts ops).
 *
 * Authentification : même pattern que tandem-followup — `CRON_SECRET` en
 * header `Authorization: Bearer ${secret}`, comparaison `timingSafeEqual`.
 */

import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { withCronRunLog } from "@/lib/cron/log-cron-run";
import { sendEmail } from "@/lib/email/resend";
import { runLibraryExpiryDigest } from "@/lib/library/expiry-digest";
import { getSiteUrl } from "@/lib/site-url";

export const maxDuration = 60;

/**
 * Compare le header `Authorization` au secret attendu en temps constant.
 * Renvoie `null` si OK, sinon une `NextResponse 401`.
 */
function checkCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron:library-expiry-digest] CRON_SECRET non configuré — route refusée");
    return new NextResponse("unauthorized", { status: 401 });
  }
  const header = req.headers.get("authorization");
  if (!header) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  if (!crypto.timingSafeEqual(a, b)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  return null;
}

async function handleCronRequest(req: NextRequest): Promise<NextResponse> {
  const authError = checkCronAuth(req);
  if (authError) return authError;

  // I3 — observabilité cron_run_log.
  const outcome = await withCronRunLog(db, "library-expiry-digest", async () =>
    runLibraryExpiryDigest({ db, sendEmail, baseUrl: getSiteUrl() }),
  );

  if (outcome.ok) {
    const result = outcome.result;
    console.log("[cron:library-expiry-digest] done", {
      total_orgs: result.totalOrganizations,
      orgs_with_issues: result.organizationsWithIssues,
      emails_sent: result.totalEmailsSent,
      email_failures: result.totalEmailFailures,
      duration_ms: result.durationMs,
    });
    return NextResponse.json({ ok: true, ...result });
  }

  const err = outcome.error;
  console.error("[cron:library-expiry-digest] unhandled", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : null,
  });
  return NextResponse.json(
    { ok: false, message: "Erreur serveur durant l'envoi du digest." },
    { status: 500 },
  );
}

/** GET — utilisé par Vercel Cron Jobs. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  return handleCronRequest(req);
}

/** POST — déclenchement manuel. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleCronRequest(req);
}
