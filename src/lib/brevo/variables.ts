/**
 * Construction des variables Brevo `params` pour les templates architecte.
 *
 * Source de vérité :
 *  - `design/copy/email_sollicitation_architecte_v1.md` (variables listées)
 *  - `specs/module_tandem_engine_v1.md` §3.3
 *  - Décision Q3 Board 2026-05-24 (Option A) : `{{rgpd_block}}` en variable
 *    de code (injecté ici, pas dans le template Brevo).
 *
 * Variables couvertes :
 *   archi_prenom, archi_nom, cabinet, ao_objet, ao_acheteur, ao_departement,
 *   ao_cloture (date FR), lien_ao, lien_opposition, rgpd_block (HTML)
 *
 * Parsing du contact :
 *  - `architects.contactName` (peut être NULL — ~50 % de l'export Odoo).
 *  - Split sur 1er espace → prénom / nom (fallback : prénom = nom complet,
 *    nom = "").
 *  - Si `contactName` NULL → `archi_prenom = "partenaire"`, `archi_nom = ""`.
 *    Cohérent avec le ton TU/VOUS : « Salut partenaire » / « Bonjour partenaire ».
 *
 * Formattage date cloture :
 *  - Format FR : `28 mai 2026` (jour + mois littéral + année).
 *  - Locale `fr-FR` via `Intl.DateTimeFormat`.
 *  - Si `deadline` NULL → `ao_cloture = "à confirmer"`.
 */

import type { Architect } from "@/db/schema/architects";
import type { Tender } from "@/db/schema/tenders";

import { buildRgpdBlockHtml, buildRgpdBlockText } from "./rgpd-block";

export interface BrevoArchitectVariables {
  archi_prenom: string;
  archi_nom: string;
  cabinet: string;
  ao_objet: string;
  ao_acheteur: string;
  ao_departement: string;
  ao_cloture: string;
  lien_ao: string;
  lien_opposition: string;
  rgpd_block: string;
  /** Version texte du bloc RGPD pour la part text/plain (Brevo gère les 2). */
  rgpd_block_text: string;
}

/** Inputs nécessaires à la construction — caller responsable de les charger. */
export interface BuildVariablesInput {
  architect: Pick<Architect, "cabinet" | "contactName">;
  tender: Pick<Tender, "title" | "buyer" | "deadline">;
  /** Département extrait par le matcher (cf. matching.ts `extractDepartment`). */
  tenderDepartment: string | null;
  /** URL absolue de la page tokenisée architecte (`/archi/[token]`). */
  lienAo: string;
  /** URL absolue de la page d'opposition (`/archi/oppose/[token]`). */
  lienOpposition: string;
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
 * Construit toutes les variables Brevo nécessaires aux templates architecte.
 * Inclut le bloc RGPD pré-interpolé (Option A — Q3 Board).
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

  return {
    archi_prenom: prenom,
    archi_nom: nom,
    cabinet,
    ao_objet: input.tender.title,
    ao_acheteur: input.tender.buyer,
    ao_departement,
    ao_cloture: formatClotureFr(input.tender.deadline),
    lien_ao: input.lienAo,
    lien_opposition: input.lienOpposition,
    rgpd_block,
    rgpd_block_text,
  };
}
