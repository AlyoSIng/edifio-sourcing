"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { bureauEtudes } from "@/db/schema/bureaux-etudes";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { eq, inArray, sql } from "drizzle-orm";

/**
 * Un groupe de doublons BET — entrées qui partagent la même raison sociale
 * (comparaison case-insensitive, whitespace trimé).
 */
export interface DuplicateBEEntry {
  id: string;
  cabinet: string;
  email: string | null;
  siren: string | null;
  city: string | null;
  createdAt: Date;
}

export interface DuplicateBEGroup {
  /** Clé normalisée : lower(trim(cabinet)) */
  key: string;
  entries: DuplicateBEEntry[];
}

// ============================================================================
// Action : détecter les doublons
// ============================================================================

/**
 * Détecte les groupes de doublons dans la table `bureaux_etudes` pour l'organisation AlyoS.
 *
 * Critère : même `cabinet` après lower(trim()), groupes de taille ≥ 2.
 * Les entrées d'un groupe sont triées par `created_at` ASC (la plus ancienne
 * est considérée comme la « canonique » à conserver).
 *
 * @returns Tableau de groupes de doublons, vide si aucun doublon.
 */
export async function detectBEDuplicatesAction(orgId: string): Promise<DuplicateBEGroup[]> {
  // Requête 1 : trouver les clés avec au moins 2 occurrences + leurs ids
  const groupRows = await db.execute<{ key: string; ids: string[] }>(sql`
    SELECT lower(trim(cabinet)) AS key,
           array_agg(id::text ORDER BY created_at ASC) AS ids
    FROM bureaux_etudes
    WHERE organization_id = ${orgId}
    GROUP BY lower(trim(cabinet))
    HAVING count(*) > 1
  `);

  if (groupRows.length === 0) return [];

  // Requête 2 : charger les détails de chaque entrée doublon
  const allIds = groupRows.flatMap((r) => r.ids);

  const details = await db
    .select({
      id: bureauEtudes.id,
      cabinet: bureauEtudes.cabinet,
      email: bureauEtudes.email,
      siren: bureauEtudes.siren,
      city: bureauEtudes.city,
      createdAt: bureauEtudes.createdAt,
    })
    .from(bureauEtudes)
    .where(inArray(bureauEtudes.id, allIds));

  // Indexer par id pour assemblage O(n)
  const detailMap = new Map<string, DuplicateBEEntry>();
  for (const row of details) {
    detailMap.set(row.id, {
      id: row.id,
      cabinet: row.cabinet,
      email: row.email,
      siren: row.siren,
      city: row.city,
      createdAt: row.createdAt,
    });
  }

  // Assembler les groupes en respectant l'ordre ASC created_at
  const groups: DuplicateBEGroup[] = [];
  for (const row of groupRows) {
    const entries: DuplicateBEEntry[] = [];
    for (const id of row.ids) {
      const entry = detailMap.get(id);
      if (entry) entries.push(entry);
    }
    if (entries.length >= 2) {
      groups.push({ key: row.key, entries });
    }
  }

  return groups;
}

// ============================================================================
// Action : supprimer un doublon BET
// ============================================================================

/**
 * Supprime un bureau d'études identifié comme doublon.
 *
 * Guards (défense en profondeur) :
 *   1. Session valide.
 *   2. Rôle admin (isAdmin suffit).
 *   3. UUID v4 valide.
 *   4. Le BET appartient bien à l'organisation courante (pas de suppression cross-tenant).
 *
 * Note : la table `bureaux_etudes` n'a pas encore de table de réponses / match_proposals
 * (les flows Tandem BET sont prévus Phase 2). Les documents `be_documents` ont
 * une FK `ON DELETE CASCADE`, ils seront supprimés avec le BET — comportement voulu
 * pour un doublon (les documents du doublon n'ont pas vocation à être conservés).
 *
 * @param id - UUID du BET à supprimer.
 */
export async function deleteBEDuplicateAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Guard 1 — session
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "unauthenticated" };

  // Guard 2 — rôle admin
  const profile = toUserProfile(user);
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };

  const orgId = await getRequiredOrgId(user.id);

  // Guard 3 — UUID v4 valide
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(id)) return { ok: false, error: "invalid_id" };

  // Guard 4 — vérifier que le BET existe et appartient au bon tenant
  const [existing] = await db
    .select({ id: bureauEtudes.id, organizationId: bureauEtudes.organizationId })
    .from(bureauEtudes)
    .where(eq(bureauEtudes.id, id))
    .limit(1);

  if (!existing) return { ok: false, error: "not_found" };
  if (existing.organizationId !== orgId) return { ok: false, error: "forbidden" };

  // Suppression effective (be_documents cascade automatiquement)
  await db.delete(bureauEtudes).where(eq(bureauEtudes.id, id));

  revalidatePath("/sourcing/bureaux-etudes");

  return { ok: true };
}
