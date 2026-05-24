/**
 * Client Brevo minimaliste — module Tandem (sollicitation architecte).
 *
 * Source de vérité :
 *  - `specs/module_tandem_engine_v1.md` §3.3 (envoi transactionnel)
 *  - `design/copy/email_sollicitation_architecte_v1.md` (variables)
 *  - `.env.example` lignes 60-73 (BREVO_API_KEY + 5 IDs templates +
 *    BREVO_WEBHOOK_SECRET)
 *
 * Conception :
 *  - **Pas de SDK Brevo ajouté** (parité Resend custom — éviter une dépendance
 *    transitive pour deux endpoints). On utilise `fetch` natif vers l'API
 *    REST v3 Brevo : `POST https://api.brevo.com/v3/smtp/email`.
 *  - **Interface mockable** : tous les call-sites consomment `BrevoClient`
 *    (interface), pas l'implémentation. Tests injectent un mock.
 *  - **Pas de retry agressif** au MVP — si l'envoi échoue (network, 5xx),
 *    on retourne `ok=false` et la Server Action décide (rollback DB ou
 *    retry user). En Phase 2 : queue Supabase Realtime + retry exponentiel.
 *  - **Headers `X-Mailin-custom`** : on inclut `tender:<uuid>;archi:<uuid>`
 *    pour pouvoir rejoindre côté webhook (event ↔ message en cas de
 *    `brevoMessageId` perdu).
 *
 * Sécurité :
 *  - `BREVO_API_KEY` lu depuis env à chaque appel (pas caché en mémoire au
 *    boot du module — évite la fuite via heap dump).
 *  - JAMAIS de log du payload contenant l'API key (header `api-key` est
 *    dans le request init, pas dans le log).
 *  - Validation `to.email` simple (regex non-RFC) avant fetch.
 */

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface BrevoTransactionalEmailInput {
  /** ID Brevo du template (entier). */
  templateId: number;
  /** Destinataire — email + name (Brevo accepte multi-recipients mais on
   *  reste single-recipient pour les sollicitations archi). */
  to: { email: string; name?: string };
  /** Variables du template (`params` dans l'API Brevo). */
  params: Record<string, string | number | boolean>;
  /** Header `X-Mailin-custom` (libre — utilisé pour join webhook). */
  customHeader?: string;
  /** Reply-to (optionnel — défaut compte Brevo). */
  replyTo?: { email: string; name?: string };
}

export interface BrevoSendResult {
  ok: true;
  messageId: string;
}

export interface BrevoSendError {
  ok: false;
  error: "missing_api_key" | "invalid_recipient" | "http_error" | "network" | "parse";
  status?: number;
  detail?: string;
}

export interface BrevoClient {
  send(input: BrevoTransactionalEmailInput): Promise<BrevoSendResult | BrevoSendError>;
}

/* -------------------------------------------------------------------------- */
/*  Implémentation production                                                  */
/* -------------------------------------------------------------------------- */

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Dépendance fetch injectable — pour tests. */
export type FetchFn = typeof fetch;

/**
 * Crée un client Brevo qui fait des vrais appels REST.
 *
 * @param opts.fetchFn — override `fetch` pour tests (mock)
 */
export function createBrevoClient(opts: { fetchFn?: FetchFn } = {}): BrevoClient {
  const fetchFn = opts.fetchFn ?? globalThis.fetch;

  return {
    async send(input: BrevoTransactionalEmailInput) {
      const apiKey = process.env.BREVO_API_KEY;
      if (!apiKey) {
        return { ok: false, error: "missing_api_key" };
      }
      if (!input.to?.email || !EMAIL_RE.test(input.to.email)) {
        return {
          ok: false,
          error: "invalid_recipient",
          detail: `Email invalide : ${input.to?.email}`,
        };
      }

      const body: Record<string, unknown> = {
        templateId: input.templateId,
        to: [
          input.to.name
            ? { email: input.to.email, name: input.to.name }
            : { email: input.to.email },
        ],
        params: input.params,
      };
      if (input.customHeader) {
        body.headers = { "X-Mailin-custom": input.customHeader };
      }
      if (input.replyTo) {
        body.replyTo = input.replyTo;
      }

      let resp: Response;
      try {
        resp = await fetchFn(BREVO_API_URL, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "api-key": apiKey,
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        return {
          ok: false,
          error: "network",
          detail: err instanceof Error ? err.message : String(err),
        };
      }

      if (!resp.ok) {
        let detail: string;
        try {
          detail = await resp.text();
        } catch {
          detail = `HTTP ${resp.status} ${resp.statusText}`;
        }
        return {
          ok: false,
          error: "http_error",
          status: resp.status,
          detail,
        };
      }

      try {
        const data = (await resp.json()) as { messageId?: string };
        if (!data.messageId) {
          return { ok: false, error: "parse", detail: "Pas de messageId dans la réponse" };
        }
        return { ok: true, messageId: data.messageId };
      } catch (err) {
        return {
          ok: false,
          error: "parse",
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

/**
 * Singleton — utilisé par les call-sites prod. Cache une seule instance pour
 * éviter de re-créer le wrapper fetch à chaque appel.
 */
let cachedClient: BrevoClient | null = null;
export function getBrevoClient(): BrevoClient {
  if (!cachedClient) cachedClient = createBrevoClient();
  return cachedClient;
}

/** Reset cache — usage tests uniquement. */
export function __resetBrevoClientCache(): void {
  cachedClient = null;
}
