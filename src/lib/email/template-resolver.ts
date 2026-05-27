/**
 * Résolution et rendu des templates d'e-mail configurables.
 *
 * Source de vérité :
 *   - `handoff/SPEC_ADDENDUM_260525_ARCHITECTES_MENU_ET_TRAME_MAIL.md` §Exigence C
 *   - Décision Board 2026-05-25 : table `message_templates` source de vérité
 *     en prod ; fallback hardcoded pour CI / seed non encore exécuté.
 *
 * Responsabilités :
 *  1. Charge le template depuis `message_templates` (BDD) selon `(orgId, key)`.
 *  2. Si absent en BDD : renvoie le template par défaut hardcoded (`DEFAULT_TEMPLATES`).
 *  3. Substitue les variables `{{nom_variable}}` dans subject + body.
 *  4. Valide les garde-fous RGPD non négociables (solicitation_* + diffusion_*).
 *
 * Variables disponibles par catégorie (cf. spec C) :
 *  - Communes        : civilite, archi_prenom, archi_nom, cabinet
 *  - AO              : ao_objet, ao_acheteur, ao_departement, ao_cloture, lien_ao
 *  - Archi           : lien_opposition, rgpd_block
 *  - Société         : presentation_societe
 *  - Utilisateur     : user_prenom, mot_de_passe_provisoire, lien_reset
 *
 * Garde-fous RGPD (non contournables à l'enregistrement) :
 *  - Templates solicitation_* : body DOIT contenir `{{rgpd_block}}` et `{{lien_opposition}}`
 *  - Templates diffusion_*    : body DOIT contenir `{{lien_ao}}`
 *
 * Utilisation :
 *   const resolver = createTemplateResolver(db, orgId);
 *   const rendered = await resolver.resolve('solicitation_vous', variables);
 *   // rendered.subject, rendered.body
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";

import type * as schema from "@/db/schema";
import { messageTemplates } from "@/db/schema/messaging";
import {
  withTenantContext,
  type DrizzleClient as TenantDrizzleClient,
} from "@/lib/db/with-tenant-context";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type TemplateKey =
  // Canal Brevo — architectes
  | "solicitation_tu"
  | "solicitation_vous"
  | "relance_tu"
  | "relance_vous"
  | "diffusion_tu"
  | "diffusion_vous"
  | "decline_acknowledgment"
  // Canal Resend — utilisateurs internes
  | "tender_summary_to_user"
  | "user_provisional_password"
  | "user_password_reset"
  | "user_notification";

export type TemplateChannel = "brevo" | "resend";

export interface TemplateVariables {
  // Communes (architectes)
  civilite?: string;
  archi_prenom?: string;
  archi_nom?: string;
  cabinet?: string;
  // AO
  ao_objet?: string;
  ao_acheteur?: string;
  ao_departement?: string;
  ao_cloture?: string;
  lien_ao?: string;
  // Archi RGPD
  lien_opposition?: string;
  rgpd_block?: string;
  // Société
  presentation_societe?: string;
  // Utilisateurs (Resend)
  user_prenom?: string;
  mot_de_passe_provisoire?: string;
  lien_reset?: string;
  // Toute variable supplémentaire (extensibilité)
  [key: string]: string | undefined;
}

export interface RenderedTemplate {
  subject: string;
  body: string;
  /** Clé du template utilisée. */
  key: TemplateKey;
  /** `true` si le template vient de la BDD, `false` si c'est le fallback hardcoded. */
  fromDatabase: boolean;
}

/** Résultat de validation garde-fou RGPD. */
export interface RgpdValidationResult {
  valid: boolean;
  /** Messages d'erreur non vides si validation échoue. */
  errors: string[];
}

/* -------------------------------------------------------------------------- */
/*  Métadonnées des templates                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Métadonnées par clé : canal, label FR, variables requises pour le
 * garde-fou RGPD (vide = pas de validation supplémentaire).
 */
export const TEMPLATE_META: Record<
  TemplateKey,
  {
    channel: TemplateChannel;
    labelFr: string;
    /** Variables dont la présence est obligatoire dans le body (garde-fous). */
    requiredVars: string[];
  }
> = {
  solicitation_tu: {
    channel: "brevo",
    labelFr: "Sollicitation (tutoiement)",
    requiredVars: ["{{rgpd_block}}", "{{lien_opposition}}"],
  },
  solicitation_vous: {
    channel: "brevo",
    labelFr: "Sollicitation (vouvoiement)",
    requiredVars: ["{{rgpd_block}}", "{{lien_opposition}}"],
  },
  relance_tu: {
    channel: "brevo",
    labelFr: "Relance (tutoiement)",
    requiredVars: [],
  },
  relance_vous: {
    channel: "brevo",
    labelFr: "Relance (vouvoiement)",
    requiredVars: [],
  },
  diffusion_tu: {
    channel: "brevo",
    labelFr: "Diffusion dossier (tutoiement)",
    requiredVars: ["{{lien_ao}}"],
  },
  diffusion_vous: {
    channel: "brevo",
    labelFr: "Diffusion dossier (vouvoiement)",
    requiredVars: ["{{lien_ao}}"],
  },
  decline_acknowledgment: {
    channel: "brevo",
    labelFr: "Accusé de refus",
    requiredVars: [],
  },
  tender_summary_to_user: {
    channel: "resend",
    labelFr: "Récapitulatif AO (Mandataire)",
    requiredVars: [],
  },
  user_provisional_password: {
    channel: "resend",
    labelFr: "Mot de passe provisoire",
    requiredVars: ["{{mot_de_passe_provisoire}}"],
  },
  user_password_reset: {
    channel: "resend",
    labelFr: "Réinitialisation mot de passe",
    requiredVars: ["{{lien_reset}}"],
  },
  user_notification: {
    channel: "resend",
    labelFr: "Notification interne",
    requiredVars: [],
  },
};

/* -------------------------------------------------------------------------- */
/*  Templates par défaut (fallback si BDD vide)                               */
/* -------------------------------------------------------------------------- */

/**
 * Templates par défaut alignés sur `design/copy/templates_brevo_v1.md`.
 * Ces valeurs sont utilisées :
 *   - En CI / tests (pas de BDD peuplée)
 *   - Au 1er démarrage avant exécution du seed
 *   - Comme valeur initiale lors du seed (`message_templates` INSERT)
 */
export const DEFAULT_TEMPLATES: Record<TemplateKey, { subject: string; body: string }> = {
  solicitation_tu: {
    subject: "[edifio Sourcing] On a un AO sur lequel on aimerait ton avis",
    body: `Bonjour {{archi_prenom}},

L'entreprise {{presentation_societe}} envisage de répondre à un AO en cotraitance
et te propose le rôle de mandataire MOE. Tu peux répondre en un clic,
sans créer de compte.

▸ L'opération
{{ao_objet}}
Acheteur : {{ao_acheteur}}
Département : {{ao_departement}}
Remise des plis : {{ao_cloture}}

▸ Tes options
Oui, je suis partant : {{lien_ao}}
Non, pas cette fois : {{lien_opposition}}

À très vite,
— via edifio Sourcing

{{rgpd_block}}`,
  },

  solicitation_vous: {
    subject: "[edifio Sourcing] Votre avis sur un appel d'offres ?",
    body: `Bonjour {{civilite}} {{archi_nom}},

L'entreprise {{presentation_societe}} envisage de répondre à un appel d'offres
en cotraitance et vous propose le rôle de mandataire MOE. Vous pouvez
répondre en un clic, sans créer de compte.

▸ L'opération
{{ao_objet}}
Acheteur : {{ao_acheteur}}
Département : {{ao_departement}}
Remise des plis : {{ao_cloture}}

▸ Vos options
Oui, je suis partant(e) : {{lien_ao}}
Non, pas cette fois : {{lien_opposition}}

Bien cordialement,
— via edifio Sourcing

{{rgpd_block}}`,
  },

  relance_tu: {
    subject: "[edifio Sourcing] Petite relance — AO {{ao_objet}}",
    body: `Hey {{archi_prenom}},

Je te relance juste sur l'AO {{ao_objet}} — la remise est dans {{ao_cloture}}
et on aimerait savoir si tu nous accompagnes pour qu'on s'organise.

Oui : {{lien_ao}}
Non (pas de souci) : {{lien_opposition}}

À toi,
— via edifio Sourcing`,
  },

  relance_vous: {
    subject: "[edifio Sourcing] Relance — AO {{ao_objet}}",
    body: `Bonjour {{civilite}} {{archi_nom}},

Je me permets de revenir vers vous concernant l'AO {{ao_objet}}.
La remise des plis est le {{ao_cloture}} et nous aimerions connaître
votre disponibilité pour finaliser notre dossier.

Oui : {{lien_ao}}
Non, merci : {{lien_opposition}}

Bien à vous,
— via edifio Sourcing`,
  },

  diffusion_tu: {
    subject: "[edifio Sourcing] Dossier prêt — {{ao_objet}}",
    body: `Salut {{archi_prenom}},

Le dossier est prêt. Lien sécurisé ci-dessous (valable 30 jours).

Ouvrir le dossier : {{lien_ao}}

Si quoi que ce soit te bloque, écris-moi.

— via edifio Sourcing`,
  },

  diffusion_vous: {
    subject: "[edifio Sourcing] Dossier prêt — {{ao_objet}}",
    body: `Bonjour {{civilite}} {{archi_nom}},

Le dossier est désormais prêt. Vous pouvez y accéder via le lien
sécurisé ci-dessous (validité 30 jours).

Ouvrir le dossier : {{lien_ao}}

Pour toute question, n'hésitez pas à revenir vers moi.

— via edifio Sourcing`,
  },

  decline_acknowledgment: {
    subject: "[edifio Sourcing] Reçu — merci !",
    body: `Pas de souci. À très vite sur un autre AO.

— via edifio Sourcing`,
  },

  tender_summary_to_user: {
    subject: "[edifio Sourcing] AO sélectionné en Mandataire — {{ao_objet}}",
    body: `Bonjour {{user_prenom}},

Vous avez sélectionné en Mandataire l'AO suivant :

▸ {{ao_objet}}
Acheteur : {{ao_acheteur}}
Département : {{ao_departement}}
Remise des plis : {{ao_cloture}}

Lien AO : {{lien_ao}}

— edifio Sourcing`,
  },

  user_provisional_password: {
    subject: "Votre accès edifio Sourcing — mot de passe provisoire",
    body: `Bonjour {{user_prenom}},

Vous avez désormais accès à edifio Sourcing, l'outil interne AlyoS Ingénierie.

Mot de passe provisoire : {{mot_de_passe_provisoire}}

Ce mot de passe expire dans 24 heures. À votre première connexion, vous
serez invité(e) à choisir votre propre mot de passe (minimum 16 caractères).

— AlyoS Ingénierie — edifio Sourcing`,
  },

  user_password_reset: {
    subject: "Réinitialisation de votre mot de passe edifio Sourcing",
    body: `Bonjour,

Vous avez demandé la réinitialisation de votre mot de passe edifio Sourcing.

Lien de réinitialisation (valable 60 minutes) : {{lien_reset}}

Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.

— edifio Sourcing — AlyoS Ingénierie`,
  },

  user_notification: {
    subject: "[edifio Sourcing] Notification",
    body: `Bonjour {{user_prenom}},

Vous avez une nouvelle notification sur edifio Sourcing.

— edifio Sourcing`,
  },
};

/* -------------------------------------------------------------------------- */
/*  Validation garde-fous RGPD                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Valide qu'un body contient bien les variables obligatoires pour une clé.
 *
 * Garde-fous non négociables (spec C) :
 *  - `solicitation_*` : `{{rgpd_block}}` + `{{lien_opposition}}` obligatoires
 *    (RGPD art.14 — information 1er contact + droit d'opposition art.21)
 *  - `diffusion_*` : `{{lien_ao}}` obligatoire (CTA dossier)
 *  - `user_provisional_password` : `{{mot_de_passe_provisoire}}` obligatoire
 *  - `user_password_reset` : `{{lien_reset}}` obligatoire
 *
 * @returns `{ valid: true, errors: [] }` si OK, `{ valid: false, errors: [...] }` sinon.
 */
export function validateTemplateRgpd(key: TemplateKey, body: string): RgpdValidationResult {
  const meta = TEMPLATE_META[key];
  const errors: string[] = [];

  for (const varRequired of meta.requiredVars) {
    if (!body.includes(varRequired)) {
      // Message d'erreur adapté selon la variable
      if (varRequired === "{{rgpd_block}}") {
        errors.push(
          `La mention RGPD art. 14 (variable {{rgpd_block}}) est obligatoire et non supprimable ` +
            `dans les templates de premier contact (${key}). ` +
            `Ajoutez {{rgpd_block}} dans le corps de votre message.`,
        );
      } else if (varRequired === "{{lien_opposition}}") {
        errors.push(
          `Le lien d'opposition (variable {{lien_opposition}}) est obligatoire et non supprimable ` +
            `dans les templates de premier contact (${key}). ` +
            `Ajoutez {{lien_opposition}} dans le corps de votre message.`,
        );
      } else if (varRequired === "{{lien_ao}}") {
        errors.push(
          `Le lien AO (variable {{lien_ao}}) est obligatoire dans les templates de diffusion (${key}). ` +
            `Ajoutez {{lien_ao}} dans le corps de votre message.`,
        );
      } else {
        errors.push(
          `La variable ${varRequired} est obligatoire dans le template ${key}. ` +
            `Ajoutez-la dans le corps de votre message.`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/* -------------------------------------------------------------------------- */
/*  Substitution de variables                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Substitue toutes les occurrences de `{{nom_variable}}` dans `text` par la
 * valeur correspondante dans `variables`. Les variables non fournies sont
 * laissées telles quelles (pas de substitution silencieuse par chaîne vide —
 * cela permet de détecter les variables manquantes dans les previews).
 */
export function substituteVariables(text: string, variables: TemplateVariables): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, varName: string) => {
    const value = variables[varName];
    return value !== undefined ? value : match;
  });
}

/* -------------------------------------------------------------------------- */
/*  Résolveur principal                                                        */
/* -------------------------------------------------------------------------- */

type DrizzleDb = PostgresJsDatabase<typeof schema>;

/**
 * Crée un résolveur de templates pour une organisation.
 *
 * Pattern factory pour permettre l'injection du client DB dans les tests.
 *
 * @param db — client Drizzle (postgres-js)
 * @param organizationId — UUID de l'organisation courante
 */
export function createTemplateResolver(db: DrizzleDb, organizationId: string) {
  return {
    /**
     * Résout un template : charge depuis BDD, fallback hardcoded, substitue variables.
     *
     * @param key — clé du template (ex. 'solicitation_vous')
     * @param variables — valeurs à substituer dans subject + body
     */
    async resolve(key: TemplateKey, variables: TemplateVariables): Promise<RenderedTemplate> {
      let subject: string;
      let body: string;
      let fromDatabase = false;

      // 1. Tentative de chargement depuis la BDD.
      // withTenantContext pose app.current_organization_id pour FORCE RLS
      // (cf. ANSWER_260527_CTO_RLS_FORCE_EDGE.md + with-tenant-context.ts).
      let dbTemplate: typeof messageTemplates.$inferSelect | undefined;
      try {
        const rows = await withTenantContext(
          organizationId,
          db as unknown as TenantDrizzleClient,
          (client) =>
            client
              .select()
              .from(messageTemplates)
              .where(
                and(
                  eq(messageTemplates.organizationId, organizationId),
                  eq(messageTemplates.key, key),
                ),
              )
              .limit(1),
        );
        dbTemplate = rows[0];
      } catch {
        // BDD non disponible (CI, cold start Edge Function) → fallback silencieux
        dbTemplate = undefined;
      }

      if (dbTemplate) {
        subject = dbTemplate.subject;
        body = dbTemplate.body;
        fromDatabase = true;
      } else {
        // 2. Fallback templates par défaut
        const fallback = DEFAULT_TEMPLATES[key];
        subject = fallback.subject;
        body = fallback.body;
      }

      // 3. Substitution des variables
      const renderedSubject = substituteVariables(subject, variables);
      const renderedBody = substituteVariables(body, variables);

      return {
        subject: renderedSubject,
        body: renderedBody,
        key,
        fromDatabase,
      };
    },

    /**
     * Charge le template brut depuis BDD (sans substitution) — pour l'éditeur UI.
     * Retourne le fallback hardcoded si absent en BDD (= valeur initiale à afficher).
     */
    async loadRaw(
      key: TemplateKey,
    ): Promise<{ subject: string; body: string; fromDatabase: boolean; version: number }> {
      try {
        // withTenantContext pose app.current_organization_id pour FORCE RLS
        const rows = await withTenantContext(
          organizationId,
          db as unknown as TenantDrizzleClient,
          (client) =>
            client
              .select()
              .from(messageTemplates)
              .where(
                and(
                  eq(messageTemplates.organizationId, organizationId),
                  eq(messageTemplates.key, key),
                ),
              )
              .limit(1),
        );
        const row = rows[0];
        if (row) {
          return {
            subject: row.subject,
            body: row.body,
            fromDatabase: true,
            version: row.version,
          };
        }
      } catch {
        // fallback
      }
      const fallback = DEFAULT_TEMPLATES[key];
      return { subject: fallback.subject, body: fallback.body, fromDatabase: false, version: 0 };
    },
  };
}
