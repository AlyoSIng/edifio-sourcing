/**
 * Copy v2 des templates Brevo — sollicitation architecte.
 *
 * Source de vérité :
 *  - `design/copy/email_sollicitation_architecte_v2.md` (CMO Léa, 2026-05-25)
 *  - Board 2026-05-25 (Lot #56) : intégration copy v2 dans les fonctions d'envoi.
 *
 * Ce fichier contient :
 *  1. Les **sujets** des templates (utilisés dans `resolveBrevoTemplate` comme
 *     référence documentaire ET comme fallback hardcodé si Brevo n'est pas
 *     configuré via templateId numérique).
 *  2. Le **corps par défaut** des templates (HTML — assemblés côté code,
 *     Option A Q3 Board : variables injectées en `params`, pas dans le template
 *     Brevo lui-même). Ces strings sont utilisées par `resolveBrevoTemplate`
 *     comme fallback quand la table `message_templates` BDD n'a pas de valeur
 *     pour l'organisation.
 *  3. `PRESENTATION_SOCIETE_HTML_DEFAULT` — bloc « qui est AlyoS » (4 puces
 *     copy v2 §A). Placeholder pour le lot D (éditable par société via
 *     `message_templates`). À ne pas considérer comme figé en dur.
 *
 * IMPORTANT — Côté Brevo (interface web) :
 *  Les templateId numériques (posés dans `.env.local` via les vars
 *  `BREVO_TEMPLATE_ID_ARCHITECT_SOLICITATION_*`) pointent vers des templates
 *  créés dans l'interface Brevo. Ces templates Brevo doivent exposer les
 *  variables suivantes (syntaxe Brevo `{{ params.NOM_VAR }}`) :
 *    - {{ params.civilite }}           — "Madame" / "Monsieur" / "Madame, Monsieur,"
 *    - {{ params.archi_prenom }}       — prénom architecte
 *    - {{ params.archi_nom }}          — nom architecte
 *    - {{ params.cabinet }}            — raison sociale cabinet
 *    - {{ params.ao_objet }}           — titre de l'AO
 *    - {{ params.ao_acheteur }}        — acheteur public
 *    - {{ params.ao_departement }}     — département
 *    - {{ params.ao_cloture }}         — date clôture FR ("28 mai 2026")
 *    - {{ params.lien_ao }}            — URL page tokenisée CTA obligatoire
 *    - {{ params.lien_opposition }}    — URL opposition RGPD obligatoire
 *    - {{ params.presentation_societe }} — bloc HTML présentation AlyoS (lot D)
 *    - {{ params.rgpd_block }}         — bloc RGPD art.14 HTML complet (Option A)
 *
 *  Les sujets et corps ci-dessous servent de **référence** pour saisir / mettre
 *  à jour ces templates dans l'interface Brevo. Ils constituent également le
 *  fallback de `resolveBrevoTemplate` (Lot C).
 *
 * MISE À JOUR BREVO REQUISE (Lot #56) :
 *  Suite au passage copy v1 → v2, les templates Brevo existants doivent être
 *  mis à jour dans l'interface Brevo :
 *    - `architect_solicitation_VOUS` :
 *        sujet : SUBJECT_SOLICITATION_VOUS (ci-dessous)
 *        corps  : voir BODY_SOLICITATION_VOUS_TEMPLATE
 *    - `architect_solicitation_TU` :
 *        sujet : SUBJECT_SOLICITATION_TU (ci-dessous)
 *        corps  : voir BODY_SOLICITATION_TU_TEMPLATE
 *  Les 3 autres templates (followup TU/VOUS, decline_ack) restent inchangés.
 */

/* -------------------------------------------------------------------------- */
/*  Sujets (copy v2)                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Sujet du template `architect_solicitation_VOUS` (variante formelle).
 * Copy v2 §A.
 */
export const SUBJECT_SOLICITATION_VOUS =
  "Une réponse en cotraitance ? {{ao_objet}} ({{ao_departement}})";

/**
 * Sujet du template `architect_solicitation_TU` (variante familière).
 * Copy v2 §B.
 */
export const SUBJECT_SOLICITATION_TU = "Un AO pour nous deux ? {{ao_objet}} ({{ao_departement}})";

/* -------------------------------------------------------------------------- */
/*  Bloc présentation AlyoS (4 puces — placeholder lot D)                     */
/* -------------------------------------------------------------------------- */

/**
 * Contenu par défaut du bloc « qui est AlyoS » — copy v2 §A, 4 puces.
 * Sera éditable par société via `message_templates` BDD (lot D).
 *
 * Format HTML compatible email (pas de CSS externe — inline styles Brevo).
 * Le bloc est injecté comme variable `{{ params.presentation_societe }}`.
 *
 * Source : alyosingenierie.fr → « Nos activités » (consulté 2026-05-25,
 * validé CMO Léa — cf. copy v2 §A + §D.3).
 */
export const PRESENTATION_SOCIETE_HTML_DEFAULT = [
  "<p>En quelques mots, AlyoS Ingénierie est un bureau d'études en ingénierie",
  "de la construction :</p>",
  "<ul>",
  "  <li><strong>Économie de la construction &amp; maîtrise d'œuvre</strong>,",
  "  en neuf comme en réhabilitation — métrés et chiffrages tous corps d'état,",
  "  missions de conception (loi MOP).</li>",
  "  <li><strong>Expertises spécialisées</strong> : accessibilité (Ad'AP) et",
  "  <strong>AMO PPMS</strong>, ingénierie de la démolition avec",
  "  <strong>diagnostic PEMD</strong> et gestion du risque amiante,",
  "  <strong>économie circulaire et réemploi</strong>.</li>",
  "  <li><strong>Ingénierie numérique &amp; BIM</strong> : BIM Management,",
  "  AMO BIM, intégrateur de solutions ACCA Software — un vrai atout sur les",
  "  dossiers publics.</li>",
  "  <li><strong>Deux agences, en Normandie et en PACA</strong>, habituées",
  "  des marchés publics de maîtrise d'œuvre.</li>",
  "</ul>",
].join("\n");

/**
 * Version texte brut du bloc présentation (pour la part text/plain).
 */
export const PRESENTATION_SOCIETE_TEXT_DEFAULT =
  "Pour rappel, côté AlyoS on couvre : l'économie de la construction et la " +
  "maîtrise d'œuvre (neuf & réhabilitation), l'accessibilité et l'AMO PPMS, " +
  "l'ingénierie de la démolition (diagnostic PEMD, amiante), l'économie " +
  "circulaire et le réemploi, et tout le volet BIM (BIM Management, AMO BIM, " +
  "intégrateur ACCA Software).";

/* -------------------------------------------------------------------------- */
/*  Corps des templates (fallback hardcodé pour resolveBrevoTemplate)         */
/* -------------------------------------------------------------------------- */

/**
 * Corps du template `architect_solicitation_VOUS` — copy v2 §A.
 *
 * Variables Brevo (syntaxe `{{ params.VAR }}`) :
 *   civilite, archi_nom, ao_objet, ao_acheteur, ao_cloture,
 *   presentation_societe, lien_ao, rgpd_block
 *
 * Note : ce corps HTML est utilisé comme fallback par `resolveBrevoTemplate`
 * quand la table `message_templates` BDD n'a pas de contenu pour l'org.
 * En production normale, c'est le template Brevo (templateId) qui est utilisé.
 */
export const BODY_SOLICITATION_VOUS_TEMPLATE = `<p>{{ params.civilite }} {{ params.archi_nom }},</p>

<p>Nous venons de repérer un appel d'offres qui pourrait vous intéresser :
<strong>{{ params.ao_objet }}</strong>, pour {{ params.ao_acheteur }}.
La clôture est fixée au {{ params.ao_cloture }}.</p>

<p>Le projet correspond bien à votre champ d'intervention, et nous serions ravis
d'y répondre <strong>avec vous, en cotraitance</strong>.</p>

{{ params.presentation_societe }}

<p>Le détail de l'AO est consultable ci-dessous — vous pouvez le parcourir et
nous indiquer si vous êtes intéressé(e), en quelques clics :</p>

<p><strong><a href="{{ params.lien_ao }}" style="color:#FF0033;">
→ Voir l'AO et répondre
</a></strong></p>

<p>Bien à vous,<br>L'équipe AlyoS Ingénierie<br><em>via edifio Sourcing</em></p>

{{ params.rgpd_block }}`;

/**
 * Corps du template `architect_solicitation_TU` — copy v2 §B.
 *
 * Variables Brevo (syntaxe `{{ params.VAR }}`) :
 *   archi_prenom, ao_objet, ao_acheteur, ao_cloture,
 *   presentation_societe, lien_ao, rgpd_block
 */
export const BODY_SOLICITATION_TU_TEMPLATE = `<p>Salut {{ params.archi_prenom }},</p>

<p>On vient de repérer un appel d'offres qui pourrait nous intéresser tous les
deux : <strong>{{ params.ao_objet }}</strong>, pour {{ params.ao_acheteur }}.
Clôture le {{ params.ao_cloture }}.</p>

<p>Ça colle bien à ce que tu fais, et ce serait l'occasion d'y répondre
ensemble, en cotraitance.</p>

{{ params.presentation_societe }}

<p>Le détail est ici, tu nous dis si tu es partant en deux clics :</p>

<p><strong><a href="{{ params.lien_ao }}" style="color:#FF0033;">
→ Voir l'AO et répondre
</a></strong></p>

<p>À très vite,<br>L'équipe AlyoS Ingénierie<br><em>via edifio Sourcing</em></p>

{{ params.rgpd_block }}`;

/* -------------------------------------------------------------------------- */
/*  Map complète (utilisée par resolveBrevoTemplate)                          */
/* -------------------------------------------------------------------------- */

/**
 * Contenu par défaut pour chaque clé de template.
 * Clés alignées sur `templateNameFor()` (cf. template-picker.ts).
 */
export const DEFAULT_TEMPLATE_COPY: Record<string, { subject: string; body: string }> = {
  architect_solicitation_VOUS: {
    subject: SUBJECT_SOLICITATION_VOUS,
    body: BODY_SOLICITATION_VOUS_TEMPLATE,
  },
  architect_solicitation_TU: {
    subject: SUBJECT_SOLICITATION_TU,
    body: BODY_SOLICITATION_TU_TEMPLATE,
  },
};
