/**
 * Notification mail aux superadmins quand un cron Vercel a échoué.
 *
 * Steve 2026-06-04 — polish I3. Évite de devoir surveiller `/admin/crons`
 * matin et soir : si un cron status='error', un mail récap part vers les
 * superadmins de l'organisation AlyoS avec le message + 500 premiers
 * caractères du stack.
 *
 * Best-effort : si la liste des superadmins est vide, si Resend rate, si
 * la fetch DB pour récupérer les destinataires échoue → on log côté
 * console et on rend la main. L'observabilité ne doit jamais bloquer
 * le pipeline cron.
 *
 * Anti-spam : on vérifie qu'il n'y a pas déjà eu un mail pour le même
 * cron_name dans la dernière heure (regarde cron_run_log row 'error'
 * précédente). Si oui → skip. C'est suffisamment robuste pour ne pas
 * inonder la boîte si un cron throw chaque tick.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { cronRunLog } from "@/db/schema/cron-log";
import { memberships, users } from "@/db/schema/users";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { sendEmail } from "@/lib/email/resend";
import { getSiteUrl } from "@/lib/site-url";

const ANTI_SPAM_WINDOW_MS = 60 * 60 * 1000; // 1h
const STACK_PREVIEW_BYTES = 500;

/**
 * Récupère les emails des superadmins de l'organisation AlyoS.
 * En MVP, c'est la seule org → un seul appel SELECT. Évolue en Phase 2
 * vers un destinataire système global.
 */
async function getSuperadminEmails(db: Db): Promise<string[]> {
  try {
    // JOIN users ↔ memberships : l'appartenance org + le rôle sont sur la
    // table memberships, pas directement sur users.
    const rows = await db
      .select({ email: users.email })
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .where(and(eq(memberships.organizationId, ALYOS_ORG_ID), eq(memberships.role, "superadmin")));
    return rows.map((r) => r.email).filter(Boolean);
  } catch (err) {
    console.warn("[cron-notify:recipients:fail]", err);
    return [];
  }
}

/**
 * Vérifie qu'il n'y a pas déjà eu un mail d'erreur pour ce cron dans la
 * dernière heure. On regarde les rows cron_run_log status='error' avec
 * `started_at >= now - 1h` (en excluant la row courante évidemment, mais
 * comme on n'a pas son id, on compte juste les rows plus anciennes que
 * celle qui vient d'écrire).
 *
 * Renvoie `true` si on peut envoyer, `false` si on doit skip.
 */
async function shouldSendAlert(db: Db, cronName: string): Promise<boolean> {
  try {
    const oneHourAgo = new Date(Date.now() - ANTI_SPAM_WINDOW_MS);
    const [recent] = await db
      .select({ id: cronRunLog.id })
      .from(cronRunLog)
      .where(
        and(
          eq(cronRunLog.cronName, cronName),
          eq(cronRunLog.status, "error"),
          gte(cronRunLog.startedAt, oneHourAgo),
        ),
      )
      .orderBy(desc(cronRunLog.startedAt))
      .limit(2);
    // [2] car la row qu'on vient d'insérer (status='error') est dans la liste —
    // on autorise l'envoi seulement si elle est la PREMIÈRE error de la fenêtre,
    // i.e. limit(2) renvoie 1 row ou moins.
    if (!recent) return true;
    const count = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(cronRunLog)
      .where(
        and(
          eq(cronRunLog.cronName, cronName),
          eq(cronRunLog.status, "error"),
          gte(cronRunLog.startedAt, oneHourAgo),
        ),
      );
    const total = Number(count[0]?.n ?? 0);
    return total <= 1; // seule la row courante → on envoie
  } catch (err) {
    console.warn("[cron-notify:antispam:fail]", err);
    // En cas de doute, on envoie. Mieux vaut un mail de trop qu'un silence.
    return true;
  }
}

function buildPayload(opts: {
  cronName: string;
  errorMessage: string;
  errorStack: string | null;
}): { subject: string; html: string; text: string } {
  const adminUrl = `${getSiteUrl()}/sourcing/admin/crons`;
  const stackPreview = (opts.errorStack ?? "").slice(0, STACK_PREVIEW_BYTES);

  const subject = `[edifio Sourcing] cron ${opts.cronName} en erreur`;
  const text =
    `Le cron ${opts.cronName} a échoué.\n\n` +
    `Message : ${opts.errorMessage}\n\n` +
    (stackPreview ? `Stack (extrait) :\n${stackPreview}\n\n` : "") +
    `Voir le détail : ${adminUrl}\n\n` +
    `— edifio Sourcing, observabilité automatique.`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:sans-serif;color:#0f172a;line-height:1.5">
<h2 style="color:#dc2626">⚠ Cron en erreur : <code>${escapeHtml(opts.cronName)}</code></h2>
<p><strong>Message</strong> : ${escapeHtml(opts.errorMessage)}</p>
${
  stackPreview
    ? `<details><summary>Stack (extrait)</summary><pre style="background:#f1f5f9;padding:8px;border-radius:4px;font-size:11px;overflow:auto">${escapeHtml(
        stackPreview,
      )}</pre></details>`
    : ""
}
<p><a href="${adminUrl}" style="display:inline-block;padding:8px 16px;background:#0f172a;color:#fff;text-decoration:none;border-radius:20px;font-size:13px">Ouvrir /admin/crons</a></p>
<p style="font-size:11px;color:#64748b;margin-top:24px">edifio Sourcing — observabilité automatique. Anti-spam : un mail par cron toutes les heures maximum.</p>
</body></html>`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Point d'entrée — appelé par les routes cron après `withCronRunLog`
 * quand `outcome.ok === false`. Best-effort : capture toutes les
 * exceptions et les warn console, ne propage rien.
 */
export async function notifyCronError(
  db: Db,
  cronName: string,
  error: unknown,
  opts: { sendEmailFn?: typeof sendEmail } = {},
): Promise<void> {
  try {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack =
      error instanceof Error && typeof error.stack === "string" ? error.stack : null;

    const canSend = await shouldSendAlert(db, cronName);
    if (!canSend) {
      console.log("[cron-notify:antispam:skip]", cronName);
      return;
    }

    const recipients = await getSuperadminEmails(db);
    if (recipients.length === 0) {
      console.warn("[cron-notify:no-recipients]", cronName);
      return;
    }

    const payload = buildPayload({ cronName, errorMessage, errorStack });
    const send = opts.sendEmailFn ?? sendEmail;

    // Resend n'accepte qu'un destinataire par appel → on boucle. Le volume
    // est tout petit (≤ 3 superadmins typiquement).
    for (const to of recipients) {
      try {
        await send({ to, ...payload });
      } catch (sendErr) {
        console.warn("[cron-notify:send:fail]", { cronName, to, err: sendErr });
      }
    }
    console.log("[cron-notify:sent]", { cronName, count: recipients.length });
  } catch (err) {
    console.warn("[cron-notify:unhandled]", cronName, err);
  }
}
