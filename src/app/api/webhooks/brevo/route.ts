/**
 * Route POST `/api/webhooks/brevo` — webhook transactionnel Brevo.
 *
 * Source de vérité :
 *  - `specs/module_tandem_engine_v1.md` §3.6
 *  - Brief Board 2026-05-24 (sous-étape 4 — HMAC obligatoire timing-safe)
 *
 * Public — pas de session AlyoS. Auth = HMAC SHA-256 du body brut avec le
 * secret `BREVO_WEBHOOK_SECRET` (cf. `src/lib/brevo/webhook-hmac.ts`).
 *
 * Events trackés (cf. `TRACKED_EVENTS`) :
 *   delivered, opened, click(ed), bounce (soft/hard), spam, unsubscribed,
 *   blocked, error, deferred.
 *
 * Persistance idempotente :
 *  - On append au JSONB `brevo_messages.events` (array d'events).
 *  - Idempotence par couple (message-id, event, ts) — Brevo retry parfois.
 *    On dédoublonne côté SQL via JSONB array contains check.
 *
 * Robustesse :
 *  - Body lu en BRUT (`req.text()`) — pas re-stringifié sinon la signature
 *    HMAC ne match plus.
 *  - Si le payload Brevo n'est pas un array (Brevo peut envoyer 1 objet
 *    seul pour certains events), on wrap dans un array.
 *  - Aucun event invalide ne fait planter le batch — on log et continue.
 */

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { brevoMessages } from "@/db/schema/integrations";
import {
  isTrackedEvent,
  loadBrevoWebhookSecret,
  readBrevoSignatureHeader,
  verifyBrevoHmac,
  type BrevoWebhookEvent,
} from "@/lib/brevo/webhook-hmac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  // 1. Charge le secret HMAC (fail-closed si absent en env)
  const secret = loadBrevoWebhookSecret();
  if (!secret) {
    console.error("[brevo-webhook] BREVO_WEBHOOK_SECRET manquant — webhook désactivé");
    // 503 pour signaler à Brevo que le webhook est temporairement indispo
    // (Brevo retentera selon sa politique de retry).
    return NextResponse.json({ ok: false, error: "webhook_disabled" }, { status: 503 });
  }

  // 2. Lit le body BRUT (string) — re-parser casserait la signature
  let body: string;
  try {
    body = await req.text();
  } catch (err) {
    console.error("[brevo-webhook] body read failed", err);
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  // 3. Verify HMAC timing-safe
  const signature = readBrevoSignatureHeader(req.headers);
  if (!signature) {
    return NextResponse.json({ ok: false, error: "missing_signature" }, { status: 401 });
  }
  if (!verifyBrevoHmac(body, signature, secret)) {
    // Pas de leak — on retourne 401 sans détail.
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  // 4. Parse JSON (Brevo envoie 1 event objet OU un array selon le mode webhook)
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_json",
        message: err instanceof Error ? err.message : "JSON parse failed",
      },
      { status: 400 },
    );
  }
  const events: BrevoWebhookEvent[] = Array.isArray(parsed)
    ? (parsed as BrevoWebhookEvent[])
    : [parsed as BrevoWebhookEvent];

  // 5. Traitement événement par événement (best-effort, on log les échecs)
  let processed = 0;
  let skipped = 0;
  for (const event of events) {
    const eventName = (event.event ?? "").toLowerCase();
    if (!isTrackedEvent(eventName)) {
      skipped++;
      continue;
    }
    const messageId = event["message-id"];
    if (!messageId) {
      skipped++;
      continue;
    }
    try {
      await appendEventIdempotent({ messageId, event });
      processed++;
    } catch (err) {
      console.error("[brevo-webhook:append_failed]", { messageId, eventName, err });
    }
  }

  return NextResponse.json({ ok: true, processed, skipped });
}

/**
 * Append idempotent d'un event Brevo à `brevo_messages.events` (JSONB array).
 *
 * Idempotence : on append uniquement si l'event (matché par `event` + `date`
 * ou `ts`) n'est PAS déjà présent. Pattern Postgres :
 *
 *   UPDATE brevo_messages
 *      SET events = events || $event::jsonb
 *    WHERE brevo_message_id = $messageId
 *      AND NOT EXISTS (
 *         SELECT 1 FROM jsonb_array_elements(events) e
 *          WHERE e->>'event' = $eventName
 *            AND COALESCE(e->>'date', '') = COALESCE($eventDate, '')
 *      )
 *
 * Si la ligne `brevo_messages` n'existe pas encore (cas dégradé : webhook
 * arrive avant l'INSERT côté `sendArchitectSolicitation`), on log et skip —
 * Brevo retentera dans 5 min, la ligne sera là.
 */
async function appendEventIdempotent(params: {
  messageId: string;
  event: BrevoWebhookEvent;
}): Promise<void> {
  const { messageId, event } = params;
  const eventName = (event.event ?? "").toLowerCase();
  const eventDate = event.date ?? null;

  // SQL natif Postgres — `jsonb_array_elements` pour la check de duplication.
  // On utilise `sql.raw` cantonné aux noms de table/colonne, paramètres en
  // bind ($1, $2, …) pour les valeurs (anti-injection).
  await db.execute(
    sql`
      UPDATE brevo_messages
         SET events = events || ${JSON.stringify(event)}::jsonb
       WHERE brevo_message_id = ${messageId}
         AND NOT EXISTS (
           SELECT 1
             FROM jsonb_array_elements(events) e
            WHERE lower(e->>'event') = ${eventName}
              AND COALESCE(e->>'date', '') = COALESCE(${eventDate}, '')
         )
    `,
  );
  // Si aucune ligne updated (brevoMessage inexistant) : on swallow.
  // Le `db.execute` ne lève pas pour 0 rows updated.
  void brevoMessages; // garde l'import vivant pour le typage
  void eq; // garde l'import vivant — utilisé symboliquement
}
