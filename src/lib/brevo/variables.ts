/**
 * Construction des variables Brevo `params` pour les templates architecte.
 *
 * Source de vérité :
 *  - `design/copy/email_sollicitation_architecte_v2.md` (variables v2 — remplace v1)
 *  - `specs/module_tandem_engine_v1.md` §3.3
 *  - Décision Q3 Board 2026-05-24 (Option A) : `{{rgpd_block}}` en variable
 *    de code (injecté ici, pas dans le template Brevo).
 *  - Board 2026-05-25 (Lot #56) : ajout `civilite` (fallback obligatoire
 *    « Madame, Monsieur, ») + `presentation_societe` (placeholder lot D).
 *
 * Variables couvertes (v2+) :
 *   greeting (salutation complète TU/VOUS), civilite, archi_prenom, archi_nom,
 *   cabinet, ao_objet, ao_acheteur, ao_departement, ao_cloture (date FR),
 *   lien_ao, lien_opposition, presentation_societe, rgpd_block (HTML)
 *
 * Parsing du contact :
 *  - `architects.contactName` (peut être NULL — ~50 % de l'export Odoo).
 *  - Split sur 1er espace → prénom / nom (fallback : prénom = nom complet,
 *    nom = "").
 *  - Si `contactName` NULL → `archi_prenom = "partenaire"`, `archi_nom = ""`.
 *    Cohérent avec le ton TU/VOUS : « Salut partenaire » / « Bonjour partenaire ».
 *
 * Civilité :
 *  - Dérivée de `architects.title` si disponible et mappable ("M." / "Mme" /
 *    "M" / "Monsieur" → "Monsieur" ; "Mme" / "Madame" → "Madame").
 *  - Fallback obligatoire (copy v2 §A, note dépendance données) :
 *    "Madame, Monsieur," si title absent ou non mappable.
 *  - Uniquement utilisée dans la variante VOUS (formelle). Ignorée en TU.
 *
 * Formattage date cloture :
 *  - Format FR : `28 mai 2026` (jour + mois littéral + année).
 *  - Locale `fr-FR` via `Intl.DateTimeFormat`.
 *  - Si `deadline` NULL → `ao_cloture = "à confirmer"`.
 *
 * presentation_societe :
 *  - Placeholder pour le lot D (éditable par société via `message_templates`).
 *  - Contenu par défaut : bloc AlyoS 4 puces copy v2 §A.
 *  - En texte brut HTML (paragraphe + liste UL). Non échappé — c'est du HTML
 *    de confiance (origine code, pas données utilisateur).
 */

import type { Architect } from "@/db/schema/architects";
import type { Tender } from "@/db/schema/tenders";

import { buildRgpdBlockHtml, buildRgpdBlockText } from "./rgpd-block";
import { PRESENTATION_SOCIETE_HTML_DEFAULT } from "./templates-copy";

export interface BrevoArchitectVariables {
  /**
   * Salutation complète, prête à insérer dans le template :
   *   - TU   : "Bonjour Marie,"
   *   - VOUS : "Bonjour Madame Dupont," / "Bonjour Monsieur Dupont,"
   *            ou "Bonjour Madame, Monsieur," si civilité inconnue
   */
  greeting: string;
  /**
   * Civilité : "Madame" | "Monsieur" | "Madame, Monsieur," (fallback).
   * Utilisée dans la variante VOUS (formelle) pour l'appel.
   */
  civilite: string;
  archi_prenom: string;
  archi_nom: string;
  cabinet: string;
  ao_objet: string;
  ao_acheteur: string;
  ao_departement: string;
  ao_cloture: string;
  lien_ao: string;
  lien_opposition: string;
  /**
   * Bloc présentation AlyoS Ingénierie (4 puces — copy v2 §A/B).
   * Contenu par défaut seedé ici ; remplaçable par `message_templates` BDD
   * (lot D, via `resolveBrevoTemplate`).
   */
  presentation_societe: string;
  rgpd_block: string;
  /** Version texte du bloc RGPD pour la part text/plain (Brevo gère les 2). */
  rgpd_block_text: string;
}

/** Inputs nécessaires à la construction — caller responsable de les charger. */
export interface BuildVariablesInput {
  architect: Pick<Architect, "cabinet" | "contactName"> & {
    /** `title` optionnel (champ Odoo "Civilité" — valeurs libres). */
    title?: string | null;
  };
  tender: Pick<Tender, "title" | "buyer" | "deadline">;
  /** Département extrait par le matcher (cf. matching.ts `extractDepartment`). */
  tenderDepartment: string | null;
  /** URL absolue de la page tokenisée architecte (`/archi/[token]`). */
  lienAo: string;
  /** URL absolue de la page d'opposition (`/archi/oppose/[token]`). */
  lienOpposition: string;
  /**
   * Override de `presentation_societe` (lot D — éditable BDD).
   * Si absent, on utilise `PRESENTATION_SOCIETE_HTML_DEFAULT`.
   */
  presentationSociete?: string;
  /**
   * Registre TU/VOUS — utilisé pour calculer la salutation.
   * Si absent, fallback VOUS (vouvoiement par défaut).
   */
  register?: "tu" | "vous";
}

/**
 * Split le `contactName` sur le premier espace.
 * Tolère espaces multiples, trim. Fallback « partenaire » si NULL/vide.
 *
 * Exemples :
 *   "Marie Dupont"      → { prenom: "Marie", nom: "Dupont" }
 *   "Jean Pierre Marie" → { prenom: "Jean", nom: "Pierre Marie" }
 *   "Solo"              → { prenom: "Solo", nom: "" }
 *   null / ""           → { prenom: "partenaire", nom: "" }
 */
export function splitContactName(contactName: string | null | undefined): {
  prenom: string;
  nom: string;
} {
  const trimmed = (contactName ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return { prenom: "partenaire", nom: "" };
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return { prenom: trimmed, nom: "" };
  return { prenom: trimmed.substring(0, idx), nom: trimmed.substring(idx + 1) };
}

/**
 * Dérive la civilité depuis le champ `title` Odoo (valeurs libres — pas
 * d'enum Postgres).
 *
 * Mapping :
 *   "M." | "M" | "Monsieur" → "Monsieur"
 *   "Mme" | "Mme." | "Madame" → "Madame"
 *   tout autre | null → "Madame, Monsieur," (fallback obligatoire copy v2)
 *
 * La comparaison est insensible à la casse et aux espaces superflus.
 */
export function deriveCivilite(title: string | null | undefined): string {
  const t = (title ?? "").trim().toLowerCase();
  if (t === "m." || t === "m" || t === "monsieur") return "Monsieur";
  if (t === "mme" || t === "mme." || t === "madame") return "Madame";
  return "Madame, Monsieur,";
}

/**
 * Formate la date de clôture en FR : `28 mai 2026` (lowercase mois).
 * Fallback : `à confirmer` si NULL.
 *
 * @param deadline — `Date` ou `null`
 */
export function formatClotureFr(deadline: Date | null | undefined): string {
  if (!deadline) return "à confirmer";
  // Intl FR — utilise `numeric` pour le jour et `long` pour le mois.
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
  return fmt.format(deadline);
}

/**
 * Calcule la salutation d'ouverture du mail.
 *
 * Règles :
 *  - TU   : "Bonjour {{prenom}},"
 *  - VOUS + civilité connue (Madame|Monsieur) : "Bonjour {{civilite}} {{nom}},"
 *    (si nom vide → "Bonjour {{civilite}},")
 *  - VOUS + civilité fallback ("Madame, Monsieur,") : "Bonjour Madame, Monsieur,"
 *
 * @param register  — "tu" ou "vous"
 * @param civilite  — résultat de deriveCivilite()
 * @param prenom    — résultat de splitContactName().prenom
 * @param nom       — résultat de splitContactName().nom
 */
export function buildGreeting(
  register: "tu" | "vous",
  civilite: string,
  prenom: string,
  nom: string,
): string {
  if (register === "tu") {
    return `Bonjour ${prenom},`;
  }
  const knownCivility = civilite === "Madame" || civilite === "Monsieur";
  if (knownCivility) {
    const namePart = nom.trim();
    return namePart ? `Bonjour ${civilite} ${namePart},` : `Bonjour ${civilite},`;
  }
  return "Bonjour Madame, Monsieur,";
}

/**
 * Construit toutes les variables Brevo nécessaires aux templates architecte.
 * Inclut le bloc RGPD pré-interpolé (Option A — Q3 Board) et les nouvelles
 * variables v2 : `civilite` + `presentation_societe`.
 *
 * @throws `Error` si `lienOpposition` invalide (propagé depuis `buildRgpdBlock*`).
 */
export function buildBrevoVariables(input: BuildVariablesInput): BrevoArchitectVariables {
  const { prenom, nom } = splitContactName(input.architect.contactName);
  const cabinet = input.architect.cabinet || "votre cabinet";
  const ao_departement = input.tenderDepartment ?? "—";

  const rgpd_block = buildRgpdBlockHtml({
    cabinet,
    lienOpposition: input.lienOpposition,
  });
  const rgpd_block_text = buildRgpdBlockText({
    cabinet,
    lienOpposition: input.lienOpposition,
  });

  const civilite_value = deriveCivilite(input.architect.title);
  const register = input.register ?? "vous";
  const greeting = buildGreeting(register, civilite_value, prenom, nom);

  return {
    greeting,
    civilite: civilite_value,
    archi_prenom: prenom,
    archi_nom: nom,
    cabinet,
    ao_objet: input.tender.title,
    ao_acheteur: input.tender.buyer,
    ao_departement,
    ao_cloture: formatClotureFr(input.tender.deadline),
    lien_ao: input.lienAo,
    lien_opposition: input.lienOpposition,
    presentation_societe: input.presentationSociete ?? PRESENTATION_SOCIETE_HTML_DEFAULT,
    rgpd_block,
    rgpd_block_text,
  };
}
