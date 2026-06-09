/**
 * GET / POST /api/cron/sourcing-monitoring — surveillance du cron sourcing-run.
 *
 * Mitigation R12 (Steve 2026-06-09). Tourne tous les jours à 7h00 (cf.
 * `vercel.json`, 30 min après le tick principal 6h30) et alerte par mail si
 * le cron sourcing-run n'a pas tourné correctement.
 *
 * Le détail de la décision « ok vs ko » est dans `@/lib/cron/monitoring.ts`
 * (testable unit, hors infra).
 *
 * Différence avec `notifyCronError` :
 *  - `notifyCronError` envoie un mail QUAND un cron a thrown (status='error').
 *  - Ce cron-ci envoie un mail QUAND un cron n'a PAS tourné du tout (no row
 *    récente) OU est resté bloqué « running » au-delà de la fenêtre. C'est
 *    le filet de sécurité « silent failure ».
 *
 * Auth : même CRON_SECRET que les autres routes cron. Vercel pose le Bearer
 * automatiquement quand `vercel.json` déclare le cron.
 *
 * Destinataire : `sebastien@edifio.fr` (cf. brief R12). On utilise l'env
 * `R12_MONITORING_RECIPIENT` pour pouvoir l'override en preview / Phase 2
 * sans toucher au code. Fallback hardcodé sur sebastien@edifio.fr.
 *
 * Transport : Resend (déjà câblé via `notifyCronError`, pas Brevo — Brevo
 * est réservé aux mails contacts archis externes dans ce repo). Le brief
 * parle de « mail via Brevo » par confusion ; on suit la convention du
 * repo en accord avec CLAUDE.md règle 5 « pas d'over-engineering ».
 */

import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { withCronRunLog } from "@/lib/cron/log-cron-run";
import { buildMonitoringMail, evaluateCronHealth, fetchLastCronRun } from "@/lib/cron/monitoring";
import { sendEmail } from "@/lib/email/resend";
import { getSiteUrl } from "@/lib/site-url";

export const runtime = "nodejs";
// Court : on lit 1 row + on envoie 1 mail au maximum. 30 s suffisent largement.
export const maxDuration = 30;

const TARGET_CRON_NAME = "sourcing-run";

/**
 * Vérifie le header `Authorization: Bearer ${CRON_SECRET}`. Aligné sur
 * la convention `sourcing-run/route.ts` (helper local pour ne pas
 * couper-coller, mais comportement strictement identique).
 */
function checkCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron:sourcing-monitoring] CRON_SECRET non configuré — route refusée");
    return new NextResponse("unauthorized", { status: 401 });
  }
  const header = req.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  return null;
}

function resolveRecipient(): string {
  const override = process.env.R12_MONITORING_RECIPIENT;
  if (override && override.length > 0) return override;
  return "sebastien@edifio.fr";
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const authError = checkCronAuth(req);
  if (authError) return authError;

  const outcome = await withCronRunLog(db, "sourcing-monitoring", async () => {
    const lastRun = await fetchLastCronRun(db, TARGET_CRON_NAME);
    const verdict = evaluateCronHealth(TARGET_CRON_NAME, lastRun);

    if (verdict.ok) {
      console.log("[cron:sourcing-monitoring] ok", {
        target: TARGET_CRON_NAME,
        age_minutes: verdict.details.ageMinutes,
      });
      return {
        target: TARGET_CRON_NAME,
        verdict: "ok" as const,
        reason: verdict.reason,
        details: verdict.details,
        alertSent: false,
      };
    }

    // Verdict KO → on alerte.
    const recipient = resolveRecipient();
    const mail = buildMonitoringMail(verdict, {
      siteUrl: getSiteUrl(),
      checkDate: new Date(),
    });

    let alertSent = false;
    let alertError: string | null = null;
    try {
      await sendEmail({
        to: recipient,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
      alertSent = true;
    } catch (err) {
      alertError = err instanceof Error ? err.message : String(err);
      console.error("[cron:sourcing-monitoring] send:fail", {
        recipient,
        message: alertError,
      });
    }

    console.warn("[cron:sourcing-monitoring] alert", {
      target: TARGET_CRON_NAME,
      reason: verdict.reason,
      message: verdict.message,
      recipient,
      alert_sent: alertSent,
      alert_error: alertError,
    });

    return {
      target: TARGET_CRON_NAME,
      verdict: "ko" as const,
      reason: verdict.reason,
      details: verdict.details,
      alertSent,
      alertError,
      recipient,
    };
  });

  if (outcome.ok) {
    return NextResponse.json({ ok: true, ...outcome.result });
  }

  const err = outcome.error;
  console.error("[cron:sourcing-monitoring] unhandled", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : null,
  });
  return NextResponse.json(
    { ok: false, message: "Erreur serveur durant le monitoring." },
    { status: 500 },
  );
}

/**
 * GET — méthode utilisée par Vercel Cron Jobs (tick 7h00 quotidien).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}

/**
 * POST — déclenchement manuel (parité comportementale stricte avec GET).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}
