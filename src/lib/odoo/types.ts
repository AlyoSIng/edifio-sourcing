/**
 * Types — connecteur Odoo XML-RPC (module Tandem + Solo partagé).
 *
 * Source de vérité :
 *  - `specs/module_solo_engine_v1.md` §3.2 (createOdooOpportunity contrat)
 *  - `specs/module_tandem_engine_v1.md` §3.5 (1 opp par architecte partant)
 *  - `specs/architects_data_and_admin_v1.md` §3 (mapping res.partner → architects)
 *  - `BRIEF_TANDEM_260521.md` (connecteur partagé, écrit UNE fois)
 *
 * Ce module ne dépend d'aucun runtime — il définit uniquement les contrats.
 * Le client réel est dans `client.ts`, l'usage dans `opportunities.ts`.
 */

/**
 * Origine d'une opportunité Odoo — aligné contrainte CHECK SQL côté table
 * `odoo_opportunities.origin` (`'solo'|'tandem'`). Pas un enum Postgres pour
 * rester souple sur d'éventuels canaux futurs.
 */
export type OdooOpportunityOrigin = "solo" | "tandem";

/**
 * Options de création d'une opportunité Odoo. Le contrat partagé entre Solo
 * et Tandem — c'est la signature qui sera consommée par les deux modules.
 */
export interface CreateOdooOpportunityOptions {
  /** Étape Odoo (ex. « AO publics / Réponse cotraitance »). */
  stage: string;
  /** Origine — Solo ou Tandem. */
  origin: OdooOpportunityOrigin;
  /**
   * UUID architecte partant — REQUIS pour `origin='tandem'`, NULL pour
   * `'solo'`. L'index partiel `uniq_opp_tandem(tender_id, architect_id)`
   * garantit l'idempotence sur le couple (AO, archi).
   */
  architectId?: string | null;
}

/**
 * Résultat d'un appel `createOdooOpportunity` — discriminé `ok`.
 *
 * - `ok=true` : la ligne `odoo_opportunities` existe en BDD. `odooId` peut
 *   être un placeholder négatif (`-1`) si la sync XML-RPC est désactivée
 *   ou si elle a échoué (dans ce cas `lastError` est set).
 * - `ok=false` : aucune ligne en BDD (erreur fatale — invariants violés,
 *   architectId requis manquant, etc.). Pas de fallback.
 */
export type CreateOdooOpportunityResult =
  | {
      ok: true;
      /** ID Drizzle de la ligne `odoo_opportunities` (UUID). */
      id: string;
      /** ID natif Odoo — `-1` si XML-RPC OFF ou échec. */
      odooId: number;
      /** `true` si la ligne existait déjà (idempotence). */
      alreadyExisted: boolean;
      /** Dernière erreur XML-RPC si la sync a échoué côté Odoo. */
      lastError: string | null;
    }
  | {
      ok: false;
      error: "missing_architect_id" | "tender_not_found" | "invalid_origin" | "db_insert_failed";
      detail?: string;
    };

/**
 * Représentation Odoo d'un partenaire architecte (`res.partner`).
 * Champs lus via `search_read` — utilisés pour l'import / synchronisation
 * de la table `architects` (post-MVP : lecture import, étape Alex côté
 * admin).
 *
 * Source : `specs/architects_data_and_admin_v1.md` §3 (champs Odoo exportés).
 */
export interface OdooPartnerRaw {
  id: number;
  name: string;
  /** Nom du contact (peut être faux/vide dans l'export — voir `dirigeant_sirene`). */
  contact_name?: string | false;
  email?: string | false;
  phone?: string | false;
  website?: string | false;
  /** SIREN 9 chars (ou false si absent). */
  vat?: string | false;
  zip?: string | false;
  city?: string | false;
  /** Dirigeant SIRENE — fallback contact_name. */
  dirigeant_sirene?: string | false;
  /** Effectif (custom field). */
  headcount?: number | false;
  /** Spécialités libres (custom field — à mapper côté `mapping.ts`). */
  specialties?: string | false;
  /** Départements d'intervention (custom field — à split côté `mapping.ts`). */
  departements_intervention?: string | false;
  /** Date de création de l'entreprise (custom field). */
  company_created_at?: string | false;
}

/**
 * Représentation Odoo d'un lead/opportunity (`crm.lead`).
 * Champs minimum nécessaires pour créer une opp depuis edifio Sourcing.
 */
export interface OdooLeadCreatePayload {
  name: string;
  partner_id?: number;
  /** Étape (stage_id) — peut être passée en int ou en search via `stage` name. */
  stage_id?: number;
  type: "opportunity";
  description?: string;
  /** Champs custom edifio (tags) — alignés Phase 2. */
  tag_ids?: number[];
  /** Référence externe edifio (tenderId UUID). */
  x_edifio_tender_id?: string;
  x_edifio_origin?: OdooOpportunityOrigin;
  x_edifio_architect_id?: string;
}
