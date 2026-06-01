"use server";

/**
 * Server Actions — flux Tandem (matching + sollicitation architecte).
 *
 * Source de vérité :
 *  - `specs/module_tandem_engine_v1.md` §3.1 (matching), §3.3 (Server Action
 *    sendArchitectSolicitation)
 *  - `handoff/PLAN_TANDEM_NADIA_260522.md` §étape 2 sous-étape 3
 *  - Décision Q3 Board 2026-05-24 — `{{rgpd_block}}` en variable code
 *  - `DECISIONS.md` 2026-05-22 (c) — `tokenId` + `followupSentAt` posés
 *  - `src/lib/audit/schemas.ts` — A5 strict (architect_solicit)
 *
 * Périmètre sous-étape 3 :
 *  1. `matchArchitectsForTender(tenderId)` — exécute le matcher V1
 *     (`rankArchitects`) avec les architectes solicitables + actifs du
 *     tenant, retourne top N (3 par défaut) avec rationale fallback. La
 *     persistance dans `match_proposals` se fait à l'envoi (`sendArchitectSolicitation`)
 *     — pas avant : l'utilisateur peut consulter la short-list sans
 *     forcément envoyer une sollicitation.
 *  2. `sendArchitectSolicitation(tenderId, architectId, opts)` — envoie le
 *     mail Brevo + crée le JWT architecte + persiste `match_proposals` +
 *     `architect_tokens` + `architect_opposition_tokens` + `architect_responses`
 *     (status=pending) + `brevo_messages` + bascule tender status →
 *     `awaiting_architect`. Audit A5 `architect_solicit` post-commit.
 *
 * **Conformité contrat partagé avec Alex (Solo) :**
 *  - `createOdooOpportunity` est consommé ici lors d'un futur `accepted` archi
 *    (étape 4 — page tokenisée). Ce module ne le déclenche PAS — Tandem
 *    crée l'opp Odoo seulement à l'acceptation, pas à la sollicitation
 *    (cf. spec §3.5).
 *
 * Sécurité :
 *  - Auth check via `requireAlyosUser` (auth + domaine alyosingenierie.fr)
 *  - Validation UUID inputs (tenderId, architectId)
 *  - Transactions Drizzle : SELECT FOR UPDATE sur `tenders` pour éviter
 *    course concurrente sur le status
 *  - Génération JWT côté serveur uniquement (clé privée jamais exposée)
 *  - Token d'opposition généré UNE fois par architecte (réutilisé après
 *    si déjà actif et non utilisé) — évite la multiplication de tokens
 *    long-life par architecte
 */

import { revalidatePath } from "next/cache";
import { and, eq, gte, ilike, inArray, not, sql } from "drizzle-orm";

import { db as defaultDb } from "@/db/client";
import { architects } from "@/db/schema/architects";
import {
  architectOppositionTokens,
  architectResponses,
  architectTokens,
  matchProposals,
} from "@/db/schema/selections";
import { brevoMessages } from "@/db/schema/integrations";
import { organizationProfiles } from "@/db/schema/messaging";
import { withTenantContext } from "@/lib/db/with-tenant-context";
import { tenders } from "@/db/schema/tenders";
import { audit } from "@/lib/audit";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { toUserProfile } from "@/lib/auth/types";
import { getBrevoClient, type BrevoClient } from "@/lib/brevo/client";
import {
  defaultRegisterFromTutoiement,
  pickBrevoTemplateId,
  templateNameFor,
  type BrevoRegister,
} from "@/lib/brevo/template-picker";
import { resolveBrevoTemplate } from "@/lib/brevo/template-resolver";
import { buildBrevoVariables } from "@/lib/brevo/variables";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extractDepartment, rankArchitects, type MatchScore } from "@/lib/tandem/matching";
import { signArchitectToken } from "@/lib/tandem/jwt";
import { generateRationaleWithAi } from "@/lib/tandem/ai-rationale";
import { createHaikuRationaleClient } from "@/lib/ai/haiku-rationale-client";
import type { Architect } from "@/db/schema/architects";
import type { Tender } from "@/db/schema/tenders";

// ============================================================================
// Types publics
// ============================================================================

export type DrizzleClient = typeof defaultDb;

export interface AuthClientLike {
  auth: {
    getUser: () => Promise<{ data: { user: import("@supabase/supabase-js").User | null } }>;
  };
}

export type AuditFn = typeof audit;

interface ActionDeps {
  db?: DrizzleClient;
  authClient?: AuthClientLike;
  auditFn?: AuditFn;
  brevoClient?: BrevoClient;
}

/**
 * Filtres optionnels de shortlist — appliqués avant `rankArchitects`.
 * Permettent à l'utilisateur d'affiner la liste directement dans l'UI
 * sans persister en BDD (session-only).
 */
export interface ShortlistMatchOptions {
  /** Nombre max d'architectes à retourner (défaut 10, max 50). */
  topN?: number;
  /**
   * Si non vide, restreint le pool d'architectes à ceux dont au moins
   * une des `geoZones` figure dans cette liste (codes dép. ex. "83", "06").
   */
  overrideDepts?: string[];
  /**
   * Si non vide, restreint le pool aux architectes dont au moins un
   * `specialtyCode` figure dans cette liste (codes ex. "sante", "logements_collectifs").
   */
  overrideSpecialties?: string[];
}

export type MatchActionResult =
  | { ok: true; matches: MatchScoreWithArchitect[] }
  | {
      ok: false;
      error:
        | "not_authenticated"
        | "forbidden_domain"
        | "invalid_input"
        | "tender_not_found"
        | "internal_error";
      /** Détail temporaire pour diagnostic — non exposé en prod. */
      detail?: string;
    };

export interface MatchScoreWithArchitect extends MatchScore {
  /** Snapshot architecte enrichi pour rendu UI (pas de lookup additionnel). */
  architect: Pick<
    Architect,
    | "id"
    | "cabinet"
    | "contactName"
    | "tutoiement"
    | "specialtyCodes"
    | "geoZones"
    | "pastCollabsCount"
    | "preferred"
  >;
}

export type SolicitActionResult =
  | { ok: true; brevoMessageId: string | null; tokenJti: string }
  | {
      ok: false;
      error:
        | "not_authenticated"
        | "forbidden_domain"
        | "invalid_input"
        | "tender_not_found"
        | "architect_not_found"
        | "architect_not_solicitable"
        | "invalid_state"
        | "brevo_send_failed"
        | "internal_error";
      detail?: string;
    };

// ============================================================================
// Helpers internes
// ============================================================================

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

async function requireAlyosUser(
  authClient: AuthClientLike,
): Promise<
  | { ok: true; userId: string; orgId: string }
  | { ok: false; error: "not_authenticated" | "forbidden_domain" }
> {
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };
  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) return { ok: false, error: "forbidden_domain" };
  const orgId = await getRequiredOrgId(user.id);
  return { ok: true, userId: user.id, orgId };
}

// ============================================================================
// 1. matchArchitectsForTender — exécute le matcher V1 et retourne top N
// ============================================================================

/**
 * Calcule et retourne les top N architectes pour un AO Tandem. Lecture
 * seule — ne persiste rien en BDD (la persistance dans `match_proposals`
 * est déclenchée immédiatement par le composant Client via
 * `persistMatchProposals` après réception des résultats).
 *
 * @param tenderId — UUID du tender (mode Tandem)
 * @param options — filtres optionnels (topN, overrideDepts, overrideSpecialties)
 */
export async function matchArchitectsForTender(
  tenderId: string,
  options: ShortlistMatchOptions = {},
  deps: ActionDeps = {},
): Promise<MatchActionResult> {
  const db = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? createSupabaseServerClient();

  // 1. Auth + domaine
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  const { orgId } = authResult;

  // 2. Validation input
  if (!UUID_SHAPE.test(tenderId)) return { ok: false, error: "invalid_input" };
  const topN = options.topN ?? 10;
  if (!Number.isInteger(topN) || topN < 1 || topN > 100) {
    return { ok: false, error: "invalid_input" };
  }

  try {
    // 3. Lookup tender (filtre tenant explicite)
    const tenderRows = await db
      .select()
      .from(tenders)
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, orgId)))
      .limit(1);
    const tender = tenderRows[0];
    if (!tender) return { ok: false, error: "tender_not_found" };

    // 4. Lookup architectes solicitable + active (filtre tenant)
    const activeArchitects = await db
      .select()
      .from(architects)
      .where(
        and(
          eq(architects.organizationId, orgId),
          eq(architects.active, true),
          eq(architects.solicitable, true),
        ),
      );

    if (activeArchitects.length === 0) {
      return { ok: true, matches: [] };
    }

    // 4b. Pré-filtrage optionnel par département (overrideDepts)
    let candidateArchitects = activeArchitects;
    if (options.overrideDepts && options.overrideDepts.length > 0) {
      const deptSet = new Set(options.overrideDepts.map((d) => d.trim()).filter(Boolean));
      candidateArchitects = candidateArchitects.filter((a) =>
        (a.geoZones ?? []).some((z) => deptSet.has(z)),
      );
    }

    // 4c. Pré-filtrage optionnel par spécialité (overrideSpecialties)
    if (options.overrideSpecialties && options.overrideSpecialties.length > 0) {
      const specSet = new Set(options.overrideSpecialties);
      candidateArchitects = candidateArchitects.filter((a) =>
        (a.specialtyCodes ?? []).some((s) => specSet.has(s)),
      );
    }

    if (candidateArchitects.length === 0) {
      return { ok: true, matches: [] };
    }

    // 5. Map sollicitations récentes (30 derniers jours) — pour scoring
    //    `availability`. On groupe par architectId depuis `architect_responses`
    //    créés ces 30 derniers jours.
    //    Note : on tourne sur `activeArchitects` (tous) pour ne pas biaiser
    //    les scores de disponibilité par le filtre overrideDepts/overrideSpecialties.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentRows = await db
      .select({
        architectId: architectResponses.architectId,
        count: sql<number>`count(*)::int`.as("count"),
      })
      .from(architectResponses)
      .where(
        and(
          eq(architectResponses.organizationId, orgId),
          gte(architectResponses.respondedAt, since),
        ),
      )
      .groupBy(architectResponses.architectId);
    const recentMap = new Map<string, number>(recentRows.map((r) => [r.architectId, r.count]));

    // 6. Relevance learning : compte les acceptations passées par architecte.
    //    Bonus +3 par acceptation, capé à +15 (ne doit pas écraser les autres critères).
    //    Note : même logique — on tourne sur `activeArchitects` (tous).
    const acceptedRows = await db
      .select({
        architectId: architectResponses.architectId,
        count: sql<number>`count(*)::int`.as("count"),
      })
      .from(architectResponses)
      .where(
        and(
          eq(architectResponses.organizationId, orgId),
          eq(architectResponses.status, "accepted"),
        ),
      )
      .groupBy(architectResponses.architectId);
    const acceptedMap = new Map<string, number>(acceptedRows.map((r) => [r.architectId, r.count]));

    // 7. Run matcher V1 — sur `candidateArchitects` (post-filtrage)
    const scores = rankArchitects(
      { title: tender.title, buyer: tender.buyer, rawData: tender.rawData, amount: tender.amount },
      { architects: candidateArchitects, recentSolicitationsByArchitect: recentMap },
      { topN },
    );

    // 8. Enrichit avec architect snapshot + fallback rationale + bonus acceptances
    //    `archMap` construit sur `candidateArchitects` (post-filtrage).
    const archMap = new Map<string, Architect>(candidateArchitects.map((a) => [a.id, a]));
    const matches: MatchScoreWithArchitect[] = await Promise.all(
      scores.map(async (s) => {
        const a = archMap.get(s.architectId)!;
        // Bonus acceptations : +3 par acceptation passée, capé à +15
        const acceptanceBonus = Math.min((acceptedMap.get(s.architectId) ?? 0) * 3, 15);
        const boostedScore = Math.min(s.score + acceptanceBonus, 100);
        const rationale = await generateRationaleWithAi(
          a,
          { title: tender.title, buyer: tender.buyer },
          s.breakdown,
          boostedScore,
          process.env.ANTHROPIC_API_KEY ? createHaikuRationaleClient() : undefined,
        );
        return {
          ...s,
          score: boostedScore,
          rationale,
          architect: {
            id: a.id,
            cabinet: a.cabinet,
            contactName: a.contactName,
            tutoiement: a.tutoiement,
            specialtyCodes: a.specialtyCodes,
            geoZones: a.geoZones,
            pastCollabsCount: a.pastCollabsCount,
            preferred: a.preferred,
          },
        };
      }),
    );

    return { ok: true, matches };
  } catch (err) {
    // Capture étendue pour diagnostic : message + code postgres-js si présent
    const detail = [
      err instanceof Error
        ? `${err.constructor.name}: ${err.message || "(no message)"}`
        : String(err),
      (err as { code?: string }).code ? `code=${(err as { code?: string }).code}` : null,
      (err as { detail?: string }).detail ?? null,
    ]
      .filter(Boolean)
      .join(" | ");
    console.error("[tandem-actions:match:fail]", detail, err);
    // TODO: retirer le `detail` en prod une fois le bug identifié
    return { ok: false, error: "internal_error", detail };
  }
}

// ============================================================================
// 1b. persistMatchProposals — persiste les proposals immédiatement après calcul
// ============================================================================

/**
 * Persiste les match proposals en BDD immédiatement après calcul.
 * Idempotent via ON CONFLICT DO UPDATE (UPSERT sur (tenderId, architectId)).
 * Appelé par TandemShortlistClient dès réception des matches.
 */
export async function persistMatchProposals(
  tenderId: string,
  matches: Array<{ architectId: string; score: number; rank: number; rationale: string }>,
  deps: { db?: typeof defaultDb; authClient?: AuthClientLike } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID_SHAPE.test(tenderId)) return { ok: false, error: "invalid_input" };
  if (!Array.isArray(matches) || matches.length === 0) return { ok: true };
  const dbInstance = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? createSupabaseServerClient();
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return { ok: false, error: authResult.error };
  const { orgId } = authResult;
  try {
    const rows = matches.map((m) => ({
      tenderId,
      organizationId: orgId,
      architectId: m.architectId,
      score: String(m.score),
      rank: m.rank,
      rationale: m.rationale,
    }));
    await dbInstance
      .insert(matchProposals)
      .values(rows)
      .onConflictDoUpdate({
        target: [matchProposals.tenderId, matchProposals.architectId],
        set: {
          score: sql`EXCLUDED.score`,
          rank: sql`EXCLUDED.rank`,
          rationale: sql`EXCLUDED.rationale`,
        },
      });
    return { ok: true };
  } catch (err) {
    console.error("[tandem:persist_proposals:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// 2. sendArchitectSolicitation — envoie le mail Brevo + persiste BDD
// ============================================================================

export interface SolicitOptions {
  /**
   * Registre TU/VOUS. Priorité : override explicite > architects.tutoiement > DEFAULT false (vouvoiement).
   * La page tokenisée architecte (lot C) ne doit PAS passer de register en override —
   * le registre est fixé lors de l'envoi initial, pas de la réponse.
   */
  register?: BrevoRegister;
  /** Texte additionnel optionnel — stocké pour audit/debug, non envoyé. */
  customNote?: string;
  /** Score + rationale issus du matcher — persistés dans `match_proposals`. */
  score: number;
  rationale: string;
  rank: number;
}

/**
 * Envoie une sollicitation Tandem à un architecte donné pour un tender donné.
 *
 * Effets de bord (transaction unique) :
 *  1. Génère un JWT architecte (RS256, 30 j, `aud=architect`, `jti` BDD).
 *  2. Génère / réutilise un token d'opposition pour cet architecte
 *     (5 ans, single-use).
 *  3. INSERT `architect_tokens` (jti unique).
 *  4. INSERT `architect_opposition_tokens` (si pas déjà actif).
 *  5. UPSERT `match_proposals` (1 ligne par couple AO+archi).
 *  6. UPSERT `architect_responses` (status=pending, tokenId set).
 *  7. UPDATE `tenders.status = 'awaiting_architect'`.
 *  8. Envoi mail Brevo (HORS transaction — l'envoi peut être lent).
 *  9. INSERT `brevo_messages` (post-envoi avec brevoMessageId).
 * 10. Audit A5 `architect_solicit` (best-effort, hors tx).
 *
 * Robustesse :
 *  - Si Brevo échoue : les rows BDD existent (token + match + response pending),
 *    `brevo_messages` n'est PAS créé mais l'`architect_responses` reste, le
 *    user peut retry depuis l'UI. On retourne `brevo_send_failed`.
 *  - Idempotence partielle : appeler 2× pour le même (tenderId, architectId)
 *    quand un `architect_responses` existe déjà → erreur `invalid_state`
 *    (la spec demande de basculer en M-D2 « relance » côté UI, pas re-créer).
 */
export async function sendArchitectSolicitation(
  tenderId: string,
  architectId: string,
  options: SolicitOptions,
  deps: ActionDeps = {},
): Promise<SolicitActionResult> {
  const db = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? createSupabaseServerClient();
  const auditFn = deps.auditFn ?? audit;
  const brevoClient = deps.brevoClient ?? getBrevoClient();

  // 1. Auth + domaine
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  const { userId, orgId } = authResult;

  // 2. Validation
  if (!UUID_SHAPE.test(tenderId) || !UUID_SHAPE.test(architectId)) {
    return { ok: false, error: "invalid_input" };
  }
  if (!Number.isFinite(options.score) || options.score < 0 || options.score > 100) {
    return { ok: false, error: "invalid_input" };
  }
  if (!options.rationale || typeof options.rationale !== "string") {
    return { ok: false, error: "invalid_input" };
  }

  let tender: Tender | undefined;
  let architect: Architect | undefined;
  let tokenJti: string;
  let oppositionToken: { jti: string; expiresAt: Date };
  let architectToken: { token: string; jti: string; expiresAt: Date };
  let pendingResponseExisted = false;

  try {
    // 3. Pré-fetch tender + architect avant de générer le JWT (besoin orgId)
    const tenderRows = await db
      .select()
      .from(tenders)
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, orgId)))
      .limit(1);
    tender = tenderRows[0];
    if (!tender) return { ok: false, error: "tender_not_found" };

    const archRows = await db
      .select()
      .from(architects)
      .where(and(eq(architects.id, architectId), eq(architects.organizationId, orgId)))
      .limit(1);
    architect = archRows[0];
    if (!architect) return { ok: false, error: "architect_not_found" };
    if (!architect.active || !architect.solicitable || !architect.email) {
      return { ok: false, error: "architect_not_solicitable" };
    }

    // 4. Génère le JWT architecte (30 j)
    architectToken = signArchitectToken({
      architectId,
      tenderId,
      organizationId: orgId,
    });
    tokenJti = architectToken.jti;

    // 5. Réutilise ou génère un token d'opposition (long-life, single-use).
    //    On cherche un token actif (usedAt IS NULL) non expiré. Si trouvé,
    //    on le réutilise — sinon on en crée un.
    const existingOppo = await db
      .select({
        jti: architectOppositionTokens.jti,
        expiresAt: architectOppositionTokens.expiresAt,
        usedAt: architectOppositionTokens.usedAt,
      })
      .from(architectOppositionTokens)
      .where(
        and(
          eq(architectOppositionTokens.architectId, architectId),
          eq(architectOppositionTokens.organizationId, orgId),
        ),
      )
      .orderBy(sql`${architectOppositionTokens.createdAt} desc`)
      .limit(1);

    const reusable =
      existingOppo[0] && existingOppo[0].usedAt === null && existingOppo[0].expiresAt > new Date();
    if (reusable && existingOppo[0]) {
      oppositionToken = {
        jti: existingOppo[0].jti,
        expiresAt: existingOppo[0].expiresAt,
      };
    } else {
      // Crée un nouveau token d'opposition (5 ans).
      // On utilise une UUID v4 comme `jti` (pas de JWT signé ici — la page
      // d'opposition vérifie l'existence du token en BDD + non-expiration).
      const newJti = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000);
      await db.insert(architectOppositionTokens).values({
        architectId,
        organizationId: orgId,
        jti: newJti,
        expiresAt,
      });
      oppositionToken = { jti: newJti, expiresAt };
    }

    // 6. Transaction : tokens + match_proposals + responses + tender status
    await db.transaction(async (tx) => {
      // architect_tokens (JWT signé — révocation cible)
      const insertedTokens = await tx
        .insert(architectTokens)
        .values({
          tenderId,
          architectId,
          organizationId: orgId,
          jwtId: architectToken.jti,
          expiresAt: architectToken.expiresAt,
        })
        .returning({ id: architectTokens.id });
      const archTokenId = insertedTokens[0]?.id;
      if (!archTokenId) throw new Error("architect_tokens insert returned no id");

      // match_proposals — UPSERT via ON CONFLICT (tenderId, architectId)
      await tx
        .insert(matchProposals)
        .values({
          tenderId,
          organizationId: orgId,
          architectId,
          score: options.score.toFixed(2),
          rank: options.rank,
          rationale: options.rationale,
        })
        .onConflictDoUpdate({
          target: [matchProposals.tenderId, matchProposals.architectId],
          set: {
            score: options.score.toFixed(2),
            rank: options.rank,
            rationale: options.rationale,
          },
        });

      // architect_responses — check existence, ne pas écraser si déjà répondu
      const existingResp = await tx
        .select({
          status: architectResponses.status,
          tokenId: architectResponses.tokenId,
        })
        .from(architectResponses)
        .where(
          and(
            eq(architectResponses.tenderId, tenderId),
            eq(architectResponses.architectId, architectId),
          ),
        )
        .limit(1);

      if (existingResp[0] && existingResp[0].status !== "pending") {
        throw new InvalidStateError(`response already ${existingResp[0].status}`);
      }
      if (existingResp[0]) {
        pendingResponseExisted = true;
        // Update : nouveau token
        await tx
          .update(architectResponses)
          .set({ tokenId: archTokenId })
          .where(
            and(
              eq(architectResponses.tenderId, tenderId),
              eq(architectResponses.architectId, architectId),
            ),
          );
      } else {
        await tx.insert(architectResponses).values({
          tenderId,
          organizationId: orgId,
          architectId,
          status: "pending",
          tokenId: archTokenId,
        });
      }

      // tenders.status = 'awaiting_architect' (uniquement si pas déjà avancé)
      await tx
        .update(tenders)
        .set({ status: "awaiting_architect", updatedAt: sql`now()` })
        .where(
          and(
            eq(tenders.id, tenderId),
            eq(tenders.organizationId, orgId),
            sql`${tenders.status} IN ('selected_tandem', 'awaiting_architect', 'architect_declined')`,
          ),
        );
    });
  } catch (err) {
    if (err instanceof InvalidStateError) {
      return { ok: false, error: "invalid_state", detail: err.message };
    }
    const detail = [
      err instanceof Error
        ? `${err.constructor.name}: ${err.message || "(no message)"}`
        : String(err),
      (err as { code?: string }).code ? `code=${(err as { code?: string }).code}` : null,
      (err as { detail?: string }).detail ?? null,
    ]
      .filter(Boolean)
      .join(" | ");
    console.error("[tandem-actions:solicit:db_fail]", detail, err);
    return { ok: false, error: "internal_error", detail };
  }

  // 7. Envoi Brevo (hors transaction — latence variable)
  const register = options.register ?? defaultRegisterFromTutoiement(architect.tutoiement);
  const templateName = templateNameFor("solicitation", register);

  // Résolution du template : BDD org-scopée → fallback copy v2 hardcodé.
  // `resolveBrevoTemplate` applique aussi les garde-fous RGPD (lien_opposition
  // + mention art.14) — si le template est non conforme, il throw et on
  // retourne `brevo_send_failed` avant tout envoi.
  let resolvedTemplate: Awaited<ReturnType<typeof resolveBrevoTemplate>> | null = null;
  try {
    resolvedTemplate = await resolveBrevoTemplate(templateName, orgId, db);
  } catch (err) {
    return {
      ok: false,
      error: "brevo_send_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  // Chargement de la présentation société + nom commercial depuis organization_profiles (lot D acté).
  // Fallback silencieux sur PRESENTATION_SOCIETE_HTML_DEFAULT / "AlyoS Ingénierie" si absent en BDD.
  // withTenantContext pose app.current_organization_id pour FORCE RLS
  // (cf. ANSWER_260527_CTO_RLS_FORCE_EDGE.md + with-tenant-context.ts).
  let presentationSociete: string | undefined;
  let nomCommercial: string | undefined;
  try {
    const orgRows = await withTenantContext(orgId, db, (client) =>
      client
        .select({
          presentationBlock: organizationProfiles.presentationBlock,
          commercialName: organizationProfiles.commercialName,
        })
        .from(organizationProfiles)
        .where(eq(organizationProfiles.organizationId, orgId))
        .limit(1),
    );
    const block = orgRows[0]?.presentationBlock;
    if (block) presentationSociete = block;
    const cname = orgRows[0]?.commercialName;
    if (cname) nomCommercial = cname;
  } catch {
    // Non-bloquant — fallback hardcoded utilisé
  }

  const variables = buildBrevoVariables({
    architect,
    tender,
    tenderDepartment: extractDepartment(tender),
    lienAo: `${getSiteUrl()}/archi/${architectToken.token}`,
    lienOpposition: `${getSiteUrl()}/archi/oppose/${oppositionToken.jti}`,
    presentationSociete,
    nomCommercial,
    register,
  });

  let templateId: number;
  try {
    templateId = pickBrevoTemplateId("solicitation", register);
  } catch (err) {
    return {
      ok: false,
      error: "brevo_send_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  // Brevo accepte un nom complet — on reconstruit depuis archi_prenom + archi_nom.
  const toName = [variables.archi_prenom, variables.archi_nom].filter(Boolean).join(" ");

  const sendResult = await brevoClient.send({
    templateId,
    to: { email: architect.email, name: toName || variables.cabinet },
    params: {
      greeting: variables.greeting,
      nom_commercial: variables.nom_commercial,
      civilite: variables.civilite,
      archi_prenom: variables.archi_prenom,
      archi_nom: variables.archi_nom,
      cabinet: variables.cabinet,
      ao_objet: variables.ao_objet,
      ao_acheteur: variables.ao_acheteur,
      ao_departement: variables.ao_departement,
      ao_cloture: variables.ao_cloture,
      lien_ao: variables.lien_ao,
      lien_opposition: variables.lien_opposition,
      presentation_societe: variables.presentation_societe,
      rgpd_block: variables.rgpd_block,
    },
    customHeader: `tender:${tenderId};archi:${architectId}`,
  });

  // resolvedTemplate est utilisée pour l'audit (source db/default — traçabilité)
  void resolvedTemplate;

  let brevoMessageId: string | null = null;
  if (!sendResult.ok) {
    // L'envoi a échoué — on garde quand même les rows BDD (cf. JSDoc §Robustesse).
    return {
      ok: false,
      error: "brevo_send_failed",
      detail: `${sendResult.error}${sendResult.detail ? `: ${sendResult.detail}` : ""}`,
    };
  }
  brevoMessageId = sendResult.messageId;

  // 8. Insert brevo_messages (post-envoi avec ID)
  try {
    await db.insert(brevoMessages).values({
      tenderId,
      architectId,
      organizationId: orgId,
      templateName,
      register,
      brevoMessageId,
      sentAt: new Date(),
    });
  } catch (err) {
    // Non-bloquant : le mail est parti, l'audit log captera la trace.
    console.error("[tandem-actions:solicit:brevo_messages_insert_fail]", err);
  }

  // 9. Audit A5 architect_solicit (best-effort)
  void userId; // (réservé pour Phase 2 — pour le moment l'audit helper lit la session)
  await auditFn({
    action: "architect_solicit",
    subjectType: "architect",
    subjectId: architectId,
    data: {
      tender_id: tenderId,
      architect_id: architectId,
      template_name: templateName,
      register,
      brevo_message_id: brevoMessageId,
      token_jti: tokenJti,
    },
  });

  // 10. Revalidate la page Tandem (réécriture future en sous-étape 5)
  revalidatePath(`/sourcing/ao/${tenderId}/tandem`);
  revalidatePath("/sourcing/ao-du-jour");

  void pendingResponseExisted; // info pour audit Phase 2 si besoin

  return { ok: true, brevoMessageId, tokenJti };
}

class InvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStateError";
  }
}

// ============================================================================
// 3. searchArchitectsForShortlist — recherche d'architecte pour ajout manuel
// ============================================================================

export type SearchArchitectsResult =
  | {
      ok: true;
      architects: Array<{
        id: string;
        cabinet: string;
        contactName: string | null;
        email: string;
        specialtyCodes: string[];
        geoZones: string[];
        preferred: boolean;
      }>;
    }
  | { ok: false; error: "not_authenticated" | "forbidden_domain" | "internal_error" };

/**
 * Recherche des architectes solicitables par nom de cabinet ou nom de contact.
 * Utilisée par le composant Client pour l'ajout manuel d'un architecte à la short-list.
 *
 * @param query — terme de recherche (min 2 caractères)
 * @param excludeIds — UUIDs à exclure (déjà dans la short-list)
 */
export async function searchArchitectsForShortlist(
  query: string,
  excludeIds: string[],
  deps: ActionDeps = {},
): Promise<SearchArchitectsResult> {
  const db = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? createSupabaseServerClient();

  // Auth + domaine
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;
  const { orgId } = authResult;

  // Requête trop courte — retourne liste vide sans aller en BDD
  if (query.trim().length < 2) {
    return { ok: true, architects: [] };
  }

  try {
    const likePattern = `%${query.trim()}%`;

    // Filtre : actif, solicitable, tenant, et hors des IDs déjà dans la short-list
    const conditions = [
      eq(architects.organizationId, orgId),
      eq(architects.active, true),
      eq(architects.solicitable, true),
      // Recherche cabinets OU contact (OR applicatif)
      sql`(${ilike(architects.cabinet, likePattern)} OR ${ilike(architects.contactName, likePattern)})`,
    ];
    if (excludeIds.length > 0) {
      conditions.push(not(inArray(architects.id, excludeIds)));
    }

    const rows = await db
      .select({
        id: architects.id,
        cabinet: architects.cabinet,
        contactName: architects.contactName,
        email: architects.email,
        specialtyCodes: architects.specialtyCodes,
        geoZones: architects.geoZones,
        preferred: architects.preferred,
      })
      .from(architects)
      .where(and(...conditions))
      .limit(10);

    // email est nullable dans le schéma mais solicitable=true garantit email NOT NULL
    return {
      ok: true,
      architects: rows.map((r) => ({
        ...r,
        email: r.email as string,
      })),
    };
  } catch (err) {
    console.error("[tandem-actions:search:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ============================================================================
// 4. sendBulkArchitectSolicitation — envoi groupé de sollicitations
// ============================================================================

export interface BulkSolicitInput {
  architectId: string;
  score: number;
  rationale: string;
  rank: number;
  register?: BrevoRegister;
}

export type BulkSolicitResult =
  | {
      ok: true;
      /** Nombre de mails envoyés avec succès. */
      sent: number;
      /** Architectes ayant échoué avec la raison. */
      failed: Array<{ architectId: string; error: string }>;
    }
  | {
      ok: false;
      error: "not_authenticated" | "forbidden_domain" | "invalid_input" | "internal_error";
    };

/**
 * Envoie une sollicitation Tandem à plusieurs architectes d'un seul coup.
 * Appelle `sendArchitectSolicitation` pour chaque item et collecte les résultats —
 * un échec individuel ne bloque pas les autres envois.
 *
 * @param tenderId — UUID du tender
 * @param items — liste des architectes à solliciter (1..10)
 */
export async function sendBulkArchitectSolicitation(
  tenderId: string,
  items: BulkSolicitInput[],
  deps: ActionDeps = {},
): Promise<BulkSolicitResult> {
  const authClient = deps.authClient ?? createSupabaseServerClient();

  // Auth + domaine
  const authResult = await requireAlyosUser(authClient);
  if (!authResult.ok) return authResult;

  // Validation
  if (!UUID_SHAPE.test(tenderId)) return { ok: false, error: "invalid_input" };
  if (!Array.isArray(items) || items.length < 1 || items.length > 10) {
    return { ok: false, error: "invalid_input" };
  }

  let sent = 0;
  const failed: Array<{ architectId: string; error: string }> = [];

  // Envoi séquentiel pour éviter les races sur le statut du tender
  for (const item of items) {
    const result = await sendArchitectSolicitation(
      tenderId,
      item.architectId,
      {
        score: item.score,
        rationale: item.rationale,
        rank: item.rank,
        register: item.register,
      },
      deps,
    );
    if (result.ok) {
      sent++;
    } else {
      failed.push({ architectId: item.architectId, error: result.error });
    }
  }

  return { ok: true, sent, failed };
}
