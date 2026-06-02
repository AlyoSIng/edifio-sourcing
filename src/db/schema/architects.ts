/**
 * Tables architects + architect_specialties — annuaire architectes partenaires.
 *
 * Source de vérité :
 *   - `specs/schema_v1.sql` §3 (modèle initial)
 *   - Gate 4 directive Board : colonne `tutoiement` (vouvoiement par défaut)
 *   - `specs/architects_data_and_admin_v1.md` §3-4 (mapping Odoo + RGPD)
 *   - DECISIONS.md 2026-05-22 (a) : **refonte propre** de la table après audit
 *     d'impact (Grep : aucun code applicatif ne consomme firstname/lastname/
 *     title/siret/references/partnership_status — uniquement schema + seed).
 *   - DECISIONS.md 2026-05-22 (d) : colonne `solicitable` dérivée
 *     `GENERATED ALWAYS AS (email IS NOT NULL) STORED`.
 *
 * Modèle Tandem-ready (refonte 2026-05-25 — PR feat/tandem-engine étape 1) :
 *   - clé personne morale : `cabinet` (NOT NULL)
 *   - contact personne physique : `contact_name` (nullable — fallback dirigeant SIRENE)
 *   - email = clé de solicitabilité (nullable global, mais NOT NULL pour
 *     que `solicitable=true`)
 *   - identifiants : `siren` (9 chars — pas `siret` 14, le siret n'est pas
 *     dans l'export Odoo), `odoo_external_id` UNIQUE (clé de rapprochement
 *     import / ré-import)
 *   - matching : `geo_zones`, `specialty_codes` (vocabulaire normalisé §4.4 spec)
 *   - enrichissement : `headcount`, `company_size`, `company_created_at`
 *   - drapeaux : `tutoiement` (Gate 4), `preferred` (admin curation),
 *     `active` (droit d'opposition RGPD), `solicitable` (dérivé)
 *   - usage : `past_collabs_count` (incrémenté par l'app — signal historique
 *     du matching V1, cf. PLAN_TANDEM_NADIA_260522.md §H.Q1)
 *
 * `architect_specialties` reste table de référence (7 spécialités seedées —
 * pas touché par la refonte, simplement conservé).
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
    /** Raison sociale du cabinet (clé personne morale). */
    cabinet: text("cabinet").notNull(),
    /**
     * Nom du contact (personne physique) — `dirigeant_sirene` fallback dans
     * l'import Odoo. Nullable car la colonne `Contact` Odoo est vide à 99 %.
     * Côté template Brevo, parse split sur 1er espace = `{{archi_prenom}}` /
     * reste = `{{archi_nom}}`. Fallback « partenaire » si NULL.
     */
    contactName: text("contact_name"),
    /**
     * Email professionnel — **clé de solicitabilité**. NULLABLE globalement
     * car ~50 % de l'export Odoo n'a pas d'email. La colonne dérivée
     * `solicitable` (GENERATED) gate l'inclusion dans le matching Tandem.
     */
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    /** SIREN 9 chars (entreprise). Le SIRET 14 chars n'est pas dans l'export. */
    siren: text("siren"),
    /** SIRET 14 chars (établissement). Saisie manuelle ou enrichissement API SIRENE. */
    siret: text("siret"),
    zip: text("zip"),
    city: text("city"),
    /**
     * Champs DC1 (CERFA n°12156 — Lettre de candidature mandataire).
     * Phase 1 Lot A : l'architecte étant mandataire du groupement MOE BTP,
     * sa fiche porte les champs administratifs requis au pré-remplissage du
     * DC1. Tous nullable — anciens architectes restent valides.
     */
    /** Adresse du candidat (ligne 1 — rue). DC1 §A. */
    addressLine1: text("address_line1"),
    /** Adresse du candidat (ligne 2 — complément). DC1 §A. */
    addressLine2: text("address_line2"),
    /** Ville de signature ("Fait à") par défaut sur le DC1. */
    signatureCity: text("signature_city"),
    /** Nom du représentant légal — signataire DC1 §G. */
    legalRepresentativeName: text("legal_representative_name"),
    /** Qualité du signataire (ex. "Gérant", "Président", "Architecte associé"). DC1 §G. */
    legalRepresentativeRole: text("legal_representative_role"),
    /** Effectif (enrichissement, hors matching V1). */
    headcount: integer("headcount"),
    /**
     * Chiffre d'affaires annuel moyen du cabinet (€ HT).
     * Utilisé dans le filtre d'éligibilité Tandem (règle : CA ≥ 40 % du montant marché).
     * NULL = inconnu → architecte inclus par défaut.
     */
    annualRevenue: integer("annual_revenue"),
    /** Taille entreprise (PME | ETI | GE) — enrichissement, hors matching V1. */
    companySize: text("company_size"),
    companyCreatedAt: timestamp("company_created_at", { withTimezone: true }),
    /** Clé Odoo de rapprochement (import / ré-import upsert). UNIQUE. */
    odooExternalId: text("odoo_external_id").unique(),
    /** Codes de spécialité (FK applicative via architect_specialties.code). */
    specialtyCodes: text("specialty_codes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** Départements/zones géo d'intervention (split de `departements_intervention`). */
    geoZones: text("geo_zones")
      .array()
      .notNull()
      .default(sql`'{}'`),
    /**
     * Drapeau Gate 4 : FALSE = vouvoiement (DEFAULT directive Board),
     * TRUE = tutoiement (collaboration historique). Pilote la sélection
     * du template Brevo TU vs VOUS.
     */
    tutoiement: boolean("tutoiement").notNull().default(false),
    /** Drapeau admin — architecte « préféré » (mise en avant matching). */
    preferred: boolean("preferred").notNull().default(false),
    /**
     * Droit d'opposition RGPD (art. 21) — FALSE désactive l'architecte
     * (retiré du matching et des sollicitations futures, sans suppression
     * dure). Toggle dans l'écran admin + page publique tokenisée
     * `/archi/oppose/[token]`.
     */
    active: boolean("active").notNull().default(true),
    /**
     * Drapeau dérivé `solicitable` = TRUE si email NOT NULL — colonne
     * GENERATED ALWAYS AS STORED (décision Board 2026-05-22 Q4 : isolée
     * en colonne stockée pour requêtes/index, pas de risque de drift
     * applicatif vs dérivation côté code).
     */
    solicitable: boolean("solicitable").generatedAlwaysAs(sql`(email IS NOT NULL)`),
    /** Compteur de collaborations passées — incrémenté à l'usage (matching V1). */
    pastCollabsCount: integer("past_collabs_count").notNull().default(0),
    notes: text("notes"),
    /**
     * Budget minimum d'opération (€ HT). Optionnel — aide au matching.
     * NULL = pas de contrainte basse.
     */
    budgetMin: integer("budget_min"),
    /**
     * Budget maximum d'opération (€ HT). Optionnel — aide au matching.
     * NULL = pas de contrainte haute.
     */
    budgetMax: integer("budget_max"),
    /**
     * Si TRUE, l'architecte répond uniquement aux concours (pas aux candidatures).
     * Pris en compte dans le matching pour filtrer les types de procédure.
     */
    concoursOnly: boolean("concours_only").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Opposition RGPD art. 21 — posée par l'admin, tracée avec date */
    rgpdOpposition: boolean("rgpd_opposition").notNull().default(false),
    /** Date de l'opposition RGPD — NULL si pas d'opposition */
    rgpdOppositionDate: timestamp("rgpd_opposition_date", { withTimezone: true }),
  },
  (table) => ({
    /** Unicité email scopée au tenant (un même archi peut être chez 2 orgs). */
    orgEmailUq: unique("architects_organization_id_email_key").on(
      table.organizationId,
      table.email,
    ),
    orgIdx: index("idx_architects_org").on(table.organizationId),
    /** Index partiel pour ne pas indexer les SIREN NULL. */
    sirenIdx: index("idx_architects_siren")
      .on(table.siren)
      .where(sql`${table.siren} IS NOT NULL`),
    /** Index GIN sur array spécialités pour matching rapide. */
    specialtiesIdx: index("idx_architects_specialties").using("gin", table.specialtyCodes),
    /** Index GIN sur array zones géo pour matching rapide. */
    geoZonesIdx: index("idx_architects_geo_zones").using("gin", table.geoZones),
    /**
     * Index partiel sur les architectes sollicitables actifs — chemin chaud
     * du matching Tandem (filtre `solicitable = TRUE AND active = TRUE`).
     */
    solicitableActiveIdx: index("idx_architects_solicitable_active")
      .on(table.organizationId)
      .where(sql`${table.solicitable} = TRUE AND ${table.active} = TRUE`),
  }),
);

export type Architect = typeof architects.$inferSelect;
export type NewArchitect = typeof architects.$inferInsert;
