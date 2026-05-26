/**
 * Tables partage cotraitant — liens tokenisés pour partage de pièces.
 *
 * Flux : AlyoS crée un lien de partage (token) pour un cotraitant (BE ou
 * archi). Le cotraitant accède à la page publique /cotraitant/[token],
 * télécharge les pièces sélectionnées depuis la bibliothèque, les signe
 * et les redépose. AlyoS consulte les dépôts sur la page de partage.
 *
 * Source de vérité : demande Board 2026-05-26 (partage cotraitant MVP).
 *
 * Bucket Storage requis côté Supabase (à créer manuellement par Steve) :
 *   - "cotraitant_signed" (private) — Storage → New Bucket dans le dashboard
 *     Supabase. Nécessaire avant la 1re utilisation du flow upload signé.
 */

import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { architects } from "./architects";
import { organizations } from "./organizations";
import { presentationLibrary } from "./library";
import { tenders } from "./tenders";
import { users } from "./users";

export const cotraitantShares = pgTable(
  "cotraitant_shares",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * FK optionnelle vers un architecte si le partage provient de la
     * shortlist Tandem.
     */
    architectId: uuid("architect_id").references(() => architects.id, {
      onDelete: "set null",
    }),
    /** Nom de contact du cotraitant (libre, pas forcément lié à un architecte DB) */
    contactName: text("contact_name").notNull(),
    /** Email de contact — utilisé pour l'affichage (pas d'envoi auto au MVP) */
    contactEmail: text("contact_email").notNull(),
    /**
     * Token public UUID — la valeur est exposée dans l'URL `/cotraitant/[token]`.
     * Généré côté serveur via `uuid_generate_v4()` automatiquement.
     * UNIQUE : chaque partage a son propre token.
     */
    token: uuid("token")
      .notNull()
      .unique()
      .default(sql`uuid_generate_v4()`),
    /** Expiration du lien (par défaut 30 jours après création) */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Révocation manuelle par AlyoS */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenderIdx: index("idx_cotraitant_shares_tender").on(table.tenderId),
    tokenIdx: index("idx_cotraitant_shares_token").on(table.token),
  }),
);

export type CotraitantShare = typeof cotraitantShares.$inferSelect;
export type NewCotraitantShare = typeof cotraitantShares.$inferInsert;

export const cotraitantShareItems = pgTable(
  "cotraitant_share_items",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    shareId: uuid("share_id")
      .notNull()
      .references(() => cotraitantShares.id, { onDelete: "cascade" }),
    /** FK vers la pièce source dans la bibliothèque (nullable si pièce supprimée) */
    libraryItemId: uuid("library_item_id").references(() => presentationLibrary.id, {
      onDelete: "set null",
    }),
    /** Nom affiché au cotraitant */
    name: text("name").notNull(),
    /** Catégorie (ex. kbis, attestation_assurance, reference_projet) */
    kind: text("kind").notNull(),
    /**
     * Chemin dans le bucket `company_library` — pour générer une URL signée
     * de téléchargement côté cotraitant.
     */
    originalStoragePath: text("original_storage_path").notNull(),
    /**
     * Chemin dans le bucket `cotraitant_signed` — non null si le cotraitant
     * a redéposé la pièce signée.
     *
     * IMPORTANT (ops) : le bucket "cotraitant_signed" doit être créé dans
     * le dashboard Supabase (Storage → New Bucket → private) avant la 1re
     * utilisation de ce flow.
     */
    signedStoragePath: text("signed_storage_path"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    /** Nom saisi par le cotraitant lors du dépôt */
    signerName: text("signer_name"),
    /** Nom du fichier signé tel que redéposé */
    signedFilename: text("signed_filename"),
  },
  (table) => ({
    shareIdx: index("idx_cotraitant_share_items_share").on(table.shareId),
  }),
);

export type CotraitantShareItem = typeof cotraitantShareItems.$inferSelect;
export type NewCotraitantShareItem = typeof cotraitantShareItems.$inferInsert;
