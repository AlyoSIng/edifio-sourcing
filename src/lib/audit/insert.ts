/**
 * Helper INSERT audit_logs — wrapper Drizzle pour la table immutable
 * `audit_logs` (cf. `specs/audit_log_v1.md`, RLS FORCE insertion-only,
 * rétention 5 ans).
 *
 * Invariants tenus par ce helper :
 *   1. **Audit ≠ correctness** — un échec d'INSERT ne doit JAMAIS faire
 *      remonter une exception au caller (qui pourrait alors casser la
 *      création de compte, la sollicitation architecte, etc.). On log
 *      l'erreur côté serveur et on laisse passer.
 *   2. **Snapshot de l'acteur** — `actor_email` et `actor_role` sont des
 *      copies au moment de l'action, pas des références vivantes. Si le
 *      user est supprimé ultérieurement (RGPD), le log reste lisible.
 *   3. **Pas de secret en payload** — le caller doit s'assurer que `data`
 *      ne contient ni mot de passe ni token (cf. invariant documenté dans
 *      `src/lib/auth/password-server.ts`). Le helper ne valide pas — c'est
 *      la responsabilité du caller.
 *   4. **organizationId** — récupéré via `memberships` du caller. Pour le
 *      MVP « 1 organisation AlyoS » (décision Board 2026-05-10), chaque
 *      user a exactement une membership. Si aucune n'est trouvée (cas
 *      bootstrap edge), on log un warn et on skip l'INSERT plutôt que de
 *      poser un log orphelin.
 */

import { eq } from "drizzle-orm";
import { type NextRequest } from "next/server";

import { db } from "@/db/client";
import { auditLogs, memberships, type NewAuditLog } from "@/db/schema";
import type { AuditLogData } from "@/db/types/jsonb";
import type { UserProfile } from "@/lib/auth/types";

type AuditAction = NonNullable<NewAuditLog["action"]>;

export interface InsertAuditLogParams {
  req: NextRequest;
  action: AuditAction;
  actor: UserProfile;
  subject?: {
    type: "user" | "tender" | "architect" | "dossier" | "search_profile" | "token";
    id: string;
  };
  data: AuditLogData;
}

export async function insertAuditLog(params: InsertAuditLogParams): Promise<void> {
  const { req, action, actor, subject, data } = params;

  try {
    const [membership] = await db
      .select({ organizationId: memberships.organizationId })
      .from(memberships)
      .where(eq(memberships.userId, actor.id))
      .limit(1);

    if (!membership) {
      console.warn("[audit_log:no_membership]", {
        actor_id: actor.id,
        actor_email: actor.email,
        action,
      });
      return;
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = req.headers.get("user-agent") ?? null;

    await db.insert(auditLogs).values({
      organizationId: membership.organizationId,
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action,
      subjectType: subject?.type ?? null,
      subjectId: subject?.id ?? null,
      ipAddress: ip,
      userAgent,
      data,
    });
  } catch (err) {
    console.error("[audit_log:insert:fail]", {
      action,
      actor_id: actor.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
