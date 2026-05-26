/**
 * Table companies — annuaire des entreprises du bâtiment partenaires
 * (Conception-Réalisation / TCE / majors BTP).
 *
 * Différences notables vs `architects` et `bureaux_etudes` :
 *  - Pas de `tutoiement` (relation commerciale, pas relationnelle individuelle).
 *  - Pas de `concoursOnly` (les entreprises CR répondent toujours à des marchés).
 *  - Pas de `odooExternalId` (import Odoo non prévu pour les entreprises au MVP).
 *  - Pas de `pastCollabsCount` (pas de matching Tandem architecte au MVP).
 *  - Contrainte UNIQUE sur `(organizationId, siren)` quand siren IS NOT NULL.
 *
 * Créée dans feat/be-companies (Nadia, 2026-05-26).
 */

import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";

export const companies = pgTable(
  "companies",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Raison sociale de l'entreprise (clé personne morale). */
    name: text("name").notNull(),
    /** Nom du contact principal (nullable). */
    contactName: text("contact_name"),
    /** Email professionnel — nullable. */
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    /** SIREN 9 chars (clé de déduplication si renseigné). */
    siren: text("siren"),
    zip: text("zip"),
    city: text("city"),
    /** Effectif salarié (enrichissement). */
    headcount: integer("headcount"),
    /** Taille entreprise (PME | ETI | GE) — enrichissement. */
    companySize: text("company_size"),
    /** Codes de spécialité (vocabulaire COMPANY_SPECIALTY_CODES). */
    specialtyCodes: text("specialty_codes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** Départements / zones géo d'intervention. */
    geoZones: text("geo_zones")
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** Budget minimum d'opération (€ HT). NULL = pas de contrainte. */
    budgetMin: integer("budget_min"),
    /** Budget maximum d'opération (€ HT). NULL = pas de contrainte. */
    budgetMax: integer("budget_max"),
    /** Entreprise « préférée » — mise en avant dans les sélections. */
    preferred: boolean("preferred").notNull().default(false),
    /** Actif / inactif. */
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Opposition RGPD art. 21. */
    rgpdOpposition: boolean("rgpd_opposition").notNull().default(false),
    /** Date de l'opposition RGPD. */
    rgpdOppositionDate: timestamp("rgpd_opposition_date", { withTimezone: true }),
  },
  (table) => ({
    orgIdx: index("idx_companies_org").on(table.organizationId),
    /**
     * Index partiel sur SIREN non NULL.
     * Note : l'unicité `(org, siren)` est gérée côté applicatif (upsert sur siren)
     * car Drizzle ne supporte pas les contraintes UNIQUE partielles via .unique().
     */
    sirenIdx: index("idx_companies_siren")
      .on(table.siren)
      .where(sql`${table.siren} IS NOT NULL`),
    /** Index GIN sur array spécialités. */
    specialtiesIdx: index("idx_companies_specialties").using("gin", table.specialtyCodes),
    /** Index GIN sur array zones géo. */
    geoZonesIdx: index("idx_companies_geo_zones").using("gin", table.geoZones),
    /** Index partiel sur les entreprises actives — chemin de sélection. */
    activeOrgIdx: index("idx_companies_active_org")
      .on(table.organizationId)
      .where(sql`${table.active} = TRUE`),
  }),
);

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
