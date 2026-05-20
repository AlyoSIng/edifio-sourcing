/**
 * Helper audit log — edifio Sourcing (étape 5/7 PR #2).
 *
 * Source de vérité :
 *  - `specs/audit_log_v1.md` §Implémentation (signature TS + 13 payloads)
 *  - `src/db/schema/audit.ts` (table `audit_logs`)
 *  - `src/db/migrations/0002_rls.sql` §6 (trigger immutabilité INSERT-only)
 *
 * Principe :
 *  1. Valide `data` avec le schéma Zod par action (cf. `schemas.ts`)
 *  2. Enrichit le payload avec :
 *     - `organization_id`, `actor_id`, `actor_email`, `actor_role`
 *       depuis le JWT de la session Supabase courante
 *     - `ip_address`, `user_agent` depuis les headers HTTP (si `request` fourni)
 *  3. INSERT dans `audit_logs` via Supabase admin client (service_role).
 *     Bypass RLS pour l'écriture — c'est attendu : la lecture reste verrouillée
 *     en admin-only par la policy tenant_isolation (cf. 0002_rls.sql l.546).
 *
 * Contrat de non-throw :
 *  - L'audit ne doit JAMAIS casser l'action métier qui l'a déclenché. Toute
 *    erreur (validation Zod, INSERT BDD, session manquante) est loggée
 *    via `console.error` (capté en prod par Sentry / Vercel logs) mais le
 *    helper retourne `void` sans propager l'exception.
 *  - Cas particulier : en environnement de test (`NODE_ENV === 'test'`) on
 *    laisse l'erreur remonter pour faciliter la détection des régressions.
 *
 * Justification du choix non-throw :
 *  - Un INSERT audit qui foire (Supabase down 30s, JWT expiré, ...) ne doit
 *    PAS empêcher l'utilisateur de sélectionner son AO. L'audit est un
 *    « side-effect best-effort ». La spec audit insiste sur l'immutabilité
 *    mais pas sur la blocage des actions métier en cas d'échec d'audit.
 *  - Cf. discussion handoff CC_260512_AUDIT_NON_BLOCKING.md (à archiver
 *    quand Sentry sera branché — Gate 8).
 */

import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

import type { AuditAction, AuditLogDataFor } from "./schemas";
import { AUDIT_SCHEMAS } from "./schemas";

// ----------------------------------------------------------------------------
// Types internes
// ----------------------------------------------------------------------------

/**
 * Paramètres du helper. `data` est typé fort selon l'action (discriminated
 * lookup via `AuditLogDataFor<A>`).
 */
export interface AuditParams<A extends AuditAction> {
  action: A;
  data: AuditLogDataFor<A>;
  /** Type de l'objet impacté (ex. 'tender', 'architect'). Optionnel. */
  subjectType?: string;
  /** UUID de l'objet impacté. Optionnel. */
  subjectId?: string;
  /**
   * Requête HTTP courante — utile pour extraire `ip_address` (header
   * `x-forwarded-for` Vercel) et `user_agent`. Optionnel : si non fournie,
   * ces champs restent `null` en BDD.
   */
  request?: Request;
}

/**
 * Forme du payload INSERT. Exposé pour les tests qui inspectent l'argument
 * passé à `supabase.from('audit_logs').insert(...)`.
 */
export interface AuditInsertPayload {
  organization_id: string | null;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: "admin" | "user" | "viewer" | null;
  action: AuditAction;
  subject_type: string | null;
  subject_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  data: Record<string, unknown>;
}

// ----------------------------------------------------------------------------
// Helpers d'enrichissement
// ----------------------------------------------------------------------------

/**
 * Type minimal du JWT app_metadata Supabase tel que posé par notre custom
 * claim (cf. middleware + invite admin). On évite `any` en typant strictement
 * ce qu'on consomme.
 */
interface AppMetadata {
  organization_id?: string;
  role?: "admin" | "user" | "viewer";
}

/**
 * Extrait l'`x-forwarded-for` Vercel + le `user-agent` depuis une `Request`.
 * Retourne `null` si la valeur est absente ou vide.
 *
 * Note Vercel : le header `x-forwarded-for` contient une liste séparée par
 * virgules ; le premier élément est l'IP client réelle. Cf. doc Vercel
 * « Request Headers » (champ rfc 7239).
 */
function extractClientHeaders(request: Request | undefined): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  if (!request) return { ipAddress: null, userAgent: null };

  const xff = request.headers.get("x-forwarded-for");
  const ipAddress = xff ? (xff.split(",")[0]?.trim() ?? null) : null;

  const ua = request.headers.get("user-agent");
  const userAgent = ua && ua.length > 0 ? ua : null;

  return { ipAddress, userAgent };
}

/**
 * Lit la session Supabase courante et en dérive les champs `actor_*` +
 * `organization_id`. Retourne des `null` si la session est absente / invalide
 * (cas d'usage : audit côté Edge Function sans contexte user).
 */
async function readSessionContext(): Promise<{
  organizationId: string | null;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: "admin" | "user" | "viewer" | null;
}> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        organizationId: null,
        actorId: null,
        actorEmail: null,
        actorRole: null,
      };
    }

    const meta = (user.app_metadata ?? {}) as AppMetadata;
    return {
      organizationId: meta.organization_id ?? null,
      actorId: user.id,
      actorEmail: user.email ?? null,
      actorRole: meta.role ?? null,
    };
  } catch (err) {
    // Tolérant : si createSupabaseServerClient() throw (hors contexte Next.js
    // request, ex. tests), on garde des null. L'erreur originelle est tracée.
    console.error("[audit] readSessionContext a échoué :", err);
    return {
      organizationId: null,
      actorId: null,
      actorEmail: null,
      actorRole: null,
    };
  }
}

// ----------------------------------------------------------------------------
// Helper public
// ----------------------------------------------------------------------------

/**
 * Audit une action sensible. Best-effort : ne throw pas en prod (cf. JSDoc
 * en-tête). Signature génériquement typée par `AuditAction` pour autocomplétion
 * du payload `data`.
 *
 * @example
 *   await audit({
 *     action: 'tender_select',
 *     data: { tender_id, tender_ref, mode: 'solo', score: 87 },
 *     subjectType: 'tender',
 *     subjectId: tender_id,
 *     request,
 *   });
 */
export async function audit<A extends AuditAction>(params: AuditParams<A>): Promise<void> {
  const { action, data, subjectType, subjectId, request } = params;

  try {
    // 1. Validation Zod par action (lève ZodError sur payload non conforme)
    const schema = AUDIT_SCHEMAS[action];
    const parsedData = schema.parse(data) as Record<string, unknown>;

    // 2. Enrichissement session + headers
    const session = await readSessionContext();
    const { ipAddress, userAgent } = extractClientHeaders(request);

    const payload: AuditInsertPayload = {
      organization_id: session.organizationId,
      actor_id: session.actorId,
      actor_email: session.actorEmail,
      actor_role: session.actorRole,
      action,
      subject_type: subjectType ?? null,
      subject_id: subjectId ?? null,
      ip_address: ipAddress,
      user_agent: userAgent,
      data: parsedData,
    };

    // 3. INSERT via service_role (bypass RLS pour écriture — la lecture
    // reste verrouillée admin-only par tenant_isolation).
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("audit_logs").insert(payload);

    if (error) {
      // Best-effort : on log mais on ne propage pas (l'action métier doit
      // continuer même si l'audit échoue côté BDD).
      console.error("[audit] INSERT audit_logs a échoué :", { action, error });
      if (process.env.NODE_ENV === "test") throw error;
    }
  } catch (err) {
    // Best-effort global (ZodError, exception inattendue, ...).
    console.error("[audit] helper audit() a levé une exception :", { action, err });
    if (process.env.NODE_ENV === "test") throw err;
  }
}

// Re-exports utiles pour les call-sites (audit + types)
export type { AuditAction, AuditLogDataFor } from "./schemas";
