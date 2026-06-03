/**
 * Cron digest hebdo — alertes bibliothèque expirée.
 *
 * Décision Steve 2026-06-03 (chantier G2.2). Tous les lundis matin, pour
 * chaque organisation : si au moins un item presentation_library a une
 * date d'expiration passée (`expired`) ou dans les 30 prochains jours
 * (`expiringSoon`), on envoie un mail digest à tous les admins (+ superadmins)
 * de l'organisation. Le mail liste les docs concernés et un lien vers la
 * bibliothèque pour renouveler.
 *
 * Sécurité :
 *  - Pas d'auth user — route /api/cron/library-expiry-digest gated par
 *    `CRON_SECRET` (cf. tandem-followup pattern).
 *  - Tenant isolation : la boucle traite chaque org séparément, jamais de
 *    données cross-tenant dans un même mail.
 *
 * Coûts : Resend (~$0.001 / mail). Pour 1 org × 1-2 admins × 1 mail / semaine
 * = ~$0.10 / an. Négligeable.
 */

import { eq, inArray } from "drizzle-orm";

import { memberships, users } from "@/db/schema/users";
import { organizations } from "@/db/schema/organizations";
import { presentationLibrary } from "@/db/schema/library";
import type { db as defaultDb } from "@/db/client";
import { classifyLibraryExpiry, type LibraryExpiryClassification } from "./expiry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DrizzleClient = typeof defaultDb;

export interface SendEmailFn {
  (input: { to: string; subject: string; html: string; text: string }): Promise<{ id: string }>;
}

export interface RunDigestInput {
  db: DrizzleClient;
  sendEmail: SendEmailFn;
  /** URL de base de l'app — utilisée dans le lien « Aller à la bibliothèque ». */
  baseUrl: string;
  /** Date de référence (défaut now). Override pour tests reproductibles. */
  now?: Date;
}

export interface RunDigestOrgResult {
  organizationId: string;
  organizationName: string;
  expiredCount: number;
  expiringSoonCount: number;
  /** Admins notifiés avec succès (email seulement, pas le user id pour réduire la PII en logs). */
  emailsSent: string[];
  /** Erreurs Resend (déjà serialisées). */
  emailFailures: Array<{ email: string; message: string }>;
}

export interface RunDigestResult {
  totalOrganizations: number;
  organizationsWithIssues: number;
  totalEmailsSent: number;
  totalEmailFailures: number;
  perOrg: RunDigestOrgResult[];
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Helpers de rendu (purs, exportés pour tests)
// ---------------------------------------------------------------------------

interface DigestItem {
  name: string;
  validUntilIso: string;
}

interface DigestContent {
  organizationName: string;
  expired: DigestItem[];
  expiringSoon: DigestItem[];
  libraryUrl: string;
}

/** Construit l'objet du mail digest. */
export function buildDigestSubject(content: DigestContent): string {
  const total = content.expired.length + content.expiringSoon.length;
  if (content.expired.length > 0) {
    return `⚠️ ${content.expired.length} document${content.expired.length > 1 ? "s" : ""} expiré${content.expired.length > 1 ? "s" : ""} en bibliothèque`;
  }
  return `${total} document${total > 1 ? "s" : ""} bibliothèque à renouveler bientôt`;
}

/** Construit le corps HTML du mail digest. */
export function buildDigestHtml(content: DigestContent): string {
  const expiredSection =
    content.expired.length === 0
      ? ""
      : `
<p><strong style="color:#b91c1c;">▸ ${content.expired.length} document${content.expired.length > 1 ? "s" : ""} expiré${content.expired.length > 1 ? "s" : ""}</strong>
— exclu${content.expired.length > 1 ? "s" : ""} automatiquement des prochains dossiers de candidature. À renouveler en priorité :</p>
<ul>
${content.expired.map((it) => `  <li>${escapeHtml(it.name)} <em style="color:#666;">(valide jusqu'au ${it.validUntilIso})</em></li>`).join("\n")}
</ul>`;

  const soonSection =
    content.expiringSoon.length === 0
      ? ""
      : `
<p><strong style="color:#b45309;">▸ ${content.expiringSoon.length} document${content.expiringSoon.length > 1 ? "s" : ""} expire${content.expiringSoon.length > 1 ? "nt" : ""} dans les 30 jours</strong>
— encore inclus dans les dossiers mais à surveiller :</p>
<ul>
${content.expiringSoon.map((it) => `  <li>${escapeHtml(it.name)} <em style="color:#666;">(valide jusqu'au ${it.validUntilIso})</em></li>`).join("\n")}
</ul>`;

  return `<p>Bonjour,</p>

<p>Récap hebdomadaire des documents de la bibliothèque ${escapeHtml(content.organizationName)} qui nécessitent ton attention :</p>

${expiredSection}
${soonSection}

<p style="margin-top:24px;">
  <a href="${content.libraryUrl}"
     style="display:inline-block;background:#FF0033;color:#fff;font-weight:bold;padding:10px 18px;border-radius:24px;text-decoration:none;">
    → Aller à la bibliothèque
  </a>
</p>

<p style="font-size:12px;color:#666;margin-top:24px;">
  Ce mail est envoyé automatiquement chaque lundi matin si au moins un document
  de la bibliothèque est expiré ou expire dans les 30 prochains jours.
</p>

<p style="font-size:12px;color:#666;">
  <em>— via edifio Sourcing</em>
</p>`;
}

/** Construit le corps texte du mail digest (fallback texte + Resend exige les 2). */
export function buildDigestText(content: DigestContent): string {
  const lines: string[] = [];
  lines.push(`Récap bibliothèque ${content.organizationName}`);
  lines.push("");
  if (content.expired.length > 0) {
    lines.push(`${content.expired.length} document(s) expiré(s) :`);
    for (const it of content.expired) {
      lines.push(`  - ${it.name} (valide jusqu'au ${it.validUntilIso})`);
    }
    lines.push("");
  }
  if (content.expiringSoon.length > 0) {
    lines.push(`${content.expiringSoon.length} document(s) expire(nt) dans les 30 jours :`);
    for (const it of content.expiringSoon) {
      lines.push(`  - ${it.name} (valide jusqu'au ${it.validUntilIso})`);
    }
    lines.push("");
  }
  lines.push(`Aller à la bibliothèque : ${content.libraryUrl}`);
  lines.push("");
  lines.push("— via edifio Sourcing");
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Helper pure — classifie et garde les champs utilisés par le mail
// ---------------------------------------------------------------------------

function toDigestItems(items: LibraryExpiryClassification["expired"]): DigestItem[] {
  return items.map((it) => ({
    name: it.name,
    validUntilIso: String(it.validUntil ?? "").slice(0, 10),
  }));
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

/**
 * Parcourt toutes les organisations actives, calcule les items biblio
 * expirés / bientôt expirés et envoie un mail digest à chaque admin
 * (incluant superadmin) si la liste n'est pas vide.
 *
 * Idempotent : peut être rejoué le même jour (Resend dédupe via son propre
 * idempotency key seulement si on le fournit — non fait ici. Le risque
 * d'envoyer 2 mails est faible car le cron tourne 1×/semaine).
 */
export async function runLibraryExpiryDigest(input: RunDigestInput): Promise<RunDigestResult> {
  const { db, sendEmail, baseUrl, now = new Date() } = input;
  const t0 = Date.now();

  // 1. Liste toutes les organisations (pas d'autre filtre — chaque org a
  //    potentiellement des items biblio à surveiller).
  const orgs = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations);

  const perOrg: RunDigestOrgResult[] = [];
  let totalEmailsSent = 0;
  let totalEmailFailures = 0;
  let organizationsWithIssues = 0;

  for (const org of orgs) {
    // 2. Items biblio de l'org.
    const items = await db
      .select()
      .from(presentationLibrary)
      .where(eq(presentationLibrary.organizationId, org.id));

    if (items.length === 0) {
      perOrg.push({
        organizationId: org.id,
        organizationName: org.name,
        expiredCount: 0,
        expiringSoonCount: 0,
        emailsSent: [],
        emailFailures: [],
      });
      continue;
    }

    // 3. Classification.
    const classification = classifyLibraryExpiry(items, now);
    const expiredCount = classification.expired.length;
    const expiringSoonCount = classification.expiringSoon.length;

    if (expiredCount === 0 && expiringSoonCount === 0) {
      // Rien à signaler pour cette org — on skippe silencieusement.
      perOrg.push({
        organizationId: org.id,
        organizationName: org.name,
        expiredCount: 0,
        expiringSoonCount: 0,
        emailsSent: [],
        emailFailures: [],
      });
      continue;
    }

    organizationsWithIssues += 1;

    // 4. Admins + superadmins de l'org.
    const adminMembers = await db
      .select({ email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organizationId, org.id));

    // Filtre côté JS car Drizzle pgEnum + filter is sometimes painful — on
    // récupère tous les members et on filtre sur le rôle après. Le set
    // « admin + superadmin » est minoritaire dans une org, le surcoût
    // applicatif est négligeable.
    const targets = await db
      .select({ userId: memberships.userId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.organizationId, org.id));

    const adminUserIds = targets
      .filter((m) => m.role === "admin" || m.role === "superadmin")
      .map((m) => m.userId);

    if (adminUserIds.length === 0) {
      perOrg.push({
        organizationId: org.id,
        organizationName: org.name,
        expiredCount,
        expiringSoonCount,
        emailsSent: [],
        emailFailures: [{ email: "(no admin)", message: "no admin found for org" }],
      });
      continue;
    }

    const adminEmailRows = await db
      .select({ email: users.email })
      .from(users)
      .where(inArray(users.id, adminUserIds));
    void adminMembers;

    // 5. Construit le contenu du mail (1 mail identique par admin).
    const content: DigestContent = {
      organizationName: org.name,
      expired: toDigestItems(classification.expired),
      expiringSoon: toDigestItems(classification.expiringSoon),
      libraryUrl: `${baseUrl}/sourcing/admin/bibliotheque`,
    };
    const subject = buildDigestSubject(content);
    const html = buildDigestHtml(content);
    const text = buildDigestText(content);

    // 6. Envoie 1 mail par admin.
    const emailsSent: string[] = [];
    const emailFailures: Array<{ email: string; message: string }> = [];
    for (const row of adminEmailRows) {
      if (!row.email) continue;
      try {
        await sendEmail({ to: row.email, subject, html, text });
        emailsSent.push(row.email);
        totalEmailsSent += 1;
      } catch (err) {
        emailFailures.push({
          email: row.email,
          message: err instanceof Error ? err.message : String(err),
        });
        totalEmailFailures += 1;
      }
    }

    perOrg.push({
      organizationId: org.id,
      organizationName: org.name,
      expiredCount,
      expiringSoonCount,
      emailsSent,
      emailFailures,
    });
  }

  return {
    totalOrganizations: orgs.length,
    organizationsWithIssues,
    totalEmailsSent,
    totalEmailFailures,
    perOrg,
    durationMs: Date.now() - t0,
  };
}
