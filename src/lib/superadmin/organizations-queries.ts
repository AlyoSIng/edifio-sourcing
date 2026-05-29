/**
 * Queries Drizzle — module organisations superadmin — edifio Sourcing
 *
 * CRUD + listings pour la gestion des organisations depuis l'espace éditeur.
 * Ces fonctions sont appelées depuis les Server Components et Server Actions
 * du module `/sourcing/superadmin/organizations`.
 *
 * Aucune vérification d'autorisation ici : la garde triple (session + domaine +
 * superadmin) est effectuée dans les Server Actions et les pages.
 *
 * Source de vérité schema : `src/db/schema/organizations.ts` + `src/db/schema/users.ts`.
 */

import { count, eq } from "drizzle-orm";

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { organizations } from "@/db/schema/organizations";
import type { NewOrganization, Organization } from "@/db/schema/organizations";
import { memberships, users } from "@/db/schema/users";
import type { Membership, User } from "@/db/schema/users";

// ─── Types de sortie ──────────────────────────────────────────────────────────

/** Organisation enrichie du nombre de membres — utilisée dans la liste. */
export interface OrganizationWithCount extends Organization {
  memberCount: number;
}

/** Membre d'une organisation avec ses infos utilisateur — utilisé dans le détail. */
export interface OrgMember {
  membership: Membership;
  user: User;
}

/** Organisation complète avec ses membres — utilisée dans la page de détail. */
export interface OrganizationWithMembers extends Organization {
  members: OrgMember[];
}

// ─── Type db minimal ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PostgresJsDatabase<any>;

// ─── listAllOrganizations ─────────────────────────────────────────────────────

/**
 * Retourne toutes les organisations avec le nombre de membres, triées par
 * date de création décroissante (la plus récente en premier).
 */
export async function listAllOrganizations(db: AnyDb): Promise<OrganizationWithCount[]> {
  // Sous-requête : nombre de membres par organisation
  const memberCounts = await db
    .select({
      organizationId: memberships.organizationId,
      memberCount: count(memberships.userId).as("member_count"),
    })
    .from(memberships)
    .groupBy(memberships.organizationId);

  // Toutes les organisations
  const orgs = await db.select().from(organizations);

  // Fusion en mémoire (liste courte — pas besoin de LEFT JOIN Drizzle complexe)
  const countMap = new Map<string, number>(
    memberCounts.map((r) => [r.organizationId, Number(r.memberCount)]),
  );

  return orgs
    .map((org) => ({
      ...org,
      memberCount: countMap.get(org.id) ?? 0,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// ─── getOrganizationById ──────────────────────────────────────────────────────

/**
 * Retourne une organisation avec la liste complète de ses membres.
 * Retourne `null` si l'organisation n'existe pas.
 */
export async function getOrganizationById(
  id: string,
  db: AnyDb,
): Promise<OrganizationWithMembers | null> {
  // Récupère l'organisation
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);

  if (!org) return null;

  // Récupère les membres avec leurs infos utilisateur
  const rows = await db
    .select({
      membership: memberships,
      user: users,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.organizationId, id));

  return {
    ...org,
    members: rows,
  };
}

// ─── createOrganization ───────────────────────────────────────────────────────

/**
 * Crée une nouvelle organisation et la retourne.
 */
export async function createOrganization(data: NewOrganization, db: AnyDb): Promise<Organization> {
  const rows = await db.insert(organizations).values(data).returning();
  const inserted = rows[0];
  if (!inserted) throw new Error("L'organisation n'a pas pu être créée.");
  return inserted;
}

// ─── updateOrganization ───────────────────────────────────────────────────────

/** Champs modifiables d'une organisation depuis l'interface superadmin. */
export type OrgUpdateData = Pick<
  Partial<Organization>,
  "name" | "subscriptionTier" | "siren" | "siret"
>;

/**
 * Met à jour les champs autorisés d'une organisation.
 * Ignore silencieusement les champs absents (update partiel).
 * Retourne `null` si l'organisation est introuvable.
 */
export async function updateOrganization(
  id: string,
  data: OrgUpdateData,
  db: AnyDb,
): Promise<Organization | null> {
  const updateSet: OrgUpdateData & { updatedAt?: Date } = {};

  if (data.name !== undefined) updateSet.name = data.name;
  if (data.subscriptionTier !== undefined) updateSet.subscriptionTier = data.subscriptionTier;
  if (data.siren !== undefined) updateSet.siren = data.siren;
  if (data.siret !== undefined) updateSet.siret = data.siret;

  // updatedAt forcé à maintenant
  updateSet.updatedAt = new Date();

  const [updated] = await db
    .update(organizations)
    .set(updateSet)
    .where(eq(organizations.id, id))
    .returning();

  return updated ?? null;
}
