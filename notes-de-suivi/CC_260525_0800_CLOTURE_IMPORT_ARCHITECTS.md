# Clôture — Import architectes réels (prod)

**Date** : 2026-05-25
**Agent** : Alex (dev) pour le script, Nadia (dev_tandem) pour l'analyse et
le mapping — rattrapage documentaire par Nadia

---

## Contexte

Suite à la migration prod des tables architects (clôturée dans
`CC_260525_0800_CLOTURE_CABINET_APPLY.md`), la table `architects` était vide
en prod. Le module Tandem nécessite des architectes en base pour le matching.
Un export Odoo CRM + enrichissement SIRENE (`Contact_complete.xlsx`, 3805 cabinets)
était disponible localement.

La décision d'importer a été prise par Steve après l'analyse Nadia
(`CC_260525_0326_NADIA_IMPORT_ARCHITECTS.md`) et validation des 4 arbitrages :
1. Cible : prod direct (table vide, idempotent par construction)
2. Lignes sans email (1903 / ~50%) : importées avec `solicitable=false` (GENERATED)
3. Tutoiement : tout `false` par défaut (défaut Board Gate 4)
4. Lignes sans `name` (4) : fallback `dirigeant_sirene` puis `"Cabinet sans nom (id)"`

---

## Scénario retenu

**Script CLI** : `scripts/architects-import-260525.ts`
(Scénario B de l'analyse `CC_260525_0326_NADIA_IMPORT_ARCHITECTS.md` §4)

Paramètres d'exécution :
- `--target=prod --commit` (import prod avec commit réel)
- Upsert `ON CONFLICT (odoo_external_id) DO NOTHING` (1er import : aucun conflit attendu)
- Batch de 200 lignes

---

## Résultats (sans donnée personnelle)

| Etape | Valeur |
|---|---|
| Lignes parsées (fichier source) | 3805 |
| Doublons supprimés par dedup `(organization_id, email)` | 365 |
| Tentatives d'insertion (après dedup) | 3440 |
| Insérés en prod | 3440 |
| Mis à jour | 0 (1er import, ON CONFLICT do nothing) |
| Erreurs | 0 |

Explication de l'écart 3805 → 3440 : la fonction `dedupByOrgEmail()` supprime
les 365 doublons sur la clé `(organization_id, email)`. Ce cas se produit
lorsque le même email apparaît plusieurs fois dans l'export (enregistrements
CRM dupliqués avec des `odoo_external_id` distincts mais même email). La règle
de déduplication retient la première occurrence par ordre de lecture du fichier.

Organisation cible : `11111111-1111-1111-1111-111111111111` (AlyoS Ingénierie)

---

## Garanties RGPD

- `Contact_complete.xlsx` : hors repo, gitignored
  (pattern `Contact_complete*.xlsx` dans `.gitignore` ligne 13)
- Rapport JSON dans `tmp/` (gitignored — `tmp/` à ajouter au `.gitignore` si ce
  n'est pas encore fait, cf. reco Nadia dans `CC_260525_0326_NADIA_IMPORT_ARCHITECTS.md` §6)
- Aucune donnée personnelle (email, nom, téléphone) dans ce document ni dans les
  notes de clôture
- Parsing 100% local, aucune donnée envoyée vers un service externe

---

## Idempotence

Re-lancer le script sans modification du fichier source = 0 insertion supplémentaire.
Le conflit sur `odoo_external_id` (UNIQUE) déclenche `DO NOTHING` : les 3440 lignes
existantes sont silencieusement ignorées. Cette propriété est vérifiable en relançant
le script en `--dry-run` : le rapport doit afficher `inserted_estimate: 0`.

---

## Etat post-import

- Table `architects` en prod : 3440 lignes actives
- Colonne `solicitable` (GENERATED ALWAYS AS `email IS NOT NULL` STORED) :
  environ 1537 lignes `solicitable=true` (lignes avec email), 1903 lignes
  `solicitable=false` (lignes sans email) — valeurs approximatives basées sur
  le taux de remplissage 50% de la colonne email dans le fichier source
- `tutoiement` : `false` sur l'ensemble (vouvoiement par défaut Board Gate 4)

---

## Notes sources

- `notes-de-suivi/CC_260525_0326_NADIA_IMPORT_ARCHITECTS.md` (analyse + décision scénario B)
- `scripts/architects-import-260525.ts` (script d'import, non committé — à inclure dans le prochain commit Yann)
- `handoff/REQUEST_260525_CLOTURE_NUIT_DEBLOCAGE_LOT56_57.md` §A.2
