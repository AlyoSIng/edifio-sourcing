/**
 * Contrats TypeScript pour les colonnes jsonb — edifio Sourcing
 *
 * Source de vérité : `specs/schema_v1.sql` (8 colonnes jsonb identifiées) +
 * specs métier (`audit_log_v1.md`, `ai_prompts_v1.md`, `module_sourcing_engine_v1.md`).
 *
 * Convention : une interface par colonne, nommée `<Table><Column>` en PascalCase.
 * Chaque interface est appliquée côté schema Drizzle via `.$type<TenderRawData>()`
 * pour bénéficier d'un typage fort end-to-end (zéro `any`, zéro `unknown`).
 *
 * Note inventaire : la spec mentionnait « 9 colonnes jsonb » dans l'ADR-013,
 * mais le décompte exact sur `schema_v1.sql` donne 8 colonnes — cf. rapport
 * étape 3. Les 8 interfaces ci-dessous couvrent l'intégralité.
 */

// ============================================================================
// 1. organizations.odoo_config — config XML-RPC Odoo par tenant
// ============================================================================
/**
 * Référence Vault Supabase : les credentials Odoo (mot de passe API) NE SONT
 * JAMAIS stockés en clair dans cette colonne — seule la `credentials_vault_ref`
 * pointe vers le secret chiffré. Les autres champs sont publics côté tenant.
 *
 * `null` côté DB = Odoo désactivé pour cette organisation (cf. plan recette
 * Gate 7 — AlyoS recette n'a pas d'Odoo branché).
 */
export interface OrganizationOdooConfig {
  /** URL XML-RPC du serveur Odoo, ex. `https://erp.alyosingenierie.fr` */
  server_url: string;
  /** Nom de la base Odoo */
  database: string;
  /** Login API Odoo (email user technique) */
  api_user: string;
  /** Référence Vault Supabase pour l'API key — jamais en clair ici */
  credentials_vault_ref: string;
  /** Version Odoo détectée au handshake initial (ADR-004) */
  detected_version?: 17 | 18 | 19;
  /** Date du dernier handshake réussi */
  last_handshake_at?: string;
}

// ============================================================================
// 2. search_profiles.keywords — mots-clés positifs/négatifs/exacts
// ============================================================================
/**
 * Structure NOT NULL avec DEFAULT `'{"positive":[],"negative":[],"exact":[]}'`.
 * Cf. `module_sourcing_engine_v1.md` §3.5 (matchesProfile) — les trois listes
 * sont consultées par le moteur de matching à chaque AO sourcé.
 */
export interface SearchProfileKeywords {
  /** Au moins un doit matcher dans title OR objet AO (sauf liste vide) */
  positive: string[];
  /** Aucun ne doit matcher — un seul hit dans negative invalide l'AO */
  negative: string[];
  /** Expression exacte recherchée — bonus de +20 au score si match */
  exact: string[];
}

// ============================================================================
// 3. tenders.raw_data — payload brut du connecteur source
// ============================================================================
/**
 * Conservé pour debug + apprentissage moteur scoring (cf. spec sourcing engine).
 * Structure VARIABLE selon plateforme source (BOAMP API ≠ PLACE scraping).
 *
 * On garde un index discriminant `platform_code` + le payload brut typé large.
 * `record` correspond au JSON natif de l'Opendatasoft BOAMP ou au DOM extrait
 * pour les scrapers PLACE/Francmarchés/MP.info.
 *
 * Justification du `Record<string, unknown>` : la spec marque explicitement
 * `payload brut de la plateforme pour debug` (l.196 schema_v1.sql), et le
 * mapping vers `NormalizedTender` se fait dans `src/lib/sourcing/normalize.ts` —
 * pas ici. Garder un typage large à la frontière entrée est un choix assumé.
 */
export interface TenderRawData {
  /**
   * Plateforme source — clef discriminante pour parser ultérieurement.
   * `prive` : consultation manuelle saisie par un admin AlyoS (migration 0023).
   */
  platform_code: "boamp" | "place" | "francmarches" | "mp_info" | "prive";
  /** Payload brut tel que reçu de la plateforme — opaque côté DB */
  record: Record<string, unknown>;
  /** Timestamp ISO de capture côté connecteur */
  fetched_at: string;
  /** Hash de dé-doublonnage (cf. dedup.ts §3.4 spec sourcing engine) */
  dedup_hash?: string;
}

// ============================================================================
// 4. tender_events.data — payload contextualisé d'un événement métier AO
// ============================================================================
/**
 * Événements posés à chaque changement de statut tender ou action utilisateur.
 * Cf. `event_type` ∈ {sourced, selected, architect_solicited, dossier_diffuse,
 * submitted, won, lost, dropped, status_change, ...}.
 *
 * Le `data` jsonb porte le contexte spécifique à l'event_type. Structure
 * faiblement typée à dessein côté DB — Zod côté app valide par event_type
 * (équivalent du pattern audit_logs).
 */
export interface TenderEventData {
  /** Statut précédent (si event_type === 'status_change') */
  from_status?: string;
  /** Nouveau statut (si event_type === 'status_change') */
  to_status?: string;
  /** ID architecte concerné (si event_type === 'architect_solicited' etc.) */
  architect_id?: string;
  /** Score IA si event_type === 'sourced' */
  score?: number;
  /** Référence externe AO (snapshot, utile si suppression) */
  external_ref?: string;
  /** Texte libre éventuel (ex. motif de drop) */
  note?: string;
  /** Métadonnées additionnelles non typées (raison "data" libre côté spec) */
  extra?: Record<string, unknown>;
}

// ============================================================================
// 5. ai_runs.output — sortie structurée validée Zod d'un run Claude
// ============================================================================
/**
 * 12 prompts définis dans `ai_prompts_v1.md` (P1 à P12) avec chacun un schéma
 * Zod en sortie. L'output jsonb stocke le JSON validé.
 *
 * Plutôt que de typer une union discriminée des 12 schémas Zod (lourd à
 * maintenir et chaque ajout de prompt requiert update), on type avec :
 *  - `prompt_name` pour discriminer côté app
 *  - `payload` pour le JSON validé Zod (forme dépend du prompt)
 *  - `metadata` pour les tokens, hash, etc.
 *
 * La validation Zod stricte reste au moment de l'INSERT côté app
 * (cf. `output_schema_zod` dans `ai_prompts`).
 */
export interface AiRunOutput {
  /** Nom du prompt — discriminant pour parser `payload` côté app */
  prompt_name: string;
  /** Version du prompt (snapshot, utile si le prompt est dépublié) */
  prompt_version: number;
  /** Payload JSON validé par le schéma Zod du prompt — forme variable */
  payload: Record<string, unknown>;
  /** Métadonnées du run */
  metadata: {
    tokens_in: number;
    tokens_out: number;
    /** Hash SHA-256 de l'input pour idempotence + cache */
    input_hash: string;
  };
}

// ============================================================================
// 6. brevo_messages.events — historique webhook Brevo (delivered/opened/...)
// ============================================================================
/**
 * NOT NULL DEFAULT `'[]'`. Chaque webhook Brevo push un élément dans le tableau.
 * Statuts gérés : `delivered`, `opened`, `clicked`, `bounced`, `spam`, `unsub`,
 * `blocked`, `deferred`, `hardbounce`, `softbounce` (Brevo API v3).
 */
export interface BrevoMessageEvent {
  /** Type d'événement Brevo */
  event:
    | "delivered"
    | "opened"
    | "clicked"
    | "bounced"
    | "hardbounce"
    | "softbounce"
    | "spam"
    | "unsubscribed"
    | "blocked"
    | "deferred";
  /** Timestamp ISO 8601 de l'événement côté Brevo */
  occurred_at: string;
  /** URL cliquée si event === 'clicked' */
  link?: string;
  /** Raison du bounce si applicable */
  reason?: string;
  /** Adresse IP éventuelle (pour delivered/opened) */
  ip?: string;
  /** User-agent éventuel (pour opened/clicked) */
  user_agent?: string;
}

/**
 * Tableau d'événements stocké dans `brevo_messages.events`. NOT NULL côté DB,
 * jamais `null` côté TS — un message neuf a `[]`.
 */
export type BrevoMessageEvents = BrevoMessageEvent[];

// ============================================================================
// 7. notifications.payload — contexte d'une notification utilisateur
// ============================================================================
/**
 * Champ optionnel (nullable côté DB). Structure dépend du `notification_type`
 * (ex. `ao_du_jour`, `architect_responded`, `dossier_ready`).
 *
 * On type souplement : ce champ est consommé côté front pour afficher la
 * notification, mais reste interprété par type. La spec ne fournit pas de
 * schéma détaillé — TODO(spec) ci-dessous.
 */
export interface NotificationPayload {
  /** ID de l'AO concerné s'il y a lieu */
  tender_id?: string;
  /** ID architecte concerné s'il y a lieu */
  architect_id?: string;
  /** URL deeplink à ouvrir au clic */
  deeplink?: string;
  /** Compteur générique (ex. nb d'AO du jour) */
  count?: number;
  // TODO(spec): détailler les payloads par notification_type une fois la
  // spec UI notifications figée (Gate 7 — attente arbitrage CMO Léa sur le
  // wording exact des 8+ notifications utilisateur).
  extra?: Record<string, unknown>;
}

// ============================================================================
// 9. learning_events.payload — snapshot tender au moment du rejet (Salve U)
// ============================================================================
/**
 * Snapshot du tender capturé au moment où l'utilisateur écarte un AO avec un
 * motif structuré (migration 0050, branche feat/learning-ecartement).
 *
 * Sert à agréger les suggestions d'ajustement du profil de recherche sans
 * re-fetch des tenders (les tenders peuvent évoluer ou être purgés). Tous les
 * champs sont optionnels : le snapshot est best-effort à partir de
 * `lockAndFetchTender` côté `rejectTenderAction`.
 *
 * Distinction sémantique : alimenté UNIQUEMENT par « Écarter »
 * (`rejectTenderAction`), jamais par « Exclure » (`excludeTenderAction` reste
 * neutre, zéro effet algo).
 */
export interface LearningEventPayload {
  /** Acheteur (snapshot `tenders.buyer`) */
  buyer?: string;
  /** Codes CPV principaux + secondaires (snapshot `tenders.cpv`) */
  cpv_codes?: string[];
  /** Département du lieu d'exécution (snapshot `tenders.department`, ex. "13") */
  geo_zone?: string | null;
  /** Montant estimé (snapshot `tenders.amount`, numeric → number) */
  amount?: number | null;
}

// ============================================================================
// 10. audit_logs.data — payload détaillé par action (13 schémas)
// ============================================================================
/**
 * Cf. `audit_log_v1.md` — 13 actions × payload spécifique. On type une union
 * discriminée par `audit_action` côté `AuditLogData`, mais la colonne stocke
 * un sous-objet anonyme : on garde donc une forme « payload libre » avec une
 * remontée au cas par cas. La validation Zod se fait côté app avant INSERT.
 *
 * Pour rester typé fort et exploiter le mapping, on déclare 13 interfaces
 * filles puis une union — Drizzle accepte les types complexes en `$type<>()`.
 */

export interface AuditLogDataLogin {
  method: "email_password" | "magic_link";
  success: boolean;
  session_id?: string;
}

export interface AuditLogDataMembershipChange {
  target_user_id: string;
  target_email: string;
  /** Extension 2026-05-27 : ajout de 'superadmin' (rôle éditeur edifio). */
  from_role?: "admin" | "user" | "viewer" | "superadmin";
  to_role?: "admin" | "user" | "viewer" | "superadmin";
  /**
   * `regenerate_provisional` ajouté 2026-05-20 par [DEV Alex],
   * **validé CTO Sophie 2026-05-20** via
   * `handoff/ANSWER_260520_1810_ETENDRE_A2_OPERATION_REGEN.md`. Couvre le
   * bouton « Renvoyer » admin qui regénère le mot de passe provisoire
   * d'un user existant sans changer son rôle (convention :
   * `from_role === to_role` quand `operation === "regenerate_provisional"`).
   */
  operation: "invite" | "update" | "revoke" | "regenerate_provisional";
}

export interface AuditLogDataSearchProfileChange {
  profile_id: string;
  profile_name: string;
  operation: "create" | "update" | "delete" | "activate" | "deactivate";
  diff?: Record<string, [unknown, unknown]>;
}

export interface AuditLogDataTenderSelect {
  tender_id: string;
  tender_ref: string;
  mode: "solo" | "tandem" | "conception_realisation";
  score: number;
}

export interface AuditLogDataArchitectSolicit {
  tender_id: string;
  architect_id: string;
  architect_email: string;
  register: "tu" | "vous";
  template_name: string;
  brevo_message_id: string;
}

export interface AuditLogDataDossierDiffuse {
  tender_id: string;
  architect_id: string;
  diffuser_role: "admin" | "user";
  admin_notified: boolean;
  files_count: number;
  brevo_message_id: string;
}

export interface AuditLogDataAiRun {
  prompt_name: string;
  prompt_version: number;
  model: "sonnet-4-6" | "haiku-4-5";
  tender_id?: string;
  cost_usd: number;
  latency_ms: number;
  succeeded: boolean;
  tokens_in: number;
  tokens_out: number;
}

export interface AuditLogDataOdooOpportunityCreate {
  tender_id: string;
  odoo_id: number;
  odoo_stage: string;
  trigger: "selected_solo" | "architect_accepted" | "manual";
}

export interface AuditLogDataArchitectChange {
  architect_id: string;
  operation: "create" | "update" | "delete" | "bulk_import";
  diff?: Record<string, [unknown, unknown]>;
}

export interface AuditLogDataRgpdExport {
  scope: "organization" | "user";
  rows_exported: number;
  tables_included: string[];
  format: "json" | "csv";
  size_bytes: number;
}

export interface AuditLogDataTokenRevoke {
  token_jwt_id: string;
  tender_id: string;
  architect_id: string;
  reason:
    | "manual_admin_revocation"
    | "tender_cancelled"
    | "architect_request"
    | "suspicious_activity";
}

export interface AuditLogDataDataDelete {
  target_table: string;
  target_id: string;
  soft_delete: boolean;
  reason: string;
  approval_board_ref?: string;
}

export interface AuditLogDataAccessAttempt {
  pathname: string;
  allowed: boolean;
  email_domain: string;
  method: string;
  denied_reason?: "no_session" | "domain_not_alyosingenierie" | "session_expired" | "token_revoked";
}

/**
 * A14 — `tender_defer` (PR n°5, 2026-05-21).
 *
 * Cf. `specs/audit_log_v1.md` §A14 + `src/lib/audit/schemas.ts` (tenderDeferSchema).
 */
export interface AuditLogDataTenderDefer {
  tender_id: string;
  tender_ref: string;
  deferred_until: string;
  hours_offset: number;
}

/**
 * A15 — `tender_reject` (PR n°5, 2026-05-21).
 *
 * `reason` et `score_at_reject` sont nullables — l'utilisateur peut rejeter
 * sans motif, et un AO peut ne pas avoir de score au moment du rejet.
 *
 * Cf. `specs/audit_log_v1.md` §A15 + `src/lib/audit/schemas.ts` (tenderRejectSchema).
 */
export interface AuditLogDataTenderReject {
  tender_id: string;
  tender_ref: string;
  reason: string | null;
  score_at_reject: number | null;
}

/**
 * A16 — `architect_response` (PR `feat/tandem-engine` etape 1, 2026-05-25).
 *
 * Tracé chaque réponse architecte (accepted/declined/info_requested) reçue
 * via la page tokenisée publique `/archi/[token]` (cas standard) ou saisie
 * manuellement par admin (fallback hors-canal, `via_token = false`).
 *
 * Décision Board 2026-05-22 (b) — code A16 alloué.
 * Cf. `specs/audit_log_v1.md` §A16 + Zod schema à ajouter à
 * `src/lib/audit/schemas.ts` lors de l'étape 5 du plan Tandem (page
 * tokenisée publique).
 */
export interface AuditLogDataArchitectResponse {
  tender_id: string;
  tender_ref: string;
  architect_id: string;
  architect_email: string;
  response_status: "accepted" | "declined" | "info_requested";
  via_token: boolean;
  /** `jti` du JWT tokenisé — null si via_token = false (saisie admin). */
  token_jti: string | null;
  /** Texte libre architecte si response_status = 'info_requested', max 1000 chars. */
  info_request_text: string | null;
  responded_at: string;
}

/**
 * A20 — `library_doc_upload` (Bloc C, 2026-05-27).
 *
 * Cf. `src/lib/audit/schemas.ts` (libraryDocUploadSchema).
 * Émise après upload réussi vers Supabase Storage + INSERT BDD dans
 * `cotraitant_documents` ou `be_documents`.
 */
export interface AuditLogDataLibraryDocUpload {
  subject_type: "cotraitant" | "bureau_etudes";
  subject_id: string;
  kind: string;
  file_name: string;
  size_bytes: number;
  storage_path: string;
}

/**
 * A21 — `library_doc_delete` (Bloc C, 2026-05-27).
 *
 * Cf. `src/lib/audit/schemas.ts` (libraryDocDeleteSchema).
 * Émise après suppression Storage + BDD d'une pièce bibliothèque.
 * `storage_path` conservé comme trace même si la suppression Storage
 * best-effort a échoué.
 */
export interface AuditLogDataLibraryDocDelete {
  subject_type: "cotraitant" | "bureau_etudes";
  subject_id: string;
  document_id: string;
  kind: string;
  storage_path: string;
}

/**
 * A22 — `dce_download` (Bloc C, 2026-05-27).
 *
 * Cf. `src/lib/audit/schemas.ts` (dceDownloadSchema).
 * Émise par `trackDceDownload` quand un utilisateur accède au lien DCE/RC.
 * `dce_url` loguée pour investigation — ne contient jamais de credentials.
 * `download_status` : résultat de la tentative côté server action.
 */
export interface AuditLogDataDceDownload {
  tender_id: string;
  tender_ref: string;
  dce_url: string;
  download_status: "success" | "failed_ssrf" | "failed_fetch" | "no_url";
}

/**
 * Union discriminée fonctionnelle côté app via le champ `action` (colonne
 * dédiée de la table, pas dans le jsonb). On expose ici un type union plat
 * pour le `.$type<>()` Drizzle.
 */
export type AuditLogData =
  | AuditLogDataLogin
  | AuditLogDataMembershipChange
  | AuditLogDataSearchProfileChange
  | AuditLogDataTenderSelect
  | AuditLogDataArchitectSolicit
  | AuditLogDataDossierDiffuse
  | AuditLogDataAiRun
  | AuditLogDataOdooOpportunityCreate
  | AuditLogDataArchitectChange
  | AuditLogDataRgpdExport
  | AuditLogDataTokenRevoke
  | AuditLogDataDataDelete
  | AuditLogDataAccessAttempt
  | AuditLogDataTenderDefer
  | AuditLogDataTenderReject
  | AuditLogDataArchitectResponse
  | AuditLogDataLibraryDocUpload
  | AuditLogDataLibraryDocDelete
  | AuditLogDataDceDownload;
