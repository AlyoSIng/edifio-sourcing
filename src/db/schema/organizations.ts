/**
 * Table organizations — tenant racine de la multi-tenancy.
 *
 * Source de vérité : `specs/schema_v1.sql` §1 + ADR-013.
 *
 * Point chaud étape 3 : la colonne `subscription_tier` est INTÉGRÉE au
 * CREATE TABLE (pas un ALTER) — c'est la justification de l'Option A retenue
 * à l'étape 2 (le 0000_init.sql pose l'enum seul, le 0001 crée la table avec
 * la colonne typée et l'index dans la foulée).
 *
 * RLS : enable + force prévus à l'étape 4 (hors scope ici).
 */

import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import type { OrganizationOdooConfig } from "../types/jsonb";
import { subscriptionTier } from "./enums";

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    name: text("name").notNull(),
    /** SIREN entreprise — unique. NULL si recette (cf. plan_recette_gate7) */
    siren: text("siren").unique(),
    /** SIRET 14 chars (établissement principal). Utilisé dans DC1, DC2, RIB. */
    siret: text("siret"),
    /** Config XML-RPC Odoo (credentials via Vault, jamais en clair ici) */
    odooConfig: jsonb("odoo_config").$type<OrganizationOdooConfig>(),
    /**
     * Palier de souscription — pilote les features dispo côté app.
     * DEFAULT 'studio' : AlyoS Ingénierie démarre sur le palier complet au MVP.
     */
    subscriptionTier: subscriptionTier("subscription_tier").notNull().default("studio"),
    /**
     * URL publique du logo organisation (bucket Supabase `org-assets`).
     * Nullable : l'organisation utilise le logo edifio Sourcing par défaut.
     */
    logoUrl: text("logo_url"),
    /**
     * Couleur dominante de marque au format hexadécimal 6 chiffres (#RRGGBB).
     * Override `--brand-red` et ses variantes dans le layout Sourcing.
     * Nullable : utilise la couleur edifio par défaut (#ff0033).
     */
    primaryColor: varchar("primary_color", { length: 7 }),
    /**
     * Famille de police pour les titres (`--font-display`).
     * Valeurs autorisées : space-grotesk | outfit | playfair-display | inter.
     * Nullable : utilise Space Grotesk (défaut DS edifio).
     */
    fontFamily: varchar("font_family", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** Index requis CTO pour les requêtes filtrées par palier */
    tierIdx: index("idx_organizations_tier").on(table.subscriptionTier),
  }),
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
