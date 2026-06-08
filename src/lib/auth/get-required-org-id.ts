/**
 * get-required-org-id.ts
 *
 * Résout l'organisation d'un utilisateur depuis la table `memberships`.
 * **Si pas de membership → ERREUR HARDFAIL** (sécurité multi-tenant).
 *
 * **Multi-tenant (ADR-014 — Steve 2026-06-05)** : depuis l'ouverture à
 * PROTECT et au-delà, un user peut avoir plusieurs memberships (typique
 * pour `sebastien@edifio.fr` superadmin sur AlyoS ET PROTECT, ou plus tard
 * pour un user qui change d'org). Le choix de l'org par défaut doit être
 * déterministe :
 *   - Ordre par `created_at ASC` → la 1ère membership créée gagne.
 *   - Rationale : un user invité une fois sur AlyoS puis sur PROTECT verra
 *     toujours AlyoS au login (cohérent avec son onboarding).
 *
 * **Sécurité — fix VETO Camille/Hugo 260608** : suppression du fallback
 * `ALYOS_ORG_ID`. Précédemment, un user sans membership (créé par superadmin
 * avant l'attribution de membership, OU user externe non rattaché) accédait
 * automatiquement aux données AlyoS — vulnérabilité **fuite cross-tenant
 * silencieuse**. Le fallback était un legacy de la Phase A (1 seule org)
 * mais reste dangereux depuis ADR-014 (multi-org).
 *
 * Le throw est intercepté par les call sites Server Action / Route Handler
 * via try/catch ou pattern `{ ok: false, error }`.
 *
 * À terme (post-migration vers monorepo edifio) : sélecteur d'org dans le
 * header (pattern Slack workspace switcher) avec mémorisation du dernier
 * choix dans `users.last_active_org_id`.
 */

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { memberships } from "@/db/schema";

export class NoOrganizationMembershipError extends Error {
  constructor(userId: string) {
    super(`User ${userId} has no organization membership`);
    this.name = "NoOrganizationMembershipError";
  }
}

export async function getRequiredOrgId(userId: string): Promise<string> {
  const rows = await db
    .select({ organizationId: memberships.organizationId })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .orderBy(memberships.createdAt) // déterministe : 1ère membership créée
    .limit(1);

  const orgId = rows[0]?.organizationId;
  if (orgId) return orgId;

  // Hardfail : user sans membership = pas d'accès tenant (sécurité ADR-014).
  // Ne JAMAIS fallback sur une org par défaut — c'est une fuite cross-tenant.
  console.error(
    `[getRequiredOrgId] CRITICAL: user ${userId} sans membership — accès refusé.`,
  );
  throw new NoOrganizationMembershipError(userId);
}
