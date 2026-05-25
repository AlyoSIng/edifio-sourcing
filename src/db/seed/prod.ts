/**
 * Seed PROD minimal -- edifio Sourcing
 * ===========================================================================
 *
 * Source : Decision Board 2026-05-20 -- Phase A initialisation BDD prod.
 *
 * Contexte :
 *   - La BDD prod Supabase est vide (0 table). Le cron Vercel
 *     `/api/cron/sourcing-run` crashe en prod sur `relation "search_profiles"
 *     does not exist` (PR #18 mergee mais migrations Drizzle 0000-0003 jamais
 *     appliquees a la prod).
 *   - Le Board (Steve) a explicitement valide l'operation de remediation
 *     infra (exception a la limite CLAUDE.md "pas d'ope prod hors Gate 9",
 *     arbitrage trace dans `DECISIONS.md` 2026-05-20).
 *   - Perimetre Phase A = 100% local, aucune action sur la prod reelle.
 *     Phase B (`drizzle-kit migrate` + ce seed) sera executee par Yann
 *     (ps_operator) avec l'URI prod fournie par Steve, dans un second temps.
 *
 * --------------------------------------------------------------------------
 * PERIMETRE SEED PROD MINIMAL (validation explicite Board "1 ok 2 ok 3 ok")
 * --------------------------------------------------------------------------
 *
 * Tables touchees (toutes en ON CONFLICT DO NOTHING = idempotent) :
 *   - organizations           : 1 ligne AlyoS (UUID stable ORG_A_ID)
 *   - platforms               : 4 lignes (boamp / place / francmarches / mp_info)
 *   - architect_specialties   : 7 lignes (table de reference)
 *   - ai_prompts              : 12 lignes (catalogue v1 P1-P12 -- import du
 *                                catalogue figé `AI_PROMPTS_V1_CATALOG`)
 *   - search_profiles         : 1 ligne AlyoS active (cron 06h30 Paris L-V)
 *
 * Tables explicitement NON touchees (a creer via flow user, pas par seed) :
 *   - auth.users              : managed par Supabase Auth (Dashboard / SDK)
 *   - users + memberships     : peuples au 1er login admin AlyoS (FK
 *                                users.id -> auth.users(id))
 *   - tenders + tender_events : viennent du cron BOAMP reel (pas de fixture)
 *   - architects + selections : donnees metier user-driven
 *   - ai_runs                 : peuples a l'usage (par les analyses RC futures)
 *   - brevo_messages          : peuples a l'usage (sollicitations architectes)
 *   - audit_logs              : peuples a l'usage (login, tender_select, etc.)
 *
 * --------------------------------------------------------------------------
 * DOUBLE GARDE ANTI-REGRESSION (impératif)
 * --------------------------------------------------------------------------
 *
 * 1. NODE_ENV doit etre "production" -- sinon throw, sauf si `--allow-prod`
 *    pour permettre un dry-run local manuel.
 * 2. DATABASE_URL ne doit PAS contenir "localhost" ni "127.0.0.1" -- sinon
 *    throw, sauf `--allow-prod`. Evite qu'un dev pose accidentellement le
 *    seed prod sur sa BDD locale (l'org `1111-...` dupliquerait celle du
 *    seed dev = etat incoherent).
 *
 * --------------------------------------------------------------------------
 * Lancement (Phase B uniquement, par Yann) :
 *   $env:DATABASE_URL = "<URI session pooler 5432 prod>"
 *   $env:NODE_ENV = "production"
 *   pnpm db:seed:prod
 *
 * Lancement (dry-run local sandbox, Alex uniquement) :
 *   pnpm db:seed:prod -- --allow-prod
 *
 * NOTE encoding : les accents sont volontairement remplaces par leurs
 * equivalents ASCII dans le code source (cohérence avec `seed/index.ts`,
 * pour echapper aux problemes encoding shell Windows et pgTAP).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { ALYOS_ORG_ID, ALYOS_ORG_NAME } from "@/lib/constants/organization";

import { db } from "../client";
import {
  aiPrompts,
  architectSpecialties,
  organizations,
  platforms,
  searchProfiles,
} from "../schema";
import type { SearchProfileKeywords } from "../types/jsonb";
import { AI_PROMPTS_V1_CATALOG } from "./data/ai-prompts";
import { DEFAULT_TEMPLATES, TEMPLATE_META, type TemplateKey } from "@/lib/email/template-resolver";
import { messageTemplates, organizationProfiles } from "@/db/schema/messaging";

// ============================================================================
// SECTION 1 -- Constantes (alignees `src/db/seed/index.ts` pour coherence
// pgTAP future : un test pgTAP doit retrouver les memes UUIDs dev et prod)
// ============================================================================
//
// Refactor 2026-05-21 (PR n°4 page AO du jour) : ORG_A_ID / ORG_A_NAME sont
// desormais importes depuis `src/lib/constants/organization.ts` (source de
// verite partagee app + seeds, cf. JSDoc du module pour le rationale
// mono-tenant V1). On les re-exporte ici sous leurs noms historiques pour ne
// PAS casser les tests (`prod.test.ts` import nomme ORG_A_ID / ORG_A_NAME).

/** UUID stable AlyoS Ingenierie -- IDENTIQUE au seed dev (re-export DRY). */
export const ORG_A_ID = ALYOS_ORG_ID;

/** Nom AlyoS sans accent -- IDENTIQUE au seed dev (re-export DRY). */
export const ORG_A_NAME = ALYOS_ORG_NAME;

/** IDs deterministes des 4 plateformes -- IDENTIQUES au seed dev (PLATFORM_IDS). */
export const PROD_PLATFORM_IDS = {
  boamp: "aaaaaaaa-0000-0000-0000-000000000001",
  place: "aaaaaaaa-0000-0000-0000-000000000002",
  francmarches: "aaaaaaaa-0000-0000-0000-000000000003",
  mp_info: "aaaaaaaa-0000-0000-0000-000000000004",
} as const;

/** Specialites architectes -- IDENTIQUES au seed dev (tableau SPECIALTIES). */
const PROD_SPECIALTIES = [
  { code: "BAT_NEUF", labelFr: "Batiment neuf" },
  { code: "REHA", labelFr: "Rehabilitation" },
  { code: "TCE", labelFr: "Tous corps d'etat" },
  { code: "MOE_TECH", labelFr: "Maitrise d'oeuvre technique" },
  { code: "PAYSAGE", labelFr: "Paysage" },
  { code: "URBA", labelFr: "Urbanisme" },
  { code: "PATRIMOINE", labelFr: "Patrimoine historique" },
] as const;

// ============================================================================
// SECTION 2 -- Double garde anti-regression
// ============================================================================

export interface SeedProdGuardEnv {
  NODE_ENV?: string;
  DATABASE_URL?: string;
}

/**
 * Verifie que le contexte d'execution est bien "prod" (ou explicitement
 * autorise via `--allow-prod` pour un dry-run local).
 *
 * Throw un message clair si :
 *   - NODE_ENV != "production" ET pas de flag `--allow-prod`
 *   - DATABASE_URL pointe sur localhost / 127.0.0.1 ET pas de flag `--allow-prod`
 *
 * Exportee pour testabilite (cf. `prod.test.ts`). Le `main()` ci-dessous
 * passe `process.env` + `process.argv` -- mais en test on peut injecter.
 */
export function assertProdContext(env: SeedProdGuardEnv, argv: string[]): void {
  const allowProd = argv.includes("--allow-prod");

  if (env.NODE_ENV !== "production" && !allowProd) {
    throw new Error(
      "[db:seed:prod] Refus: NODE_ENV doit valoir 'production' (ou passer --allow-prod " +
        "pour test local manuel). Cf. docs/DEPLOY.md.",
    );
  }

  const url = env.DATABASE_URL ?? "";
  const looksLocal = url.includes("localhost") || url.includes("127.0.0.1");
  if (looksLocal && !allowProd) {
    throw new Error(
      "[db:seed:prod] Refus: DATABASE_URL pointe sur localhost / 127.0.0.1 " +
        "(seed prod sur BDD locale = etat incoherent avec seed dev). " +
        "Passe --allow-prod pour confirmer (re-lecture obligatoire CTO).",
    );
  }
}

// ============================================================================
// SECTION 3 -- Buildeurs (pure functions)
// ============================================================================

/**
 * Construit l'unique search_profile AlyoS actif au demarrage prod.
 *
 * Choix metier valides Board :
 *   - keywords positifs : BTP, renovation, construction, MOE (sud-ouest AlyoS)
 *   - cpvCodes 45 (construction BTP) + 71 (ingenierie architecture)
 *   - geoZones departements 33/40/47/64 + ville 33000 Bordeaux (INSEE)
 *   - amountMin/amountMax = NULL : pas de filtre montant V1
 *   - cronTime 06h30 + cronDays L-V (1-5) : aligne `vercel.json` `30 4 * * 1-5` UTC
 */
function buildProdSearchProfile(): typeof searchProfiles.$inferInsert {
  const keywords: SearchProfileKeywords = {
    positive: ["BTP", "renovation", "construction", "maitrise d'oeuvre"],
    negative: ["informatique", "logiciel", "fourniture mobilier"],
    exact: ["AlyoS", "edifio"],
  };
  return {
    organizationId: ORG_A_ID,
    name: "Profil AlyoS BTP - sourcing principal",
    keywords,
    cpvCodes: ["45000000", "71000000"],
    geoZones: ["33", "40", "47", "64", "33000"],
    marketTypes: ["travaux", "services", "maitrise d'oeuvre"],
    amountMin: null,
    amountMax: null,
    active: true,
    cronTime: "06:30:00",
    cronDays: [1, 2, 3, 4, 5],
  };
}

// ============================================================================
// SECTION 4 -- Rapport seed
// ============================================================================

export interface SeedProdReportCounts {
  organizations: number;
  platforms: number;
  architect_specialties: number;
  ai_prompts: number;
  search_profiles: number;
  message_templates: number;
  organization_profiles: number;
}

export interface SeedProdReport {
  seeded_at: string;
  context: "production" | "allow-prod-local";
  counts: SeedProdReportCounts;
  org_a_id: string;
  org_a_name: string;
}

// ============================================================================
// SECTION 5 -- Orchestration
// ============================================================================

/**
 * Execute le seed prod minimal. Idempotent grace aux `onConflictDoNothing()`
 * sur les UUID / contraintes UNIQUE.
 *
 * @param env - Variables d'environnement (defaut: process.env). Injecte en
 *              test pour controler NODE_ENV / DATABASE_URL.
 * @param argv - Argv ligne de commande (defaut: process.argv). Injecte en
 *              test pour simuler `--allow-prod`.
 */
export async function runSeedProd(
  env: SeedProdGuardEnv = process.env,
  argv: string[] = process.argv,
): Promise<SeedProdReport> {
  assertProdContext(env, argv);

  const isAllowProdMode = argv.includes("--allow-prod") && env.NODE_ENV !== "production";
  const context: SeedProdReport["context"] = isAllowProdMode ? "allow-prod-local" : "production";

  // eslint-disable-next-line no-console
  console.log("[db:seed:prod] ==== Seed PROD minimal -- edifio Sourcing ====");
  // eslint-disable-next-line no-console
  console.log(`[db:seed:prod] Contexte : ${context}`);

  const counts: SeedProdReportCounts = {
    organizations: 0,
    platforms: 0,
    architect_specialties: 0,
    ai_prompts: 0,
    search_profiles: 0,
    message_templates: 0,
    organization_profiles: 0,
  };

  // --- 1. Organization AlyoS ----------------------------------------------
  await db
    .insert(organizations)
    .values({
      id: ORG_A_ID,
      name: ORG_A_NAME,
      subscriptionTier: "studio",
    })
    .onConflictDoNothing();
  counts.organizations = 1;
  // eslint-disable-next-line no-console
  console.log(`[db:seed:prod] [OK] organizations : 1 ligne (${ORG_A_NAME})`);

  // --- 2. Platforms (4 lignes -- IDENTIQUES seed dev) ---------------------
  await db
    .insert(platforms)
    .values([
      {
        id: PROD_PLATFORM_IDS.boamp,
        code: "boamp",
        displayName: "BOAMP",
        authType: "api_key",
        baseUrl: "https://data.boamp.fr",
        enabled: true,
      },
      {
        id: PROD_PLATFORM_IDS.place,
        code: "place",
        displayName: "PLACE",
        authType: "login_password",
        baseUrl: "https://www.marches-publics.gouv.fr",
        enabled: true,
      },
      {
        id: PROD_PLATFORM_IDS.francmarches,
        code: "francmarches",
        displayName: "Francmarches",
        authType: "none",
        baseUrl: "https://www.francmarches.com",
        enabled: true,
      },
      {
        id: PROD_PLATFORM_IDS.mp_info,
        code: "mp_info",
        displayName: "MP.info",
        authType: "none",
        baseUrl: "https://www.marches-publics.info",
        enabled: true,
      },
    ])
    .onConflictDoNothing();
  counts.platforms = 4;
  // eslint-disable-next-line no-console
  console.log("[db:seed:prod] [OK] platforms : 4 lignes (boamp / place / francmarches / mp_info)");

  // --- 3. Architect specialties (7 lignes de reference) ------------------
  await db
    .insert(architectSpecialties)
    .values([...PROD_SPECIALTIES])
    .onConflictDoNothing();
  counts.architect_specialties = PROD_SPECIALTIES.length;
  // eslint-disable-next-line no-console
  console.log(`[db:seed:prod] [OK] architect_specialties : ${PROD_SPECIALTIES.length} lignes`);

  // --- 4. AI prompts (catalogue v1 P1-P12, import sans duplication) ------
  // Cf. `src/db/seed/data/ai-prompts.ts` -- catalogue figé CTO. Toute modif
  // d'un prompt = bump version + revue CTO (cf. politique versioning prompts).
  await db.insert(aiPrompts).values(AI_PROMPTS_V1_CATALOG).onConflictDoNothing();
  counts.ai_prompts = AI_PROMPTS_V1_CATALOG.length;
  // eslint-disable-next-line no-console
  console.log(
    `[db:seed:prod] [OK] ai_prompts : ${AI_PROMPTS_V1_CATALOG.length} lignes (P1-P12 v1)`,
  );

  // --- 5. Search profile AlyoS (1 ligne active) --------------------------
  // Pas de garde onConflictDoNothing sur cette table : la PK est un UUID
  // genere cote DB (`uuid_generate_v4()`) et il n'y a pas de contrainte
  // UNIQUE sur (organization_id, name). Le seed prod n'est pas censé etre
  // re-execute en prod, mais si jamais ca arrive, on aura plusieurs profils
  // identiques. Solution future si besoin : ajouter une contrainte UNIQUE
  // dans une migration ulterieure puis basculer en onConflictDoNothing.
  // En attendant : on idempotence "a la main" via un check pre-insert.
  const existingProfiles = await db.select({ id: searchProfiles.id }).from(searchProfiles);
  if (existingProfiles.length === 0) {
    await db.insert(searchProfiles).values(buildProdSearchProfile());
    counts.search_profiles = 1;
    // eslint-disable-next-line no-console
    console.log("[db:seed:prod] [OK] search_profiles : 1 ligne (AlyoS BTP, active)");
  } else {
    counts.search_profiles = 0;
    // eslint-disable-next-line no-console
    console.log(
      `[db:seed:prod] [SKIP] search_profiles : ${existingProfiles.length} deja en BDD, pas de re-insert`,
    );
  }

  // --- 6. Templates d'e-mail (11 templates par defaut) -------------------
  // Idempotent via onConflictDoNothing (contrainte UNIQUE org_id + key).
  // Le seed pose les valeurs par defaut; le Board peut les editer via
  // l'interface /sourcing/admin/modeles-email sans re-seeder.
  const templateKeys = Object.keys(DEFAULT_TEMPLATES) as TemplateKey[];
  const templateRows = templateKeys.map((key) => ({
    organizationId: ORG_A_ID,
    key,
    channel: TEMPLATE_META[key].channel,
    subject: DEFAULT_TEMPLATES[key].subject,
    body: DEFAULT_TEMPLATES[key].body,
    version: 1,
  }));
  await db.insert(messageTemplates).values(templateRows).onConflictDoNothing();
  counts.message_templates = templateKeys.length;
  // eslint-disable-next-line no-console
  console.log(
    `[db:seed:prod] [OK] message_templates : ${templateKeys.length} lignes (11 templates par defaut)`,
  );

  // --- 7. Profil organisation AlyoS (1 ligne) ----------------------------
  // Seed MVP : bloc 4 puces AlyoS (eco construction/MOE ; accessibilite ;
  // BIM/ACCA ; 2 agences Normandie & PACA) — validé Board spec D.
  const ALYOS_PRESENTATION_BLOCK =
    "AlyoS Ingenierie est un bureau d'etudes specialise en maitrise d'oeuvre BTP, " +
    "intervenant en construction neuve et rehabilitation.\n\n" +
    "- Eco-construction et maitrise d'oeuvre : conception durable, materiaux biosources, " +
    "performance energetique.\n" +
    "- Accessibilite et reglementaire : mise en conformite Ad'AP, AMO PPMS, missions " +
    "PEMD/amiante, economie circulaire et reemploi.\n" +
    "- BIM et outils numeriques : pilotage maquette ACCA, coordination interoperabilite.\n" +
    "- Deux agences : Normandie (Rouen) et PACA (Aix-en-Provence).";

  await db
    .insert(organizationProfiles)
    .values({
      organizationId: ORG_A_ID,
      presentationBlock: ALYOS_PRESENTATION_BLOCK,
      commercialName: "AlyoS Ingenierie",
      emailSignature: "L'equipe AlyoS Ingenierie",
      agencyDetails:
        "Agence Normandie : 2 rue des Artisans, 76000 Rouen\n" +
        "Agence PACA : 15 avenue du Mistral, 13100 Aix-en-Provence",
      phone: "",
      contactEmail: "",
    })
    .onConflictDoNothing();
  counts.organization_profiles = 1;
  // eslint-disable-next-line no-console
  console.log("[db:seed:prod] [OK] organization_profiles : 1 ligne (AlyoS Ingenierie)");

  // --- 8. Rapport ---------------------------------------------------------
  const report: SeedProdReport = {
    seeded_at: new Date().toISOString(),
    context,
    counts,
    org_a_id: ORG_A_ID,
    org_a_name: ORG_A_NAME,
  };

  // Persistance du rapport (audit / traceability). Aligne le pattern de
  // `seed/index.ts` qui ecrit `distribution-report.json`.
  const reportPath = resolve(process.cwd(), "src/db/seed/prod-seed-report.json");
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  // eslint-disable-next-line no-console
  console.log("[db:seed:prod] Rapport :", JSON.stringify(report, null, 2));
  // eslint-disable-next-line no-console
  console.log(`[db:seed:prod] Rapport ecrit : ${reportPath}`);
  // eslint-disable-next-line no-console
  console.log("[db:seed:prod] ==== Seed PROD termine OK ====");

  return report;
}

// ============================================================================
// SECTION 6 -- Entry guard (execution directe uniquement, pas en import test)
// ============================================================================

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("src/db/seed/prod.ts") ?? false;

if (isDirectRun) {
  runSeedProd()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error("[db:seed:prod] FAIL", err);
      process.exit(1);
    });
}
