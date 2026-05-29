/**
 * Requêtes BDD — branding organisation.
 *
 * Fournit `getOrgBranding` qui charge les 3 colonnes de branding depuis la
 * table `organizations`. Utilisé dans le layout Sourcing (injection CSS) et
 * dans la page admin Personnalisation (valeurs initiales du formulaire).
 *
 * Résilience : toute erreur est absorbée par l'appelant (try/catch recommandé).
 * Ici on retourne `null` si la ligne est introuvable ; l'appelant doit gérer
 * null en servant le branding par défaut.
 */

import { eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { organizations } from "@/db/schema";
import type { OrgBranding } from "./branding";

/**
 * Charge le branding (logoUrl, primaryColor, fontFamily) d'une organisation.
 *
 * @param orgId   UUID de l'organisation (résolu depuis memberships).
 * @param client  Instance Drizzle (permet l'injection en test / tenant context).
 * @returns Données branding ou `null` si organisation introuvable.
 *
 * @example
 * const branding = await getOrgBranding(orgId, db).catch(() => null);
 */
export async function getOrgBranding(orgId: string, client: Db): Promise<OrgBranding | null> {
  const rows = await client
    .select({
      logoUrl: organizations.logoUrl,
      primaryColor: organizations.primaryColor,
      fontFamily: organizations.fontFamily,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  return rows[0] ?? null;
}
