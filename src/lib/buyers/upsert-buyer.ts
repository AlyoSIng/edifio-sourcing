/**
 * Helper d'UPSERT pour l'annuaire des acheteurs (Steve 2026-06-04 — Q2).
 *
 * Appelé en best-effort par updateBuyerAddressAction (et autres entry points
 * futurs) à chaque fois qu'on enregistre une nouvelle info sur un acheteur.
 *
 * Stratégie d'UPSERT :
 *   - Match par `(organization_id, name_normalized)` UNIQUE.
 *   - À l'INSERT initial : on pose tous les champs fournis (avec null par
 *     défaut si absent).
 *   - Au UPDATE : on ne **remplace pas** un champ existant par null. Si
 *     l'appel suivant ne fournit qu'une adresse, on garde le SIRET/email/etc.
 *     précédents. Logique « enrichissement progressif ».
 *
 * Best-effort : si l'UPSERT échoue (RLS, BDD down…), on warn console et on
 * renvoie null. Le flow appelant ne doit pas dépendre du résultat.
 */

import { and, eq, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { buyers, normalizeBuyerName } from "@/db/schema/buyers";

export interface UpsertBuyerInput {
  organizationId: string;
  /** Nom brut (sera normalisé pour le matching, affiché tel quel). */
  name: string;
  address?: string | null;
  siret?: string | null;
  siren?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  /** UUID de l'utilisateur qui déclenche l'UPSERT (créateur si INSERT). */
  userId?: string | null;
}

/**
 * UPSERT un acheteur. Le matching se fait sur le nom normalisé. Renvoie
 * l'id du buyer touché, ou null en cas d'erreur (best-effort).
 *
 * Champs non fournis ou null/empty → conservés en BDD (pas écrasés). Sauf
 * pour le nom qui est obligatoire.
 */
export async function upsertBuyer(db: Db, input: UpsertBuyerInput): Promise<string | null> {
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) return null;

  const nameNormalized = normalizeBuyerName(trimmedName);

  try {
    const [row] = await db
      .insert(buyers)
      .values({
        organizationId: input.organizationId,
        name: trimmedName,
        nameNormalized,
        address: emptyToNull(input.address),
        siret: emptyToNull(input.siret),
        siren: emptyToNull(input.siren),
        contactEmail: emptyToNull(input.contactEmail),
        contactPhone: emptyToNull(input.contactPhone),
        notes: emptyToNull(input.notes),
        createdBy: input.userId ?? null,
      })
      .onConflictDoUpdate({
        target: [buyers.organizationId, buyers.nameNormalized],
        // COALESCE : on garde la valeur existante si l'appel ne fournit rien
        // de meilleur (logique d'enrichissement progressif).
        set: {
          name: trimmedName, // on rafraîchit l'affichage (le user a peut-être tapé une casse plus propre)
          address: sql`COALESCE(${emptyToNull(input.address)}, ${buyers.address})`,
          siret: sql`COALESCE(${emptyToNull(input.siret)}, ${buyers.siret})`,
          siren: sql`COALESCE(${emptyToNull(input.siren)}, ${buyers.siren})`,
          contactEmail: sql`COALESCE(${emptyToNull(input.contactEmail)}, ${buyers.contactEmail})`,
          contactPhone: sql`COALESCE(${emptyToNull(input.contactPhone)}, ${buyers.contactPhone})`,
          notes: sql`COALESCE(${emptyToNull(input.notes)}, ${buyers.notes})`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: buyers.id });
    return row?.id ?? null;
  } catch (err) {
    console.warn("[upsertBuyer:fail]", { name: trimmedName, err });
    return null;
  }
}

/**
 * Cherche un acheteur par nom normalisé. Renvoie l'address (et autres infos)
 * ou null si non trouvé.
 *
 * Utilisé pour l'auto-populate de tender.buyer_address (Q3) : si l'AO n'a
 * pas d'adresse en BDD mais qu'un buyer correspondant existe dans
 * l'annuaire, on suggère/applique son adresse.
 */
export async function findBuyerByName(
  db: Db,
  organizationId: string,
  name: string,
): Promise<{
  id: string;
  name: string;
  address: string | null;
  siret: string | null;
} | null> {
  const nameNormalized = normalizeBuyerName(name);
  if (nameNormalized.length === 0) return null;

  try {
    const [row] = await db
      .select({
        id: buyers.id,
        name: buyers.name,
        address: buyers.address,
        siret: buyers.siret,
      })
      .from(buyers)
      .where(
        and(eq(buyers.organizationId, organizationId), eq(buyers.nameNormalized, nameNormalized)),
      )
      .limit(1);
    return row ?? null;
  } catch (err) {
    console.warn("[findBuyerByName:fail]", { name, err });
    return null;
  }
}

function emptyToNull(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}
