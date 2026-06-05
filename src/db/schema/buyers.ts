/**
 * Table buyers — annuaire des acheteurs publics (Steve 2026-06-04).
 *
 * Master data des acheteurs (mairies, conseils départementaux, hôpitaux, etc.)
 * qui apparaissent dans les AOs. Permet de réutiliser les adresses saisies
 * d'un AO à l'autre pour un même acheteur, sans ressaisie.
 *
 * Cf. migration 0048 pour le SQL natif (RLS FORCE + unique index sur
 * `(organization_id, name_normalized)`).
 *
 * Pas de FK depuis `tenders.buyer` vers `buyers.id` : le buyer BOAMP est
 * du texte libre qui peut varier orthographiquement entre 2 AOs (« Mairie
 * de Lyon » vs « Ville de Lyon »). La déduplication est faite via le nom
 * normalisé en applicatif, pas via FK.
 */

import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { users } from "./users";

export const buyers = pgTable(
  "buyers",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Nom affiché (préserve case + accents pour les courriers). */
    name: text("name").notNull(),
    /** Nom normalisé pour le matching (lowercase + sans accents + trim).
        UNIQUE par organisation pour éviter les doublons. */
    nameNormalized: text("name_normalized").notNull(),
    /** Adresse postale (rue + code postal + ville). NULL = pas encore renseignée. */
    address: text("address"),
    /** SIRET 14 chars si connu. */
    siret: text("siret"),
    /** SIREN 9 chars si connu. */
    siren: text("siren"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => ({
    orgNameNormIdx: uniqueIndex("idx_buyers_org_name_norm").on(
      table.organizationId,
      table.nameNormalized,
    ),
    orgNameIdx: index("idx_buyers_org_name").on(table.organizationId, table.name),
  }),
);

export type Buyer = typeof buyers.$inferSelect;
export type NewBuyer = typeof buyers.$inferInsert;

/**
 * Normalise un nom d'acheteur pour le matching.
 *   - lowercase
 *   - NFD + suppression des diacritiques (accents)
 *   - compactage des espaces multiples
 *   - trim
 *
 * Exportée pour qu'elle soit utilisée à la fois côté UPSERT et côté SELECT
 * (matching d'un nom BOAMP vs annuaire) afin d'éviter les fausses divergences.
 */
export function normalizeBuyerName(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
