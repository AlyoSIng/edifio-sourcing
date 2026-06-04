/**
 * Table cron_run_log — journal des exécutions Vercel Cron (chantier I3).
 *
 * Steve 2026-06-04. Une row par run, insérée au début (status='running'),
 * mise à jour à la fin avec finished_at + status final + duration_ms.
 *
 * Org-agnostique : les crons itèrent sur toutes les organisations dans le
 * même run, on ne stocke donc pas d'organization_id ici. La table est en
 * RLS FORCE sans policy authenticated — seul le service_role peut lire.
 */

import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const cronRunLog = pgTable(
  "cron_run_log",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    cronName: text("cron_name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    /** 'running' | 'ok' | 'error' — voir CHECK constraint migration 0046. */
    status: text("status").notNull().default("running"),
    /** Sortie JSON sérialisée du runner (ex. nb mails envoyés, ZIPs supprimés). */
    payload: jsonb("payload"),
    errorMessage: text("error_message"),
    errorStack: text("error_stack"),
  },
  (table) => ({
    startedAtIdx: index("idx_cron_run_log_started_at").on(table.startedAt),
    nameStartedIdx: index("idx_cron_run_log_name_started").on(table.cronName, table.startedAt),
  }),
);

export type CronRunLog = typeof cronRunLog.$inferSelect;
export type NewCronRunLog = typeof cronRunLog.$inferInsert;
