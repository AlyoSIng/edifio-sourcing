# Copy — 1er mail de sollicitation cotraitance (architecte)

**Auteur** : [CMO Léa]
**Date** : 2026-05-21
**Statut** : v1 — pour intégration Brevo (templates `architect_solicitation_TU` / `architect_solicitation_VOUS`)
**Réf.** : `specs/module_tandem_engine_v1.md` §3.3 + `specs/rgpd_registre_architectes_DRAFT.md` (art. 14) + `design/tokens.json` (charte edifio)

> **Principe de ton** (charte éditoriale edifio) : direct, chaleureux, sans jargon. On parle d'égal à égal entre pros du bâtiment. Pas de « cher partenaire », pas de tournures commerciales lourdes. Le but du 1er mail : donner envie d'ouvrir l'AO, pas tout dire.

---

## Variables Brevo

`{{archi_prenom}}`, `{{archi_nom}}`, `{{cabinet}}`, `{{ao_objet}}`, `{{ao_acheteur}}`, `{{ao_departement}}`, `{{ao_cloture}}`, `{{lien_ao}}` (page tokenisée), `{{lien_opposition}}`.

---

## A. Variante TU — `architect_solicitation_TU`

**Objet :** Un AO pour nous deux ? {{ao_objet}} ({{ao_departement}})

**Corps :**

Salut {{archi_prenom}},

On vient de repérer un appel d'offres qui pourrait nous intéresser tous les deux : **{{ao_objet}}**, pour {{ao_acheteur}}. Clôture le {{ao_cloture}}.

Ça colle bien à ce que tu fais. On se disait que ce serait l'occasion d'y répondre ensemble, en cotraitance.

Le détail de l'AO est ici — tu peux jeter un œil et nous dire si tu es partant, en deux clics :

**→ [Voir l'AO et répondre]({{lien_ao}})**

À très vite,
L'équipe AlyoS Ingénierie
*via edifio Sourcing*

---

## B. Variante VOUS — `architect_solicitation_VOUS`

**Objet :** Une réponse en cotraitance ? {{ao_objet}} ({{ao_departement}})

**Corps :**

Bonjour {{archi_prenom}} {{archi_nom}},

Nous venons de repérer un appel d'offres qui pourrait vous intéresser : **{{ao_objet}}**, pour {{ao_acheteur}}. La clôture est fixée au {{ao_cloture}}.

Le projet correspond bien à votre champ d'intervention. Nous serions ravis d'y répondre avec vous, en cotraitance.

Vous trouverez le détail de l'AO ci-dessous — vous pouvez le consulter et nous indiquer si vous êtes intéressé(e), en quelques clics :

**→ [Voir l'AO et répondre]({{lien_ao}})**

Bien à vous,
L'équipe AlyoS Ingénierie
*via edifio Sourcing*

---

## C. Mention d'information RGPD (art. 14) — pied de mail, OBLIGATOIRE sur le 1er envoi

> Bloc en petits caractères, gris (`--muted`), sous la signature. Identique TU/VOUS.

---

*Vous recevez ce message car AlyoS Ingénierie a identifié {{cabinet}} comme partenaire potentiel pour une réponse en cotraitance à des marchés publics de maîtrise d'œuvre. Vos coordonnées professionnelles proviennent de bases professionnelles et publiques (dont les données ouvertes SIRENE). AlyoS Ingénierie (éditeur de edifio Sourcing) traite ces données dans le seul but de vous proposer des opportunités de cotraitance, sur la base de son intérêt légitime. Vous disposez d'un droit d'accès, de rectification et d'opposition : pour ne plus être sollicité, [cliquez ici]({{lien_opposition}}) ou écrivez-nous. Données hébergées dans l'Union européenne.*

---

## D. Notes d'intégration

- La mention RGPD (C) est **obligatoire au 1er contact** (art. 14 — données non collectées auprès de la personne). Sur les relances (D.3/D.4 de `templates_brevo_v1.md`), un lien d'opposition suffit.
- `{{lien_opposition}}` → page publique tokenisée qui passe l'architecte en `active=false` (cf. `architects_data_and_admin_v1.md` §5).
- Respecter la charte : titres Space Grotesk, corps Inter, CTA rouge `#FF0033` (radius 6px, padding 11/20, 14px/600), fond `#FAF9F6`.
- Objets testables en A/B (Brevo) ultérieurement — garder ces deux-là comme référence v1.
- Signature stricte : « L'équipe AlyoS Ingénierie » + « via edifio Sourcing » (jamais « Alyos »).
