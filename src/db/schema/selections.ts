/**
 * Tables sélections + matching architectes + tokens accès tokenisé.
 *
 * Source de vérité :
 *   - `specs/schema_v1.sql` §5 (modèle initial)
 *   - `specs/module_tandem_engine_v1.md` §3 (flow Tandem complet)
 *   - DECISIONS.md 2026-05-22 (c) : ajout `token_id` + `followup_sent_at`
 *     sur `architect_responses` (PR `feat/tandem-engine` étape 1).
 *   - DECISIONS.md 2026-05-22 (d) `architect_opposition_tokens` : table dédiée
 *     pour la page publique RGPD `/archi/oppose/[token]` (1 token par
 *     architecte, durée de vie longue, single-use).
 *
 * - `selections` : 1 ligne par AO sélectionné (unique tender_id)
 * - `match_proposals` : top N architectes proposés pour un AO Tandem
 * - `architect_responses` : réponse de l'archi (pending/accepted/declined/info)
 *   avec ajouts Tandem : `tokenId` (FK vers `architect_tokens`),
 *   `followupSentAt` (cron J+3 idempotent)
 * - `architect_tokens` : JWT révocables pour la page tokenisée (jti UNIQUE)
 * - `architect_opposition_tokens` : token RGPD opposition (1 par archi,
 *   single-use, cf. spec architects_data_and_admin_v1 §5)
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { architects } from "./architects";
import { architectResponseStatus, selectionMode } from "./enums";
import { organizations } from "./organizations";
import { tenders } from "./tenders";
import { users } from "./users";

export const selections = pgTable("selections", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  /** UNIQUE : un AO ne peut être sélectionné qu'une fois (annulation = cancelled_at set) */
  tenderId: uuid("tender_id")
    .notNull()
    .unique()
    .references(() => tenders.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  mode: selectionMode("mode").notNull(),
  selectedBy: uuid("selected_by")
    .notNull()
    .references(() => users.id),
  selectedAt: timestamp("selected_at", { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
});

export type Selection = typeof selections.$inferSelect;
export type NewSelection = typeof selections.$inferInsert;

export const matchProposals = pgTable(
  "match_proposals",
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
    architectId: uuid("architect_id")
      .notNull()
      .references(() => architects.id, { onDelete: "cascade" }),
    score: numeric("score", { precision: 5, scale: 2 }).notNull(),
    rank: integer("rank").notNull(),
    /** Texte IA « Pourquoi cet archi » (cf. prompt P5) */
    rationale: text("rationale"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenderArchiUq: unique("match_proposals_tender_id_architect_id_key").on(
      table.tenderId,
      table.architectId,
    ),
    tenderRankIdx: index("idx_match_proposals_tender").on(table.tenderId, table.rank),
  }),
);

export type MatchProposal = typeof matchProposals.$inferSelect;
export type NewMatchProposal = typeof matchProposals.$inferInsert;

export const architectTokens = pgTable(
  "architect_tokens",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    architectId: uuid("architect_id")
      .notNull()
      .references(() => architects.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Claim `jti` du JWT — UNIQUE pour révocation cible */
    jwtId: text("jwt_id").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revoked: boolean("revoked").notNull().default(false),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** Index partiel sur tokens actifs uniquement (perf check révocation) */
    activeIdx: index("idx_architect_tokens_active")
      .on(table.jwtId)
      .where(sql`${table.revoked} = FALSE`),
  }),
);

export type ArchitectToken = typeof architectTokens.$inferSelect;
export type NewArchitectToken = typeof architectTokens.$inferInsert;

export const architectResponses = pgTable(
  "architect_responses",
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
    architectId: uuid("architect_id")
      .notNull()
      .references(() => architects.id, { onDelete: "cascade" }),
    status: architectResponseStatus("status").notNull().default("pending"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    infoRequestText: text("info_request_text"),
    /**
     * Décision Board 2026-05-22 (c) — FK vers `architect_tokens.id` du token
     * via lequel l'archi a répondu. Nullable car les réponses pré-Tandem
     * (qui n'auraient pas de token) ou les réponses saisies manuellement
     * côté admin n'ont pas de provenance token. ON DELETE SET NULL pour
     * conserver l'historique de réponse même si le token est révoqué.
     */
    tokenId: uuid("token_id").references(() => architectTokens.id, { onDelete: "set null" }),
    /**
     * Décision Board 2026-05-22 (c) — timestamp de la dernière relance Brevo
     * envoyée (template `architect_followup_TU|VOUS`). Le cron J+3
     * (`/api/cron/tandem-followup`) update cette colonne pour rendre la
     * relance idempotente : filtrage `WHERE status = 'pending' AND
     * followup_sent_at IS NULL AND responded_at IS NULL AND created_at <=
     * now() - INTERVAL '3 days'`.
     */
    followupSentAt: timestamp("followup_sent_at", { withTimezone: true }),
  },
  (table) => ({
    tenderArchiUq: unique("architect_responses_tender_id_architect_id_key").on(
      table.tenderId,
      table.architectId,
    ),
    statusIdx: index("idx_architect_responses_status").on(table.status, table.tenderId),
    /**
     * Index partiel sur le chemin chaud du cron J+3 : les réponses en
     * attente sans relance encore envoyée.
     */
    pendingNoFollowupIdx: index("idx_architect_responses_pending_no_followup")
      .on(table.tenderId)
      .where(sql`${table.status} = 'pending' AND ${table.followupSentAt} IS NULL`),
  }),
);

export type ArchitectResponse = typeof architectResponses.$inferSelect;
export type NewArchitectResponse = typeof architectResponses.$inferInsert;

/**
 * Tokens d'opposition RGPD — page publique tokenisée `/archi/oppose/[token]`.
 *
 * Source : `specs/architects_data_and_admin_v1.md` §5 (RGPD dans l'app —
 * lien d'opposition dans chaque mail Brevo) + décision Board 2026-05-22.
 *
 * Modèle :
 *   - 1 token actif par architecte (régénérable côté admin)
 *   - durée de vie longue (5 ans alignée rétention RGPD, configurable)
 *   - single-use : `used_at` IS NOT NULL après opposition exercée
 *     (l'archi peut toujours revenir, mais on log la traçabilité)
 *
 * RLS : FORCE + tenant_isolation (multi-tenant via `architects.organizationId`).
 * Aucune route applicative n'expose cette table à l'utilisateur — accès
 * uniquement via Server Action de la page publique `/archi/oppose/[token]`,
 * en bypass RLS (service_role) après validation JWT côté serveur.
 */
export const architectOppositionTokens = pgTable(
  "architect_opposition_tokens",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    architectId: uuid("architect_id")
      .notNull()
      .references(() => architects.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Claim `jti` du JWT d'opposition — UNIQUE. */
    jti: text("jti").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /**
     * Timestamp de l'usage du token (clic « M'opposer » par l'architecte).
     * Single-use : une fois set, le token ne peut plus être ré-exercé
     * (mais l'architecte peut toujours demander un nouveau lien).
     */
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => ({
    architectIdx: index("idx_architect_opposition_tokens_architect").on(table.architectId),
    /** Index partiel : tokens encore actifs (non utilisés). */
    activeIdx: index("idx_architect_opposition_tokens_active")
      .on(table.jti)
      .where(sql`${table.usedAt} IS NULL`),
  }),
);

export type ArchitectOppositionToken = typeof architectOppositionTokens.$inferSelect;
export type NewArchitectOppositionToken = typeof architectOppositionTokens.$inferInsert;
