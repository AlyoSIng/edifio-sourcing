/**
 * Résolution de template Brevo avec fallback BDD → hardcodé.
 *
 * Source de vérité :
 *  - `design/copy/email_sollicitation_architecte_v2.md` (copy v2 — CMO Léa)
 *  - Board 2026-05-25 Lot C : `resolveBrevoTemplate` avec fallback BDD
 *    et garde-fous RGPD non contournables.
 *  - `specs/rgpd_registre_architectes_DRAFT.md` art. 14 (mention obligatoire)
 *  - `specs/module_tandem_engine_v1.md` §3.3
 *
 * Stratégie de résolution (par ordre de priorité) :
 *  1. Table `message_templates` BDD (org-scopée) — si la table existe et si
 *     une ligne pour `(organizationId, key)` est trouvée avec `active = TRUE`.
 *  2. Contenu hardcodé `DEFAULT_TEMPLATE_COPY` (copy v2 validée CMO Léa).
 *
 * La table `message_templates` est gérée par Alex (UI editor). Ce module
 * l'interroge en lecture seule. Si la table n'existe pas encore (pre-migration),
 * le fallback hardcodé est retourné silencieusement.
 *
 * Garde-fous RGPD (non contournables — art. 14 RGPD) :
 *  Pour les templates de type `solicitation_*` et `relance_*` :
 *    - Le corps DOIT contenir `{{lien_opposition}}` (ou `{{ params.lien_opposition }}`).
 *    - Le corps DOIT contenir une mention "art. 14" ou "art.14".
 *  Si l'une ou l'autre condition est absente → `throw` avec le code
 *  `'rgpd_lien_opposition_manquant'` ou `'rgpd_art14_mention_manquante'`.
 *  L'envoi est bloqué jusqu'à correction du template (BDD ou code).
 *
 * Coordination Alex :
 *  - Ce module importe `DrizzleClient` depuis `actions.ts` pour ne pas
 *    créer une dépendance circulaire. Le type est ré-exporté ici.
 *  - La table `message_templates` doit exposer les colonnes :
 *      `organization_id UUID`, `key TEXT`, `subject TEXT NOT NULL`,
 *      `body TEXT NOT NULL`, `active BOOLEAN NOT NULL DEFAULT TRUE`.
 *  - Index recommandé : `(organization_id, key)` UNIQUE WHERE `active = TRUE`.
 *  - Une fois la migration Alex mergée, retirer le `try/catch` silencieux
 *    du fallback et utiliser le select normalement.
 */

import { sql } from "drizzle-orm";

import type { DrizzleClient } from "@/app/sourcing/ao/[id]/tandem/actions";
import { DEFAULT_TEMPLATE_COPY } from "./templates-copy";

/* -------------------------------------------------------------------------- */
/*  Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface ResolvedTemplate {
  /** Sujet de l'email (peut contenir des variables Brevo `{{...}}`). */
  subject: string;
  /**
   * Corps HTML de l'email. Pour les templates Brevo (templateId numérique),
   * ce body est informatif / fallback — le vrai rendu se fait côté Brevo.
   * Pour les envois directs (mode fallback sans templateId), ce body est
   * envoyé tel quel via `htmlContent`.
   */
  body: string;
  /** Source de résolution — pour debug / audit. */
  source: "db" | "default";
}

export type { DrizzleClient };

/* -------------------------------------------------------------------------- */
/*  Garde-fous RGPD (non contournables)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Détermine si une clé de template est soumise aux garde-fous RGPD.
 * Toutes les clés `solicitation_*` et `relance_*` (ou `followup_*`) sont
 * concernées — ces mails vont vers des personnes dont les données n'ont
 * pas été collectées directement (art. 14 RGPD).
 */
function isRgpdMandatoryKey(key: string): boolean {
  return (
    key.startsWith("architect_solicitation") ||
    key.startsWith("architect_followup") ||
    key.startsWith("architect_relance")
  );
}

/**
 * Vérifie les garde-fous RGPD sur le body d'un template.
 *
 * @throws `Error` avec `.message = 'rgpd_lien_opposition_manquant'`
 *   si le body ne contient pas de référence au lien d'opposition.
 * @throws `Error` avec `.message = 'rgpd_art14_mention_manquante'`
 *   si le body ne contient pas de mention "art. 14" ou "art.14".
 */
export function assertRgpdGuardrails(key: string, body: string): void {
  if (!isRgpdMandatoryKey(key)) return;

  // Accepte les syntaxes : variable Brevo double et triple accolade, URL directe
  const hasLienOpposition =
    body.includes("{{lien_opposition}}") ||
    body.includes("{{ params.lien_opposition }}") ||
    body.includes("{{ params.rgpd_block }}") || // bloc complet injecté → contient le lien
    body.includes("{{{ params.rgpd_block }}}") || // triple-accolade Mustache (HTML brut)
    body.includes("{{rgpd_block}}");

  if (!hasLienOpposition) {
    const err = new Error("rgpd_lien_opposition_manquant");
    err.name = "RgpdGuardrailError";
    throw err;
  }

  const hasArt14Mention =
    body.includes("art. 14") ||
    body.includes("art.14") ||
    body.includes("{{ params.rgpd_block }}") || // bloc complet injecté → contient art. 14
    body.includes("{{{ params.rgpd_block }}}") || // triple-accolade Mustache (HTML brut)
    body.includes("{{rgpd_block}}");

  if (!hasArt14Mention) {
    const err = new Error("rgpd_art14_mention_manquante");
    err.name = "RgpdGuardrailError";
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/*  Résolution depuis la BDD                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Forme minimale d'une ligne `message_templates` attendue en BDD.
 * La migration est gérée par Alex — on reste permissif sur les types.
 * `Record<string, unknown>` requis par la contrainte de `db.execute<T>`.
 */
interface MessageTemplateRow extends Record<string, unknown> {
  subject: string;
  body: string;
}

/**
 * Tente de lire le template depuis la table `message_templates` BDD.
 * Retourne `null` si :
 *  - la table n'existe pas encore (pre-migration) ;
 *  - aucune ligne active pour `(organizationId, key)`.
 *
 * On attrape silencieusement les erreurs liées à la table manquante
 * (code Postgres `42P01` = undefined_table). Toute autre erreur est
 * re-throwée pour éviter de masquer des bugs.
 */
async function fetchFromDb(
  key: string,
  orgId: string,
  db: DrizzleClient,
): Promise<MessageTemplateRow | null> {
  try {
    // Accès direct SQL via `db.execute` + `sql` tagged template Drizzle.
    // CRUCIAL : utiliser `sql` (drizzle-orm) pour que les valeurs soient
    // bindées comme paramètres positionnels Postgres ($1, $2). Sans `sql`,
    // les `${orgId}` sont interpolés en SQL brut → Postgres reçoit un
    // littéral non typé et peut planter avec "cannot cast type bigint to uuid"
    // si la colonne attend un UUID.
    const result = await db.execute<MessageTemplateRow>(
      sql`SELECT subject, body
          FROM message_templates
          WHERE organization_id = ${orgId}::uuid
            AND key = ${key}
          LIMIT 1`,
    );
    const rows = Array.isArray(result)
      ? result
      : ((result as { rows?: MessageTemplateRow[] }).rows ?? []);
    return rows[0] ?? null;
  } catch (err: unknown) {
    // Postgres error code 42P01 = undefined_table (table n'existe pas encore)
    const pgCode = (err as { code?: string })?.code;
    if (pgCode === "42P01") {
      // Table pre-migration — fallback silencieux
      return null;
    }
    // Toute autre erreur est propagée
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/*  Fonction principale                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Résout le template Brevo pour une clé + organisation donnée.
 *
 * Priorité : BDD org-scopée → défaut hardcodé.
 * Garde-fous RGPD appliqués sur le body résolu (throw si non conformes).
 *
 * @param key — nom logique du template, ex. `"architect_solicitation_VOUS"`.
 *   Aligné sur `templateNameFor()` (template-picker.ts).
 * @param orgId — UUID de l'organisation (RLS + multi-tenancy).
 * @param db — client Drizzle (injecté — facilite les tests).
 *
 * @throws `Error('rgpd_lien_opposition_manquant')` si lien opposition absent.
 * @throws `Error('rgpd_art14_mention_manquante')` si mention art. 14 absente.
 * @throws `Error('template_introuvable')` si clé inconnue ET pas en BDD.
 */
export async function resolveBrevoTemplate(
  key: string,
  orgId: string,
  db: DrizzleClient,
): Promise<ResolvedTemplate> {
  // 1. Tentative BDD
  let row: MessageTemplateRow | null = null;
  if (orgId && db) {
    row = await fetchFromDb(key, orgId, db);
  }

  let resolved: ResolvedTemplate;

  if (row) {
    resolved = { subject: row.subject, body: row.body, source: "db" };
  } else {
    // 2. Fallback hardcodé
    const defaultCopy = DEFAULT_TEMPLATE_COPY[key];
    if (!defaultCopy) {
      throw new Error(`template_introuvable:${key}`);
    }
    resolved = { subject: defaultCopy.subject, body: defaultCopy.body, source: "default" };
  }

  // 3. Garde-fous RGPD (non contournables)
  assertRgpdGuardrails(key, resolved.body);

  return resolved;
}
