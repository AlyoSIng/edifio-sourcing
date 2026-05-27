/**
 * Tables du module Superadmin — edifio Sourcing
 *
 * Décision Board 2026-05-27 : 3e rôle `superadmin` réservé à l'éditeur edifio
 * (contact@edifio.fr + steissier@alyosingenierie.fr).
 *
 * Périmètre fonctionnel de ces tables :
 *   - support_tickets           : tickets d'aide soumis par les utilisateurs
 *   - news_items                : actualités produit publiées par le superadmin
 *   - user_news_reads           : suivi de lecture des actualités par user
 *   - formations                : fiches formations (vidéo, doc, lien externe)
 *   - faq_items                 : questions fréquentes
 *   - guided_tests              : tests guidés QCM liés aux formations
 *   - guided_test_submissions   : réponses des utilisateurs aux tests guidés
 *   - app_content               : clés/valeurs de contenu global (PDF plaquette,
 *                                  roadmap, URL démo vidéo)
 *   - notifications             : notifications in-app (badge)
 *
 * RLS : ENABLE + FORCE posés dans la migration 0019 via SQL natif.
 * Aucun trigger updated_at modélisé en DSL Drizzle (posé via SQL brut en migration).
 *
 * Source de vérité : migration `src/db/migrations/0019_superadmin_module.sql`.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "./organizations";

// ─── support_tickets ─────────────────────────────────────────────────────────

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Organisation de l'émetteur (isolement multi-tenant). */
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** UUID Supabase Auth de l'émetteur (pas de FK vers users — bypass RLS). */
    userId: uuid("user_id").notNull(),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    /** 'open' | 'in_progress' | 'closed' — géré via CHECK SQL. */
    status: text("status").notNull().default("open"),
    /** Réponse du superadmin (null si non traité). */
    response: text("response"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    /** UUID du superadmin ayant répondu. */
    respondedBy: uuid("responded_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("idx_support_tickets_org_id").on(table.orgId),
    userIdx: index("idx_support_tickets_user_id").on(table.userId),
    statusIdx: index("idx_support_tickets_status").on(table.status),
  }),
);

export type SupportTicket = typeof supportTickets.$inferSelect;
export type NewSupportTicket = typeof supportTickets.$inferInsert;

// ─── news_items ──────────────────────────────────────────────────────────────

export const newsItems = pgTable(
  "news_items",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    content: text("content").notNull(),
    /** Seuls les articles publiés sont visibles des users standard. */
    isPublished: boolean("is_published").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** UUID du superadmin auteur. */
    authorId: uuid("author_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    publishedIdx: index("idx_news_items_published").on(table.isPublished, table.publishedAt.desc()),
  }),
);

export type NewsItem = typeof newsItems.$inferSelect;
export type NewNewsItem = typeof newsItems.$inferInsert;

// ─── user_news_reads ─────────────────────────────────────────────────────────

export const userNewsReads = pgTable(
  "user_news_reads",
  {
    userId: uuid("user_id").notNull(),
    newsId: uuid("news_id")
      .notNull()
      .references(() => newsItems.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.newsId] }),
  }),
);

export type UserNewsRead = typeof userNewsReads.$inferSelect;
export type NewUserNewsRead = typeof userNewsReads.$inferInsert;

// ─── formations ──────────────────────────────────────────────────────────────

export const formations = pgTable("formations", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url"),
  /** 'video' | 'doc' | 'external' — géré via CHECK SQL. */
  type: text("type").notNull().default("video"),
  thumbnailUrl: text("thumbnail_url"),
  /** Durée estimée en minutes (optionnelle). */
  durationMin: integer("duration_min"),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Formation = typeof formations.$inferSelect;
export type NewFormation = typeof formations.$inferInsert;

// ─── faq_items ───────────────────────────────────────────────────────────────

export const faqItems = pgTable("faq_items", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  /** Catégorie libre (ex. 'general', 'sourcing', 'tandem'). */
  category: text("category").notNull().default("general"),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FaqItem = typeof faqItems.$inferSelect;
export type NewFaqItem = typeof faqItems.$inferInsert;

// ─── guided_tests ────────────────────────────────────────────────────────────

/**
 * Structure d'une étape de test guidé.
 * `type` peut valoir 'qcm', 'open', 'action'.
 */
export interface GuidedTestStep {
  id: string;
  type: "qcm" | "open" | "action";
  question: string;
  /** Options pour QCM. */
  options?: string[];
  /** Index (0-based) de la bonne réponse pour QCM. */
  correctIndex?: number;
}

export const guidedTests = pgTable("guided_tests", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  /** Formation associée (optionnelle). */
  formationId: uuid("formation_id").references(() => formations.id, { onDelete: "set null" }),
  /** Tableau d'étapes sérialisé en JSONB. */
  steps: jsonb("steps")
    .$type<GuidedTestStep[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GuidedTest = typeof guidedTests.$inferSelect;
export type NewGuidedTest = typeof guidedTests.$inferInsert;

// ─── guided_test_submissions ─────────────────────────────────────────────────

/** Map réponse : clé = id de l'étape, valeur = index choisi ou texte libre. */
export type GuidedTestAnswers = Record<string, number | string>;

export const guidedTestSubmissions = pgTable(
  "guided_test_submissions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    testId: uuid("test_id")
      .notNull()
      .references(() => guidedTests.id, { onDelete: "cascade" }),
    /** UUID Supabase Auth de l'utilisateur. */
    userId: uuid("user_id").notNull(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    answers: jsonb("answers")
      .$type<GuidedTestAnswers>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Remarques libres de l'utilisateur. */
    remarks: text("remarks"),
    /** Score calculé (0-100) — null si non corrigé automatiquement. */
    score: integer("score"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userTestIdx: index("idx_guided_test_submissions_user").on(table.userId, table.testId),
  }),
);

export type GuidedTestSubmission = typeof guidedTestSubmissions.$inferSelect;
export type NewGuidedTestSubmission = typeof guidedTestSubmissions.$inferInsert;

// ─── app_content ─────────────────────────────────────────────────────────────

/**
 * Contenu global géré par le superadmin.
 * Clés actuelles : 'pitch_pdf_url', 'roadmap_pdf_url', 'demo_video_url'.
 * Le superadmin peut ajouter d'autres clés librement.
 */
export const appContent = pgTable("app_content", {
  /** Clé alphanumérique unique (ex. 'pitch_pdf_url'). */
  key: text("key").primaryKey(),
  /** Texte libre (titre, description courte). */
  contentText: text("content_text"),
  /** URL (PDF Storage Supabase, vidéo externe, etc.). */
  contentUrl: text("content_url"),
  /** Payload JSON arbitraire pour les cas complexes. */
  contentJson: jsonb("content_json"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  /** UUID du superadmin ayant effectué la dernière mise à jour. */
  updatedBy: uuid("updated_by"),
});

export type AppContent = typeof appContent.$inferSelect;
export type NewAppContent = typeof appContent.$inferInsert;

// ─── user_notifications ───────────────────────────────────────────────────────
//
// Attention : la table `notifications` existe déjà dans le schéma `integrations`
// (notifications Odoo/Brevo avec org_id requis). Cette table est distincte :
// notifications in-app légères (news, support_reply, system) sans org_id.
// Nom BDD : `user_notifications` (évite la collision avec `notifications`).

/** Payload spécifique selon le type de notification in-app. */
export type UserNotificationPayload =
  | { ticketId: string }
  | { newsId: string }
  | Record<string, unknown>;

export const userNotifications = pgTable(
  "user_notifications",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** UUID Supabase Auth du destinataire. */
    userId: uuid("user_id").notNull(),
    /** 'news' | 'support_reply' | 'system' — géré via CHECK SQL. */
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    payload: jsonb("payload").$type<UserNotificationPayload>(),
    /** null = non lue ; horodatage = lue. */
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userReadIdx: index("idx_user_notifications_user_id").on(table.userId, table.readAt),
  }),
);

export type UserNotification = typeof userNotifications.$inferSelect;
export type NewUserNotification = typeof userNotifications.$inferInsert;
