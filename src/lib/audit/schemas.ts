/**
 * Schémas Zod par action — helper audit log edifio Sourcing.
 *
 * Source de vérité : `specs/audit_log_v1.md` §A1-A13 (payloads détaillés).
 *
 * Pourquoi un fichier dédié ?
 *  - Séparation responsabilités : ce fichier ne dépend QUE de Zod, donc
 *    testable hors contexte Supabase / Drizzle (cf. `schemas.test.ts`).
 *  - Le helper `audit()` (cf. `./index.ts`) consomme la map `AUDIT_SCHEMAS`
 *    pour valider le payload avant INSERT — typing via discriminated lookup.
 *
 * Périmètre PR #2 :
 *  - **A4 `tender_select`** est implémenté en strict — c'est l'action
 *    déclenchée par la prochaine PR (sélection AO dans « AO du jour »).
 *  - Les **12 autres actions** sont déclarées en placeholder
 *    `z.object({}).passthrough()` pour exposer dès maintenant la surface
 *    générique du helper (`audit<'membership_change'>({...})` typo-check à
 *    la compilation). Les schémas stricts arrivent dans les PR qui
 *    déclenchent l'action correspondante.
 *
 * Toute action ajoutée ici DOIT :
 *  1. exister dans l'enum Postgres `audit_action` (cf. `enums.ts`)
 *  2. être documentée dans `specs/audit_log_v1.md`
 *  3. avoir un test positif + négatif dans `schemas.test.ts` quand implémentée
 *    en strict (placeholder = 1 test smoke uniquement).
 */

import { z } from "zod";

// ============================================================================
// 1. Union literal des 13 actions — aligné enum Postgres `audit_action`
// ============================================================================

/**
 * Liste fermée des 19 actions sensibles tracées en audit log.
 *
 * IMPORTANT : tout ajout ici nécessite :
 *  - bump du payload spec `audit_log_v1.md`
 *  - ALTER TYPE audit_action ADD VALUE ... dans une nouvelle migration
 *  - ajout du schéma Zod ci-dessous (placeholder ou strict)
 *
 * **Alignement strict avec enum Postgres `audit_action`** (cf.
 * `src/db/schema/enums.ts`). L'ordre doit être identique pour que les
 * snapshots Drizzle soient déterministes — `tender_defer` et `tender_reject`
 * en fin de liste comme dans la migration 0004 (PR n°5, 2026-05-21).
 */
export const AUDIT_ACTIONS = [
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
  // A16 — `architect_response` (Tandem étape 1, décision Board 2026-05-22 (b)).
  // Émis par POST /api/archi/[token]/respond (étape 4) — l'acteur est
  // l'architecte via JWT, pas un user AlyoS authentifié. Schéma strict ci-dessous.
  "architect_response",
  // A17-A19 — codes admin architectes (migration Lot B, 2026-05-25, décision CTO Sophie).
  // `architect_edit`   : modification d'une fiche architecte par un admin.
  // `architect_import` : import CSV en masse par un admin.
  // `architect_export` : export CSV par un admin (tracé RGPD art. 20).
  "architect_edit",
  "architect_import",
  "architect_export",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// ============================================================================
// 2. Schémas Zod — A4 strict, les 12 autres en placeholder
// ============================================================================

/**
 * Placeholder réutilisable pour les actions pas encore implémentées en strict.
 *
 * `passthrough()` autorise n'importe quel champ — on conserve donc la donnée
 * brute sans la rejeter. Le test smoke (`schemas.test.ts`) vérifie juste que
 * le placeholder accepte un objet vide ET un objet avec champs arbitraires.
 *
 * TODO(PR ultérieures) : remplacer chaque placeholder par le schéma strict
 * quand la PR qui déclenche l'action est mergée. Cf. JSDoc en-tête.
 */
const placeholder = z.object({}).passthrough();

/**
 * Regex UUID « shape-only » (8-4-4-4-12 hex), volontairement plus permissive
 * que `z.string().uuid()` de Zod 4 qui exige variante RFC 4122 stricte
 * (`[1-8]` version + `[89abAB]` variant). Les UUIDs côté Postgres sont
 * générés par `uuid_generate_v4()` (v4 strict) mais nous voulons accepter
 * aussi les UUIDs de test/déterministes (ex. `11111111-...`) sans rendre
 * la validation Zod inutilisable.
 *
 * Source v4 stricte rejetée volontairement : on n'a aucune valeur ajoutée
 * à imposer la variante côté audit (la BDD le fait déjà via la colonne
 * `uuid` typée Postgres). Déclarée ici (avant A3) car partagée par
 * `searchProfileChangeSchema` (A3) + `tenderSelectSchema` (A4) +
 * `tenderDeferSchema` (A14) + `tenderRejectSchema` (A15).
 */
const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * A1 — `login` (placeholder)
 *
 * Spec : `{ method, success, session_id? }`.
 * Déclenchée par la PR auth callback Supabase (déjà mergée mais l'audit
 * n'a pas encore été branché côté `auth/callback/route.ts`).
 *
 * TODO: implémenter à la PR qui branche audit sur le callback Supabase Auth.
 */
const loginSchema = placeholder;

/**
 * A2 — `membership_change` (STRICT — implémenté par la PR auth-password-pivot).
 *
 * Couvre 4 sous-cas d'`operation` :
 *  - `invite` : admin crée un nouveau collaborateur AlyoS via `POST /api/admin/users`.
 *    `from_role` omis (le user n'existe pas avant), `to_role` = rôle assigné.
 *  - `update` : admin modifie le rôle d'un user existant (interface admin Gate 7).
 *    `from_role` ≠ `to_role`.
 *  - `revoke` : admin retire un user (interface admin Gate 7+).
 *    `to_role` omis (perte de membership).
 *  - `regenerate_provisional` : bouton « Renvoyer » admin sur un user existant
 *    via `POST /api/admin/users/[id]/regenerate-password`. Convention validée
 *    CTO Sophie 2026-05-20 (cf. `handoff/ANSWER_260520_1810_*.md`) :
 *    `from_role === to_role` (pas de changement de rôle, juste rotation du
 *    credential provisoire). Le password régénéré n'est **JAMAIS** loggué
 *    (invariant `src/lib/auth/password-server.ts`).
 *
 * Contraintes :
 *  - `target_user_id` : UUID shape (regex inline `8-4-4-4-12` hex —
 *    permissif v4-strict vs déterministes de test, cf. `UUID_SHAPE`
 *    plus bas réutilisé par A4).
 *  - `target_email` : email simple (regex non-RFC, suffisant pour audit).
 *  - `from_role` / `to_role` : optionnels selon l'opération, enum
 *    `admin | user | viewer` aligné sur `membership_role` Postgres.
 *  - `operation` : enum strict 4 valeurs.
 */
const membershipChangeSchema = z.object({
  target_user_id: z
    .string()
    .regex(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
      "target_user_id doit être un UUID",
    ),
  target_email: z
    .string()
    .min(3)
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "email invalide"),
  from_role: z.enum(["admin", "user", "viewer"]).optional(),
  to_role: z.enum(["admin", "user", "viewer"]).optional(),
  operation: z.enum(["invite", "update", "revoke", "regenerate_provisional"]),
});

/**
 * A3 — `search_profile_change` (STRICT — implémenté P2 Gate 6, 2026-05-22).
 *
 * Déclenchée par la Server Action `updateProfileAction`
 * (`src/app/sourcing/admin/profil/actions.ts`). V1 ne couvre que l'opération
 * `update` (l'édition du profil unique AlyoS — Q2 Board 22/05). Les autres
 * opérations (`create | delete | activate | deactivate`) restent acceptées
 * par le schéma pour anticiper la PR Phase 2 multi-profils — pas besoin
 * d'ALTER de l'enum côté code.
 *
 * Contraintes :
 *  - `profile_id` : UUID shape (cf. `UUID_SHAPE`)
 *  - `profile_name` : non vide, snapshot (utile post-suppression de profil)
 *  - `operation` : enum strict 5 valeurs alignées spec `audit_log_v1.md` §A3
 *  - `diff` : optionnel, map `field → [before, after]`. On reste permissif
 *    sur le type des valeurs (`z.unknown()`) car le diff couvre des arrays,
 *    des objets `keywords` JSONB, des montants `numeric` Postgres (string)
 *    et des nullables — typer plus strictement coûterait sans vraie valeur
 *    pour l'audit (relecture humaine). La spec dit `Record<string, [unknown,
 *    unknown]>` côté `AuditLogDataSearchProfileChange` (cf.
 *    `src/db/types/jsonb.ts:247`).
 */
const searchProfileChangeSchema = z.object({
  profile_id: z.string().regex(UUID_SHAPE, { message: "profile_id doit être un UUID" }),
  profile_name: z.string().min(1, { message: "profile_name ne peut pas être vide" }),
  operation: z.enum(["create", "update", "delete", "activate", "deactivate"]),
  diff: z.record(z.string(), z.tuple([z.unknown(), z.unknown()])).optional(),
});

/**
 * A4 — `tender_select` (STRICT — implémenté PR #2).
 *
 * Déclenchée quand un utilisateur sélectionne un AO dans « AO du jour »
 * (mode solo ou tandem). C'est la première action audit live du module
 * sourcing.
 *
 * Contraintes :
 *  - `tender_id` : UUID v4 valide (FK logique vers `tenders.id`)
 *  - `tender_ref` : non vide (externalRef BOAMP, ex. `25-AO-00142`)
 *  - `mode` : enum strict `solo | tandem` (cf. enum Postgres `selection_mode`)
 *  - `score` : entier 0-100 (contrainte CHECK BDD côté `tenders.score`)
 *
 * (Regex `UUID_SHAPE` partagée — déclarée plus haut, juste après `placeholder`.)
 */
const tenderSelectSchema = z.object({
  tender_id: z.string().regex(UUID_SHAPE, { message: "tender_id doit être un UUID" }),
  tender_ref: z.string().min(1, { message: "tender_ref ne peut pas être vide" }),
  mode: z.enum(["solo", "tandem"]),
  score: z.number().int().min(0).max(100),
});

/**
 * A5 — `architect_solicit` (STRICT — implémenté Tandem étape 3, 2026-05-24).
 *
 * Déclenchée par la Server Action `sendArchitectSolicitation` quand un user
 * AlyoS envoie un mail Brevo de sollicitation à un architecte pour un AO en
 * mode Tandem. C'est la 1re des deux actions audit du workflow Tandem
 * (la 2e étant A16 `architect_response` quand l'archi répond).
 *
 * Contraintes :
 *  - `tender_id`, `architect_id` : UUID shape (cf. `UUID_SHAPE`)
 *  - `template_name` : string non vide (ex. `architect_solicitation_TU`)
 *  - `register` : enum strict `tu | vous`
 *  - `brevo_message_id` : optionnel — peut être absent si l'envoi a échoué
 *    (la Server Action insère quand même la trace BDD pour retry futur)
 *  - `token_jti` : optionnel — `jti` du JWT architecte généré pour cette
 *    sollicitation (présent en succès, absent en échec pré-token)
 */
const architectSolicitSchema = z.object({
  tender_id: z.string().regex(UUID_SHAPE, { message: "tender_id doit être un UUID" }),
  architect_id: z.string().regex(UUID_SHAPE, { message: "architect_id doit être un UUID" }),
  template_name: z.string().min(1, { message: "template_name ne peut pas être vide" }),
  register: z.enum(["tu", "vous"]),
  brevo_message_id: z.string().optional(),
  token_jti: z.string().optional(),
});

/**
 * A6 — `dossier_diffuse` (placeholder)
 * TODO: implémenter à la PR diffusion dossier acheteur public.
 */
const dossierDiffuseSchema = placeholder;

/**
 * A7 — `ai_run` (placeholder)
 * TODO: implémenter à la PR scoring IA Haiku (PR #7).
 */
const aiRunSchema = placeholder;

/**
 * A8 — `odoo_opportunity_create` (placeholder)
 * TODO: implémenter à la PR sync Odoo XML-RPC.
 */
const odooOpportunityCreateSchema = placeholder;

/**
 * A9 — `architect_change` (placeholder)
 * TODO: implémenter à la PR CRUD architectes + import bulk.
 */
const architectChangeSchema = placeholder;

/**
 * A10 — `rgpd_export` (placeholder)
 * TODO: implémenter à la PR RGPD export.
 */
const rgpdExportSchema = placeholder;

/**
 * A11 — `token_revoke` (placeholder)
 * TODO: implémenter à la PR tokens architectes (page tokenisée).
 */
const tokenRevokeSchema = placeholder;

/**
 * A12 — `data_delete` (placeholder)
 * TODO: implémenter à la PR RGPD droit à l'oubli.
 */
const dataDeleteSchema = placeholder;

/**
 * A13 — `access_attempt` (placeholder)
 *
 * NB : déjà émis par le middleware `middleware.ts` côté allowed=false. Le
 * branchement audit a été reporté à une PR dédiée car le middleware tourne
 * en Edge Runtime (pas d'accès au client Supabase service_role en l'état) —
 * cf. note de suivi `CC_260514_AUDIT_ACCESS_ATTEMPT.md`.
 *
 * TODO: implémenter à la PR audit Edge Runtime.
 */
const accessAttemptSchema = placeholder;

/**
 * A14 — `tender_defer` (STRICT — implémenté PR n°5, Arbitrage Board B 2026-05-21).
 *
 * Déclenchée quand un utilisateur clique « Différer » sur une `TenderCard`.
 * L'AO reste `status='sourced'` mais est exclu de la vue « AO du jour »
 * jusqu'à expiration de `deferred_until` (cf. filtre `getTendersOfTheDay`).
 *
 * Contraintes :
 *  - `tender_id` : UUID shape (cf. `UUID_SHAPE` réutilisé depuis A4)
 *  - `tender_ref` : non vide (externalRef snapshot)
 *  - `deferred_until` : ISO 8601 datetime (résultante calculée `now() + offset`)
 *  - `hours_offset` : entier positif (V1 fixe à 24, extensible Phase 2)
 */
const tenderDeferSchema = z.object({
  tender_id: z.string().regex(UUID_SHAPE, { message: "tender_id doit être un UUID" }),
  tender_ref: z.string().min(1, { message: "tender_ref ne peut pas être vide" }),
  deferred_until: z
    .string()
    .datetime({ message: "deferred_until doit être ISO 8601 (ex. 2026-05-22T06:30:00.000Z)" }),
  hours_offset: z
    .number()
    .int({ message: "hours_offset doit être entier" })
    .positive({ message: "hours_offset doit être strictement positif" }),
});

/**
 * A15 — `tender_reject` (STRICT — implémenté PR n°5, Arbitrage Board A 2026-05-21).
 *
 * Déclenchée quand un utilisateur clique « Rejeter » sur une `TenderCard` puis
 * confirme via la modale `RejectReasonModal`. L'AO bascule `status='dropped'`.
 * Le motif libre `reason` (max 280 chars, nullable) alimente le bloc
 * apprentissage IA scoring — signal négatif explicite, distinct du simple
 * différé (A14).
 *
 * Contraintes :
 *  - `tender_id` : UUID shape (cf. `UUID_SHAPE`)
 *  - `tender_ref` : non vide
 *  - `reason` : string max 280 chars OU null (Arbitrage Board C 2026-05-21,
 *    motif optionnel)
 *  - `score_at_reject` : entier 0-100 OU null (un AO non scoré peut être
 *    rejeté avant calcul de score — robustesse)
 */
const tenderRejectSchema = z.object({
  tender_id: z.string().regex(UUID_SHAPE, { message: "tender_id doit être un UUID" }),
  tender_ref: z.string().min(1, { message: "tender_ref ne peut pas être vide" }),
  reason: z.string().max(280, { message: "reason ne peut pas dépasser 280 caractères" }).nullable(),
  score_at_reject: z
    .number()
    .int({ message: "score_at_reject doit être entier" })
    .min(0, { message: "score_at_reject doit être >= 0" })
    .max(100, { message: "score_at_reject doit être <= 100" })
    .nullable(),
});

/**
 * A17 — `architect_edit` (placeholder)
 *
 * Déclenchée quand un admin modifie une fiche architecte (save du formulaire
 * d'édition). Périmètre : champs de la table `architects`.
 *
 * TODO: implémenter en strict à la PR CRUD architectes.
 */
const architectEditSchema = placeholder;

/**
 * A18 — `architect_import` (placeholder)
 *
 * Déclenchée par un import CSV en masse (bouton « Importer » admin).
 * Payload attendu : `{ file_name, row_count, upserted_count, error_count }`.
 *
 * TODO: implémenter en strict à la PR import bulk architectes.
 */
const architectImportSchema = placeholder;

/**
 * A19 — `architect_export` (placeholder)
 *
 * Déclenchée par un export CSV (bouton « Exporter » admin). Tracé RGPD art. 20.
 * Payload attendu : `{ row_count, filters }`.
 *
 * TODO: implémenter en strict à la PR export architectes.
 */
const architectExportSchema = placeholder;

/**
 * A16 — `architect_response` (STRICT — Tandem étape 1+3, code alloué Board
 * 2026-05-22 (b)).
 *
 * Déclenchée par POST /api/archi/[token]/respond — l'architecte répond à
 * une sollicitation via la page tokenisée publique. L'acteur n'est PAS un
 * user AlyoS authentifié : c'est l'architecte via JWT (cf. JSDoc enum
 * `auditAction` dans `src/db/schema/enums.ts`). Les champs `actor_*` du
 * helper `audit()` resteront NULL pour cette action (gérés côté helper).
 *
 * Contraintes :
 *  - `tender_id`, `architect_id` : UUID shape
 *  - `status` : enum strict `accepted | declined | info_requested`
 *    (jamais `pending` — pending est l'état initial, pas une réponse)
 *  - `token_jti` : string non vide (claim `jti` du JWT — traçabilité)
 *  - `has_info_request_text` : booléen (présence de texte libre, sans le
 *    contenu — RGPD-friendly, on évite de dupliquer le texte dans l'audit)
 */
const architectResponseSchema = z.object({
  tender_id: z.string().regex(UUID_SHAPE, { message: "tender_id doit être un UUID" }),
  architect_id: z.string().regex(UUID_SHAPE, { message: "architect_id doit être un UUID" }),
  status: z.enum(["accepted", "declined", "info_requested"]),
  token_jti: z.string().min(1, { message: "token_jti ne peut pas être vide" }),
  has_info_request_text: z.boolean(),
});

// ============================================================================
// 3. Map action → schéma Zod
// ============================================================================

/**
 * Lookup central utilisé par le helper `audit()` pour valider le payload
 * avant INSERT. Type fortement contraint : chaque clef est une `AuditAction`
 * et la valeur est un `ZodSchema` (pas de `any`).
 *
 * Ne pas exporter l'objet en `as const` strict pour conserver le typage
 * `ZodTypeAny` côté Zod (sinon le `parse()` retourne `never`).
 */
export const AUDIT_SCHEMAS = {
  login: loginSchema,
  membership_change: membershipChangeSchema,
  search_profile_change: searchProfileChangeSchema,
  tender_select: tenderSelectSchema,
  architect_solicit: architectSolicitSchema,
  dossier_diffuse: dossierDiffuseSchema,
  ai_run: aiRunSchema,
  odoo_opportunity_create: odooOpportunityCreateSchema,
  architect_change: architectChangeSchema,
  rgpd_export: rgpdExportSchema,
  token_revoke: tokenRevokeSchema,
  data_delete: dataDeleteSchema,
  access_attempt: accessAttemptSchema,
  tender_defer: tenderDeferSchema,
  tender_reject: tenderRejectSchema,
  architect_response: architectResponseSchema,
  architect_edit: architectEditSchema,
  architect_import: architectImportSchema,
  architect_export: architectExportSchema,
} as const satisfies Record<AuditAction, z.ZodTypeAny>;

// ============================================================================
// 4. Type-level helpers : data attendue par action
// ============================================================================

/**
 * Type de la `data` validée pour une action donnée.
 *
 * Permet `audit<'tender_select'>({ action: 'tender_select', data: { ... } })`
 * où `data` est strictement contraint au schéma A4 (autocomplétion + erreur
 * de compilation si champ manquant / mauvais type).
 *
 * Pour les placeholders, le type résout vers `Record<string, unknown>` (forme
 * passthrough de Zod), ce qui est volontaire : on n'impose pas encore de
 * structure aux 12 actions non-implémentées.
 */
export type AuditLogDataFor<A extends AuditAction> = z.infer<(typeof AUDIT_SCHEMAS)[A]>;

/**
 * Re-export des schémas individuels pour les tests + les call-sites stricts.
 * Le call-site `audit({ action: 'tender_select', data: ... })` n'a PAS besoin
 * d'importer le schéma : la validation est interne au helper.
 */
export {
  architectResponseSchema,
  architectSolicitSchema,
  tenderDeferSchema,
  tenderRejectSchema,
  tenderSelectSchema,
};
