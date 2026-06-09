"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { architects } from "@/db/schema/architects";
import { architectResponses, matchProposals } from "@/db/schema/selections";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { eq, inArray, sql } from "drizzle-orm";

/**
 * Un groupe de doublons — entrées qui partagent la même raison sociale
 * (comparaison case-insensitive, whitespace trimé).
 */
export interface DuplicateEntry {
  id: string;
  cabinet: string;
  email: string | null;
  siren: string | null;
  city: string | null;
  createdAt: Date;
}

export interface DuplicateGroup {
  /** Clé normalisée : lower(trim(cabinet)) */
  key: string;
  entries: DuplicateEntry[];
}

// ============================================================================
// Action : détecter les doublons
// ============================================================================

/**
 * Détecte les groupes de doublons dans la table `architects` pour l'organisation AlyoS.
 *
 * Critère : même `cabinet` après lower(trim()), groupes de taille ≥ 2.
 * Les entrées d'un groupe sont triées par `created_at` ASC (la plus ancienne
 * est considérée comme la « canonique » à conserver).
 *
 * @returns Tableau de groupes de doublons, vide si aucun doublon.
 */
export async function detectArchitectDuplicatesAction(orgId: string): Promise<DuplicateGroup[]> {
  // Requête 1 : trouver les clés qui ont au moins 2 occurrences + leurs ids
  const groupRows = await db.execute<{ key: string; ids: string[] }>(sql`
    SELECT lower(trim(cabinet)) AS key,
           array_agg(id::text ORDER BY created_at ASC) AS ids
    FROM architects
    WHERE organization_id = ${orgId}
    GROUP BY lower(trim(cabinet))
    HAVING count(*) > 1
  `);

  if (groupRows.length === 0) return [];

  // Requête 2 : charger les détails de chaque entrée doublon
  const allIds = groupRows.flatMap((r) => r.ids);

  const details = await db
    .select({
      id: architects.id,
      cabinet: architects.cabinet,
      email: architects.email,
      siren: architects.siren,
      city: architects.city,
      createdAt: architects.createdAt,
    })
    .from(architects)
    .where(inArray(architects.id, allIds));

  // Indexer les détails par id pour assemblage O(n)
  const detailMap = new Map<string, DuplicateEntry>();
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

  // Assembler les groupes en respectant l'ordre ASC created_at (ids déjà triés en SQL)
  const groups: DuplicateGroup[] = [];
  for (const row of groupRows) {
    const entries: DuplicateEntry[] = [];
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
// Action : supprimer un doublon
// ============================================================================

/**
 * Supprime un architecte identifié comme doublon.
 *
 * Guards (défense en profondeur) :
 *   1. Session valide.
 *   2. Rôle admin (isAdmin suffit — pas besoin superadmin).
 *   3. UUID v4 valide.
 *   4. L'architecte appartient bien à l'organisation courante (pas de suppression cross-tenant).
 *   5. Aucune `architect_response` active (statut « pending ») sur cet architecte.
 *   6. Aucun `match_proposal` actif sur cet architecte (présence = AO en cours).
 *
 * En cas de blocage par la contrainte 5 ou 6, retourne `{ ok: false, error: "has_active_solicitations" }`.
 *
 * @param id - UUID de l'architecte à supprimer.
 */
export async function deleteArchitectDuplicateAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Guard 1 — session
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "unauthenticated" };

  // Guard 2 — rôle admin
  const profile = toUserProfile(user);
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };

  const orgId = await getRequiredOrgId(user.id);

  // Guard 3 — UUID v4 valide (regex stricte)
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(id)) return { ok: false, error: "invalid_id" };

  // Guard 4 — vérifier que l'architecte existe et appartient au bon tenant
  const [existing] = await db
    .select({ id: architects.id, organizationId: architects.organizationId })
    .from(architects)
    .where(eq(architects.id, id))
    .limit(1);

  if (!existing) return { ok: false, error: "not_found" };
  if (existing.organizationId !== orgId) return { ok: false, error: "forbidden" };

  // Guard 5 — aucune réponse active (pending) sur cet architecte
  const pendingResponses = await db
    .select({ id: architectResponses.id })
    .from(architectResponses)
    .where(
      sql`${architectResponses.architectId} = ${id}::uuid
          AND ${architectResponses.status} = 'pending'`,
    )
    .limit(1);

  if (pendingResponses.length > 0) {
    return { ok: false, error: "has_active_solicitations" };
  }

  // Guard 6 — aucune proposition de matching active sur cet architecte
  const activeProposals = await db
    .select({ id: matchProposals.id })
    .from(matchProposals)
    .where(eq(matchProposals.architectId, id))
    .limit(1);

  if (activeProposals.length > 0) {
    return { ok: false, error: "has_active_solicitations" };
  }

  // Suppression effective
  await db.delete(architects).where(eq(architects.id, id));

  revalidatePath("/sourcing/architectes");

  return { ok: true };
}
