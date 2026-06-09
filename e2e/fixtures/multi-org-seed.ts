/**
 * Fixtures multi-org pour la recette finale PROTECT (bascule 18 juillet 2026).
 *
 * Source de vérité scénarios : `gates/RECETTE_FINALE_PROTECT_BASCULE_JUILLET.md` §3.
 *
 * Cette fixture utilise un client Supabase **service_role** (admin) pour seeder
 * de manière idempotente :
 *   1. 3 organisations à UUIDs déterministes (ALYOS, PROTECT, CABINET_DUPONT).
 *   2. Des users + memberships dans chaque org (admin + members).
 *   3. Des architectes, BE et entreprises par tenant (3 par org pour vérifier le
 *      cloisonnement → un user PROTECT ne voit JAMAIS d'entité AlyoS et inverse).
 *   4. Des tenders `sourced` distincts par tenant (pour S2 + S6).
 *   5. Des profils de recherche actifs par org (pour le cron multi-tenant S6).
 *
 * **Sécurité — service_role uniquement en preview/dev** : la clé service_role
 * BYPASSE la RLS. Elle est utilisée ici parce qu'on **prépare** l'environnement
 * de test, pas parce qu'on simule l'usage applicatif. Aucun chemin applicatif
 * ne doit l'utiliser. La fixture refuse de tourner si l'env ne mentionne pas
 * explicitement `E2E_TEST_ROUTES_ENABLED=1` (anti-prod safety).
 *
 * **Idempotence** : tous les seeds sont des `INSERT ... ON CONFLICT DO NOTHING`
 * ou des upserts par identifiant déterministe. Lancer la fixture deux fois ne
 * crée pas de doublons et ne réveille pas d'erreurs.
 *
 * **Naming** : préfixes `e2e-test+multiorg-<org>-<role>@<domain>` pour faciliter
 * le nettoyage (cf. `cleanupMultiOrgFixtures()` en bas de fichier).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { UserMetadata } from "../../src/lib/auth/types";

// ─── Identifiants déterministes ──────────────────────────────────────────────

export const MULTI_ORG_IDS = {
  ALYOS: "00000000-0000-0000-0000-000000000a01",
  PROTECT: "00000000-0000-0000-0000-000000000b01",
  CABINET_DUPONT: "00000000-0000-0000-0000-000000000c01",
} as const;

export type OrgKey = keyof typeof MULTI_ORG_IDS;

export const MULTI_ORG_USERS = {
  ALYOS: {
    admin: "e2e-test+multiorg-alyos-admin@alyosingenierie.fr",
    member: "e2e-test+multiorg-alyos-member@alyosingenierie.fr",
  },
  PROTECT: {
    admin: "e2e-test+multiorg-protect-admin@protect-marseille.com",
    member: "e2e-test+multiorg-protect-member@protect-marseille.com",
  },
  CABINET_DUPONT: {
    admin: "e2e-test+multiorg-dupont-admin@cabinet-dupont.fr",
    member: "e2e-test+multiorg-dupont-member@cabinet-dupont.fr",
  },
  // Superadmin avec memberships sur AlyoS ET PROTECT (S3 + S8).
  SUPERADMIN: "e2e-test+multiorg-superadmin@edifio.fr",
  // User orphelin (auth seul, aucune membership) → bascule sur /no-org (S10).
  ORPHAN: "e2e-test+multiorg-orphan@external.com",
} as const;

/** Mot de passe durable pour tous les users multi-org (must_change_password=false). */
export const MULTI_ORG_PASSWORD = "MultiOrg-E2E-2026!";

// ─── Service-role client (admin BYPASSRLS) ───────────────────────────────────

function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error(
      "Multi-org seed : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant. " +
        "Vérifier `.env.local` (dev) ou les secrets GitHub Actions (CI).",
    );
  }
  if (process.env.E2E_TEST_ROUTES_ENABLED !== "1") {
    throw new Error(
      "Multi-org seed : E2E_TEST_ROUTES_ENABLED=1 requis. Anti-prod safety : refuser de " +
        "seeder en prod par accident.",
    );
  }
  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── Seed organisations ──────────────────────────────────────────────────────

interface SeedOrgSpec {
  id: string;
  name: string;
  tier: "studio" | "sourcing" | "cotraitance";
}

const ORG_SPECS: SeedOrgSpec[] = [
  { id: MULTI_ORG_IDS.ALYOS, name: "AlyoS Ingénierie", tier: "studio" },
  { id: MULTI_ORG_IDS.PROTECT, name: "PROTECT Marseille", tier: "sourcing" },
  { id: MULTI_ORG_IDS.CABINET_DUPONT, name: "Cabinet Dupont", tier: "sourcing" },
];

async function seedOrganizations(admin: SupabaseClient): Promise<void> {
  for (const spec of ORG_SPECS) {
    const { error } = await admin.from("organizations").upsert(
      {
        id: spec.id,
        name: spec.name,
        subscription_tier: spec.tier,
        subscription_status: "active",
      },
      { onConflict: "id" },
    );
    if (error) {
      throw new Error(`seedOrganizations(${spec.name}): ${error.message}`);
    }
  }
}

// ─── Seed users + memberships ────────────────────────────────────────────────

interface SeedUserSpec {
  email: string;
  orgId: string | null; // null = orphelin
  role: "admin" | "user" | "viewer" | "superadmin";
  firstName: string;
  lastName: string;
  /** Memberships additionnelles (cas superadmin → AlyoS + PROTECT). */
  extraMemberships?: { orgId: string; role: "admin" | "user" | "viewer" | "superadmin" }[];
}

function buildUserSpecs(): SeedUserSpec[] {
  return [
    {
      email: MULTI_ORG_USERS.ALYOS.admin,
      orgId: MULTI_ORG_IDS.ALYOS,
      role: "admin",
      firstName: "Alyos",
      lastName: "Admin",
    },
    {
      email: MULTI_ORG_USERS.ALYOS.member,
      orgId: MULTI_ORG_IDS.ALYOS,
      role: "user",
      firstName: "Alyos",
      lastName: "Member",
    },
    {
      email: MULTI_ORG_USERS.PROTECT.admin,
      orgId: MULTI_ORG_IDS.PROTECT,
      role: "admin",
      firstName: "Protect",
      lastName: "Admin",
    },
    {
      email: MULTI_ORG_USERS.PROTECT.member,
      orgId: MULTI_ORG_IDS.PROTECT,
      role: "user",
      firstName: "Protect",
      lastName: "Member",
    },
    {
      email: MULTI_ORG_USERS.CABINET_DUPONT.admin,
      orgId: MULTI_ORG_IDS.CABINET_DUPONT,
      role: "admin",
      firstName: "Dupont",
      lastName: "Admin",
    },
    {
      email: MULTI_ORG_USERS.CABINET_DUPONT.member,
      orgId: MULTI_ORG_IDS.CABINET_DUPONT,
      role: "user",
      firstName: "Dupont",
      lastName: "Member",
    },
    {
      email: MULTI_ORG_USERS.SUPERADMIN,
      orgId: MULTI_ORG_IDS.ALYOS,
      role: "superadmin",
      firstName: "Super",
      lastName: "Admin",
      extraMemberships: [{ orgId: MULTI_ORG_IDS.PROTECT, role: "superadmin" }],
    },
    {
      email: MULTI_ORG_USERS.ORPHAN,
      orgId: null, // orphelin → page /no-org au login
      role: "user",
      firstName: "Orphan",
      lastName: "User",
    },
  ];
}

async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  // listUsers est paginé — on parcourt tant qu'on n'a pas trouvé OU épuisé.
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`findUserIdByEmail(${email}): ${error.message}`);
    const found = (data?.users ?? []).find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
    );
    if (found) return found.id;
    if ((data?.users ?? []).length < 200) break; // dernière page
  }
  return null;
}

async function seedUser(admin: SupabaseClient, spec: SeedUserSpec): Promise<string> {
  // Idempotence : on supprime + recrée pour garantir mot de passe + metadata.
  const existing = await findUserIdByEmail(admin, spec.email);
  if (existing) {
    await admin.auth.admin.deleteUser(existing);
  }

  const metadata: UserMetadata = {
    role: spec.role,
    must_change_password: false,
    provisional_password_expires_at: null,
    first_name: spec.firstName,
    last_name: spec.lastName,
  };
  const { data, error } = await admin.auth.admin.createUser({
    email: spec.email,
    password: MULTI_ORG_PASSWORD,
    email_confirm: true,
    user_metadata: metadata as Record<string, unknown>,
  });
  if (error || !data?.user) {
    throw new Error(`seedUser(${spec.email}): ${error?.message ?? "no user returned"}`);
  }
  const userId = data.user.id;

  // public.users (FK audit_logs) + memberships (idempotent).
  await admin.from("users").upsert(
    {
      id: userId,
      email: spec.email,
      firstname: spec.firstName,
      lastname: spec.lastName,
    },
    { onConflict: "id" },
  );

  // Seul l'orphelin n'a pas de membership — c'est exactement le but de S10.
  if (spec.orgId) {
    await admin
      .from("memberships")
      .upsert(
        { organization_id: spec.orgId, user_id: userId, role: spec.role },
        { onConflict: "organization_id,user_id" },
      );
  }
  for (const extra of spec.extraMemberships ?? []) {
    await admin
      .from("memberships")
      .upsert(
        { organization_id: extra.orgId, user_id: userId, role: extra.role },
        { onConflict: "organization_id,user_id" },
      );
  }
  return userId;
}

// ─── Seed entités métier (architectes / BE / entreprises) ───────────────────

async function seedEntitiesForOrg(
  admin: SupabaseClient,
  orgId: string,
  prefix: string,
): Promise<void> {
  // 3 architectes par org — UUIDs déterministes pour idempotence.
  for (let i = 1; i <= 3; i += 1) {
    await admin.from("architects").upsert(
      {
        // UUID v4 quasi-déterministe construit à partir du prefix + index.
        id: pseudoUuid(`arch-${prefix}-${i}`),
        organization_id: orgId,
        cabinet: `${prefix} Architectes ${i}`,
        email: `arch${i}@${prefix.toLowerCase()}-archi.fr`,
        city: "Paris",
      },
      { onConflict: "id" },
    );
  }

  // 3 BE par org.
  for (let i = 1; i <= 3; i += 1) {
    await admin.from("bureaux_etudes").upsert(
      {
        id: pseudoUuid(`be-${prefix}-${i}`),
        organization_id: orgId,
        cabinet: `${prefix} BE ${i}`,
        email: `be${i}@${prefix.toLowerCase()}-be.fr`,
        city: "Marseille",
      },
      { onConflict: "id" },
    );
  }

  // 3 entreprises par org.
  for (let i = 1; i <= 3; i += 1) {
    await admin.from("companies").upsert(
      {
        id: pseudoUuid(`co-${prefix}-${i}`),
        organization_id: orgId,
        name: `${prefix} Entreprise ${i}`,
        email: `co${i}@${prefix.toLowerCase()}-co.fr`,
        city: "Lyon",
      },
      { onConflict: "id" },
    );
  }
}

/**
 * UUID v4-like déterministe à partir d'une string — pour les fixtures.
 * Format `00000000-0000-4000-8xxx-xxxxxxxxxxxx`. Pas cryptographique,
 * juste une fonction stable pour avoir des IDs prévisibles dans les tests.
 */
function pseudoUuid(seed: string): string {
  // Hash FNV-1a 32 bits suffit pour la stabilité (collision improbable sur < 100 seeds).
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  const hex = h.toString(16).padStart(8, "0");
  // Variant + version 4 fixés. Suffisant pour la BDD (UUID type).
  return `${hex}-0000-4000-8000-${hex}${hex.slice(0, 4)}`;
}

// ─── Seed search profiles + tenders ─────────────────────────────────────────

async function seedSearchProfileAndTenders(
  admin: SupabaseClient,
  orgId: string,
  prefix: string,
): Promise<void> {
  // Récupère un platform_id BOAMP — réutilise celui seedé en migration init.
  const { data: platformRow } = await admin
    .from("platforms")
    .select("id")
    .eq("code", "boamp")
    .limit(1)
    .single();
  if (!platformRow) {
    // En CI sans seed metier complet, on saute — les tests qui dépendent du
    // tender (S6) sont skip-friendly.
    return;
  }
  const platformId = platformRow.id;

  // Search profile actif (1 par org).
  const profileId = pseudoUuid(`sp-${prefix}`);
  await admin.from("search_profiles").upsert(
    {
      id: profileId,
      organization_id: orgId,
      name: `${prefix} Profil`,
      is_default: true,
      active: true,
    },
    { onConflict: "id" },
  );

  // 2 tenders `sourced` par org (pour la liste AO du jour).
  for (let i = 1; i <= 2; i += 1) {
    await admin.from("tenders").upsert(
      {
        id: pseudoUuid(`tender-${prefix}-${i}`),
        organization_id: orgId,
        external_ref: `${prefix}-EXT-${i}`,
        platform_id: platformId,
        title: `${prefix} AO test ${i}`,
        buyer: `${prefix} Acheteur ${i}`,
        status: "sourced",
        matching_profile_id: profileId,
      },
      { onConflict: "id" },
    );
  }
}

// ─── API publique ───────────────────────────────────────────────────────────

/**
 * Seed complet de la fixture multi-org. Idempotent.
 *
 * Renvoie un dictionnaire `{ orgKey → userId }` utile pour les helpers
 * qui ont besoin de connaître l'auth.users.id (ex: assertOrgIsolation).
 */
export async function seedMultiOrgFixtures(): Promise<{
  orgIds: typeof MULTI_ORG_IDS;
  userIds: Record<string, string>;
}> {
  const admin = createAdminClient();
  await seedOrganizations(admin);

  const userIds: Record<string, string> = {};
  for (const spec of buildUserSpecs()) {
    userIds[spec.email] = await seedUser(admin, spec);
  }

  await seedEntitiesForOrg(admin, MULTI_ORG_IDS.ALYOS, "ALYOS");
  await seedEntitiesForOrg(admin, MULTI_ORG_IDS.PROTECT, "PROTECT");
  await seedEntitiesForOrg(admin, MULTI_ORG_IDS.CABINET_DUPONT, "DUPONT");

  await seedSearchProfileAndTenders(admin, MULTI_ORG_IDS.ALYOS, "ALYOS");
  await seedSearchProfileAndTenders(admin, MULTI_ORG_IDS.PROTECT, "PROTECT");

  return { orgIds: MULTI_ORG_IDS, userIds };
}

/**
 * Nettoyage best-effort des fixtures multi-org. Supprime les users de test
 * (les memberships + données dépendantes tombent en cascade FK).
 * À appeler en `afterAll` des specs pour ne pas polluer la BDD preview.
 */
export async function cleanupMultiOrgFixtures(): Promise<void> {
  try {
    const admin = createAdminClient();
    const emails = [
      ...Object.values(MULTI_ORG_USERS.ALYOS),
      ...Object.values(MULTI_ORG_USERS.PROTECT),
      ...Object.values(MULTI_ORG_USERS.CABINET_DUPONT),
      MULTI_ORG_USERS.SUPERADMIN,
      MULTI_ORG_USERS.ORPHAN,
    ];
    for (const email of emails) {
      const id = await findUserIdByEmail(admin, email);
      if (id) {
        await admin.auth.admin.deleteUser(id);
      }
    }
  } catch (err) {
    // Best-effort — ne fait pas échouer la suite.
    // eslint-disable-next-line no-console
    console.warn("[cleanupMultiOrgFixtures] non-fatal", err);
  }
}

/** Helper interne — exposé pour `db-checks.ts`. */
export function getAdminClient(): SupabaseClient {
  return createAdminClient();
}
