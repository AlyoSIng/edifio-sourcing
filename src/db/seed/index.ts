/**
 * Seed principal -- edifio Sourcing
 * ===========================================================================
 *
 * Source : Decision Board etape 5 (Gate 6) + condition 2 ADR-013 (CTO).
 *
 * Perimetre (CHOIX B etendu) : 2 organisations completes pour permettre les
 * tests cross-tenant en pgTAP. Tables couvertes :
 *   - organizations + memberships + users
 *   - platforms (4 lignes) + platform_credentials
 *   - search_profiles (1 / org)
 *   - architects (50 / org = 100 total)
 *   - tenders (100 / org = 200 total) avec distribution stricte 15/60/25
 *   - tender_events (~3 / tender)
 *   - ai_prompts + ai_runs (~10 / org)
 *   - brevo_messages (~20 / org)
 *   - audit_logs (~30 / org)
 *
 * NOTES PROD :
 *   - L'organisation "Seed Test Org B" est marquee dev/CI-only. Le middleware
 *     auth restreint deja l'acces a `@alyosingenierie.fr`. Cette org ne doit
 *     JAMAIS apparaitre en production (CLAUDE.md : "1 seule organisation en
 *     prod au MVP : AlyoS").
 *   - Le seed est `ON CONFLICT DO NOTHING` -friendly : idempotent par nature
 *     (UUID stables pour les 2 orgs, etc.).
 *
 * Lancement :
 *   - `pnpm db:seed` (npm script -> tsx src/db/seed/index.ts)
 *   - en CI : entre `pnpm db:migrate` et `pnpm test:rls`.
 *
 * NE LANCE PAS le fetch reseau BOAMP : lit la fixture committee
 * `src/db/seed/fixtures/boamp-real.json` via `loadBoampFixture()`.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { faker } from "@faker-js/faker/locale/fr";
import { sql } from "drizzle-orm";

import { db } from "../client";
import {
  aiPrompts,
  aiRuns,
  architectSpecialties,
  architects,
  auditLogs,
  brevoMessages,
  memberships,
  organizations,
  platforms,
  searchProfiles,
  tenderEvents,
  tenders,
  users,
} from "../schema";
import type {
  AiRunOutput,
  AuditLogData,
  BrevoMessageEvents,
  SearchProfileKeywords,
  TenderEventData,
  TenderRawData,
} from "../types/jsonb";
import { AI_PROMPTS_V1_CATALOG } from "./data/ai-prompts";
import { assertDistribution, recordSizeKb } from "./lib/distribution";
import { loadBoampFixture } from "./lib/fixture-loader";

faker.seed(20260518);

// --- UUID stables ----------------------------------------------------------
// Permet l'idempotence (relancer le seed ne reduplique pas) + permet aux
// tests pgTAP de retrouver les orgs via UUID predictible.
const ORG_A_ID = "11111111-1111-1111-1111-111111111111"; // AlyoS Ingenierie
const ORG_B_ID = "22222222-2222-2222-2222-222222222222"; // Seed Test Org B (dev/CI only)

const ORG_A_NAME = "AlyoS Ingenierie";
const ORG_B_NAME = "Seed Test Org B";

// IDs deterministes pour les 4 plateformes
const PLATFORM_IDS = {
  boamp: "aaaaaaaa-0000-0000-0000-000000000001",
  place: "aaaaaaaa-0000-0000-0000-000000000002",
  francmarches: "aaaaaaaa-0000-0000-0000-000000000003",
  mp_info: "aaaaaaaa-0000-0000-0000-000000000004",
} as const;

// --- Specialites architectes (table de reference) --------------------------
const SPECIALTIES = [
  { code: "BAT_NEUF", labelFr: "Batiment neuf" },
  { code: "REHA", labelFr: "Rehabilitation" },
  { code: "TCE", labelFr: "Tous corps d'etat" },
  { code: "MOE_TECH", labelFr: "Maitrise d'oeuvre technique" },
  { code: "PAYSAGE", labelFr: "Paysage" },
  { code: "URBA", labelFr: "Urbanisme" },
  { code: "PATRIMOINE", labelFr: "Patrimoine historique" },
] as const;

// --- Prompts IA (table de reference) ---------------------------------------
// Source : `src/db/seed/data/ai-prompts.ts` -- catalogue v1 figé (12 prompts
// P1-P12 alignés `specs/ai_prompts_v1.md`). Etape 6/7 PR #2.
// La structure precedente (2 prompts stub `tender_score_full` +
// `architect_match`) a ete REMPLACEE le 2026-05-20 -- toutes les sections
// suivantes du seed (notamment ai_runs section 9) referencent desormais le
// premier prompt du catalogue v1 (`rc_analysis_full`).
const AI_PROMPTS = AI_PROMPTS_V1_CATALOG;

// ============================================================================
// SECTION 1 -- Buildeurs (logique pure, possibles a sortir si besoin de test)
// ============================================================================

function buildSearchProfile(orgId: string, name: string): typeof searchProfiles.$inferInsert {
  const keywords: SearchProfileKeywords = {
    positive: ["BTP", "renovation", "construction", "maitrise d'oeuvre"],
    negative: ["informatique", "logiciel", "fourniture mobilier"],
    exact: ["AlyoS", "edifio"],
  };
  return {
    organizationId: orgId,
    name,
    keywords,
    cpvCodes: ["45000000", "71000000"],
    geoZones: ["33", "40", "47", "64", "33000"],
    marketTypes: ["travaux", "services", "maitrise d'oeuvre"],
    active: true,
  };
}

function buildArchitect(orgId: string, index: number): typeof architects.$inferInsert {
  const firstname = faker.person.firstName();
  const lastname = faker.person.lastName();
  return {
    organizationId: orgId,
    firstname,
    lastname,
    title: faker.helpers.arrayElement(["M.", "Mme", "Dr"]),
    email: `archi-${orgId.slice(0, 8)}-${index}@exemple.test`,
    phone: "01 23 45 67 89",
    siret: faker.string.numeric(14),
    specialtyCodes: faker.helpers.arrayElements(
      SPECIALTIES.map((s) => s.code),
      { min: 1, max: 3 },
    ),
    geoZones: faker.helpers.arrayElements(["33", "40", "47", "64", "75", "13", "69"], {
      min: 1,
      max: 4,
    }),
    references: faker.lorem.sentence(),
    partnershipStatus: faker.helpers.arrayElement(["actif", "inactif", "prospect"]),
    notes: faker.lorem.paragraph(),
    tutoiement: index % 5 === 0, // 20% tutoiement
  };
}

interface BuildTenderInput {
  orgId: string;
  bucketRecord: Record<string, unknown>;
  bucket: "small" | "medium" | "large";
  index: number;
}

function buildTender({
  orgId,
  bucketRecord,
  bucket,
  index,
}: BuildTenderInput): typeof tenders.$inferInsert {
  const fetchedAt = faker.date.recent({ days: 90 });
  const dedupSource = `${orgId}|${bucket}|${index}|${JSON.stringify(bucketRecord).slice(0, 200)}`;
  const dedupHash = createHash("sha256").update(dedupSource).digest("hex");
  const rawData: TenderRawData = {
    platform_code: "boamp",
    record: bucketRecord,
    fetched_at: fetchedAt.toISOString(),
    dedup_hash: dedupHash,
  };
  const deadline = faker.date.soon({ days: 60, refDate: fetchedAt });
  // Note : faker.date.between exige refDate < fetchedAt. Questions deadline = 80% avant deadline.
  const questionsDeadline = faker.date.between({ from: fetchedAt, to: deadline });
  return {
    organizationId: orgId,
    externalRef: `BOAMP-${orgId.slice(0, 8)}-${bucket}-${index}`,
    platformId: PLATFORM_IDS.boamp,
    title:
      typeof bucketRecord["objet"] === "string" ? bucketRecord["objet"] : faker.lorem.sentence(),
    buyer:
      typeof bucketRecord["nomacheteur"] === "string"
        ? bucketRecord["nomacheteur"]
        : faker.company.name(),
    cpv:
      typeof bucketRecord["codecpv_principal"] === "string"
        ? [bucketRecord["codecpv_principal"]]
        : ["45000000"],
    amount: faker.number.int({ min: 50000, max: 5000000 }).toString(),
    deadline,
    questionsDeadline,
    visitDate: null,
    dceUrl: typeof bucketRecord["url_dce"] === "string" ? bucketRecord["url_dce"] : null,
    sourceUrl: null,
    rawData,
    score: faker.number.float({ min: 0, max: 100, fractionDigits: 2 }).toString(),
    status: "sourced",
  };
}

function buildTenderEvent(
  tenderId: string,
  orgId: string,
  actorId: string,
  eventType: "sourced" | "selected" | "status_change",
  occurredAt: Date,
): typeof tenderEvents.$inferInsert {
  const data: TenderEventData =
    eventType === "status_change"
      ? { from_status: "sourced", to_status: "selected_solo" }
      : eventType === "selected"
        ? { score: faker.number.int({ min: 60, max: 95 }) }
        : { extra: { source: "BOAMP cron" } };
  return {
    tenderId,
    organizationId: orgId,
    actorId,
    eventType,
    occurredAt,
    data,
  };
}

function buildAiRun(
  orgId: string,
  promptId: string,
  promptName: string,
  index: number,
): typeof aiRuns.$inferInsert {
  const inputHash = createHash("sha256").update(`${orgId}|${promptName}|${index}`).digest("hex");
  const output: AiRunOutput = {
    prompt_name: promptName,
    prompt_version: 1,
    payload: {
      score: faker.number.int({ min: 0, max: 100 }),
      rationale: faker.lorem.paragraph(),
    },
    metadata: {
      tokens_in: faker.number.int({ min: 500, max: 8000 }),
      tokens_out: faker.number.int({ min: 100, max: 2000 }),
      input_hash: inputHash,
    },
  };
  return {
    organizationId: orgId,
    promptId,
    tenderId: null,
    inputHash,
    output,
    costUsd: faker.number.float({ min: 0.001, max: 0.5, fractionDigits: 4 }).toString(),
    latencyMs: faker.number.int({ min: 200, max: 12000 }),
    model: "sonnet-4-6",
    succeeded: true,
    errorMessage: null,
  };
}

function buildBrevoMessage(orgId: string, index: number): typeof brevoMessages.$inferInsert {
  const eventsCount = faker.number.int({ min: 1, max: 5 });
  const baseDate = faker.date.recent({ days: 30 });
  const events: BrevoMessageEvents = Array.from({ length: eventsCount }, (_, i) => ({
    event: faker.helpers.arrayElement([
      "delivered" as const,
      "opened" as const,
      "clicked" as const,
      "bounced" as const,
      "softbounce" as const,
    ]),
    occurred_at: new Date(baseDate.getTime() + i * 3600 * 1000).toISOString(),
    ip: faker.internet.ipv4(),
    user_agent: faker.internet.userAgent(),
  }));
  return {
    organizationId: orgId,
    tenderId: null,
    architectId: null,
    templateName: faker.helpers.arrayElement([
      "architect_solicitation_TU",
      "architect_solicitation_VOUS",
      "dossier_diffuse_VOUS",
    ]),
    register: faker.helpers.arrayElement(["tu" as const, "vous" as const, "neutre" as const]),
    brevoMessageId: `brevo-${orgId.slice(0, 8)}-${index}-${faker.string.alphanumeric(8)}`,
    sentAt: baseDate,
    events,
  };
}

function buildAuditLog(
  orgId: string,
  actorId: string,
  actorEmail: string,
  index: number,
): typeof auditLogs.$inferInsert {
  // On distribue les 13 actions de maniere variee mais deterministe.
  const actions = [
    "login",
    "membership_change",
    "search_profile_change",
    "tender_select",
    "architect_solicit",
    "dossier_diffuse",
    "ai_run",
    "odoo_opportunity_create",
    "architect_change",
    "rgpd_export",
    "token_revoke",
    "data_delete",
    "access_attempt",
  ] as const;
  const action = actions[index % actions.length] ?? "login";

  // Construit un payload typed selon l'action. Pour rester sobre, on fournit
  // un payload minimaliste valide pour chaque type discrimine de AuditLogData.
  let data: AuditLogData;
  switch (action) {
    case "login":
      data = { method: "email_password", success: true };
      break;
    case "membership_change":
      data = {
        target_user_id: faker.string.uuid(),
        target_email: `target-${index}@exemple.test`,
        operation: "invite",
        to_role: "user",
      };
      break;
    case "search_profile_change":
      data = {
        profile_id: faker.string.uuid(),
        profile_name: "Profil principal",
        operation: "update",
      };
      break;
    case "tender_select":
      data = {
        tender_id: faker.string.uuid(),
        tender_ref: `BOAMP-${index}`,
        mode: faker.helpers.arrayElement(["solo" as const, "tandem" as const]),
        score: faker.number.int({ min: 0, max: 100 }),
      };
      break;
    case "architect_solicit":
      data = {
        tender_id: faker.string.uuid(),
        architect_id: faker.string.uuid(),
        architect_email: `archi-${index}@exemple.test`,
        register: faker.helpers.arrayElement(["tu" as const, "vous" as const]),
        template_name: "architect_solicitation_VOUS",
        brevo_message_id: `brevo-${index}`,
      };
      break;
    case "dossier_diffuse":
      data = {
        tender_id: faker.string.uuid(),
        architect_id: faker.string.uuid(),
        diffuser_role: "admin",
        admin_notified: true,
        files_count: faker.number.int({ min: 2, max: 12 }),
        brevo_message_id: `brevo-${index}`,
      };
      break;
    case "ai_run":
      data = {
        prompt_name: "tender_score_full",
        prompt_version: 1,
        model: "sonnet-4-6",
        cost_usd: 0.012,
        latency_ms: 3200,
        succeeded: true,
        tokens_in: 4200,
        tokens_out: 380,
      };
      break;
    case "odoo_opportunity_create":
      data = {
        tender_id: faker.string.uuid(),
        odoo_id: faker.number.int({ min: 10000, max: 99999 }),
        odoo_stage: "Qualified",
        trigger: "selected_solo",
      };
      break;
    case "architect_change":
      data = { architect_id: faker.string.uuid(), operation: "update" };
      break;
    case "rgpd_export":
      data = {
        scope: "organization",
        rows_exported: 1245,
        tables_included: ["tenders", "architects", "selections"],
        format: "json",
        size_bytes: 1024 * 32,
      };
      break;
    case "token_revoke":
      data = {
        token_jwt_id: faker.string.uuid(),
        tender_id: faker.string.uuid(),
        architect_id: faker.string.uuid(),
        reason: "manual_admin_revocation",
      };
      break;
    case "data_delete":
      data = {
        target_table: "architects",
        target_id: faker.string.uuid(),
        soft_delete: false,
        reason: "RGPD article 17 - droit a l'oubli",
      };
      break;
    case "access_attempt":
      data = {
        pathname: "/sourcing/admin",
        allowed: false,
        email_domain: "exemple.test",
        method: "GET",
        denied_reason: "domain_not_alyosingenierie",
      };
      break;
  }

  return {
    organizationId: orgId,
    actorId,
    actorEmail,
    actorRole: "admin",
    action,
    subjectType: "tender",
    subjectId: faker.string.uuid(),
    occurredAt: faker.date.recent({ days: 60 }),
    ipAddress: faker.internet.ipv4(),
    userAgent: faker.internet.userAgent(),
    data,
  };
}

// ============================================================================
// SECTION 2 -- Orchestration du seed
// ============================================================================

/**
 * Pioche `count` records distincts a partir du pool bucket. Si le pool est plus
 * petit que count, recycle avec resample local (suffit pour un seed, dej traite
 * en amont par fetch-boamp-fixture).
 */
function pickFromBucket(
  pool: Record<string, unknown>[],
  count: number,
  seed: number,
): Record<string, unknown>[] {
  if (pool.length === 0) {
    throw new Error("[seed] pool BOAMP vide -- fetch-boamp-fixture jamais execute ?");
  }
  const out: Record<string, unknown>[] = [];
  // PRNG mulberry32 inline
  let state = seed >>> 0;
  const rand = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < count; i += 1) {
    const idx = Math.floor(rand() * pool.length);
    const picked = pool[idx];
    if (picked) out.push(picked);
  }
  return out;
}

interface SeedReportCounts {
  organizations: number;
  users: number;
  memberships: number;
  architects: number;
  search_profiles: number;
  tenders: number;
  tender_events: number;
  ai_runs: number;
  brevo_messages: number;
  audit_logs: number;
}

interface SeedReport {
  seeded_at: string;
  tenders_total: number;
  median_raw_data_kb: number;
  distribution: { small: number; medium: number; large: number };
  buckets_kb: { small: string; medium: string; large: string };
  counts: SeedReportCounts;
}

export async function runSeed(): Promise<SeedReport> {
  // eslint-disable-next-line no-console
  console.log("[seed] ==== ETAPE 5 -- seed dev/CI (2 orgs, 200 tenders) ====");

  const fixture = loadBoampFixture();

  // --- 1. Organizations -----------------------------------------------------
  await db
    .insert(organizations)
    .values([
      { id: ORG_A_ID, name: ORG_A_NAME, subscriptionTier: "studio" },
      // Org B : DEV/CI ONLY -- ne doit JAMAIS apparaitre en production
      // (CLAUDE.md : "1 seule organisation en prod : AlyoS"). Cette ligne est
      // posee uniquement par `pnpm db:seed`, qui est interdit en prod (cf. reset.ts).
      { id: ORG_B_ID, name: ORG_B_NAME, subscriptionTier: "sourcing" },
    ])
    .onConflictDoNothing();

  // --- 2. Platforms + specialties (refs) -----------------------------------
  await db
    .insert(platforms)
    .values([
      {
        id: PLATFORM_IDS.boamp,
        code: "boamp",
        displayName: "BOAMP",
        authType: "api_key",
        baseUrl: "https://data.boamp.fr",
        enabled: true,
      },
      {
        id: PLATFORM_IDS.place,
        code: "place",
        displayName: "PLACE",
        authType: "login_password",
        baseUrl: "https://www.marches-publics.gouv.fr",
        enabled: true,
      },
      {
        id: PLATFORM_IDS.francmarches,
        code: "francmarches",
        displayName: "Francmarches",
        authType: "none",
        baseUrl: "https://www.francmarches.com",
        enabled: true,
      },
      {
        id: PLATFORM_IDS.mp_info,
        code: "mp_info",
        displayName: "MP.info",
        authType: "none",
        baseUrl: "https://www.marches-publics.info",
        enabled: true,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(architectSpecialties)
    .values([...SPECIALTIES])
    .onConflictDoNothing();

  // --- 3. Prompts IA (12 prompts P1-P12, cf. ai_prompts_v1.md) ------------
  // Idempotent : `onConflictDoNothing()` sur la contrainte UNIQUE (name,
  // version) -- relancer le seed ne reduplique pas (CI re-seed safe).
  await db.insert(aiPrompts).values(AI_PROMPTS).onConflictDoNothing();

  // --- 4. Users + memberships ---------------------------------------------
  // Typage strict (vs Record<string, number> qui declenche noUncheckedIndexedAccess).
  const counts: SeedReportCounts = {
    organizations: 2,
    users: 0,
    memberships: 0,
    architects: 0,
    search_profiles: 0,
    tenders: 0,
    tender_events: 0,
    ai_runs: 0,
    brevo_messages: 0,
    audit_logs: 0,
  };

  const orgConfig: { id: string; slug: string }[] = [
    { id: ORG_A_ID, slug: "orga" },
    { id: ORG_B_ID, slug: "orgb" },
  ];

  // Pour chaque org : 1 admin, 2 user, 2 viewer
  const allUsers: {
    id: string;
    email: string;
    orgId: string;
    role: "admin" | "user" | "viewer";
  }[] = [];
  for (const org of orgConfig) {
    const userSpecs: { role: "admin" | "user" | "viewer"; n: number }[] = [
      { role: "admin", n: 1 },
      { role: "user", n: 2 },
      { role: "viewer", n: 2 },
    ];
    let userIdx = 1;
    for (const spec of userSpecs) {
      for (let i = 0; i < spec.n; i += 1) {
        const id = faker.string.uuid();
        const email = `seed-${org.slug}-${spec.role}-${userIdx}@exemple.test`;
        allUsers.push({ id, email, orgId: org.id, role: spec.role });
        userIdx += 1;
      }
    }
  }

  // Stub auth.users -- en prod Supabase Auth peuple auth.users automatiquement
  // (cascade depuis l'invitation user). En dev/CI on n'a pas Supabase Auth
  // managed : le stub auth.users existe en CI (cf. db-rls.yml etape
  // "Prepare Supabase auth schema stub") et en dry-run local (cf.
  // scripts/db-dry-run.ps1), mais reste vide a ce stade. La FK
  // users.id -> auth.users(id) posee par 0003_fk_supabase.sql bloque l'insert
  // ci-dessous si auth.users n'a pas d'abord les memes UUID. On stub donc ici,
  // exclusivement pour dev/CI (seed `JAMAIS sur prod` cf. CLAUDE.md).
  for (const u of allUsers) {
    await db.execute(
      sql`INSERT INTO auth.users (id, email) VALUES (${u.id}::uuid, ${u.email}) ON CONFLICT (id) DO NOTHING`,
    );
  }

  await db
    .insert(users)
    .values(
      allUsers.map((u) => ({
        id: u.id,
        email: u.email,
        firstname: faker.person.firstName(),
        lastname: faker.person.lastName(),
      })),
    )
    .onConflictDoNothing();
  counts.users = allUsers.length;

  await db
    .insert(memberships)
    .values(
      allUsers.map((u) => ({
        organizationId: u.orgId,
        userId: u.id,
        role: u.role,
      })),
    )
    .onConflictDoNothing();
  counts.memberships = allUsers.length;

  // --- 5. Search profiles (1 par org) -------------------------------------
  await db
    .insert(searchProfiles)
    .values(orgConfig.map((o) => buildSearchProfile(o.id, `Profil principal ${o.slug}`)));
  counts.search_profiles = orgConfig.length;

  // --- 6. Architects (50 par org = 100 total) -----------------------------
  for (const org of orgConfig) {
    const archis = Array.from({ length: 50 }, (_, i) => buildArchitect(org.id, i));
    await db.insert(architects).values(archis).onConflictDoNothing();
    counts.architects += archis.length;
  }

  // --- 7. Tenders (100 par org, distribution 15/60/25) --------------------
  // Pour la condition 2 CTO : on construit la liste exacte de records BOAMP
  // a injecter et on calcule mediane / distribution apres assemblage.
  const allTenderRecords: { kb: number; bucket: "small" | "medium" | "large" }[] = [];

  for (const org of orgConfig) {
    const smallRecs = pickFromBucket(fixture.small, 15, 100);
    const mediumRecs = pickFromBucket(fixture.medium, 60, 200);
    const largeRecs = pickFromBucket(fixture.large, 25, 300);

    const buildBatch = (
      records: Record<string, unknown>[],
      bucket: "small" | "medium" | "large",
      offset: number,
    ) =>
      records.map((rec, i) => {
        allTenderRecords.push({ kb: recordSizeKb(rec), bucket });
        return buildTender({
          orgId: org.id,
          bucketRecord: rec,
          bucket,
          index: offset + i,
        });
      });

    const batch = [
      ...buildBatch(smallRecs, "small", 0),
      ...buildBatch(mediumRecs, "medium", 1000),
      ...buildBatch(largeRecs, "large", 2000),
    ];

    await db.insert(tenders).values(batch).onConflictDoNothing();
    counts.tenders += batch.length;
  }

  // --- 8. Tender events (3 par tender) -----------------------------------
  // On relit les ids de tenders inseres pour eviter de devoir tracker les
  // uuid generes. Comme on a un externalRef + platform deterministes, on
  // selectionne par org.
  for (const org of orgConfig) {
    const rows = await db
      .select({ id: tenders.id })
      .from(tenders)
      .where(sql`${tenders.organizationId} = ${org.id}`);
    const orgUsers = allUsers.filter((u) => u.orgId === org.id);
    const adminId = orgUsers.find((u) => u.role === "admin")?.id ?? orgUsers[0]?.id;
    if (!adminId) throw new Error(`[seed] aucun admin pour ${org.id}`);

    const eventsBatch: (typeof tenderEvents.$inferInsert)[] = [];
    for (const row of rows) {
      const base = faker.date.recent({ days: 30 });
      eventsBatch.push(buildTenderEvent(row.id, org.id, adminId, "sourced", base));
      eventsBatch.push(
        buildTenderEvent(
          row.id,
          org.id,
          adminId,
          "selected",
          new Date(base.getTime() + 86400 * 1000),
        ),
      );
      eventsBatch.push(
        buildTenderEvent(
          row.id,
          org.id,
          adminId,
          "status_change",
          new Date(base.getTime() + 2 * 86400 * 1000),
        ),
      );
    }
    // Inserts en chunks de 200 pour ne pas exploser la taille de requete
    for (let i = 0; i < eventsBatch.length; i += 200) {
      await db.insert(tenderEvents).values(eventsBatch.slice(i, i + 200));
    }
    counts.tender_events += eventsBatch.length;
  }

  // --- 9. AI runs (10 par org) -------------------------------------------
  // Reference le 1er prompt du catalogue v1 (P1 rc_analysis_full / sonnet-4-6).
  // Le typage `AiPromptSeed.id` est `string | undefined` (default UUID cote
  // DB), mais notre catalogue garantit un UUID explicite -- narrow ici.
  const firstPrompt = AI_PROMPTS[0];
  if (!firstPrompt || !firstPrompt.id || !firstPrompt.name) {
    throw new Error("[seed] catalogue AI_PROMPTS vide ou premier prompt sans id/name");
  }
  for (const org of orgConfig) {
    const aiBatch = Array.from({ length: 10 }, (_, i) =>
      buildAiRun(org.id, firstPrompt.id!, firstPrompt.name, i),
    );
    await db.insert(aiRuns).values(aiBatch);
    counts.ai_runs += aiBatch.length;
  }

  // --- 10. Brevo messages (20 par org) ----------------------------------
  for (const org of orgConfig) {
    const brevoBatch = Array.from({ length: 20 }, (_, i) => buildBrevoMessage(org.id, i));
    await db.insert(brevoMessages).values(brevoBatch);
    counts.brevo_messages += brevoBatch.length;
  }

  // --- 11. Audit logs (30 par org) -------------------------------------
  for (const org of orgConfig) {
    const orgUsers = allUsers.filter((u) => u.orgId === org.id);
    const admin = orgUsers.find((u) => u.role === "admin");
    if (!admin) continue;
    const auditBatch = Array.from({ length: 30 }, (_, i) =>
      buildAuditLog(org.id, admin.id, admin.email, i),
    );
    await db.insert(auditLogs).values(auditBatch);
    counts.audit_logs += auditBatch.length;
  }

  // --- 12. Assertion mediane / distribution (CONDITION 2 CTO ADR-013) ----
  const distroBuckets = {
    small: allTenderRecords.filter((r) => r.bucket === "small").length,
    medium: allTenderRecords.filter((r) => r.bucket === "medium").length,
    large: allTenderRecords.filter((r) => r.bucket === "large").length,
  };
  // mediane sur les tailles absolues
  const sizes = allTenderRecords.map((r) => r.kb).sort((a, b) => a - b);
  const median = (() => {
    if (sizes.length === 0) return 0;
    const mid = Math.floor(sizes.length / 2);
    if (sizes.length % 2 === 0) {
      const lo = sizes[mid - 1];
      const hi = sizes[mid];
      if (lo === undefined || hi === undefined) return 0;
      return (lo + hi) / 2;
    }
    return sizes[mid] ?? 0;
  })();

  assertDistribution(distroBuckets, median, allTenderRecords.length);

  // --- 13. Rapport ---------------------------------------------------------
  const smallSizes = allTenderRecords.filter((r) => r.bucket === "small").map((r) => r.kb);
  const mediumSizes = allTenderRecords.filter((r) => r.bucket === "medium").map((r) => r.kb);
  const largeSizes = allTenderRecords.filter((r) => r.bucket === "large").map((r) => r.kb);

  const fmtRange = (arr: number[]): string => {
    if (arr.length === 0) return "0-0";
    return `${Math.min(...arr).toFixed(2)}-${Math.max(...arr).toFixed(2)}`;
  };

  const report: SeedReport = {
    seeded_at: new Date().toISOString(),
    tenders_total: counts.tenders ?? 0,
    median_raw_data_kb: Number(median.toFixed(2)),
    distribution: distroBuckets,
    buckets_kb: {
      small: fmtRange(smallSizes),
      medium: fmtRange(mediumSizes),
      large: fmtRange(largeSizes),
    },
    counts,
  };

  // Persistance du rapport (commit) -- utile pour audit + traceability CI.
  const reportPath = resolve(process.cwd(), "src/db/seed/distribution-report.json");
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  // eslint-disable-next-line no-console
  console.log("[seed] Rapport :", JSON.stringify(report, null, 2));
  // eslint-disable-next-line no-console
  console.log(`[seed] Rapport ecrit : ${reportPath}`);
  // eslint-disable-next-line no-console
  console.log("[seed] ==== Seed termine OK ====");

  // Sanity check global : on aurait pu skipper certains compteurs en cas
  // d'erreur silencieuse. On verifie les invariants principaux.
  if (counts.tenders !== 200) {
    throw new Error(`[seed] tenders attendu 200, observe ${counts.tenders}`);
  }
  if (counts.architects !== 100) {
    throw new Error(`[seed] architects attendu 100, observe ${counts.architects}`);
  }

  return report;
}

// Entry guard
const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("src/db/seed/index.ts") ?? false;

if (isDirectRun) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error("[seed] FAIL", err);
      process.exit(1);
    });
}
