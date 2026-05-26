/**
 * Tables bibliothèque cotraitants — annuaire réutilisable + association AO + documents.
 *
 * Trois tables :
 *  - `cotraitants`          : annuaire global réutilisable d'un AO à l'autre
 *  - `tender_cotraitants`   : association AO ↔ cotraitant (1 cotraitant par AO MVP)
 *  - `cotraitant_documents` : pièces liées à un cotraitant, optionnellement à un AO
 *
 * Source de vérité : demande Board 2026-05-26 (bibliothèque cotraitants).
 *
 * Bucket Storage requis côté Supabase (à créer manuellement par Steve) :
 *   - "cotraitant-docs" (private) — Storage → New Bucket dans le dashboard
 *     Supabase. Nécessaire avant la 1re utilisation du flow upload documents.
 */

import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { tenders } from "./tenders";
import { users } from "./users";

// ============================================================================
// 1. cotraitants — annuaire global
// ============================================================================

export const cotraitants = pgTable(
  "cotraitants",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Nom du cabinet / entreprise cotraitante — obligatoire */
    cabinet: text("cabinet").notNull(),
    /** Nom du contact principal */
    contactName: text("contact_name"),
    /** Email de contact — unique par organisation si renseigné */
    email: text("email"),
    phone: text("phone"),
    /** Numéro SIRET (14 chiffres) */
    siret: text("siret"),
    /** Code postal */
    zip: text("zip"),
    city: text("city"),
    /** Notes libres internes */
    notes: text("notes"),
    /** Actif — false = archivé (masqué dans l'annuaire mais données conservées) */
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** Index principal sur l'organisation pour le filtre tenant */
    orgIdx: index("idx_cotraitants_org").on(table.organizationId),
    /** Unicité email par organisation (partial : seulement si email IS NOT NULL) */
    emailOrgUniq: unique("uq_cotraitants_org_email").on(table.organizationId, table.email),
  }),
);

export type Cotraitant = typeof cotraitants.$inferSelect;
export type NewCotraitant = typeof cotraitants.$inferInsert;

// ============================================================================
// 2. tender_cotraitants — association AO ↔ cotraitant
// ============================================================================

export const tenderCotraitants = pgTable(
  "tender_cotraitants",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    cotraitantId: uuid("cotraitant_id")
      .notNull()
      .references(() => cotraitants.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** 1 seul cotraitant par AO au MVP */
    tenderUniq: unique("uq_tender_cotraitants_tender").on(table.tenderId),
    tenderIdx: index("idx_tender_cotraitants_tender").on(table.tenderId),
    cotraitantIdx: index("idx_tender_cotraitants_cotraitant").on(table.cotraitantId),
  }),
);

export type TenderCotraitant = typeof tenderCotraitants.$inferSelect;
export type NewTenderCotraitant = typeof tenderCotraitants.$inferInsert;

// ============================================================================
// 3. cotraitant_documents — pièces liées à un cotraitant
// ============================================================================

/**
 * Catégories de documents gérées en applicatif (pas d'enum Postgres pour
 * rester flexible sans migration).
 *
 * - 'dc1_signed'    : DC1 signé (AlyoS → cotraitant)
 * - 'urssaf'        : Attestation URSSAF (cotraitant → AlyoS)
 * - 'assurance'     : Attestation assurance RC (cotraitant → AlyoS)
 * - 'rib'           : RIB (cotraitant → AlyoS)
 * - 'convention'    : Convention de cotraitance
 * - 'alyos_rc'      : RC professionnelle AlyoS (AlyoS → cotraitant)
 * - 'autre'         : Autre document libre
 */
export type CotraitantDocumentKind =
  | "dc1_signed"
  | "urssaf"
  | "assurance"
  | "rib"
  | "convention"
  | "alyos_rc"
  | "autre";

export const cotraitantDocuments = pgTable(
  "cotraitant_documents",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    cotraitantId: uuid("cotraitant_id")
      .notNull()
      .references(() => cotraitants.id, { onDelete: "cascade" }),
    /**
     * FK optionnelle vers un AO — null = pièce globale du cotraitant
     * (non liée à un AO spécifique, ex. attestation URSSAF valable tout AO).
     */
    tenderId: uuid("tender_id").references(() => tenders.id, { onDelete: "set null" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * Catégorie du document — valeurs contrôlées applicativement
     * (cf. `CotraitantDocumentKind`).
     */
    kind: text("kind").notNull(),
    /** Nom lisible affiché dans l'UI (ex. "DC1 signé AO EDM 26 S 01") */
    label: text("label").notNull(),
    /**
     * Chemin dans le bucket Supabase Storage "cotraitant-docs" (private).
     * Format : `{organizationId}/{cotraitantId}/{filename}`.
     */
    storagePath: text("storage_path").notNull(),
    /** Nom original du fichier tel qu'uploadé */
    filename: text("filename").notNull(),
    /** Utilisateur AlyoS ayant uploadé le document */
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * Date d'expiration du document — null = pas d'expiration (ex. convention).
     * Utile pour les attestations URSSAF, RC pro (valables 1 an en général).
     */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => ({
    /** Index pour lister les docs d'un cotraitant */
    cotraitantIdx: index("idx_cotraitant_docs_cotraitant").on(table.cotraitantId),
    /** Index partial pour lister les docs liés à un AO précis */
    tenderIdx: index("idx_cotraitant_docs_tender").on(table.tenderId),
  }),
);

export type CotraitantDocument = typeof cotraitantDocuments.$inferSelect;
export type NewCotraitantDocument = typeof cotraitantDocuments.$inferInsert;
