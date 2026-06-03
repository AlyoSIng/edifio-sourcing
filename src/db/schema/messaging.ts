/**
 * Tables messaging — modèles d'e-mail éditables + profil société.
 *
 * Source de vérité :
 *   - `handoff/SPEC_ADDENDUM_260525_ARCHITECTES_MENU_ET_TRAME_MAIL.md` §Exigence C+D
 *   - Décision Board 2026-05-25 : Lots C+D validés (éditeur templates + présentation société)
 *
 * ZONE ORANGE — migration non exécutée en prod sans revue CTO Sophie.
 * Fichier SQL généré via `pnpm drizzle-kit generate` puis posé en handoff.
 *
 * `message_templates` :
 *   - Stocke objet + corps pour chacun des 11 templates (Brevo + Resend).
 *   - 1 ligne par template par organisation (contrainte UNIQUE sur
 *     `(organization_id, key)`).
 *   - Versionné (`version` incrémenté à chaque save côté Server Action).
 *   - Canal : `brevo` (architectes) ou `resend` (utilisateurs internes).
 *
 * `organization_profiles` :
 *   - Bloc de présentation AlyoS (4 puces) + identité commerciale.
 *   - 1 ligne par organisation (contrainte UNIQUE sur `organization_id`).
 *   - Fournit la variable `{{presentation_societe}}` injectée dans les templates.
 *   - Seed MVP : bloc AlyoS 4 puces (éco construction/MOE ; accessibilité ;
 *     BIM/ACCA ; 2 agences Normandie & PACA).
 *
 * RLS :
 *   - `organization_id` filtre sur 100 % des requêtes (défense applicative).
 *   - Policies RLS Supabase à poser dans une migration SQL natif ultérieure
 *     (comme pour les autres tables multi-tenant).
 */

import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { users } from "./users";

/**
 * message_templates — modèles d'e-mail configurables par organisation.
 *
 * Clés valides (`key`) — inventaire complet Gate 5 spec C :
 *   Canal Brevo (architectes) :
 *     solicitation_tu, solicitation_vous,
 *     relance_tu, relance_vous,
 *     diffusion_tu, diffusion_vous,
 *     decline_acknowledgment
 *   Canal Resend (utilisateurs internes) :
 *     tender_summary_to_user,
 *     user_provisional_password,
 *     user_password_reset,
 *     user_notification
 */
export const messageTemplates = pgTable(
  "message_templates",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * Identifiant logique du template — voir commentaire table pour
     * la liste exhaustive des 11 clés.
     */
    key: text("key").notNull(),
    /** Canal de diffusion : 'brevo' (architectes) | 'resend' (utilisateurs). */
    channel: text("channel").notNull(),
    /** Objet de l'e-mail. Peut contenir des variables {{...}}. */
    subject: text("subject").notNull(),
    /**
     * Corps de l'e-mail (texte + HTML inline ou markdown selon canal).
     * Peut contenir des variables {{...}} de la palette autorisée par `key`.
     */
    body: text("body").notNull(),
    /**
     * Dernier éditeur — FK nullable (SET NULL si user supprimé).
     * NULL si créé par le seed initial.
     */
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * Version incrémentée à chaque sauvegarde pour traçabilité.
     * Pas de table de versions historiques au MVP — version courante uniquement.
     */
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** 1 template par clé par organisation — contrainte fonctionnelle core. */
    orgKeyUq: unique("message_templates_organization_id_key_key").on(
      table.organizationId,
      table.key,
    ),
    orgIdx: index("idx_message_templates_org").on(table.organizationId),
    channelIdx: index("idx_message_templates_channel").on(table.channel),
  }),
);

export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type NewMessageTemplate = typeof messageTemplates.$inferInsert;

/**
 * organization_profiles — profil commercial de l'organisation.
 *
 * Fournit les données injectées dans {{presentation_societe}} et les
 * signatures / pieds de page des templates.
 *
 * Seed MVP AlyoS : bloc 4 puces + 2 agences Normandie & PACA.
 */
export const organizationProfiles = pgTable("organization_profiles", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" })
    .unique(),
  /**
   * Bloc de présentation long — injecté verbatim dans {{presentation_societe}}.
   * Contient les 4 puces AlyoS au MVP (éco construction/MOE ; accessibilité ;
   * BIM/ACCA ; 2 agences).
   */
  presentationBlock: text("presentation_block").notNull().default(""),
  /** Nom commercial affiché dans les e-mails et l'UI. */
  commercialName: text("commercial_name").notNull().default(""),
  /** Signature e-mail (ex. « L'équipe AlyoS Ingénierie »). */
  emailSignature: text("email_signature").notNull().default(""),
  /** Coordonnées agences (format libre, multi-lignes). */
  agencyDetails: text("agency_details").notNull().default(""),
  /** Téléphone principal (affiché dans certains templates). */
  phone: text("phone").notNull().default(""),
  /** Email de contact principal (reply-to ou pied de page). */
  contactEmail: text("contact_email").notNull().default(""),
  // `logoUrl` retiré — colonne droppée par la migration 0043 (Steve
  // 2026-06-03). Le logo est désormais géré par `organizations.logo_url`
  // (Personnalisation / bucket org-assets).
  /**
   * Données administratives DC2 (CERFA 12157) — Phase 1 Lot B.
   * En cotraitance MOE BTP, AlyoS est cotraitant et doit produire son DC2 ;
   * ces champs permettent le pré-remplissage du formulaire.
   * Tous nullable : profils antérieurs à la migration 0034 restent valides.
   */
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  legalRepresentativeName: text("legal_representative_name"),
  legalRepresentativeRole: text("legal_representative_role"),
  capitalEur: integer("capital_eur"),
  signatureCity: text("signature_city"),
  /**
   * Forme juridique (SA, SARL, SAS, SASU, EURL, SCP, SELARL, etc.).
   * Champ libre text pour ne pas figer une enum côté schéma — la validation
   * UI suggère les plus courantes via datalist (Steve 2026-06-03 / mig. 0040).
   */
  legalForm: text("legal_form"),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OrganizationProfile = typeof organizationProfiles.$inferSelect;
export type NewOrganizationProfile = typeof organizationProfiles.$inferInsert;
