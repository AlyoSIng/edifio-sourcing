import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";

/**
 * Critères de short-list paramétrables par organisation.
 * S'appliquent aux modules Architectes, Cotraitants, Entreprises/Majors.
 *
 * Un enregistrement par organisation + cible (architects | cotraitants | companies).
 * L'IA utilise ces critères pour pondérer les notes internes lors de la génération
 * des short-lists Tandem.
 *
 * Source de vérité : `specs/module_tandem_engine_v1.md` §short-list.
 * Décision Nadia 2026-05-28 : table dédiée `shortlist_criteria` (zone verte spec Tandem).
 */
export const shortlistCriteria = pgTable(
  "shortlist_criteria",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * Cible des critères : 'architects' | 'cotraitants' | 'companies'
     * Une ligne par (organization_id, target) — contrainte unique.
     */
    target: text("target").notNull(),
    /** CA minimum requis (€). null = pas de filtre. */
    caMiniEur: integer("ca_mini_eur"),
    /** Effectif minimum requis. null = pas de filtre. */
    effectifMini: integer("effectif_mini"),
    /** Spécialités requises (au moins l'une doit matcher). */
    requiredSpecialties: text("required_specialties")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Exiger au moins N effectifs > 10 ans d'expérience. 0 = désactivé. */
    minSeniorsRequired: integer("min_seniors_required").notNull().default(0),
    /** Nombre max de sollicitations simultanées autorisées. null = pas de limite. */
    maxSolicitations: integer("max_solicitations"),
    /** Filtrer par départements (tableau de codes dept, ex. ['34','30','11']). Vide = tous. */
    allowedDepartments: text("allowed_departments")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Nombre max d'entrées dans la short-list générée. null = pas de limite. */
    maxResults: integer("max_results"),
    /**
     * Poids IA (0.0–1.0) sur les notes internes (score Haiku).
     * 0 = ignorer les notes internes, 1 = critère dominant.
     * Valeur par défaut : 0.5 (équilibre filtres hard + notes IA).
     * Stocké en text pour éviter la perte de précision NUMERIC → JS number.
     */
    aiNotesWeight: text("ai_notes_weight").notNull().default("0.5"),
    /** Paramètres additionnels libres (extensibilité Phase 2). */
    extraParams: jsonb("extra_params").default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgTargetUniq: index("idx_shortlist_criteria_org_target").on(
      table.organizationId,
      table.target,
    ),
  }),
);

export type ShortlistCriteria = typeof shortlistCriteria.$inferSelect;
export type NewShortlistCriteria = typeof shortlistCriteria.$inferInsert;
