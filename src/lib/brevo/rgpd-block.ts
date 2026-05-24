/**
 * Bloc RGPD art.14 — variable code `{{rgpd_block}}` injectée dans les
 * templates Brevo de sollicitation architecte (1er envoi obligatoire).
 *
 * Source de vérité :
 *  - `design/copy/email_sollicitation_architecte_v1.md` §C
 *    (texte verbatim validé par CMO Léa)
 *  - Décision Q3 Board 2026-05-24 : **Option A** — bloc injecté en variable
 *    de code, pas dans le template Brevo (permet override applicatif si
 *    régulation évolue, sans rééditer 5 templates).
 *  - `specs/rgpd_registre_architectes_DRAFT.md` (art. 14 RGPD — info
 *    obligatoire quand données non collectées auprès de la personne).
 *
 * Format :
 *  - HTML pour le rendu mail (couleur grise, italique, taille réduite)
 *  - Texte brut généré en parallèle pour la version `text/plain` du mail
 *
 * Le bloc contient `{{cabinet}}` et `{{lien_opposition}}` — Brevo
 * **n'interpole pas** les variables à l'intérieur d'une autre variable
 * (limitation confirmée doc Brevo). On fait donc l'interpolation côté
 * code AVANT envoi : `buildRgpdBlockHtml({ cabinet, lienOpposition })`.
 *
 * **Mandatory** : `lienOpposition` ne peut pas être vide (RGPD art. 21 —
 * droit d'opposition doit être actionnable). On throw si absent.
 */

export interface RgpdBlockInput {
  /** Nom du cabinet (snapshot — sera affiché tel quel dans le mail). */
  cabinet: string;
  /** URL absolue de la page d'opposition tokenisée (`/archi/oppose/[token]`). */
  lienOpposition: string;
}

const STYLE_BLOCK =
  'style="color:#6B7280;font-size:12px;line-height:1.5;font-style:italic;margin-top:24px;padding-top:16px;border-top:1px solid #E5E7EB;"';
const STYLE_LINK = 'style="color:#FF0033;text-decoration:underline;"';

/**
 * Construit la version HTML du bloc RGPD. Les valeurs `cabinet` et
 * `lienOpposition` sont injectées + échappées (HTML entities) pour éviter
 * tout XSS si un nom de cabinet contient `<`/`>`/`&`.
 *
 * @throws `Error` si `lienOpposition` manquant ou ne commence pas par http(s).
 */
export function buildRgpdBlockHtml(input: RgpdBlockInput): string {
  if (!input.lienOpposition || !/^https?:\/\//.test(input.lienOpposition)) {
    throw new Error(
      "buildRgpdBlockHtml: lienOpposition requis et doit être une URL absolue (http/https)",
    );
  }
  const cabinet = escapeHtml(input.cabinet || "votre cabinet");
  const href = escapeHtml(input.lienOpposition);
  return (
    `<p ${STYLE_BLOCK}>` +
    `Vous recevez ce message car AlyoS Ingénierie a identifié ${cabinet} comme partenaire ` +
    `potentiel pour une réponse en cotraitance à des marchés publics de maîtrise d'œuvre. ` +
    `Vos coordonnées professionnelles proviennent de bases professionnelles et publiques ` +
    `(dont les données ouvertes SIRENE). AlyoS Ingénierie (éditeur de edifio Sourcing) ` +
    `traite ces données dans le seul but de vous proposer des opportunités de cotraitance, ` +
    `sur la base de son intérêt légitime. Vous disposez d'un droit d'accès, de rectification ` +
    `et d'opposition : pour ne plus être sollicité, ` +
    `<a href="${href}" ${STYLE_LINK}>cliquez ici</a> ` +
    `ou écrivez-nous. Données hébergées dans l'Union européenne.` +
    `</p>`
  );
}

/**
 * Version texte brut (pour la part `text/plain` du mail).
 */
export function buildRgpdBlockText(input: RgpdBlockInput): string {
  if (!input.lienOpposition || !/^https?:\/\//.test(input.lienOpposition)) {
    throw new Error(
      "buildRgpdBlockText: lienOpposition requis et doit être une URL absolue (http/https)",
    );
  }
  const cabinet = input.cabinet || "votre cabinet";
  return (
    `\n\n---\n` +
    `Vous recevez ce message car AlyoS Ingénierie a identifié ${cabinet} comme partenaire ` +
    `potentiel pour une réponse en cotraitance à des marchés publics de maîtrise d'œuvre. ` +
    `Vos coordonnées professionnelles proviennent de bases professionnelles et publiques ` +
    `(dont les données ouvertes SIRENE). AlyoS Ingénierie (éditeur de edifio Sourcing) ` +
    `traite ces données dans le seul but de vous proposer des opportunités de cotraitance, ` +
    `sur la base de son intérêt légitime. Vous disposez d'un droit d'accès, de rectification ` +
    `et d'opposition : pour ne plus être sollicité, ouvrez : ${input.lienOpposition} ` +
    `ou écrivez-nous. Données hébergées dans l'Union européenne.`
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
