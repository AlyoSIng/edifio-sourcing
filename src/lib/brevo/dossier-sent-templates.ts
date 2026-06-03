/**
 * Templates Brevo — envoi du dossier compilé à l'architecte mandataire.
 *
 * Décision Steve 2026-06-03 : nouveau template dédié `dossier_sent_to_archi`.
 *
 * Versions TU (tutoiement) et VOUS (vouvoiement). Le sujet et le corps sont
 * pré-rendus côté Node.js via `renderMustache` (cf. `dispatch-actions.ts`).
 *
 * Variables Mustache attendues :
 *  - `archi_prenom`, `archi_nom`, `cabinet`
 *  - `ao_objet`, `ao_acheteur`, `ao_departement`, `ao_cloture`
 *  - `lien_telechargement` — signed URL Supabase Storage (7 jours)
 *  - `lien_ao` — URL de l'annonce officielle
 *  - `expiration_dl_jours` — durée de validité du lien DL (chaîne : "7")
 *
 * Pas de mention RGPD nécessaire ici : ce mail n'est PAS une sollicitation
 * commerciale (art.14). C'est un envoi opérationnel à un archi qui a déjà
 * accepté l'AO. Le lien d'opposition reste dispo via le pied-de-page si
 * besoin de l'ajouter en V2.
 */

export const DOSSIER_SENT_SUBJECT_VOUS = `Dossier de candidature prêt — {{ ao_objet }}`;
export const DOSSIER_SENT_SUBJECT_TU = `Ton dossier de candidature est prêt — {{ ao_objet }}`;

// ---------------------------------------------------------------------------
// Corps VOUS (vouvoiement)
// ---------------------------------------------------------------------------

export const DOSSIER_SENT_BODY_VOUS = `<p>Bonjour {{ archi_prenom }} {{ archi_nom }},</p>

<p>Le dossier de candidature pour l'AO <strong>« {{ ao_objet }} »</strong>
({{ ao_acheteur }} — département {{ ao_departement }}) est compilé et prêt
à être déposé.</p>

<p><strong>▸ Date limite de remise :</strong> {{ ao_cloture }}</p>

<p><strong>▸ Téléchargement du dossier (ZIP)</strong></p>
<p>
  <a href="{{ lien_telechargement }}"
     style="display:inline-block;background:#FF0033;color:#fff;font-weight:bold;padding:10px 18px;border-radius:24px;text-decoration:none;">
    → Télécharger le dossier
  </a>
</p>
<p style="font-size:13px;color:#666;">
  Lien valable {{ expiration_dl_jours }} jours. Si besoin d'un nouveau lien,
  contactez-nous, nous pouvons le régénérer.
</p>

<p><strong>▸ Le dossier contient :</strong></p>
<ul>
  <li>DC1 — Lettre de candidature (mandataire = votre cabinet)</li>
  <li>DC2 AlyoS Ingénierie — Cotraitant</li>
  <li>Pouvoir du mandataire signé par AlyoS</li>
  <li>Règlement de Consultation (RC) source</li>
  <li>Pièces complémentaires AlyoS (attestations, références, présentation)</li>
</ul>

<p><strong>▸ Ce qu'il reste à faire de votre côté :</strong></p>
<ol>
  <li>Compléter et signer le DC1 en tant que mandataire</li>
  <li>Joindre vos attestations URSSAF, DGFiP, RC pro et inscription à l'Ordre</li>
  <li>Vérifier le mémoire technique et la cohérence du chiffrage</li>
  <li>Déposer l'ensemble sur la plateforme officielle :
    <a href="{{ lien_ao }}">{{ lien_ao }}</a></li>
</ol>

<p>Nous restons à votre disposition pour toute question.</p>

<p>Bien cordialement,<br><em>— L'équipe AlyoS Ingénierie, via edifio Sourcing</em></p>
`;

// ---------------------------------------------------------------------------
// Corps TU (tutoiement)
// ---------------------------------------------------------------------------

export const DOSSIER_SENT_BODY_TU = `<p>Salut {{ archi_prenom }},</p>

<p>Le dossier de candidature pour l'AO <strong>« {{ ao_objet }} »</strong>
({{ ao_acheteur }} — département {{ ao_departement }}) est compilé et prêt
à être déposé.</p>

<p><strong>▸ Date limite de remise :</strong> {{ ao_cloture }}</p>

<p><strong>▸ Téléchargement du dossier (ZIP)</strong></p>
<p>
  <a href="{{ lien_telechargement }}"
     style="display:inline-block;background:#FF0033;color:#fff;font-weight:bold;padding:10px 18px;border-radius:24px;text-decoration:none;">
    → Télécharger le dossier
  </a>
</p>
<p style="font-size:13px;color:#666;">
  Lien valable {{ expiration_dl_jours }} jours. Si tu as besoin d'un nouveau
  lien, dis-moi, je peux le régénérer.
</p>

<p><strong>▸ Le dossier contient :</strong></p>
<ul>
  <li>DC1 — Lettre de candidature (mandataire = ton cabinet)</li>
  <li>DC2 AlyoS Ingénierie — Cotraitant</li>
  <li>Pouvoir du mandataire signé par AlyoS</li>
  <li>Règlement de Consultation (RC) source</li>
  <li>Pièces complémentaires AlyoS (attestations, références, présentation)</li>
</ul>

<p><strong>▸ Ce qu'il te reste à faire :</strong></p>
<ol>
  <li>Compléter et signer ton DC1 en tant que mandataire</li>
  <li>Joindre tes attestations URSSAF, DGFiP, RC pro et inscription à l'Ordre</li>
  <li>Vérifier le mémoire technique et la cohérence du chiffrage</li>
  <li>Déposer l'ensemble sur la plateforme officielle :
    <a href="{{ lien_ao }}">{{ lien_ao }}</a></li>
</ol>

<p>Je reste dispo pour toute question.</p>

<p>À très vite,<br><em>— L'équipe AlyoS Ingénierie, via edifio Sourcing</em></p>
`;
