/**
 * get-required-org-id.ts
 *
 * Résout l'organisation d'un utilisateur depuis la table `memberships`.
 * Fallback sur ALYOS_ORG_ID si aucune membership trouvée (utilisateurs
 * créés avant Phase A — MVP mono-tenant AlyoS).
 *
 * Phase B : ce fallback sera supprimé quand tous les users auront une membership.
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
    .limit(1);

  const orgId = rows[0]?.organizationId;
  if (orgId) return orgId;

  // Fallback : utilisateur sans membership (créé avant Phase A)
  console.warn(`[getRequiredOrgId] Aucune membership pour user ${userId} — fallback ALYOS_ORG_ID`);
  return ALYOS_ORG_ID;
}
