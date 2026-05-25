# BRIEF — Prochain chantier edifio Sourcing (demandé Board 2026-05-22)

**Émetteur** : [CEO] Marc + [CTO] Sophie + [CMO] Léa (Cowork)
**Destinataires** : Alex (`dev`), Nadia (`dev_tandem`), Camille (`qa`), Hugo (`reviewer`)
**Statut** : 🔴 **Changement de périmètre — en attente validation Board avant lancement**
**Zone** : rouge (nouveau scope) → une fois validé, exécution en zone verte sur specs détaillées.

Deux lots demandés par le Board. Objectif métier final : **piloter la relation
architectes dans la durée** et **accélérer la décision Go/No-Go sur chaque AO**.

---

## LOT A — Architectes dans l'app : édition + suivi du cycle de vie + stats annuelles

### Objectif
Le Board veut, depuis l'app : (1) **voir et mettre à jour** les données architectes,
(2) **suivre le cycle de vie** de chaque sollicitation, (3) **extraire des stats en fin d'année**.

### Cycle de vie à tracer (par couple architecte × AO)
1. **Sollicité** : on a demandé à l'architecte de répondre à un AO (Tandem).
2. **Réponse** : oui / non (/ demande d'infos).
3. **Issue de l'AO** : gagné / perdu / sans suite.

### Données (delta sur l'existant — déjà partiellement en place)
- `architects` (16 cols, déjà reconstruite propre) : écran admin CRUD + recherche + filtres
  (réutiliser la maquette M16 `maquettes_v5_admin_architectes.html`). Import/réimport CSV
  (cf. `specs/architects_data_and_admin_v1.md`).
- Sollicitation : déjà couverte par `architect_tokens` + `brevo_messages` + audit `architect_solicit`.
- Réponse : déjà couverte par `architect_responses` (`pending/accepted/declined/info_requested`).
- **MANQUE — issue de l'AO** : ajouter une notion de résultat sur l'AO.
  Proposition CTO : `tenders.outcome` enum (`en_cours`, `gagne`, `perdu`, `sans_suite`)
  + `outcome_at timestamptz` + `outcome_by uuid`. L'attribution « gagné PAR tel architecte »
  se déduit du `architect_responses.accepted` rattaché à cet AO.
  *(Alternative : table `tender_results` dédiée — à arbitrer par la CTO selon le besoin Odoo.)*

### Stats annuelles (par architecte, par année civile)
Vue de reporting `architect_stats_yearly` exposant : nb sollicitations, nb oui, nb non,
taux de réponse, nb d'AO gagnés en Tandem avec lui, taux de transformation.
Export **xlsx/CSV** déclenchable depuis l'admin (fin d'année).

### IA / RGPD / sécu
- Stats = usage interne AlyoS (pas de partage externe).
- Cohérent avec le registre RGPD architectes (`specs/rgpd_registre_architectes_DRAFT.md`).
- RLS FORCE sur `tenders.outcome` comme le reste ; audit log de chaque changement d'issue.

### Critères d'acceptation
- Je peux éditer une fiche architecte et l'enregistrer (round-trip import/export OK).
- Pour un AO Tandem, je vois qui a été sollicité, qui a dit oui/non, et je peux marquer l'AO gagné/perdu.
- Je peux exporter en fin d'année un tableau de stats par architecte.

---

## LOT B — « AO du jour » enrichi : annonce + RC + brief d'opportunité IA

### Objectif
Sur chaque AO, le Board veut disposer de **trois choses** au même endroit :
1. **L'annonce** (l'avis BOAMP complet).
2. **Le RC** (règlement de consultation).
3. **Un brief d'opportunité rédigé par Claude**.

### 1. Annonce
Données déjà en base (`tenders.raw_data` + champs structurés). Affichage soigné sur la
fiche AO (réutiliser maquette M6). Lien source (`source_url`).

### 2. RC (règlement de consultation)
- Récupérer le DCE depuis `tenders.dce_url`, stocker dans Supabase Storage + `tender_documents`.
- **Difficulté connue** : le DCE est souvent un .zip multi-fichiers ; le RC est un PDF parmi d'autres.
  - **V1** : télécharger le DCE, lister les fichiers, laisser l'utilisateur identifier le RC,
    aperçu/téléchargement.
  - **V2** : extraction auto du RC (heuristique nom de fichier + parsing).
- Approbation Board requise pour tout téléchargement de fichier externe (zone explicite).

### 3. Brief d'opportunité IA
- **Modèle : Sonnet 4.6** (lecture annonce + RC) — cohérent avec l'arbitrage Gate 2/4
  (Sonnet sur RC ; Haiku reste sur la pré-classification des AO).
- **Sortie structurée** : objet & périmètre, lots, montant estimé, dates clés
  (remise, questions, visite), critères d'attribution, **signaux Go/No-Go**,
  adéquation au profil AlyoS, **reco Solo vs Tandem**.
- **Provenance IA obligatoire** : chaque affirmation tirée du RC cite sa page + courte citation
  (règle Gate 5). Validation regex post-extraction.
- **Prompt versionné en BDD** (`ai_prompts`), jamais en dur. Run tracé dans `ai_runs`.
- Stockage du brief : table `tender_briefs` (ou champ jsonb sur `tenders`) + `ai_run_id`.
- **Coût** : métré par run (Sonnet). Garde-fou : brief généré à la demande ou sur AO sélectionné,
  pas sur les 288 AO bruts.

### Critères d'acceptation
- Sur un AO, je vois l'annonce, j'accède au DCE/RC, et je peux générer un brief d'opportunité
  IA avec citations du RC.
- Le brief est reproductible (prompt versionné) et tracé (`ai_runs`).

---

## Séquencement proposé (à valider Board)
1. D'abord finir/merger le chantier en cours (refonte UI, écran profil #40, bug admin #41, Tandem).
2. Durcissement sécu RLS (cf. topo 2026-05-22) AVANT merge prod.
3. Puis Lot A (architectes + suivi + stats) — Nadia, base déjà en place.
4. Puis Lot B (AO enrichi + RC + brief IA) — Alex, plus lourd (Storage + IA + provenance).

→ **Board, valides-tu ce périmètre et ce séquencement ?** (OUI / NON / OUI SOUS RÉSERVE DE…)
