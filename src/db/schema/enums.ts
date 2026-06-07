/**
 * Enums Postgres — edifio Sourcing
 *
 * Source de vérité : `specs/schema_v1.sql` + ADR-013 (specs/adr_013_orm_drizzle.md).
 *
 * Convention : nom Postgres en lowercase snake_case, identifiant TS en camelCase.
 * Toutes les valeurs sont en lowercase strict (jamais 'Sourcing' / 'STUDIO').
 *
 * Étape 2 du plan Gate 6 — Option A : la migration 0000_init.sql ne pose que
 * l'enum `subscription_tier` (single-purpose). Les 21+ tables et les 11 enums
 * restants arrivent à l'étape 3 dans la migration 0001_schema_v1.sql.
 */

import { pgEnum } from "drizzle-orm/pg-core";

/**
 * subscription_tier — palier de souscription d'une organisation cliente.
 *
 * Valeurs figées par le CTO :
 *   - sourcing    : palier d'entrée, module Sourcing seul
 *   - cotraitance : palier intermédiaire, ajout de la cotraitance architectes
 *   - studio      : palier complet (DEFAULT pour AlyoS Ingénierie au MVP)
 *
 * La colonne `organizations.subscription_tier` (NOT NULL, DEFAULT 'studio')
 * et l'index `idx_organizations_tier` seront créés à l'étape 3 (migration 0001).
 */
export const subscriptionTier = pgEnum("subscription_tier", ["sourcing", "cotraitance", "studio"]);

/**
 * membership_role — rôle d'un user dans une organisation.
 * superadmin : rôle éditeur edifio — réservé à sebastien@edifio.fr (unique
 *              depuis Steve 2026-06-05 — facturation AlyoS désormais active).
 *              Inclut tous les droits admin + accès au module /sourcing/superadmin
 *              (support, news, formations, tests guidés, contenu app).
 * admin      : full access (admin pages, audit logs, gestion membres)
 * user       : usage standard (sélection AO, sollicitation archis, dossier)
 * viewer     : lecture seule
 */
export const membershipRole = pgEnum("membership_role", ["admin", "user", "viewer", "superadmin"]);

/**
 * platform_code — plateforme source d'un AO public BTP.
 * 4 plateformes intégrées au MVP (cf. spec module_sourcing_engine_v1).
 * `prive` : consultations privées / gré à gré créées manuellement par l'utilisateur
 *           (ajouté migration 0023 — feat/boamp-dce-ao-manuel 2026-05-27).
 */
export const platformCode = pgEnum("platform_code", [
  "boamp",
  "place",
  "francmarches",
  "mp_info",
  "prive",
]);

/**
 * auth_type — type d'authentification du connecteur plateforme.
 * api_key       : BOAMP (clef Opendatasoft)
 * oauth         : réservé futurs connecteurs
 * login_password: PLACE (scraping authentifié)
 * none          : Francmarchés, MP.info (scraping public)
 */
export const authType = pgEnum("auth_type", ["api_key", "oauth", "login_password", "none"]);

/**
 * partnership_status — relation commerciale architecte.
 *
 * **OBSOLÈTE 2026-05-25** (PR `feat/tandem-engine` étape 1) : la colonne
 * `architects.partnership_status` a été supprimée par la refonte propre
 * (décision Board 2026-05-22 (a)). L'enum Postgres reste défini pour ne
 * pas casser l'historique des snapshots/migrations, mais n'est plus
 * référencé par aucune table. Suppression dure dans une migration
 * ultérieure (post-MVP).
 */
export const partnershipStatus = pgEnum("partnership_status", ["actif", "inactif", "prospect"]);

/**
 * tender_status — 14 statuts du cycle de vie d'un AO (Gate 4).
 * Ordre logique : sourced → selected → architect/dossier → submitted → won|lost|dropped.
 */
export const tenderStatus = pgEnum("tender_status", [
  "sourced",
  "selected_solo",
  "selected_tandem",
  "awaiting_architect",
  "architect_accepted",
  "architect_declined",
  "architect_info_requested",
  "dossier_review_required",
  "dossier_ready",
  "dossier_diffused",
  "submitted",
  "won",
  "lost",
  "dropped",
]);

/**
 * selection_mode — mode de réponse choisi pour un AO.
 * solo                  : réponse en propre / mandataire seul (Mode 1 historique)
 * tandem                : cotraitance avec architecte (Mode 2 historique)
 * conception_realisation: groupement conception-réalisation (ajouté PR feat/modal-mandataire-cr)
 */
export const selectionMode = pgEnum("selection_mode", ["solo", "tandem", "conception_realisation"]);

/**
 * architect_response_status — état de la réponse architecte à une sollicitation.
 */
export const architectResponseStatus = pgEnum("architect_response_status", [
  "pending",
  "accepted",
  "declined",
  "info_requested",
]);

/**
 * ai_model — modèles Anthropic utilisés (Gate 2 arbitrage 4/A).
 * sonnet-4-6 : tâches longues / structurées (P1, P2, P3)
 * haiku-4-5  : tâches courtes / pré-classification (P4 à P12)
 */
export const aiModel = pgEnum("ai_model", ["sonnet-4-6", "haiku-4-5"]);

/**
 * brevo_register — registre de communication architecte.
 * tu     : tutoiement (Gate 4 — colonne `architects.tutoiement = TRUE`)
 * vous   : vouvoiement (DEFAULT — Gate 4 directive Board)
 * neutre : pour communications non personnelles (système, notifications)
 */
export const brevoRegister = pgEnum("brevo_register", ["tu", "vous", "neutre"]);

/**
 * audit_action — 19 actions sensibles tracées en audit log immutable.
 * Cf. `specs/audit_log_v1.md` pour les payloads détaillés par action.
 *
 * NB : `tender_defer` et `tender_reject` ajoutés à la fin du tableau par
 * PR n°5 (2026-05-21). `architect_response` ajouté à la fin par PR
 * `feat/tandem-engine` étape 1 (2026-05-25, décision Board 2026-05-22 (b)
 * code A16 alloué). Cet ordre se reflète dans le SQL côté Drizzle
 * sous forme de `ALTER TYPE audit_action ADD VALUE 'tender_defer'`
 * puis `ALTER TYPE audit_action ADD VALUE 'tender_reject'` puis
 * `ALTER TYPE audit_action ADD VALUE 'architect_response'` — l'ordre
 * d'ajout est important car `ALTER TYPE ... ADD VALUE` ne peut pas
 * tourner dans une transaction Postgres (cf. migration 0004 et 0005).
 *
 * `architect_edit`, `architect_import`, `architect_export` ajoutés par
 * migration Lot B (2026-05-25, décision CTO Sophie) — codes A17, A18, A19.
 * Actions admin uniquement : édition fiche, import CSV, export CSV.
 *
 * `library_doc_upload`, `library_doc_delete`, `dce_download` ajoutés par
 * migration 0021 (Bloc C, 2026-05-27) — codes A20, A21, A22.
 * A20 : upload pièce bibliothèque cotraitant/BE (admin).
 * A21 : suppression pièce bibliothèque cotraitant/BE (admin).
 * A22 : téléchargement DCE/RC depuis l'annonce (tous rôles authentifiés).
 * L'ordre d'ajout est important — `ALTER TYPE ... ADD VALUE` ne peut pas
 * tourner dans une transaction Postgres (cf. migration 0021).
 */
export const auditAction = pgEnum("audit_action", [
  "login",
  "membership_change",
  "search_profile_change",
  "tender_select",
  "architect_solicit",
  "dossier_diffuse",
  "ai_run",
  "odoo_opportunity_create",
  "architect_change",
  "rgpd_export",
  "token_revoke",
  "data_delete",
  "access_attempt",
  "tender_defer",
  "tender_reject",
  "architect_response",
  "architect_edit",
  "architect_import",
  "architect_export",
  "library_doc_upload",
  "library_doc_delete",
  "dce_download",
]);

/**
 * learning_event_type — événement d'apprentissage du moteur de scoring.
 * selected : l'utilisateur a sélectionné un AO → signal positif
 * rejected : l'utilisateur a rejeté un AO → signal négatif (motif analysé par IA)
 */
export const learningEventType = pgEnum("learning_event_type", ["selected", "rejected"]);
