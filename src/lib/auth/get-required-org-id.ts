/**
 * get-required-org-id.ts
 *
 * Résout l'organisation d'un utilisateur depuis la table `memberships`.
 * Fallback sur ALYOS_ORG_ID si aucune membership trouvée (utilisateurs
 * créés avant Phase A — MVP mono-tenant AlyoS).
 *
 * **Multi-tenant (ADR-014 — Steve 2026-06-05)** : depuis l'ouverture à
 * PROTECT et au-delà, un user peut avoir plusieurs memberships (typique
 * pour `contact@edifio.fr` superadmin sur AlyoS ET PROTECT, ou plus tard
 * pour un user qui change d'org). Le choix de l'org par défaut doit être
 * déterministe :
 *   - Ordre par `created_at ASC` → la 1ère membership créée gagne.
 *   - Rationale : un user invité une fois sur AlyoS puis sur PROTECT verra
 *     toujours AlyoS au login (cohérent avec son onboarding).
 *
 * À terme (post-migration vers monorepo edifio) : sélecteur d'org dans le
 * header (pattern Slack workspace switcher) avec mémorisation du dernier
 * choix dans `users.last_active_org_id`.
 *
 * Phase B : ce fallback ALYOS_ORG_ID sera supprimé quand tous les users
 * auront une membership active (vérifié par un cron ou une contrainte BDD).
 */

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { memberships } from "@/db/schema";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";

export async function getRequiredOrgId(userId: string): Promise<string> {
  const rows = await db
    .select({ organizationId: memberships.organizationId })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .orderBy(memberships.createdAt) // déterministe : 1ère membership créée
    .limit(1);

  const orgId = rows[0]?.organizationId;
  if (orgId) return orgId;

  // Fallback : utilisateur sans membership (créé avant Phase A)
  console.warn(`[getRequiredOrgId] Aucune membership pour user ${userId} — fallback ALYOS_ORG_ID`);
  return ALYOS_ORG_ID;
}
