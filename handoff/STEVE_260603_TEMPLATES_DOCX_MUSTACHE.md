# Steve — Comment préparer tes templates DC1 / DC2 / Pouvoir

**Date** : 2026-06-03
**Contexte** : chantier B+C (voie A — Mustache .docx) acté ce jour.

## Ce qui change

À partir de la prochaine session, **l'app n'utilisera plus pdf-lib** pour
fabriquer DC1, DC2 et Pouvoir. À la place :

1. Tu déposes tes propres modèles `.docx` dans ta bibliothèque (déjà fait pour
   DC1 + DC2 + Pouvoir d'après ton screenshot — mais ce sont des `.doc`, pas
   des `.docx`).
2. Tu ajoutes des **balises Mustache** dans ces templates aux endroits où
   l'app doit injecter les données BDD.
3. À la validation CERFA / compilation Pouvoir, l'app charge ton template,
   remplace les balises par les valeurs réelles, et sort un `.docx` rempli.

Le résultat reste éditable côté Word. L'archi peut le réviser/signer/imprimer
avant de déposer sur la plateforme officielle.

## Étape 1 — Convertir tes .doc en .docx

Ouvre chacun des 3 fichiers dans Word, puis `Fichier → Enregistrer sous` →
choisir le format **« Document Word (\*.docx) »** (pas `.doc`).

Sauvegarde-les sous des noms parlants :
- `AlyoS Ingenierie - DC1.docx`
- `AlyoS Ingenierie - DC2.docx`
- `AlyoS Ingenierie - Pouvoir.docx`

## Étape 2 — Ajouter les balises Mustache

Une balise = `{{nom_du_champ}}` posée directement dans le corps Word, comme
du texte normal. Tu peux la coller au milieu d'une phrase, dans un tableau,
dans une cellule CERFA — peu importe.

**Règle d'or** : tape la balise d'un seul tenant, sans changer le format
au milieu (pas de gras sur une lettre, pas de souligné partiel). Si tu veux
mettre la valeur en gras une fois remplie, c'est la balise entière qu'il
faut mettre en gras.

### Balises disponibles (DC1 et DC2)

| Balise | Contenu | Source BDD |
|---|---|---|
| `{{alyos_raison_sociale}}` | « AlyoS Ingénierie » | profil organisation |
| `{{alyos_forme_juridique}}` | « SARL », « SAS », « EURL »… | profil organisation (DC1 §A1 + DC2 §B1) |
| `{{alyos_siret}}` | SIRET AlyoS | profil organisation |
| `{{alyos_adresse}}` | adresse complète | profil organisation |
| `{{alyos_code_postal}}` | code postal AlyoS | profil organisation |
| `{{alyos_ville}}` | ville AlyoS | profil organisation |
| `{{alyos_telephone}}` | téléphone AlyoS | profil organisation |
| `{{alyos_email}}` | email AlyoS | profil organisation |
| `{{alyos_capital_eur}}` | capital social (en euros) | profil organisation |
| `{{alyos_representant_nom}}` | nom du signataire AlyoS | profil organisation |
| `{{alyos_representant_qualite}}` | « Président », « Gérant » … | profil organisation |
| `{{alyos_effectif}}` | effectif moyen annuel | profil organisation |
| `{{alyos_ca_n1}}` `{{alyos_ca_n2}}` `{{alyos_ca_n3}}` | chiffres d'affaires N-1/2/3 | profil organisation |
| `{{archi_cabinet}}` | nom du cabinet archi mandataire | fiche architecte |
| `{{archi_forme_juridique}}` | « SARL d'architecture », « SELARL »… | fiche architecte (DC1 §A1) |
| `{{archi_siret}}` | SIRET de l'archi | fiche architecte |
| `{{archi_adresse}}` | adresse archi | fiche architecte |
| `{{archi_representant_nom}}` | nom du signataire archi | fiche architecte |
| `{{archi_representant_qualite}}` | qualité du signataire archi | fiche architecte |
| `{{ao_objet}}` | intitulé du marché | tender |
| `{{ao_reference}}` | référence AO (externalRef) | tender |
| `{{ao_acheteur}}` | nom de l'acheteur (MOA) | tender |
| `{{ao_lot}}` | numéro/intitulé de lot | tender (si renseigné) |
| `{{date_jour}}` | date du jour au format DD/MM/YYYY | calculé au remplissage |
| `{{lieu_signature}}` | ville de signature AlyoS | profil organisation |

### Balises supplémentaires (Pouvoir mandataire)

Le Pouvoir étant un document AlyoS → archi, on a en plus :

| Balise | Contenu |
|---|---|
| `{{pouvoir_archi_email}}` | email archi (destinataire du pouvoir) |
| `{{pouvoir_archi_telephone}}` | téléphone archi |

### Balises inconnues

Si tu écris `{{champ_qui_existe_pas}}`, l'app le laisse **tel quel** dans le
document final (visuel rouge évident) et te signale l'erreur côté UI. Comme
ça tu vois immédiatement la coquille.

## Étape 3 — Uploader dans la bibliothèque

Va sur `/sourcing/admin/bibliotheque` :
- DC1.docx → catégorie **DC1 — Déclaration du candidat**
- DC2.docx → catégorie **DC2 — Déclaration du candidat (lots)**
- Pouvoir.docx → catégorie **Pouvoir mandataire**

Les anciens `.doc` peuvent être supprimés ou laissés en doublon (l'app prend
toujours le plus récent par catégorie).

## Étape 4 — Tester

À la prochaine livraison de l'app (chantier B+C session suivante), tu
testeras le flow sur un AO réel :

1. Sélectionner un AO en Tandem
2. Cliquer sur « Préparer le dossier » pour un archi accepté
3. Aller sur la page CERFA → bouton « Générer DC1 / DC2 depuis template »
4. L'app remplit les balises et sauve un `.docx` rempli dans Storage
5. Tu télécharges, vérifies dans Word, c'est OK

## Bonus — tester localement avant la session suivante

Si tu veux vérifier que tes balises sont propres avant que je code
l'intégration :
- Tape un texte simple dans Word avec quelques `{{archi_cabinet}}`
- Sauve en .docx
- Re-ouvre dans Word et copie tout en clipboard
- Si le texte que tu vois ressort à l'identique sans accents/styles qui
  cassent ta balise, c'est bon

L'autre piège classique : copier-coller une balise depuis cette doc vers
Word peut transformer les `{{` en guillemets typographiques `« »`. Si ça
arrive, retape la balise à la main directement dans Word.

## Limites connues (V1)

- Pas de section conditionnelle `{{#si_archi}}...{{/si_archi}}` (loops/conditionnels).
  Si une donnée est vide, le texte autour reste tel quel. Si besoin d'avoir
  un encart qui apparaît uniquement si tu réponds en BE cotraitant, on
  refactorera vers `docxtemplater` (lib dédiée).
- Pas de tableau dynamique (un tableau avec autant de lignes que de BE
  cotraitants). Si tu veux ça plus tard, on l'ajoute en V2.
- Pas de format conditionnel sur les valeurs (chiffres en euros formatés,
  dates dans une langue spécifique). Pour l'instant, ce que la BDD a sort
  tel quel.
