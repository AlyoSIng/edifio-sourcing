/**
 * Générateur CERFA via template `.docx` Mustache (chantier H1, Steve 2026-06-04).
 *
 * Voie A décidée le 2026-06-03 : au lieu de générer un PDF custom via pdf-lib
 * (qui ressemble vaguement au CERFA officiel), on laisse Steve déposer ses
 * **propres** modèles `.docx` dans la bibliothèque (catégories `dc1`, `dc2`,
 * `pouvoir_mandataire`) avec des balises Mustache embarquées dans le texte
 * Word, et l'app les remplit à la volée à la validation CERFA.
 *
 * Logique de sélection du template :
 *   1. Cherche un `library_items` actif avec `kind = 'dc1' | 'dc2' |
 *      'pouvoir_mandataire'` de l'organisation.
 *   2. Si plusieurs candidats, on prend le plus récent (`created_at DESC`).
 *   3. Si aucun → retourne `{ ok: false, reason: 'no_template' }` et le caller
 *      retombe sur l'ancien flow pdf-lib (rétrocompatibilité).
 *
 * Logique de mapping fields → params Mustache :
 *   Les `CerfaField` ont un `field_id` stable (ex. `archi_cabinet`,
 *   `archi_siret`, `ao_objet`…). On utilise ce field_id comme nom de balise
 *   Mustache. Steve doit donc nommer ses balises `{{ archi_cabinet }}` etc.
 *   En plus on ajoute quelques variables de contexte : `ao_objet`,
 *   `ao_acheteur`, `org_nom`, `archi_cabinet`, `be_cabinet`, `date_jour`.
 *
 * Module pur : pas de BDD ni de Storage directs — le caller fournit le buffer
 * du template (chargé depuis Storage en amont).
 */

import { fillDocxTemplate, type DocxFillParams } from "./docx-fill";

/**
 * Snapshot minimal du contexte CERFA à passer en variables Mustache.
 *
 * `fields` est la liste validée issue de `cerfa-prefill` — chaque entrée
 * a un `field_id` qui devient une clé Mustache, `value` est sa valeur.
 */
export interface CerfaDocxInput {
  /** dc1, dc2 ou pouvoir_mandataire (kind biblio). */
  kind: "dc1" | "dc2" | "pouvoir_mandataire";
  tenderTitle: string;
  tenderBuyer: string;
  organizationName: string;
  selectedArchitectCabinet: string | null;
  selectedBeCabinet: string | null;
  fields: Array<{
    field_id: string;
    value: string;
  }>;
  generatedAt: Date;
}

export interface CerfaDocxResult {
  /** Buffer du `.docx` rempli, prêt à uploader Storage. */
  buffer: Uint8Array;
  /** Nombre de balises substituées. */
  substitutionCount: number;
  /** Balises présentes dans le template mais sans valeur fournie. */
  unknownTokens: string[];
}

/**
 * Construit la table de paramètres Mustache à partir d'un `CerfaDocxInput`.
 * Exporté pour testabilité.
 *
 * On expose **deux familles** de clés :
 *   - **field_id stables** : `archi_cabinet`, `archi_siret`, `org_nom`, …
 *     directement depuis la liste `fields`. Steve peut donc faire
 *     `{{ archi_cabinet }}` dans son .docx et ça matche.
 *   - **variables de contexte AO** : `ao_objet`, `ao_acheteur`,
 *     `org_nom`, `archi_cabinet`, `be_cabinet`, `date_jour`. Pratique
 *     pour les en-têtes / sous-titres du document Word.
 *
 * En cas de collision entre les 2 (ex. `org_nom` fourni à la fois dans
 * `fields` et dans le contexte), `fields` gagne — c'est le contrat validé
 * côté Server Action.
 */
export function buildCerfaMustacheParams(input: CerfaDocxInput): DocxFillParams {
  const params: DocxFillParams = {};

  // Variables de contexte AO (peuvent être surchargées par fields).
  params.ao_objet = input.tenderTitle;
  params.ao_acheteur = input.tenderBuyer;
  params.org_nom = input.organizationName;
  params.archi_cabinet = input.selectedArchitectCabinet ?? "";
  params.be_cabinet = input.selectedBeCabinet ?? "";
  params.date_jour = input.generatedAt.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  params.date_iso = input.generatedAt.toISOString().slice(0, 10);

  // Variables issues de la saisie validée — clé = field_id, valeur = value.
  // On écrase les variables de contexte si même clé.
  for (const f of input.fields) {
    params[f.field_id] = f.value ?? "";
  }

  return params;
}

/**
 * Remplit un template `.docx` Mustache avec les valeurs CERFA validées.
 *
 * @param templateBuffer  Buffer du `.docx` source (chargé depuis Storage par le caller).
 * @param input           Snapshot CERFA à imprimer.
 */
export function generateCerfaDocx(
  templateBuffer: Uint8Array,
  input: CerfaDocxInput,
): CerfaDocxResult {
  const params = buildCerfaMustacheParams(input);
  const result = fillDocxTemplate(templateBuffer, params);
  return {
    buffer: result.buffer,
    substitutionCount: result.substitutionCount,
    unknownTokens: result.unknownTokens,
  };
}

/**
 * Détermine le `kind` de library_item à chercher selon le contexte CERFA.
 * DC1 et DC2 → kind biblio identique au nom CERFA. Pouvoir → 'pouvoir_mandataire'.
 *
 * Exporté pour testabilité.
 */
export function cerfaKindToLibraryKind(cerfaKind: "DC1" | "DC2"): "dc1" | "dc2" {
  return cerfaKind === "DC1" ? "dc1" : "dc2";
}
