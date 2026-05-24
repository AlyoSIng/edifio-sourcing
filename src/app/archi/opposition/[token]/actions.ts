"use server";

/**
 * Server Action — exercer le droit d'opposition RGPD architecte.
 *
 * Source de vérité : `specs/architects_data_and_admin_v1.md` §5 (RGPD app).
 *
 * Public — pas de session AlyoS (l'architecte est externe). L'auth est le
 * JWT `aud=opposition` (audience STRICTEMENT différente du JWT architecte de
 * réponse — cf. `src/lib/tandem/opposition-jwt.ts`).
 *
 * Effets (transaction unique) :
 *  1. Verify JWT crypto + audience + exp + single-use BDD (architect_opposition_tokens)
 *  2. UPDATE `architects.active = false` (droit d'opposition art. 21 RGPD)
 *  3. UPDATE `architect_opposition_tokens.used_at = now()` (single-use)
 *  4. UPDATE `architect_tokens.revoked = true` (TOUS les JWT de réponse en
 *     cours pour cet archi — sécurité : un archi opposé ne doit plus pouvoir
 *     répondre à un AO via un vieux lien)
 *  5. Audit `token_revoke` (best-effort)
 *
 * Sécurité : aucun élément de l'erreur n'est exposé au client — l'archi voit
 * un message générique « lien expiré ou invalide » s'il y a un souci.
 */

import { and, eq, sql } from "drizzle-orm";

import { db as defaultDb } from "@/db/client";
import { architects } from "@/db/schema/architects";
import { architectOppositionTokens, architectTokens } from "@/db/schema/selections";
import { audit } from "@/lib/audit";
import { verifyOppositionToken } from "@/lib/tandem/opposition-jwt";

type DrizzleClient = typeof defaultDb;

export type OppositionActionResult =
  | { ok: true; architectId: string; revokedJwtCount: number }
  | { ok: false; error: "invalid_token" | "internal_error" };

interface OpposeDeps {
  db?: DrizzleClient;
  auditFn?: typeof audit;
}

/**
 * Exécute l'opposition. Idempotent par design : si le token est `already_used`,
 * la verify retourne ok=false et on ne rejoue rien. Si l'archi est déjà
 * `active=false`, l'UPDATE est no-op (et c'est OK).
 */
export async function opposeArchitect(
  token: string,
  deps: OpposeDeps = {},
): Promise<OppositionActionResult> {
  const db = deps.db ?? defaultDb;
  const auditFn = deps.auditFn ?? audit;

  // 1. Verify JWT opposition (signature + aud=opposition + exp + single-use BDD)
  const verifyResult = await verifyOppositionToken(token, async (jti) => {
    try {
      const rows = await db
        .select({
          usedAt: architectOppositionTokens.usedAt,
        })
        .from(architectOppositionTokens)
        .where(eq(architectOppositionTokens.jti, jti))
        .limit(1);
      if (!rows[0]) return "unknown";
      if (rows[0].usedAt !== null) return "already_used";
      return "valid";
    } catch {
      return "unknown";
    }
  });

  if (!verifyResult.ok) {
    return { ok: false, error: "invalid_token" };
  }
  const decoded = verifyResult.payload;

  // 2. Transaction : update archi + token + révoque tous les JWT de réponse
  let revokedJwtCount = 0;
  try {
    await db.transaction(async (tx) => {
      // 2.a Set architects.active = false (idempotent — déjà false = no-op)
      await tx
        .update(architects)
        .set({ active: false, updatedAt: sql`now()` })
        .where(
          and(
            eq(architects.id, decoded.architectId),
            eq(architects.organizationId, decoded.organizationId),
          ),
        );

      // 2.b Mark le token d'opposition comme utilisé (single-use)
      await tx
        .update(architectOppositionTokens)
        .set({ usedAt: new Date() })
        .where(eq(architectOppositionTokens.jti, decoded.jti));

      // 2.c Révoque TOUS les JWT de réponse en cours pour cet archi.
      //     Un archi opposé ne doit plus pouvoir répondre à un AO via
      //     un vieux lien qui ne serait pas encore expiré.
      const revoked = await tx
        .update(architectTokens)
        .set({
          revoked: true,
          revokedAt: new Date(),
          // revokedBy = null (acteur = archi via opposition, pas user AlyoS)
        })
        .where(
          and(
            eq(architectTokens.architectId, decoded.architectId),
            eq(architectTokens.organizationId, decoded.organizationId),
            eq(architectTokens.revoked, false),
          ),
        )
        .returning({ id: architectTokens.id });
      revokedJwtCount = revoked.length;
    });
  } catch (err) {
    console.error("[archi-oppose:tx_fail]", err);
    return { ok: false, error: "internal_error" };
  }

  // 3. Audit `token_revoke` (best-effort — l'archi a déjà obtenu son
  //    opposition, l'audit ne doit pas bloquer)
  await auditFn({
    action: "token_revoke",
    subjectType: "architect",
    subjectId: decoded.architectId,
    data: {
      reason: "rgpd_opposition",
      jti_opposition: decoded.jti,
      revoked_jwt_count: revokedJwtCount,
    },
  });

  return { ok: true, architectId: decoded.architectId, revokedJwtCount };
}
