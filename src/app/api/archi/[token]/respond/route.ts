/**
 * Route POST `/api/archi/[token]/respond` — réponse architecte à une
 * sollicitation Tandem.
 *
 * Source de vérité : `specs/module_tandem_engine_v1.md` §3.5.
 *
 * Public — pas de middleware Supabase (cf. `PUBLIC_ARCHITECT_API_PREFIX`).
 * Authentification = JWT architecte dans le path (`aud=architect`, RS256,
 * révocable via `architect_tokens.revoked`).
 *
 * Effets de bord (dans l'ordre — chaque étape robuste à l'échec des suivantes) :
 *  1. Verify JWT crypto + audience + exp + révocation BDD
 *  2. Validate body `{ status: 'accepted'|'declined'|'info_requested', message? }`
 *  3. UPDATE `architect_responses (status, responded_at, info_request_text)`
 *     en se basant sur (tenderId, architectId) — gate `status='pending'` pour
 *     l'idempotence (un 2e clic sur « Oui » renvoie 200 sans rejouer Odoo).
 *  4. UPDATE `tenders.status` selon mapping spec (architect_accepted |
 *     architect_declined | architect_info_requested)
 *  5. Audit A16 `architect_response` (l'acteur n'est PAS un user AlyoS —
 *     `actor_*` resteront NULL côté helper).
 *  6. Si `accepted` → trigger `createOdooOpportunity(tenderId, { origin:
 *     'tandem', architectId, stage: 'Réponse cotraitance' })`. Best-effort :
 *     un échec Odoo ne casse PAS la réponse (la trace BDD existe).
 *  7. Si `declined` → envoi mail D.8 ack court (best-effort).
 *  8. Realtime broadcast user AlyoS (best-effort).
 *
 * Robustesse :
 *  - Toutes les étapes post-DB (Odoo, Brevo D.8, Realtime) sont best-effort.
 *  - Tout échec retourne JSON 4xx/5xx au client (l'archi voit un message
 *    d'erreur in-page côté ArchitectResponseForm).
 *
 * Sécurité :
 *  - JWT verify avant tout I/O — pas d'oracle de révocation accessible.
 *  - Pas de log du JWT en clair (uniquement `jti` masqué si nécessaire).
 *  - Validation body Zod stricte.
 *  - `infoRequestText` limité à 1000 caractères.
 */

import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db as defaultDb } from "@/db/client";
import { architects } from "@/db/schema/architects";
import { architectResponses, architectTokens } from "@/db/schema/selections";
import { tenders } from "@/db/schema/tenders";
import { audit } from "@/lib/audit";
import { getBrevoClient } from "@/lib/brevo/client";
import { pickBrevoTemplateId, templateNameFor } from "@/lib/brevo/template-picker";
import { createOdooOpportunity } from "@/lib/odoo/opportunities";
import { verifyArchitectToken } from "@/lib/tandem/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BODY_SCHEMA = z.object({
  status: z.enum(["accepted", "declined", "info_requested"]),
  message: z.string().max(1000).optional(),
});

interface RouteContext {
  params: { token: string };
}

const STATUS_TO_TENDER_STATUS = {
  accepted: "architect_accepted",
  declined: "architect_declined",
  info_requested: "architect_info_requested",
} as const;

export async function POST(req: Request, { params }: RouteContext): Promise<NextResponse> {
  const db = defaultDb;

  // 1. Verify JWT (signature + audience + exp + révocation BDD)
  const verifyResult = await verifyArchitectToken(params.token, async (jti) => {
    try {
      const rows = await db
        .select({ revoked: architectTokens.revoked })
        .from(architectTokens)
        .where(eq(architectTokens.jwtId, jti))
        .limit(1);
      if (!rows[0]) return "unknown";
      if (rows[0].revoked) return "revoked";
      return "valid";
    } catch {
      return "unknown";
    }
  });

  if (!verifyResult.ok) {
    // Pas de leak — message générique, code HTTP générique (401).
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
  }
  const decoded = verifyResult.payload;

  // 2. Parse body
  let body: z.infer<typeof BODY_SCHEMA>;
  try {
    const raw = await req.json();
    body = BODY_SCHEMA.parse(raw);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_body",
        message: err instanceof Error ? err.message : "Body JSON invalide",
      },
      { status: 400 },
    );
  }

  // 3. Pré-fetch archi (besoin email pour D.8 si declined)
  let architectEmail: string | null = null;
  let architectActive = true;
  try {
    const rows = await db
      .select({ email: architects.email, active: architects.active })
      .from(architects)
      .where(
        and(
          eq(architects.id, decoded.architectId),
          eq(architects.organizationId, decoded.organizationId),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      return NextResponse.json({ ok: false, error: "architect_not_found" }, { status: 404 });
    }
    architectEmail = rows[0].email;
    architectActive = rows[0].active;
  } catch (err) {
    console.error("[archi-respond:archi_lookup]", err);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }

  if (!architectActive) {
    // L'archi s'est opposé entre l'envoi du mail et le clic — on bloque.
    return NextResponse.json({ ok: false, error: "architect_inactive" }, { status: 403 });
  }

  // 4. Transaction : update architect_responses + tender status (idempotent)
  let alreadyResponded = false;
  try {
    await db.transaction(async (tx) => {
      // Lock + check le row architect_responses
      const existing = await tx
        .select({ status: architectResponses.status })
        .from(architectResponses)
        .where(
          and(
            eq(architectResponses.tenderId, decoded.tenderId),
            eq(architectResponses.architectId, decoded.architectId),
            eq(architectResponses.organizationId, decoded.organizationId),
          ),
        )
        .limit(1);

      if (!existing[0]) {
        // Pas de ligne pending — état pathologique (le mail Brevo ne devrait
        // pas exister sans architect_responses pending). On crée pour ne pas
        // perdre la réponse.
        await tx.insert(architectResponses).values({
          tenderId: decoded.tenderId,
          organizationId: decoded.organizationId,
          architectId: decoded.architectId,
          status: body.status,
          respondedAt: new Date(),
          infoRequestText: body.status === "info_requested" ? (body.message ?? null) : null,
        });
      } else if (existing[0].status !== "pending") {
        // Idempotence : déjà répondu, on ne rejoue rien (Odoo, mail D.8…).
        alreadyResponded = true;
      } else {
        await tx
          .update(architectResponses)
          .set({
            status: body.status,
            respondedAt: new Date(),
            infoRequestText: body.status === "info_requested" ? (body.message ?? null) : null,
          })
          .where(
            and(
              eq(architectResponses.tenderId, decoded.tenderId),
              eq(architectResponses.architectId, decoded.architectId),
              eq(architectResponses.organizationId, decoded.organizationId),
            ),
          );
      }

      // Tender status — uniquement si on n'est pas en idempotence
      if (!alreadyResponded) {
        await tx
          .update(tenders)
          .set({
            status: STATUS_TO_TENDER_STATUS[body.status],
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(tenders.id, decoded.tenderId),
              eq(tenders.organizationId, decoded.organizationId),
              // Garde : on ne sort de `awaiting_architect` que si on y est —
              // évite d'écraser un status manuellement avancé côté admin.
              eq(tenders.status, "awaiting_architect"),
            ),
          );
      }
    });
  } catch (err) {
    console.error("[archi-respond:tx_fail]", err);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }

  if (alreadyResponded) {
    // 200 idempotent — l'archi reçoit la même UX que le premier clic
    // (mais on ne rejoue ni audit ni Odoo ni mail D.8).
    return NextResponse.json({ ok: true, alreadyResponded: true });
  }

  // 5. Audit A16 (best-effort — le helper absorbe les erreurs)
  await audit({
    action: "architect_response",
    subjectType: "tender",
    subjectId: decoded.tenderId,
    data: {
      tender_id: decoded.tenderId,
      architect_id: decoded.architectId,
      status: body.status,
      token_jti: decoded.jti,
      has_info_request_text: Boolean(body.status === "info_requested" && body.message?.trim()),
    },
  });

  // 6. Si accepted → trigger Odoo (best-effort, l'échec ne casse pas la réponse)
  if (body.status === "accepted") {
    try {
      const result = await createOdooOpportunity(
        decoded.tenderId,
        {
          stage: "Réponse cotraitance",
          origin: "tandem",
          architectId: decoded.architectId,
        },
        { organizationId: decoded.organizationId },
      );
      if (!result.ok) {
        console.error("[archi-respond:odoo_fail]", result);
      }
    } catch (err) {
      console.error("[archi-respond:odoo_throw]", err);
    }
  }

  // 7. Si declined → envoi du template D.8 (best-effort)
  if (body.status === "declined" && architectEmail) {
    try {
      const templateId = pickBrevoTemplateId("decline_ack", "vous"); // neutre — register ignoré
      const client = getBrevoClient();
      const sendResult = await client.send({
        templateId,
        to: { email: architectEmail },
        params: {
          org_name: "AlyoS Ingénierie",
        },
        customHeader: `tender:${decoded.tenderId};archi:${decoded.architectId};kind:decline_ack`,
      });
      if (!sendResult.ok) {
        console.error("[archi-respond:brevo_d8_fail]", sendResult);
      }
    } catch (err) {
      // pickBrevoTemplateId throw si l'env BREVO_TEMPLATE_ID_ARCHITECT_DECLINE_ACKNOWLEDGMENT
      // est absent — log et on continue (la réponse archi reste valide).
      console.error("[archi-respond:brevo_d8_throw]", err);
    }
    void templateNameFor; // import garde pour la cohérence d'inventaire — pas de log inutile
  }

  // 8. Realtime broadcast (best-effort) — la session AlyoS qui a sélectionné
  //    l'AO recevra une notification in-app. À brancher Phase 2 quand on aura
  //    posé le canal Supabase Realtime côté Server Action.
  //    TODO(Phase 2) : `supabaseAdmin.channel('org-...').send(...)`

  return NextResponse.json({ ok: true });
}
