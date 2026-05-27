/**
 * Tests d'inférence de types Drizzle — schema v1.
 *
 * Objectif : verrouiller le typage `$inferSelect` / `$inferInsert` sur chaque
 * table et garantir que les 8 colonnes jsonb sont bien typées via `.$type<T>()`
 * (zéro `any`, zéro `unknown` paresseux).
 *
 * Approche : `expectTypeOf` de Vitest (assertions de type compile-time, pas de
 * runtime check). Si un type fluctue (par ex. quelqu'un retire `.$type<>()`
 * dans un module schema), le test casse à l'exécution `vitest run`.
 */

import { describe, expectTypeOf, it } from "vitest";

import type {
  AiRunOutput,
  AuditLogData,
  BrevoMessageEvents,
  NotificationPayload,
  OrganizationOdooConfig,
  SearchProfileKeywords,
  TenderEventData,
  TenderRawData,
} from "@/db/types/jsonb";
import {
  aiPrompts,
  aiRuns,
  architectResponses,
  architectSpecialties,
  architectTokens,
  architects,
  auditLogs,
  brevoMessages,
  learningEvents,
  matchProposals,
  memberships,
  notifications,
  odooOpportunities,
  organizations,
  platformCredentials,
  platforms,
  presentationLibrary,
  responseFiles,
  searchProfiles,
  selections,
  tenderDocuments,
  tenderEvents,
  tenderLots,
  tenders,
  users,
} from "@/db/schema";

describe("schema Drizzle v1 — inférence de types", () => {
  it("organizations : $inferSelect inclut subscription_tier typé enum + odoo_config typé OrganizationOdooConfig", () => {
    type Row = typeof organizations.$inferSelect;
    expectTypeOf<Row["id"]>().toEqualTypeOf<string>();
    expectTypeOf<Row["name"]>().toEqualTypeOf<string>();
    expectTypeOf<Row["subscriptionTier"]>().toEqualTypeOf<"sourcing" | "cotraitance" | "studio">();
    expectTypeOf<Row["odooConfig"]>().toEqualTypeOf<OrganizationOdooConfig | null>();
  });

  it("organizations : $inferInsert rend subscription_tier optionnel (DEFAULT 'studio')", () => {
    type Insert = typeof organizations.$inferInsert;
    expectTypeOf<Insert["name"]>().toEqualTypeOf<string>();
    // subscription_tier a un DEFAULT donc Drizzle le rend optionnel à l'insert
    expectTypeOf<Insert["subscriptionTier"]>().toEqualTypeOf<
      "sourcing" | "cotraitance" | "studio" | undefined
    >();
  });

  it("users : $inferSelect typé strict (id, email, firstname nullable)", () => {
    type Row = typeof users.$inferSelect;
    expectTypeOf<Row["id"]>().toEqualTypeOf<string>();
    expectTypeOf<Row["email"]>().toEqualTypeOf<string>();
    expectTypeOf<Row["firstname"]>().toEqualTypeOf<string | null>();
  });

  it("memberships : $inferSelect inclut role typé enum membership_role", () => {
    type Row = typeof memberships.$inferSelect;
    // Extension 2026-05-27 : ajout de 'superadmin' (rôle éditeur edifio — Board 2026-05-27).
    expectTypeOf<Row["role"]>().toEqualTypeOf<"admin" | "user" | "viewer" | "superadmin">();
  });

  it("search_profiles : keywords typé SearchProfileKeywords (jsonb)", () => {
    type Row = typeof searchProfiles.$inferSelect;
    expectTypeOf<Row["keywords"]>().toEqualTypeOf<SearchProfileKeywords>();
    expectTypeOf<Row["keywords"]["positive"]>().toEqualTypeOf<string[]>();
    // Les arrays Postgres sont string[] côté Drizzle
    expectTypeOf<Row["cpvCodes"]>().toEqualTypeOf<string[]>();
    expectTypeOf<Row["cronDays"]>().toEqualTypeOf<number[]>();
  });

  it("platforms : code typé enum platform_code", () => {
    type Row = typeof platforms.$inferSelect;
    // `prive` ajouté migration 0023 (feat/boamp-dce-ao-manuel 2026-05-27)
    expectTypeOf<Row["code"]>().toEqualTypeOf<
      "boamp" | "place" | "francmarches" | "mp_info" | "prive"
    >();
    expectTypeOf<Row["authType"]>().toEqualTypeOf<
      "api_key" | "oauth" | "login_password" | "none"
    >();
  });

  it("platform_credentials : structure typée", () => {
    type Row = typeof platformCredentials.$inferSelect;
    expectTypeOf<Row["credentialsVaultRef"]>().toEqualTypeOf<string>();
  });

  it("architect_specialties : structure de référence", () => {
    type Row = typeof architectSpecialties.$inferSelect;
    expectTypeOf<Row["code"]>().toEqualTypeOf<string>();
    expectTypeOf<Row["labelFr"]>().toEqualTypeOf<string>();
  });

  it("architects : tutoiement boolean + cabinet NOT NULL + email nullable + specialty_codes array + solicitable GENERATED", () => {
    // Refonte 2026-05-25 (PR feat/tandem-engine etape 1) : drop firstname/
    // lastname/title/siret/references/partnership_status — refonte propre
    // cabinet/contact_name/email/siren/odoo_external_id/preferred/active/
    // solicitable GENERATED/past_collabs_count. Cf. DECISIONS.md 2026-05-22 (a).
    type Row = typeof architects.$inferSelect;
    expectTypeOf<Row["tutoiement"]>().toEqualTypeOf<boolean>();
    expectTypeOf<Row["cabinet"]>().toEqualTypeOf<string>(); // NOT NULL
    expectTypeOf<Row["contactName"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Row["email"]>().toEqualTypeOf<string | null>(); // devenu nullable
    expectTypeOf<Row["siren"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Row["odooExternalId"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Row["preferred"]>().toEqualTypeOf<boolean>();
    expectTypeOf<Row["active"]>().toEqualTypeOf<boolean>();
    // solicitable est une colonne GENERATED ALWAYS AS (email IS NOT NULL) STORED.
    // Drizzle l'infere boolean | null (nullable car generee, mais en pratique
    // jamais null cote DB puisque l'expression IS NOT NULL ne renvoie jamais NULL).
    expectTypeOf<Row["solicitable"]>().toEqualTypeOf<boolean | null>();
    expectTypeOf<Row["pastCollabsCount"]>().toEqualTypeOf<number>();
    expectTypeOf<Row["specialtyCodes"]>().toEqualTypeOf<string[]>();
  });

  it("tenders : raw_data typé TenderRawData (jsonb) + status enum 14 valeurs", () => {
    type Row = typeof tenders.$inferSelect;
    expectTypeOf<Row["rawData"]>().toEqualTypeOf<TenderRawData | null>();
    // tender_status = 14 valeurs (cf. Gate 4). On vérifie l'union complète.
    expectTypeOf<Row["status"]>().toEqualTypeOf<
      | "sourced"
      | "selected_solo"
      | "selected_tandem"
      | "awaiting_architect"
      | "architect_accepted"
      | "architect_declined"
      | "architect_info_requested"
      | "dossier_review_required"
      | "dossier_ready"
      | "dossier_diffused"
      | "submitted"
      | "won"
      | "lost"
      | "dropped"
    >();
    // Les numeric Postgres sont string côté Drizzle (préservation précision)
    expectTypeOf<Row["amount"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Row["score"]>().toEqualTypeOf<string | null>();
  });

  it("tender_lots : structure typée", () => {
    type Row = typeof tenderLots.$inferSelect;
    expectTypeOf<Row["lotNumber"]>().toEqualTypeOf<number>();
  });

  it("tender_documents : analyzed boolean + size_bytes number", () => {
    type Row = typeof tenderDocuments.$inferSelect;
    expectTypeOf<Row["analyzed"]>().toEqualTypeOf<boolean>();
    expectTypeOf<Row["sizeBytes"]>().toEqualTypeOf<number | null>();
  });

  it("tender_events : data typé TenderEventData (jsonb)", () => {
    type Row = typeof tenderEvents.$inferSelect;
    expectTypeOf<Row["data"]>().toEqualTypeOf<TenderEventData | null>();
    expectTypeOf<Row["eventType"]>().toEqualTypeOf<string>();
  });

  it("selections : mode enum selection_mode", () => {
    type Row = typeof selections.$inferSelect;
    // Migration 0012 a ajouté 'conception_realisation' à l'enum selection_mode.
    expectTypeOf<Row["mode"]>().toEqualTypeOf<"solo" | "tandem" | "conception_realisation">();
    expectTypeOf<Row["cancelledAt"]>().toEqualTypeOf<Date | null>();
  });

  it("match_proposals : score string (numeric) + rank number", () => {
    type Row = typeof matchProposals.$inferSelect;
    expectTypeOf<Row["score"]>().toEqualTypeOf<string>();
    expectTypeOf<Row["rank"]>().toEqualTypeOf<number>();
  });

  it("architect_responses : status enum architect_response_status", () => {
    type Row = typeof architectResponses.$inferSelect;
    expectTypeOf<Row["status"]>().toEqualTypeOf<
      "pending" | "accepted" | "declined" | "info_requested"
    >();
  });

  it("architect_tokens : revoked boolean + jwt_id string", () => {
    type Row = typeof architectTokens.$inferSelect;
    expectTypeOf<Row["revoked"]>().toEqualTypeOf<boolean>();
    expectTypeOf<Row["jwtId"]>().toEqualTypeOf<string>();
  });

  it("response_files : validated boolean", () => {
    type Row = typeof responseFiles.$inferSelect;
    expectTypeOf<Row["validated"]>().toEqualTypeOf<boolean>();
  });

  it("presentation_library : valid_until date nullable", () => {
    type Row = typeof presentationLibrary.$inferSelect;
    expectTypeOf<Row["validUntil"]>().toEqualTypeOf<string | null>();
  });

  it("ai_prompts : model enum ai_model + active boolean", () => {
    type Row = typeof aiPrompts.$inferSelect;
    expectTypeOf<Row["model"]>().toEqualTypeOf<"sonnet-4-6" | "haiku-4-5">();
    expectTypeOf<Row["active"]>().toEqualTypeOf<boolean>();
  });

  it("ai_runs : output typé AiRunOutput (jsonb)", () => {
    type Row = typeof aiRuns.$inferSelect;
    expectTypeOf<Row["output"]>().toEqualTypeOf<AiRunOutput | null>();
    expectTypeOf<Row["succeeded"]>().toEqualTypeOf<boolean>();
    expectTypeOf<Row["model"]>().toEqualTypeOf<"sonnet-4-6" | "haiku-4-5">();
  });

  it("odoo_opportunities : odoo_id integer", () => {
    type Row = typeof odooOpportunities.$inferSelect;
    expectTypeOf<Row["odooId"]>().toEqualTypeOf<number>();
  });

  it("brevo_messages : events typé BrevoMessageEvents (jsonb non-null) + register enum", () => {
    type Row = typeof brevoMessages.$inferSelect;
    expectTypeOf<Row["events"]>().toEqualTypeOf<BrevoMessageEvents>();
    expectTypeOf<Row["register"]>().toEqualTypeOf<"tu" | "vous" | "neutre">();
  });

  it("notifications : payload typé NotificationPayload (jsonb)", () => {
    type Row = typeof notifications.$inferSelect;
    expectTypeOf<Row["payload"]>().toEqualTypeOf<NotificationPayload | null>();
  });

  it("audit_logs : data typé AuditLogData (jsonb union) + action enum 22 valeurs", () => {
    type Row = typeof auditLogs.$inferSelect;
    expectTypeOf<Row["data"]>().toEqualTypeOf<AuditLogData | null>();
    // audit_action = 22 valeurs (cf. audit_log_v1.md).
    // - PR n°5 2026-05-21 : ajout A14 tender_defer + A15 tender_reject.
    // - PR feat/tandem-engine etape 1 2026-05-25 : ajout A16 architect_response
    //   (décision Board 2026-05-22 (b)).
    // - Migration Lot B 2026-05-25 : ajout A17 architect_edit + A18 architect_import
    //   + A19 architect_export (décision CTO Sophie).
    // - Migration Bloc C 2026-05-27 : ajout A20 library_doc_upload + A21
    //   library_doc_delete + A22 dce_download.
    expectTypeOf<Row["action"]>().toEqualTypeOf<
      | "login"
      | "membership_change"
      | "search_profile_change"
      | "tender_select"
      | "architect_solicit"
      | "dossier_diffuse"
      | "ai_run"
      | "odoo_opportunity_create"
      | "architect_change"
      | "rgpd_export"
      | "token_revoke"
      | "data_delete"
      | "access_attempt"
      | "tender_defer"
      | "tender_reject"
      | "architect_response"
      | "architect_edit"
      | "architect_import"
      | "architect_export"
      | "library_doc_upload"
      | "library_doc_delete"
      | "dce_download"
    >();
    // actor_role est nullable (snapshot)
    // Extension 2026-05-27 : ajout de 'superadmin' (rôle éditeur edifio).
    expectTypeOf<Row["actorRole"]>().toEqualTypeOf<
      "admin" | "user" | "viewer" | "superadmin" | null
    >();
  });

  it("learning_events : event_type enum learning_event_type", () => {
    type Row = typeof learningEvents.$inferSelect;
    expectTypeOf<Row["eventType"]>().toEqualTypeOf<"selected" | "rejected">();
  });

  it("aucune colonne jsonb ne dérive vers `any` ou `unknown` paresseux", () => {
    // Test garde-fou : si quelqu'un retire un .$type<>() sur une colonne jsonb,
    // ces assertions cassent en compile-time.
    type OrgOdoo = typeof organizations.$inferSelect.odooConfig;
    type ProfileKw = typeof searchProfiles.$inferSelect.keywords;
    type TenderRaw = typeof tenders.$inferSelect.rawData;
    type EventData = typeof tenderEvents.$inferSelect.data;
    type RunOut = typeof aiRuns.$inferSelect.output;
    type BrevoEv = typeof brevoMessages.$inferSelect.events;
    type NotifPl = typeof notifications.$inferSelect.payload;
    type AuditPl = typeof auditLogs.$inferSelect.data;

    expectTypeOf<OrgOdoo>().not.toBeAny();
    expectTypeOf<OrgOdoo>().not.toBeUnknown();
    expectTypeOf<ProfileKw>().not.toBeAny();
    expectTypeOf<ProfileKw>().not.toBeUnknown();
    expectTypeOf<TenderRaw>().not.toBeAny();
    expectTypeOf<TenderRaw>().not.toBeUnknown();
    expectTypeOf<EventData>().not.toBeAny();
    expectTypeOf<EventData>().not.toBeUnknown();
    expectTypeOf<RunOut>().not.toBeAny();
    expectTypeOf<RunOut>().not.toBeUnknown();
    expectTypeOf<BrevoEv>().not.toBeAny();
    expectTypeOf<BrevoEv>().not.toBeUnknown();
    expectTypeOf<NotifPl>().not.toBeAny();
    expectTypeOf<NotifPl>().not.toBeUnknown();
    expectTypeOf<AuditPl>().not.toBeAny();
    expectTypeOf<AuditPl>().not.toBeUnknown();
  });
});
