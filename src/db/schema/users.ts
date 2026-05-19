/**
 * Tables users + memberships — auth et appartenance organisationnelle.
 *
 * Source de vérité : `specs/schema_v1.sql` §1.
 *
 * Spécificité Supabase : `users.id` référence `auth.users(id)` (schéma natif
 * Supabase Auth). Drizzle ne modélise pas le schéma `auth`, donc on déclare
 * la colonne sans `.references()` Drizzle natif et on pose la FK via SQL
 * brut dans la migration — drizzle-kit accepte `references(() => sql`...`)`
 * via le mécanisme `references` côté pgTable (cf. migration générée).
 *
 * En pratique : on déclare la colonne `uuid PRIMARY KEY` côté Drizzle et la
 * contrainte FK vers `auth.users` est documentée dans le SQL final. Si
 * drizzle-kit n'émet pas la référence cross-schema, un follow-up SQL natif
 * sera posé à l'étape 4 (RLS) où l'on injecte déjà du SQL via drizzle-kit.
 */

import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { membershipRole } from "./enums";
import { organizations } from "./organizations";

export const users = pgTable("users", {
  /**
   * Référence `auth.users(id)` (Supabase) — la FK cross-schema sera posée
   * via SQL natif dans la migration RLS étape 4. Côté Drizzle on déclare
   * juste la colonne PK.
   */
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  firstname: text("firstname"),
  lastname: text("lastname"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const memberships = pgTable(
  "memberships",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.userId] }),
    userIdx: index("idx_memberships_user").on(table.userId),
  }),
);

export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
