/**
 * Table bureaux_etudes — annuaire des bureaux d'études techniques partenaires.
 *
 * Structure calquée sur la table `architects` (même logique de tenant,
 * même pattern de solicitabilité dérivée, mêmes colonnes RGPD).
 *
 * Décision : séparation en table dédiée (pas d'extension de `architects`)
 * car les BET ont un profil métier distinct — spécialités techniques (BE_SPECIALTY_CODES),
 * pas de tutoiement ni concours, et un flux de sollicitation Tandem différent.
 *
 * Créée dans feat/be-companies (Nadia, 2026-05-26).
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "./organizations";

export const bureauEtudes = pgTable(
  "bureaux_etudes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Raison sociale du bureau (clé personne morale). */
    cabinet: text("cabinet").notNull(),
    /**
     * Nom du contact principal — nullable car souvent absent à l'import.
     * Fallback « partenaire » si NULL dans les templates de sollicitation.
     */
    contactName: text("contact_name"),
    /**
     * Email professionnel — clé de solicitabilité.
     * NULL = BET non sollicitable (exclu du matching Tandem).
     */
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    /** SIREN 9 chars (entreprise). */
    siren: text("siren"),
    /** SIRET 14 chars (établissement). Saisie manuelle ou enrichissement API SIRENE. */
    siret: text("siret"),
    zip: text("zip"),
    city: text("city"),
    /**
     * Champs DC2 (CERFA n°12157 — Déclaration du candidat).
     * Phase 1 Lot C : en cotraitance BE, AlyoS est mandataire d'un groupement
     * avec des BE cotraitants — chaque BE cotraitant doit produire son propre
     * DC2. Sa fiche porte donc les champs administratifs requis au
     * pré-remplissage du CERFA n°12157. Tous nullable — BE existants restent
     * valides.
     */
    /** Adresse du candidat (ligne 1 — rue, siège BE). DC2 §A. */
    addressLine1: text("address_line1"),
    /** Adresse du candidat (ligne 2 — complément). DC2 §A. */
    addressLine2: text("address_line2"),
    /** Capital social en euros. DC2 §B. */
    capitalEur: integer("capital_eur"),
    /**
     * Chiffre d'affaires des 3 dernières années (DC2 §E « Capacité financière »).
     * Steve 2026-06-04. Nullable : peuvent être complétés progressivement.
     */
    revenueN1: integer("revenue_n1"),
    revenueN2: integer("revenue_n2"),
    revenueN3: integer("revenue_n3"),
    /** Ville de signature ("Fait à") par défaut sur le DC2. */
    signatureCity: text("signature_city"),
    /** Nom du représentant légal — signataire DC2 §G. */
    legalRepresentativeName: text("legal_representative_name"),
    /** Qualité du signataire (ex. "Gérant", "Président"). DC2 §G. */
    legalRepresentativeRole: text("legal_representative_role"),
    /**
     * Forme juridique du BE (SARL, SAS, EURL, etc.).
     * Champ libre TEXT — DC2 §B1 obligatoire (Steve 2026-06-03 / migration 0040).
     */
    legalForm: text("legal_form"),
    /** Effectif salarié (enrichissement). */
    headcount: integer("headcount"),
    /** Taille entreprise (PME | ETI | GE) — enrichissement. */
    companySize: text("company_size"),
    /** Clé Odoo de rapprochement import/ré-import. UNIQUE. */
    odooExternalId: text("odoo_external_id").unique(),
    /** Codes de spécialité (vocabulaire BE_SPECIALTY_CODES). */
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
    /**
     * Si TRUE, le BET répond uniquement aux concours.
     * Pris en compte dans le matching pour filtrer les procédures.
     */
    concoursOnly: boolean("concours_only").notNull().default(false),
    /**
     * Drapeau Gate 4 (hérité architectes) : FALSE = vouvoiement (défaut),
     * TRUE = tutoiement. Pilote la sélection du template Brevo TU vs VOUS.
     */
    tutoiement: boolean("tutoiement").notNull().default(false),
    /** Drapeau admin — BET « préféré » (mise en avant matching). */
    preferred: boolean("preferred").notNull().default(false),
    /** Actif / inactif (droit d'opposition RGPD ou désactivation manuelle). */
    active: boolean("active").notNull().default(true),
    /**
     * Drapeau dérivé : TRUE si email NOT NULL.
     * GENERATED ALWAYS AS STORED — cohérence absolue avec la valeur email.
     */
    solicitable: boolean("solicitable").generatedAlwaysAs(sql`(email IS NOT NULL)`),
    /** Compteur de collaborations passées (signal matching V1). */
    pastCollabsCount: integer("past_collabs_count").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Opposition RGPD art. 21 — posée par l'admin, tracée avec date. */
    rgpdOpposition: boolean("rgpd_opposition").notNull().default(false),
    /** Date de l'opposition RGPD — NULL si pas d'opposition. */
    rgpdOppositionDate: timestamp("rgpd_opposition_date", { withTimezone: true }),
  },
  (table) => ({
    /** Unicité email scopée au tenant. */
    orgEmailUq: unique("bureaux_etudes_organization_id_email_key").on(
      table.organizationId,
      table.email,
    ),
    orgIdx: index("idx_be_org").on(table.organizationId),
    /** Index partiel sur SIREN non NULL. */
    sirenIdx: index("idx_be_siren")
      .on(table.siren)
      .where(sql`${table.siren} IS NOT NULL`),
    /** Index GIN sur array spécialités pour matching rapide. */
    specialtiesIdx: index("idx_be_specialties").using("gin", table.specialtyCodes),
    /** Index GIN sur array zones géo pour matching rapide. */
    geoZonesIdx: index("idx_be_geo_zones").using("gin", table.geoZones),
    /**
     * Index partiel sur les BET sollicitables actifs — chemin chaud du matching.
     */
    solicitableActiveIdx: index("idx_be_solicitable_active")
      .on(table.organizationId)
      .where(sql`${table.solicitable} = TRUE AND ${table.active} = TRUE`),
  }),
);

export type BureauEtudes = typeof bureauEtudes.$inferSelect;
export type NewBureauEtudes = typeof bureauEtudes.$inferInsert;
