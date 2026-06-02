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
 *    - {{ params.greeting }}           — salutation complète ("Bonjour Madame Dupont," / "Bonjour Marie,")
 *    - {{ params.nom_commercial }}     — nom commercial société émettrice (v3, ex. "AlyoS Ingénierie")
 *    - {{ params.civilite }}           — "Madame" / "Monsieur" / "Madame, Monsieur," (conservé)
 *    - {{ params.archi_prenom }}       — prénom architecte
 *    - {{ params.archi_nom }}          — nom architecte
 *    - {{ params.cabinet }}            — raison sociale cabinet
 *    - {{ params.ao_objet }}           — titre de l'AO
 *    - {{ params.ao_acheteur }}        — acheteur public
 *    - {{ params.ao_departement }}     — département
 *    - {{ params.ao_cloture }}         — date clôture FR ("28 mai 2026")
 *    - {{ params.lien_ao }}            — URL page tokenisée CTA obligatoire
 *    - {{ params.lien_opposition }}    — URL opposition RGPD obligatoire
 *    - {{ params.lien_annonce_officielle }} — URL annonce officielle BOAMP / plateforme source
 *      (optionnelle : encapsuler le rendu dans
 *      `{{#params.lien_annonce_officielle}}…{{/params.lien_annonce_officielle}}`
 *      pour ne pas afficher de lien cassé si `tenders.source_url` est NULL).
 *    - {{{ params.presentation_societe }}} — bloc HTML (triple-accolade = pas d'échappement)
 *    - {{{ params.rgpd_block }}}         — bloc RGPD art.14 HTML (triple-accolade = pas d'échappement)
 *
 *  Note Brevo : double-accolade `{{ X }}` échappe le HTML (sécurité par défaut).
 *  Pour injecter du HTML brut (presentation_societe, rgpd_block), utiliser
 *  la syntaxe triple-accolade `{{{ X }}}` — syntaxe Mustache standard.
 *
 *  Les sujets et corps ci-dessous servent de **référence** pour saisir / mettre
 *  à jour ces templates dans l'interface Brevo. Ils constituent également le
 *  fallback de `resolveBrevoTemplate` (Lot C).
 *
 * MISE À JOUR BREVO REQUISE (PR #63 — copy v3) :
 *  Suite au passage copy v2 → v3, les templates Brevo existants doivent être
 *  mis à jour dans l'interface Brevo :
 *    - `architect_solicitation_VOUS` :
 *        sujet : SUBJECT_SOLICITATION_VOUS (ci-dessous)
 *        corps  : voir BODY_SOLICITATION_VOUS_TEMPLATE (v3 — ajouter {{ params.nom_commercial }})
 *    - `architect_solicitation_TU` :
 *        sujet : SUBJECT_SOLICITATION_TU (ci-dessous)
 *        corps  : voir BODY_SOLICITATION_TU_TEMPLATE (v3 — ajouter {{ params.nom_commercial }})
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
 * Corps du template `architect_solicitation_VOUS` — copy v3 (PR #63).
 *
 * Variables Brevo (syntaxe `{{ params.VAR }}`) :
 *   greeting, nom_commercial, ao_objet, ao_acheteur, ao_departement, ao_cloture,
 *   lien_annonce_officielle (optionnelle — bloc conditionnel Mustache),
 *   presentation_societe, lien_ao, lien_opposition, rgpd_block
 *
 * Note : ce corps HTML est utilisé comme fallback par `resolveBrevoTemplate`
 * quand la table `message_templates` BDD n'a pas de contenu pour l'org.
 * En production normale, c'est le template Brevo (templateId) qui est utilisé.
 */
export const BODY_SOLICITATION_VOUS_TEMPLATE = `<p>{{ params.greeting }}</p>

<p>La société <strong>{{ params.nom_commercial }}</strong> envisage de répondre à un AO en cotraitance et vous propose le rôle de <strong>mandataire MOE</strong>. Vous pouvez répondre en un clic, sans créer de compte.</p>

<p><strong>▸ L'opération</strong></p>
<p>{{ params.ao_objet }}</p>
<ul>
  <li><strong>Acheteur :</strong> {{ params.ao_acheteur }}</li>
  <li><strong>Département :</strong> {{ params.ao_departement }}</li>
  <li><strong>Remise des plis :</strong> {{ params.ao_cloture }}</li>
</ul>
{{#params.lien_annonce_officielle}}
<p><a href="{{ params.lien_annonce_officielle }}" style="color:#FF0033;">→ Consulter l'annonce officielle</a></p>
{{/params.lien_annonce_officielle}}

{{{ params.presentation_societe }}}

<p><strong>▸ Vos options</strong></p>
<p><a href="{{ params.lien_ao }}" style="color:#FF0033;font-weight:bold;">→ Oui, je suis partant(e)</a></p>
<p><a href="{{ params.lien_opposition }}" style="color:#666;">Non, pas cette fois</a></p>

<p>Bien cordialement,<br><em>— via edifio Sourcing</em></p>

{{{ params.rgpd_block }}}`;

/**
 * Corps du template `architect_solicitation_TU` — copy v3 (PR #63).
 *
 * Variables Brevo (syntaxe `{{ params.VAR }}`) :
 *   greeting, nom_commercial, ao_objet, ao_acheteur, ao_departement, ao_cloture,
 *   lien_annonce_officielle (optionnelle — bloc conditionnel Mustache),
 *   presentation_societe, lien_ao, lien_opposition, rgpd_block
 */
export const BODY_SOLICITATION_TU_TEMPLATE = `<p>{{ params.greeting }}</p>

<p>L'entreprise <strong>{{ params.nom_commercial }}</strong> envisage de répondre à un AO en cotraitance et te propose le rôle de <strong>mandataire MOE</strong>. Tu peux répondre en un clic, sans créer de compte.</p>

<p><strong>▸ L'opération</strong></p>
<p>{{ params.ao_objet }}</p>
<ul>
  <li><strong>Acheteur :</strong> {{ params.ao_acheteur }}</li>
  <li><strong>Département :</strong> {{ params.ao_departement }}</li>
  <li><strong>Remise des plis :</strong> {{ params.ao_cloture }}</li>
</ul>
{{#params.lien_annonce_officielle}}
<p><a href="{{ params.lien_annonce_officielle }}" style="color:#FF0033;">→ Consulter l'annonce officielle</a></p>
{{/params.lien_annonce_officielle}}

{{{ params.presentation_societe }}}

<p><strong>▸ Tes options</strong></p>
<p><a href="{{ params.lien_ao }}" style="color:#FF0033;font-weight:bold;">→ Oui, je suis partant</a></p>
<p><a href="{{ params.lien_opposition }}" style="color:#666;">Non, pas cette fois</a></p>

<p>À très vite,<br><em>— via edifio Sourcing</em></p>

{{{ params.rgpd_block }}}`;

/* -------------------------------------------------------------------------- */
/*  Diffusion dossier — sujets + corps (Lot 2 short-list "Dossier prêt")      */
/* -------------------------------------------------------------------------- */

/**
 * Sujet du template `architect_dossier_diffusion_VOUS` (variante formelle).
 * Envoyé à l'architecte cotraitant une fois le dossier de candidature prêt.
 * Le bloc RGPD reste injecté (cohérence templates architecte) mais cette
 * clé n'est PAS soumise aux garde-fous `assertRgpdGuardrails` (cf. template-resolver.ts).
 */
export const SUBJECT_DOSSIER_DIFFUSION_VOUS = "Dossier de candidature prêt : {{ params.ao_objet }}";

/**
 * Sujet du template `architect_dossier_diffusion_TU` (variante familière).
 */
export const SUBJECT_DOSSIER_DIFFUSION_TU = "Le dossier est prêt : {{ params.ao_objet }}";

/**
 * Corps du template `architect_dossier_diffusion_VOUS`.
 * Variables Brevo : greeting, nom_commercial, ao_objet, lien_dossier, rgpd_block.
 */
export const BODY_DOSSIER_DIFFUSION_VOUS_TEMPLATE = `<p>{{ params.greeting }}</p>

<p>Merci d'avoir accepté de partir avec <strong>{{ params.nom_commercial }}</strong> sur ce dossier.</p>

<p>Le dossier de candidature pour <strong>{{ params.ao_objet }}</strong> est prêt. Vous pouvez le consulter et le télécharger depuis le lien ci-dessous.</p>

<p><a href="{{ params.lien_dossier }}" style="color:#FF0033;font-weight:bold;">→ Consulter le dossier de candidature</a></p>

<p>Bien cordialement,<br><em>— via edifio Sourcing</em></p>

{{{ params.rgpd_block }}}`;

/**
 * Corps du template `architect_dossier_diffusion_TU`.
 * Variables Brevo : greeting, nom_commercial, ao_objet, lien_dossier, rgpd_block.
 */
export const BODY_DOSSIER_DIFFUSION_TU_TEMPLATE = `<p>{{ params.greeting }}</p>

<p>Merci d'avoir accepté de partir avec <strong>{{ params.nom_commercial }}</strong> sur ce dossier.</p>

<p>Le dossier de candidature pour <strong>{{ params.ao_objet }}</strong> est prêt. Tu peux le consulter et le télécharger depuis le lien ci-dessous.</p>

<p><a href="{{ params.lien_dossier }}" style="color:#FF0033;font-weight:bold;">→ Consulter le dossier de candidature</a></p>

<p>À très vite,<br><em>— via edifio Sourcing</em></p>

{{{ params.rgpd_block }}}`;

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
  architect_dossier_diffusion_VOUS: {
    subject: SUBJECT_DOSSIER_DIFFUSION_VOUS,
    body: BODY_DOSSIER_DIFFUSION_VOUS_TEMPLATE,
  },
  architect_dossier_diffusion_TU: {
    subject: SUBJECT_DOSSIER_DIFFUSION_TU,
    body: BODY_DOSSIER_DIFFUSION_TU_TEMPLATE,
  },
};
