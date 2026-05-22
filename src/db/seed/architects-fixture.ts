/**
 * Seed fictif Tandem — 4 cabinets architectes pour tests fonctionnels.
 *
 * Source : `handoff/PLAN_TANDEM_NADIA_260522.md` étape 1 §D + décision
 * Board 2026-05-22 (a) refonte propre `architects`.
 *
 * Objectif :
 *   - 4 cabinets `@example.test` (domaine de test RFC 2606, non routable)
 *   - mix TU/VOUS (2/2) pour exercer le template-picker Brevo
 *   - spécialités riches (Cabinet TU 1) et pauvres/vides (Cabinet VOUS 2)
 *     pour exercer la repondération matching données pauvres (décision Q1
 *     `MATCHING_WEIGHTS_PROFILE = 'sparse_data'`)
 *   - zones géo variées (Île-de-France, Nouvelle-Aquitaine, hors-périmètre)
 *   - 1 cabinet `preferred = true` (Cabinet TU 1)
 *   - 1 cabinet `active = false` (RGPD opposition exercée — Cabinet INACTIF)
 *     pour exercer le filtre matching `active = TRUE`
 *   - 1 cabinet sans email (Cabinet SANS EMAIL) pour exercer la dérivée
 *     `solicitable = FALSE` (GENERATED ALWAYS AS)
 *
 * Idempotence : upsert sur la contrainte UNIQUE (organization_id, email)
 * pour les 3 fiches avec email + sur `odoo_external_id` UNIQUE pour la
 * fiche sans email (clé de rapprochement Odoo). Relancer le script ne
 * duplique pas.
 *
 * Gating : NODE_ENV !== 'production' obligatoire — ces fixtures `@example.test`
 * sont strictement dev/CI, jamais en prod.
 *
 * Lancement :
 *   - `pnpm db:seed:architects` (à ajouter dans `package.json`)
 *   - branchement conditionnel depuis `src/db/seed/index.ts` (dev/CI only)
 */

import { sql } from "drizzle-orm";

import { ALYOS_ORG_ID } from "@/lib/constants/organization";

import { db } from "../client";
import { architects } from "../schema";

/** UUIDs déterministes pour idempotence cross-run (tests E2E). */
const FIXTURE_IDS = {
  cabinetTu1: "fa110001-0000-0000-0000-000000000001",
  cabinetTu2: "fa110001-0000-0000-0000-000000000002",
  cabinetVous1: "fa110001-0000-0000-0000-000000000003",
  cabinetVous2: "fa110001-0000-0000-0000-000000000004",
  cabinetInactif: "fa110001-0000-0000-0000-000000000005",
  cabinetSansEmail: "fa110001-0000-0000-0000-000000000006",
} as const;

interface ArchitectFixture {
  id: string;
  cabinet: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  siren: string | null;
  zip: string | null;
  city: string | null;
  headcount: number | null;
  companySize: string | null;
  odooExternalId: string;
  specialtyCodes: string[];
  geoZones: string[];
  tutoiement: boolean;
  preferred: boolean;
  active: boolean;
  pastCollabsCount: number;
  notes: string | null;
}

/**
 * Catalogue des 6 cabinets fixtures Tandem.
 * Note : on en pose 6 (vs 4 dans le plan initial) pour couvrir aussi les
 * cas limites (inactif RGPD, sans email) qui exercent les filtres matching.
 * Le plan parlait de 4 cabinets « principaux » TU/VOUS — les 2 cas limites
 * sont du même registre fonctionnel.
 */
const FIXTURES: ArchitectFixture[] = [
  {
    id: FIXTURE_IDS.cabinetTu1,
    cabinet: "Atelier Dupont & Associes",
    contactName: "Marc Dupont",
    email: "marc.dupont@example.test",
    phone: "05 56 12 34 56",
    website: "https://www.atelier-dupont.example.test",
    siren: "812345678",
    zip: "33000",
    city: "Bordeaux",
    headcount: 12,
    companySize: "PME",
    odooExternalId: "fixture-tandem-001",
    specialtyCodes: ["BAT_NEUF", "REHA", "TCE", "MOE_TECH"], // riche
    geoZones: ["33", "40", "47", "64"], // Nouvelle-Aquitaine
    tutoiement: true,
    preferred: true,
    active: true,
    pastCollabsCount: 7,
    notes: "Cabinet de reference Nouvelle-Aquitaine, collaboration historique.",
  },
  {
    id: FIXTURE_IDS.cabinetTu2,
    cabinet: "Studio Martin Architecture",
    contactName: "Sophie Martin",
    email: "sophie.martin@example.test",
    phone: "01 42 34 56 78",
    website: "https://www.studio-martin.example.test",
    siren: "823456789",
    zip: "75011",
    city: "Paris",
    headcount: 5,
    companySize: "PME",
    odooExternalId: "fixture-tandem-002",
    specialtyCodes: ["PATRIMOINE", "REHA"], // moyen
    geoZones: ["75", "92", "93", "94"], // Ile-de-France
    tutoiement: true,
    preferred: false,
    active: true,
    pastCollabsCount: 3,
    notes: "Specialiste rehabilitation patrimoine Ile-de-France.",
  },
  {
    id: FIXTURE_IDS.cabinetVous1,
    cabinet: "Cabinet Architectes du Sud-Ouest",
    contactName: "Jean-Pierre Lefevre",
    email: "jp.lefevre@example.test",
    phone: "05 59 01 23 45",
    website: null,
    siren: "834567890",
    zip: "64000",
    city: "Pau",
    headcount: 25,
    companySize: "PME",
    odooExternalId: "fixture-tandem-003",
    specialtyCodes: ["URBA", "PAYSAGE"], // moyen
    geoZones: ["64", "40", "65"], // Sud-Ouest
    tutoiement: false,
    preferred: false,
    active: true,
    pastCollabsCount: 1,
    notes: null,
  },
  {
    id: FIXTURE_IDS.cabinetVous2,
    cabinet: "Atelier Garcia",
    contactName: null, // pas de contact identifie (cas frequent export Odoo)
    email: "contact@atelier-garcia.example.test",
    phone: null,
    website: null,
    siren: "845678901",
    zip: "13001",
    city: "Marseille",
    headcount: null,
    companySize: null,
    odooExternalId: "fixture-tandem-004",
    specialtyCodes: [], // VIDE — exerce la repondération sparse_data
    geoZones: ["13", "84"], // PACA — hors périmètre Sud-Ouest standard
    tutoiement: false,
    preferred: false,
    active: true,
    pastCollabsCount: 0,
    notes: "Donnees pauvres — exerce repondération matching sparse_data.",
  },
  {
    id: FIXTURE_IDS.cabinetInactif,
    cabinet: "Architectes Inactifs SARL",
    contactName: "Paul Bernard",
    email: "paul.bernard@example.test",
    phone: "01 23 45 67 89",
    website: null,
    siren: "856789012",
    zip: "69001",
    city: "Lyon",
    headcount: 3,
    companySize: "PME",
    odooExternalId: "fixture-tandem-005",
    specialtyCodes: ["BAT_NEUF"],
    geoZones: ["69"],
    tutoiement: false,
    preferred: false,
    active: false, // RGPD opposition exercee — exclu du matching
    pastCollabsCount: 2,
    notes: "Opposition RGPD exercee le 2026-05-15 via /archi/oppose/[token].",
  },
  {
    id: FIXTURE_IDS.cabinetSansEmail,
    cabinet: "Cabinet Sans Contact",
    contactName: "Inconnue (dirigeant SIRENE)",
    email: null, // exerce solicitable = FALSE (GENERATED)
    phone: "04 91 00 00 00",
    website: null,
    siren: "867890123",
    zip: "13002",
    city: "Marseille",
    headcount: null,
    companySize: null,
    odooExternalId: "fixture-tandem-006",
    specialtyCodes: ["BAT_NEUF"],
    geoZones: ["13"],
    tutoiement: false,
    preferred: false,
    active: true,
    pastCollabsCount: 0,
    notes: "Pas d'email dans l'export Odoo — solicitable = FALSE (derive).",
  },
];

/**
 * Seede les 6 cabinets fixtures Tandem dans l'org passée en argument.
 *
 * Idempotence : on tente un INSERT … ON CONFLICT (id) DO UPDATE — UUIDs
 * déterministes garantissent la stabilité entre runs. On utilise
 * `DO UPDATE` plutôt que `DO NOTHING` pour que les corrections de copy
 * dans `FIXTURES` se propagent au prochain run (dev experience).
 *
 * @param orgId ID de l'organisation cible (default : ALYOS — `ALYOS_ORG_ID`).
 * @returns nombre de cabinets seedés.
 */
export async function seedArchitectsFixture(orgId: string = ALYOS_ORG_ID): Promise<number> {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[seed:architects] interdit en production — fixtures @example.test reservees dev/CI",
    );
  }

  const rows = FIXTURES.map((f) => ({
    id: f.id,
    organizationId: orgId,
    cabinet: f.cabinet,
    contactName: f.contactName,
    email: f.email,
    phone: f.phone,
    website: f.website,
    siren: f.siren,
    zip: f.zip,
    city: f.city,
    headcount: f.headcount,
    companySize: f.companySize,
    odooExternalId: f.odooExternalId,
    specialtyCodes: f.specialtyCodes,
    geoZones: f.geoZones,
    tutoiement: f.tutoiement,
    preferred: f.preferred,
    active: f.active,
    pastCollabsCount: f.pastCollabsCount,
    notes: f.notes,
  }));

  await db
    .insert(architects)
    .values(rows)
    .onConflictDoUpdate({
      target: architects.id,
      set: {
        cabinet: sql`excluded.cabinet`,
        contactName: sql`excluded.contact_name`,
        email: sql`excluded.email`,
        phone: sql`excluded.phone`,
        website: sql`excluded.website`,
        siren: sql`excluded.siren`,
        zip: sql`excluded.zip`,
        city: sql`excluded.city`,
        headcount: sql`excluded.headcount`,
        companySize: sql`excluded.company_size`,
        odooExternalId: sql`excluded.odoo_external_id`,
        specialtyCodes: sql`excluded.specialty_codes`,
        geoZones: sql`excluded.geo_zones`,
        tutoiement: sql`excluded.tutoiement`,
        preferred: sql`excluded.preferred`,
        active: sql`excluded.active`,
        pastCollabsCount: sql`excluded.past_collabs_count`,
        notes: sql`excluded.notes`,
        updatedAt: sql`now()`,
      },
    });

  return rows.length;
}

// Entry guard — `pnpm tsx src/db/seed/architects-fixture.ts` direct.
const isDirectRun =
  process.argv[1]?.replace(/\\/g, "/").endsWith("src/db/seed/architects-fixture.ts") ?? false;

if (isDirectRun) {
  seedArchitectsFixture()
    .then((count) => {
      // eslint-disable-next-line no-console
      console.log(`[seed:architects] ${count} cabinets fixtures Tandem seedes (org ALYOS)`);
      process.exit(0);
    })
    .catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error("[seed:architects] FAIL", err);
      process.exit(1);
    });
}
