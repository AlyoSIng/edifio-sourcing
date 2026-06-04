/**
 * GET / POST /api/cron/tandem-followup — déclencheur quotidien des
 * relances J+3 module Tandem.
 *
 * Source de vérité :
 *  - `specs/module_tandem_engine_v1.md` §3.7 (relance automatique)
 *  - `vercel.json` (schedule cron — voir patch sous-étape 5)
 *  - `src/lib/tandem/followup-cron.ts` (logique métier)
 *
 * Méthodes HTTP exposées :
 *  - **GET** : utilisé par Vercel Cron Jobs (doc : crons tapent GET).
 *  - **POST** : déclenchement manuel (curl, scripts ops, tests E2E).
 *
 * Authentification :
 *  - Vercel Cron pose `Authorization: Bearer ${CRON_SECRET}` quand la var
 *    d'env est configurée + cron déclaré dans `vercel.json`.
 *  - Comparaison `timingSafeEqual` (constant-time) pour éviter une fuite
 *    par timing attack.
 *  - Sans secret → 401 explicite (refus par défaut, cf. memory ops prod).
 *
 * Sécurité :
 *  - Pas de JWT en clair dans les logs (le summary expose des UUIDs et
 *    des compteurs, pas les tokens signés).
 *
 * Résilience :
 *  - Throw global capté → 500 JSON
 *  - Échecs individuels collectés dans `failures[]` du summary
 */

import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { getBrevoClient } from "@/lib/brevo/client";
import { withCronRunLog } from "@/lib/cron/log-cron-run";
import { notifyCronError } from "@/lib/cron/notify-error";
import { runTandemFollowups } from "@/lib/tandem/followup-cron";

/** Le cron peut s'étirer si plusieurs centaines d'archis à relancer. */
export const maxDuration = 60;

/**
 * Compare le header `Authorization` au secret attendu en temps constant.
 * Renvoie `null` si OK, sinon une `NextResponse 401`.
 *
 * Refus par défaut si `CRON_SECRET` non configuré (cf. memory
 * `feedback_ops_prod_user_runs_migration` — on préfère refuser visible-
 * ment qu'exposer une route ouverte).
 */
function checkCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron:tandem-followup] CRON_SECRET non configuré — route refusée");
    return new NextResponse("unauthorized", { status: 401 });
  }
  const header = req.headers.get("authorization");
  if (!header) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const expected = `Bearer ${secret}`;
  // timingSafeEqual exige des buffers de même longueur — on pad si mismatch
  // pour rester en temps constant (un attaquant ne peut pas distinguer
  // « mauvais préfixe » de « bonne longueur, mauvaise valeur »).
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

  // I3 — wrap dans withCronRunLog : INSERT row 'running' au début, UPDATE
  // avec status final + duration_ms à la fin (même en cas d'exception).
  const outcome = await withCronRunLog(
    db,
    "tandem-followup",
    async () => {
      const brevoClient = getBrevoClient();
      return await runTandemFollowups({ db, brevoClient });
    },
    { onError: (err) => notifyCronError(db, "tandem-followup", err) },
  );

  if (outcome.ok) {
    const result = outcome.result;
    // Trace structurée Vercel logs — pas de JWT, pas de PII (cabinet ok).
    console.log("[cron:tandem-followup] done", {
      total_candidates: result.totalCandidates,
      eligible_count: result.eligibleCount,
      sent_count: result.sentCount,
      failed_count: result.failedCount,
      duration_ms: result.durationMs,
      failures_sample: result.failures.slice(0, 5),
    });
    return NextResponse.json({ ok: true, ...result });
  }

  const err = outcome.error;
  console.error("[cron:tandem-followup] unhandled", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : null,
  });
  return NextResponse.json(
    { ok: false, message: "Erreur serveur durant la relance Tandem." },
    { status: 500 },
  );
}

/** GET — utilisé par Vercel Cron Jobs. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  return handleCronRequest(req);
}

/** POST — déclenchement manuel (tests E2E + scripts ops). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleCronRequest(req);
}
