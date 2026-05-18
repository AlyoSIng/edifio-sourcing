/**
 * Tables architects + architect_specialties — annuaire architectes partenaires.
 *
 * Source de vérité : `specs/schema_v1.sql` §3 + Gate 4 directive Board sur
 * la colonne `tutoiement` (vouvoiement par défaut, drapeau par architecte).
 *
 * `architect_specialties` est une table de référence (7 spécialités seedées).
 */

import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { partnershipStatus } from "./enums";
import { organizations } from "./organizations";

export const architectSpecialties = pgTable("architect_specialties", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  code: text("code").notNull().unique(),
  labelFr: text("label_fr").notNull(),
});

export type ArchitectSpecialty = typeof architectSpecialties.$inferSelect;
export type NewArchitectSpecialty = typeof architectSpecialties.$inferInsert;

export const architects = pgTable(
  "architects",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    firstname: text("firstname").notNull(),
    lastname: text("lastname").notNull(),
    /** Civilité : M., Mme, Dr, etc. */
    title: text("title"),
    email: text("email").notNull(),
    phone: text("phone"),
    siret: text("siret"),
    /** Codes de spécialité (FK applicative via architect_specialties.code) */
    specialtyCodes: text("specialty_codes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    geoZones: text("geo_zones")
      .array()
      .notNull()
      .default(sql`'{}'`),
    references: text("references"),
    partnershipStatus: partnershipStatus("partnership_status").notNull().default("prospect"),
    notes: text("notes"),
    /**
     * Drapeau Gate 4 : FALSE = vouvoiement (DEFAULT directive Board),
     * TRUE = tutoiement (collaboration historique). Pilote la sélection
     * du template Brevo TU vs VOUS.
     */
    tutoiement: boolean("tutoiement").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** Unicité email scopée au tenant (un même archi peut être chez 2 orgs) */
    orgEmailUq: unique("architects_organization_id_email_key").on(
      table.organizationId,
      table.email,
    ),
    orgIdx: index("idx_architects_org").on(table.organizationId),
    /** Index partiel pour ne pas indexer les SIRET NULL */
    siretIdx: index("idx_architects_siret")
      .on(table.siret)
      .where(sql`${table.siret} IS NOT NULL`),
    /** Index GIN sur array spécialités pour matching rapide */
    specialtiesIdx: index("idx_architects_specialties").using("gin", table.specialtyCodes),
  }),
);

export type Architect = typeof architects.$inferSelect;
export type NewArchitect = typeof architects.$inferInsert;
