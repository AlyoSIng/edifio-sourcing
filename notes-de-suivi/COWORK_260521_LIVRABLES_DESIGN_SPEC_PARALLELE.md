# Note de suivi — Production Cowork parallèle (design + spec)

**Date** : 2026-05-21
**Application** : edifio Sourcing
**Pilotes** : [GRAPHISTE Théo] + [CTO Sophie] + [CMO Léa]
**Rédacteur** : [CEO Marc]
**Contexte** : demande Board — faire avancer pages / fonctionnalités / esthétique en parallèle du backend d'Alex, pendant Gate 6.

---

## 1. Décisions prises

| # | Décision | Pris par | Motif |
|---|----------|----------|-------|
| 1 | Appliquer la **charte edifio** (pas AlyoS) sur l'app | Board | edifio est le produit ; AlyoS reste l'éditeur (footer uniquement) |
| 2 | Réutiliser le DS existant `tokens.json` tel quel | Théo + Sophie | Charte déjà vérifiée pixel-à-pixel contre edifio.fr (ADR-012) — aucune divergence |
| 3 | Écrire la **spec Solo manquante** (la spec Tandem existait déjà) | Sophie | Parité des deux modules pour qu'Alex enchaîne sans temps mort |
| 4 | Connecteur Odoo **partagé** Solo ↔ Tandem | Sophie | Tandem réutilise `createOdooOpportunity` écrit dans le module Solo |

---

## 2. Livrables produits (à committer dans le repo `edifio-sourcing`)

| Livrable | Chemin | Couvre |
|----------|--------|--------|
| Maquette HF v4 | `design/maquettes/maquettes_v4_sourcing_modules.html` | (a) AO du jour poli + (c) modales Solo/Tandem, flux Odoo, short-list archi, preview Brevo, états vide/chargement/erreur |
| Spec module Solo | `specs/module_solo_engine_v1.md` | (b) flux `selected_solo` → opportunité Odoo, mapping, tests, plan Alex ~5 j |
| (existant, confirmé) Spec Tandem | `specs/module_tandem_engine_v1.md` | (b) déjà complète — plan Alex ~7 j |

Écrans couverts par la maquette v4 : **M-A** (AO du jour, score ring + 3 actions), **M-B** (modale Solo/Tandem), **M-C** (flux Solo → toast Odoo), **M-D1** (short-list architectes + rationale IA), **M-D2** (preview/édition mail Brevo TU/VOUS), **M-E** (états vide / chargement / erreur sourcing).

---

## 3. Point d'attention pour Alex (naming tokens)

Les tokens couleur sont **historiquement nommés** `--alyos-red` / `alyos-red-dark` dans `tokens.json` et les maquettes, **mais leur valeur est la couleur de marque edifio** (`#FF0033`, vérifiée edifio.fr). 

→ **Recommandation** : renommer en `--brand-red` lors d'une passe coordonnée (refacto CSS vars, pas urgent, à faire avec Alex pour ne rien casser dans le code déjà écrit). **Ne pas** renommer à la volée tant que ce n'est pas synchronisé avec l'implémentation existante. La valeur, elle, est correcte et ne change pas.

---

## 4. Actions à mener

| # | Action | Responsable | Échéance |
|---|--------|-------------|----------|
| 1 | Committer maquette v4 + spec Solo dans le repo | Yann (ps_operator) | au prochain handoff |
| 2 | Choisir prochaine grosse PR : Solo (A) ou Tandem (B) | Board | quand prêt |
| 3 | Fournir accès Odoo (URL, base, compte service, clé API) pour test réel Solo | Board / AlyoS | avant test réel module Solo |
| 4 | Confirmer nom pipeline Odoo (« AO publics » ?) + étape de départ (« Sourcing » ?) | Board / AlyoS | avant impl. mapping |
| 5 | (éventuel) Ajouter sub-agents QA + reviewer en Claude Code | Board (validation) | si arbitré |

---

## 5. Risques identifiés

- Mapping Odoo basé sur des **hypothèses** (pipeline « AO publics », étape « Sourcing ») → à confirmer avant impl., sinon handoff REQUEST.
- Renommage tokens `alyos-red → brand-red` : risque de casse si fait sans coordination avec le code déjà écrit → à faire en passe dédiée.

---

## 6. Prochaine étape

- Backend : validation Gate 6 demain matin (cron réel + E2E prod) — cf. tâches #25/#26.
- Côté Cowork : la file d'Alex est désormais remplie (maquette + 2 specs prêtes). Dès l'arbitrage Solo/Tandem du Board, Alex démarre sans temps mort.
