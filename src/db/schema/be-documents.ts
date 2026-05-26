/**
 * Table be_documents — documents administratifs d'un bureau d'études.
 *
 * Stocke les pièces administratives rattachées à une fiche BET :
 * DC1, DC2, DC4, Pouvoir, Kbis, attestations URSSAF/assurance/fiscale,
 * présentation BE, moyens humains, références, mémoire RSE.
 *
 * Les fichiers physiques sont stockés dans le bucket Supabase Storage
 * "be-docs" (private). La colonne `storage_path` contient le chemin
 * dans ce bucket.
 *
 * Bucket Storage requis (à créer manuellement par Steve) :
 *   - "be-docs" (private) — Storage → New Bucket dans le dashboard Supabase.
 *
 * Créée dans feat/be-documents (Alex, 2026-05-26).
 */

import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { users } from "./users";
import { bureauEtudes } from "./bureaux-etudes";

// ============================================================================
// Type applicatif — catégories de documents BE
// ============================================================================

/**
 * Catégories de documents administratifs d'un bureau d'études.
 * Type applicatif (pas d'enum Postgres) pour rester flexible sans migration.
 *
 * - dc1             : DC1 — Lettre de candidature
 * - dc2             : DC2 — Déclaration du candidat
 * - dc4             : DC4 — Déclaration de sous-traitance
 * - pouvoir         : Pouvoir du signataire
 * - kbis            : Kbis / Extrait RCS
 * - assurance       : Attestation d'assurance RC
 * - urssaf          : Attestation URSSAF
 * - fiscal          : Attestation fiscale
 * - presentation_be : Présentation du BE
 * - moyens_humains  : Moyens humains et matériels
 * - references      : Références
 * - memoire_rse     : Mémoire RSE
 */
export type BeDocumentKind =
  | "dc1"
  | "dc2"
  | "dc4"
  | "pouvoir"
  | "kbis"
  | "assurance"
  | "urssaf"
  | "fiscal"
  | "presentation_be"
  | "moyens_humains"
  | "references"
  | "memoire_rse";

/**
 * Labels affichables par kind — utilisés dans l'UI et les tooltips.
 */
export const BE_DOCUMENT_KIND_LABELS: Record<BeDocumentKind, string> = {
  dc1: "DC1 — Lettre de candidature",
  dc2: "DC2 — Déclaration du candidat",
  dc4: "DC4 — Déclaration de sous-traitance",
  pouvoir: "Pouvoir du signataire",
  kbis: "Kbis / Extrait RCS",
  assurance: "Attestation d'assurance RC",
  urssaf: "Attestation URSSAF",
  fiscal: "Attestation fiscale",
  presentation_be: "Présentation du BE",
  moyens_humains: "Moyens humains et matériels",
  references: "Références",
  memoire_rse: "Mémoire RSE",
};

/** Liste ordonnée des kinds pour les sélecteurs UI. */
export const BE_DOCUMENT_KINDS: BeDocumentKind[] = [
  "dc1",
  "dc2",
  "dc4",
  "pouvoir",
  "kbis",
  "assurance",
  "urssaf",
  "fiscal",
  "presentation_be",
  "moyens_humains",
  "references",
  "memoire_rse",
];

// ============================================================================
// Table be_documents
// ============================================================================

export const beDocuments = pgTable(
  "be_documents",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    /** FK vers le bureau d'études propriétaire du document */
    beId: uuid("be_id")
      .notNull()
      .references(() => bureauEtudes.id, { onDelete: "cascade" }),
    /** Tenant AlyoS — filtre RLS */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * Catégorie du document — valeurs contrôlées applicativement
     * (cf. `BeDocumentKind`). Stocké en texte pour flexibilité sans migration.
     */
    kind: text("kind").notNull(),
    /** Nom lisible affiché dans l'UI (ex. "DC1 — AO EDM 26 S 01" ou "Kbis 2026") */
    label: text("label").notNull(),
    /**
     * Chemin dans le bucket Supabase Storage "be-docs" (private).
     * Format : `{organizationId}/{beId}/{timestamp}_{filename}`.
     */
    storagePath: text("storage_path").notNull(),
    /** Nom original du fichier tel qu'uploadé */
    filename: text("filename").notNull(),
    /** Utilisateur AlyoS ayant uploadé le document */
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * Date d'expiration du document — null = pas d'expiration.
     * Utile pour les attestations URSSAF, RC pro (valables 1 an en général).
     */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => ({
    /** Index principal pour lister les docs d'un bureau d'études */
    beIdx: index("idx_be_docs_be").on(table.beId),
    /** Index tenant pour les requêtes filtrées par organisation */
    orgIdx: index("idx_be_docs_org").on(table.organizationId),
  }),
);

export type BeDocument = typeof beDocuments.$inferSelect;
export type NewBeDocument = typeof beDocuments.$inferInsert;
