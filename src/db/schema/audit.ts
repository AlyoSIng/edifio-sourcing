/**
 * Tables audit_logs + learning_events.
 *
 * Source de vérité : `specs/schema_v1.sql` §9 + `specs/audit_log_v1.md`.
 *
 * `audit_logs` est IMMUTABLE (INSERT only) — les triggers Postgres qui
 * bloquent UPDATE/DELETE seront posés à l'étape 4 (RLS) via SQL natif
 * dans la migration. Ils ne se modélisent pas en DSL Drizzle pur.
 *
 * RLS particulière sur audit_logs : visible aux `admin` uniquement
 * (cf. policy `tenant_isolation` schema_v1.sql l.546).
 */

import { sql } from "drizzle-orm";
import { index, inet, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { AuditLogData, LearningEventPayload } from "../types/jsonb";
import { auditAction, learningEventType, membershipRole } from "./enums";
import { organizations } from "./organizations";
import { tenders } from "./tenders";
import { users } from "./users";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    /** SET NULL : on garde le log même si l'org est supprimée (rétention 5 ans) */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** Snapshot email pour cas user supprimé */
    actorEmail: text("actor_email"),
    /** Snapshot rôle au moment de l'action */
    actorRole: membershipRole("actor_role"),
    action: auditAction("action").notNull(),
    /** Type de l'entité impactée : 'tender', 'architect', 'user', 'dossier', ... */
    subjectType: text("subject_type"),
    subjectId: uuid("subject_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    /** IP source (header x-forwarded-for Vercel) */
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    /** Payload typé par action (cf. audit_log_v1.md — 13 schémas Zod) */
    data: jsonb("data").$type<AuditLogData>(),
  },
  (table) => ({
    orgDateIdx: index("idx_audit_logs_org_date").on(table.organizationId, table.occurredAt.desc()),
    /** Index partiel : on filtre souvent par actor connu */
    actorIdx: index("idx_audit_logs_actor")
      .on(table.actorId)
      .where(sql`${table.actorId} IS NOT NULL`),
    actionDateIdx: index("idx_audit_logs_action").on(table.action, table.occurredAt.desc()),
  }),
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export const learningEvents = pgTable(
  "learning_events",
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
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    eventType: learningEventType("event_type").notNull(),
    /** Catégorie standardisée (cf. prompt P9 decline_motif_categorize) */
    motifCategory: text("motif_category"),
    /**
     * Motif structuré normalisé — apprentissage par écartement (Salve U,
     * migration 0050). Distinct de `motifCategory` (réservé à la
     * catégorisation IA P9) : `reasonCode` porte l'un des 6 motifs structurés
     * de `REJECTION_REASONS` (cf. `src/lib/sourcing/learning/rejection-reasons.ts`).
     * Nullable pour rétrocompat (vieux events `rejected` sans motif structuré).
     */
    reasonCode: text("reason_code"),
    /** Verbatim utilisateur (utile pour le feedback IA) */
    verbatim: text("verbatim"),
    /**
     * Snapshot du tender au moment du rejet (migration 0050) : buyer,
     * cpvCodes, geoZone/department, amount. Permet d'agréger les suggestions
     * d'ajustement de profil sans re-fetch des tenders. Forme typée par
     * `LearningEventPayload` (cf. `src/db/types/jsonb.ts`). Nullable.
     */
    payload: jsonb("payload").$type<LearningEventPayload>(),
    /**
     * Non-null = la suggestion issue de cet event a été APPLIQUÉE au profil
     * par un admin (apprentissage par écartement, migration 0050).
     */
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    /**
     * Non-null = la suggestion a été IGNORÉE par un admin. Un event dont
     * `appliedAt` ET `dismissedAt` sont NULL est encore « actionnable » pour
     * le calcul des suggestions (cf. `computeSuggestions`).
     */
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgDateIdx: index("idx_learning_events_org_date").on(
      table.organizationId,
      table.occurredAt.desc(),
    ),
    /**
     * Index partiel sur les motifs structurés (migration 0050) — accélère le
     * regroupement par `reason_code` actionnable sur 30 j glissants côté
     * `computeSuggestions`. Aligné sur `idx_learning_events_org_reason`.
     */
    orgReasonIdx: index("idx_learning_events_org_reason")
      .on(table.organizationId, table.reasonCode, table.occurredAt.desc())
      .where(sql`${table.reasonCode} IS NOT NULL`),
  }),
);

export type LearningEvent = typeof learningEvents.$inferSelect;
export type NewLearningEvent = typeof learningEvents.$inferInsert;
