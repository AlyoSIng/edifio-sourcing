/**
 * Data loader — page tokenisée architecte `/archi/[token]` (Server Component).
 *
 * Source de vérité : `specs/module_tandem_engine_v1.md` §3.4.
 *
 * Charge en une transaction lecture seule :
 *   - le tender (cible de la sollicitation)
 *   - l'architecte cible
 *   - le match_proposal (score + rationale — affiché « Pourquoi nous t'avons choisi »)
 *   - la ligne `architect_responses` (statut courant : pending / accepted / declined…)
 *   - la ligne `architect_tokens` (pour révocation + lookup `jti`)
 *
 * **RLS bypass** : le client Drizzle (`@/db/client`) se connecte via
 * `DATABASE_URL` direct (rôle `postgres`, pas via JWT) — il bypass RLS de
 * facto (cf. `src/lib/constants/organization.ts` §RLS defense in depth). On
 * porte donc le filtre `organizationId = decoded.organizationId` en clause
 * SQL explicite — c'est notre ligne de défense applicative. La RLS reste
 * en defense-in-depth pour les autres call-sites (pgTAP test cross-tenant).
 *
 * **Pas d'I/O d'audit ici** — l'affichage de la page n'est PAS une action
 * sensible auditée. L'audit A16 `architect_response` est émis depuis la
 * route POST /api/archi/[token]/respond (étape 4), à la réponse effective.
 */

import { and, eq } from "drizzle-orm";

import { db as defaultDb } from "@/db/client";
import { architects, type Architect } from "@/db/schema/architects";
import {
  architectResponses,
  architectTokens,
  matchProposals,
  type ArchitectResponse,
  type ArchitectToken,
  type MatchProposal,
} from "@/db/schema/selections";
import { tenders, type Tender } from "@/db/schema/tenders";

import { verifyArchitectToken, type VerifyTokenError } from "./jwt";

type DrizzleClient = typeof defaultDb;

/**
 * Résultat consommable par la page Server Component. La forme est aplatie
 * (pas de Drizzle relation pour rester compatible MVP) — tout est nullable
 * sauf `tender` et `architect` qui sont indispensables au rendu.
 */
export interface ArchitectPageData {
  decoded: {
    architectId: string;
    tenderId: string;
    organizationId: string;
    jti: string;
    iat: number;
    exp: number;
  };
  tender: Pick<
    Tender,
    "id" | "title" | "buyer" | "deadline" | "amount" | "cpv" | "sourceUrl" | "dceUrl" | "status"
  >;
  architect: Pick<
    Architect,
    "id" | "cabinet" | "contactName" | "tutoiement" | "specialtyCodes" | "geoZones" | "active"
  >;
  match: Pick<MatchProposal, "score" | "rank" | "rationale"> | null;
  response: Pick<ArchitectResponse, "status" | "respondedAt" | "infoRequestText"> | null;
  /** Ligne `architect_tokens` correspondant au `jti` du JWT. */
  tokenRow: Pick<ArchitectToken, "id" | "revoked" | "expiresAt"> | null;
}

/** Erreur typée — routée par la page vers `<TokenInvalidPage variant=… />`. */
export type LoadArchitectPageError =
  | VerifyTokenError
  | "tender_not_found"
  | "architect_not_found"
  | "architect_inactive"
  | "internal_error";

export type LoadArchitectPageResult =
  | { ok: true; data: ArchitectPageData }
  | { ok: false; error: LoadArchitectPageError };

/**
 * Charge les données complètes de la page architecte depuis un token JWT.
 *
 * Étapes :
 *  1. Vérification cryptographique du JWT (signature + audience + exp).
 *  2. Lookup BDD du `jti` dans `architect_tokens` (révocation + cohérence).
 *  3. Fetch tender + architect + match_proposal + architect_response, tous
 *     filtrés par `organizationId` (defense in depth applicative).
 *
 * Robuste à l'absence de match_proposal / response (NULL) — la page rend
 * quand même un fallback minimal (le mail Brevo peut être envoyé avant que
 * `match_proposals` soit persisté en cas de chemin atypique).
 *
 * @param token — JWT brut issu de l'URL `[token]` Next.js params
 * @param deps — DI tests (db override)
 */
export async function loadArchitectPageData(
  token: string,
  deps: { db?: DrizzleClient } = {},
): Promise<LoadArchitectPageResult> {
  const db = deps.db ?? defaultDb;

  // 1. Verify JWT crypto + audience + exp + BDD lookup `jti`
  const verifyResult = await verifyArchitectToken(token, async (jti) => {
    try {
      const rows = await db
        .select({
          revoked: architectTokens.revoked,
          expiresAt: architectTokens.expiresAt,
        })
        .from(architectTokens)
        .where(eq(architectTokens.jwtId, jti))
        .limit(1);
      if (!rows[0]) return "unknown";
      if (rows[0].revoked) return "revoked";
      return "valid";
    } catch {
      // Le throw côté BDD est traité côté caller (cf. catch global de la page).
      // Ici on retourne `unknown` pour cohérence — la page rendra
      // `<TokenInvalidPage variant="invalid" />` sans leak d'info.
      return "unknown";
    }
  });

  if (!verifyResult.ok) {
    return { ok: false, error: verifyResult.error };
  }
  const decoded = verifyResult.payload;

  // 2. Fetch tender + architect + match + response en parallèle (4 round-trips
  //    indépendants, ~80 ms total sur Supabase EU).
  try {
    const [tenderRows, architectRows, matchRows, responseRows, tokenRows] = await Promise.all([
      db
        .select({
          id: tenders.id,
          title: tenders.title,
          buyer: tenders.buyer,
          deadline: tenders.deadline,
          amount: tenders.amount,
          cpv: tenders.cpv,
          sourceUrl: tenders.sourceUrl,
          dceUrl: tenders.dceUrl,
          status: tenders.status,
        })
        .from(tenders)
        .where(
          and(eq(tenders.id, decoded.tenderId), eq(tenders.organizationId, decoded.organizationId)),
        )
        .limit(1),
      db
        .select({
          id: architects.id,
          cabinet: architects.cabinet,
          contactName: architects.contactName,
          tutoiement: architects.tutoiement,
          specialtyCodes: architects.specialtyCodes,
          geoZones: architects.geoZones,
          active: architects.active,
        })
        .from(architects)
        .where(
          and(
            eq(architects.id, decoded.architectId),
            eq(architects.organizationId, decoded.organizationId),
          ),
        )
        .limit(1),
      db
        .select({
          score: matchProposals.score,
          rank: matchProposals.rank,
          rationale: matchProposals.rationale,
        })
        .from(matchProposals)
        .where(
          and(
            eq(matchProposals.tenderId, decoded.tenderId),
            eq(matchProposals.architectId, decoded.architectId),
            eq(matchProposals.organizationId, decoded.organizationId),
          ),
        )
        .limit(1),
      db
        .select({
          status: architectResponses.status,
          respondedAt: architectResponses.respondedAt,
          infoRequestText: architectResponses.infoRequestText,
        })
        .from(architectResponses)
        .where(
          and(
            eq(architectResponses.tenderId, decoded.tenderId),
            eq(architectResponses.architectId, decoded.architectId),
            eq(architectResponses.organizationId, decoded.organizationId),
          ),
        )
        .limit(1),
      db
        .select({
          id: architectTokens.id,
          revoked: architectTokens.revoked,
          expiresAt: architectTokens.expiresAt,
        })
        .from(architectTokens)
        .where(eq(architectTokens.jwtId, decoded.jti))
        .limit(1),
    ]);

    const tender = tenderRows[0];
    const architect = architectRows[0];
    if (!tender) return { ok: false, error: "tender_not_found" };
    if (!architect) return { ok: false, error: "architect_not_found" };
    // RGPD : un archi opposé ne doit plus pouvoir répondre. La page affichera
    // un message neutre « ce lien n'est plus actif » sans détail.
    if (!architect.active) return { ok: false, error: "architect_inactive" };

    return {
      ok: true,
      data: {
        decoded: {
          architectId: decoded.architectId,
          tenderId: decoded.tenderId,
          organizationId: decoded.organizationId,
          jti: decoded.jti,
          iat: decoded.iat,
          exp: decoded.exp,
        },
        tender,
        architect,
        match: matchRows[0] ?? null,
        response: responseRows[0] ?? null,
        tokenRow: tokenRows[0] ?? null,
      },
    };
  } catch (err) {
    console.error("[archi-page:load_failed]", err);
    return { ok: false, error: "internal_error" };
  }
}
