# Copy — 1er mail de sollicitation cotraitance (architecte) — v2

**Auteur** : [CMO Léa]
**Date** : 2026-05-25
**Statut** : v2 — **remplace v1**. Pour intégration Brevo (templates `architect_solicitation_*`).
**Évolutions demandées par le Board (2026-05-25)** :
1. Ajout d'un bloc « qui est AlyoS » en **3-4 points clés** (missions issues de alyosingenierie.fr).
2. **Civilité** « Madame / Monsieur » dans l'adresse.
**Réf.** : `specs/module_tandem_engine_v1.md` §3.3 + `specs/rgpd_registre_architectes_DRAFT.md` (art. 14) + design system edifio v1.0.

> **Principe de ton** (charte éditoriale edifio) : direct, chaleureux, sans jargon, d'égal à égal entre pros du bâtiment. Le 1er mail doit donner envie d'ouvrir l'AO — le bloc « qui est AlyoS » reste **court** (4 puces max), ce n'est pas une plaquette.

---

## Variables Brevo

`{{civilite}}` (« Madame » / « Monsieur » — **fallback obligatoire** « Madame, Monsieur »), `{{archi_prenom}}`, `{{archi_nom}}`, `{{cabinet}}`, `{{ao_objet}}`, `{{ao_acheteur}}`, `{{ao_departement}}`, `{{ao_cloture}}`, `{{lien_ao}}` (page tokenisée), `{{lien_opposition}}`.

> ⚠️ **Dépendance données (à confirmer Nadia)** : la table `architects` expose `title` mais pas de champ civilité fiable. Prévoir un champ/dérivation `civilite` ; **si la civilité est inconnue, utiliser la formule d'appel « Madame, Monsieur, »** (jamais d'appel vide ou genré au hasard). Syntaxe Brevo type : `{{ contact.CIVILITE | default : "Madame, Monsieur" }}`.

---

## A. Variante FORMELLE (standard de lancement) — `architect_solicitation_VOUS`

**Objet :** Une réponse en cotraitance ? {{ao_objet}} ({{ao_departement}})

**Corps :**

{{civilite}} {{archi_nom}},

Nous venons de repérer un appel d'offres qui pourrait vous intéresser : **{{ao_objet}}**, pour {{ao_acheteur}}. La clôture est fixée au {{ao_cloture}}.

Le projet correspond bien à votre champ d'intervention, et nous serions ravis d'y répondre **avec vous, en cotraitance**.

En quelques mots, AlyoS Ingénierie est un bureau d'études en ingénierie de la construction :

- **Économie de la construction & maîtrise d'œuvre**, en neuf comme en réhabilitation — métrés et chiffrages tous corps d'état, missions de conception (loi MOP).
- **Expertises spécialisées** : accessibilité (Ad'AP) et **AMO PPMS**, ingénierie de la démolition avec **diagnostic PEMD** et gestion du risque amiante, **économie circulaire et réemploi**.
- **Ingénierie numérique & BIM** : BIM Management, AMO BIM, intégrateur de solutions ACCA Software — un vrai atout sur les dossiers publics.
- **Deux agences, en Normandie et en PACA**, habituées des marchés publics de maîtrise d'œuvre.

Le détail de l'AO est consultable ci-dessous — vous pouvez le parcourir et nous indiquer si vous êtes intéressé(e), en quelques clics :

**→ [Voir l'AO et répondre]({{lien_ao}})**

Bien à vous,
L'équipe AlyoS Ingénierie
*via edifio Sourcing*

---

## B. Variante FAMILIÈRE (contacts déjà connus uniquement) — `architect_solicitation_TU`

> À n'utiliser que pour les architectes avec qui AlyoS a déjà une relation de tutoiement. Pour un 1er contact « à froid », utiliser la variante formelle A. Pas de civilité ici (relation établie).

**Objet :** Un AO pour nous deux ? {{ao_objet}} ({{ao_departement}})

**Corps :**

Salut {{archi_prenom}},

On vient de repérer un appel d'offres qui pourrait nous intéresser tous les deux : **{{ao_objet}}**, pour {{ao_acheteur}}. Clôture le {{ao_cloture}}.

Ça colle bien à ce que tu fais, et ce serait l'occasion d'y répondre ensemble, en cotraitance.

Pour rappel, côté AlyoS on couvre : l'économie de la construction et la maîtrise d'œuvre (neuf & réhabilitation), l'accessibilité et l'AMO PPMS, l'ingénierie de la démolition (diagnostic PEMD, amiante), l'économie circulaire et le réemploi, et tout le volet BIM (BIM Management, AMO BIM, intégrateur ACCA Software).

Le détail est ici, tu nous dis si tu es partant en deux clics :

**→ [Voir l'AO et répondre]({{lien_ao}})**

À très vite,
L'équipe AlyoS Ingénierie
*via edifio Sourcing*

---

## C. Mention d'information RGPD (art. 14) — pied de mail, OBLIGATOIRE au 1er envoi

> Bloc en petits caractères, gris (`--muted`), sous la signature. Identique aux deux variantes.

*Vous recevez ce message car AlyoS Ingénierie a identifié {{cabinet}} comme partenaire potentiel pour une réponse en cotraitance à des marchés publics de maîtrise d'œuvre. Vos coordonnées professionnelles proviennent de bases professionnelles et publiques (dont les données ouvertes SIRENE). AlyoS Ingénierie (éditeur de edifio Sourcing) traite ces données dans le seul but de vous proposer des opportunités de cotraitance, sur la base de son intérêt légitime. Vous disposez d'un droit d'accès, de rectification et d'opposition : pour ne plus être sollicité, [cliquez ici]({{lien_opposition}}) ou écrivez-nous. Données hébergées dans l'Union européenne.*

---

## D. Notes d'intégration

- **Civilité** : variante A obligatoirement avec `{{civilite}}` + fallback « Madame, Monsieur, ». Voir dépendance données ci-dessus (Nadia).
- **Registre tu/vous = choix persistant par architecte** (décision Board 2026-05-25). Champ `architects.tutoiement` (déjà en base) : `false` → variante A (formelle, défaut) ; `true` → variante B (tutoiement). Le choix **s'applique à tous les messages futurs** vers cet architecte tant que le Board ne modifie pas la donnée dans la fiche. Défaut à la création = **vouvoiement**. Cf. `SPEC_ADDENDUM_260525_ARCHITECTES_MENU_ET_TRAME_MAIL.md` (Exigence A).
- **Bloc « qui est AlyoS » = contenu par défaut (seed)**, destiné à devenir **éditable par société** (cf. spec Exigence D) — ne pas le considérer comme figé en dur.
- Bloc « qui est AlyoS » : **4 puces max**, factuel, orienté crédibilité cotraitance. Ne pas rallonger.
- Mention RGPD (C) **obligatoire au 1er contact** (art. 14). Sur les relances, un lien d'opposition suffit.
- `{{lien_opposition}}` → page publique tokenisée qui passe l'architecte en opposition (cf. `architects_data_and_admin_v1.md`).
- Charte design system edifio v1.0 : titres Space Grotesk, corps Inter, CTA rouge edifio `#FF0033` (radius 6px, padding 11/20, 14px/600), fond `#FAFAF7`.
- Signature stricte : « L'équipe AlyoS Ingénierie » + « via edifio Sourcing » (jamais « Alyos »).
- Source des missions AlyoS : alyosingenierie.fr → « Nos activités » (consulté 2026-05-25).
