/**
 * Client Resend minimal — appel HTTP REST direct (pas de dépendance `resend`).
 *
 * Justification : le SDK officiel `resend` ajoute ~150 kB de bundle pour
 * une seule fonction `emails.send`. On préfère un fetch direct (Node 22+
 * a `fetch` global), zéro deps. Le SDK pourra être adopté plus tard si on
 * a besoin des webhooks, audiences, batches, etc.
 *
 * API : https://resend.com/docs/api-reference/emails/send-email
 *
 * Config minimale (`.env.local`) :
 *   - RESEND_API_KEY=re_xxx
 *   - RESEND_FROM_EMAIL=no-reply@alyosingenierie.fr  (domaine à valider DNS)
 */

const RESEND_API_URL = "https://api.resend.com/emails";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Optionnel — override du `from` configuré globalement (cas test). */
  from?: string;
  /** Optionnel — override de l'endpoint (utile pour tests / mocks Playwright). */
  endpoint?: string;
}

export interface SendEmailResult {
  id: string;
}

/**
 * Envoie un email via Resend. Throw si la config manque ou si l'API
 * répond en erreur. À l'appelant de capturer pour décider du fallback
 * (log + succès apparent côté forgot-password, vs propagation côté
 * admin/users où l'admin a besoin du feedback).
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  // 2026-06-04 — Steve a posé `RESEND_API_SOURCING_KEY` sur Vercel pour
  // distinguer du reste de l'écosystème AlyoS. On lit d'abord ce nom
  // « sourcing-scoped », puis on retombe sur le nom historique
  // `RESEND_API_KEY` pour les tests locaux / scripts ops qui le posent
  // encore comme ça. Les 2 conventions cohabitent sans casser quoi que ce soit.
  // `??` ne suffit pas : Vercel + Vitest peuvent poser une chaîne vide. On
  // filtre explicitement les vides avant le fallback.
  const sourcing = process.env.RESEND_API_SOURCING_KEY;
  const legacy = process.env.RESEND_API_KEY;
  const apiKey = sourcing && sourcing.length > 0 ? sourcing : legacy;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_SOURCING_KEY (ou RESEND_API_KEY en local) non configurée. Voir .env.example.",
    );
  }
  const from = params.from ?? process.env.RESEND_FROM_EMAIL;
  if (!from) {
    throw new Error("RESEND_FROM_EMAIL non configurée. Voir .env.example.");
  }

  const endpoint = params.endpoint ?? RESEND_API_URL;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "(no body)");
    throw new Error(`Resend API error ${response.status}: ${detail}`);
  }

  const json = (await response.json()) as { id?: string };
  if (!json.id) {
    throw new Error("Resend API: réponse sans champ 'id'.");
  }
  return { id: json.id };
}
