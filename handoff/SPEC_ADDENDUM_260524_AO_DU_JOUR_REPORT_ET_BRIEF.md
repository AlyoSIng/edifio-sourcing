# ADDENDUM SPEC — AO du jour : report des non-traités + brief court + liens

**Émetteur** : CEO Marc + CTO Sophie (Cowork)
**Destinataires** : Alex (`dev`), Camille (`qa`), Hugo (`reviewer`)
**Date** : 2026-05-24
**Origine** : demande Board 2026-05-24.
**Rattachement** : précise et complète le **Lot B** (`handoff/BRIEF_CHANTIER_NEXT_260522.md`). Périmètre validé Board.
**Base réelle vérifiée en prod** : `tenders(status enum, deferred_until, source_url, dce_url, raw_data, score, deadline)`, `tender_documents(kind, format, storage_path, analyzed)`. Enum `tender_status` : `sourced, selected_solo, selected_tandem, awaiting_architect, architect_accepted, architect_declined, architect_info_requested, dossier_review_required, dossier_ready, dossier_diffused, submitted, won, lost, dropped`.

---

## Exigence 1 — Report des AO non traités de la veille (et avant)

**Besoin Board** : l'écran « AO du jour » ne doit pas montrer uniquement les AO créés aujourd'hui. Tout AO **non traité** doit rester visible jusqu'à ce qu'une action soit prise — y compris ceux récupérés les jours précédents.

**Définition « non traité »** (à câbler dans la query de liste) :
```
status = 'sourced'                         -- aucune décision prise
AND (deferred_until IS NULL OR deferred_until <= now())  -- pas reporté dans le futur
AND (deadline IS NULL OR deadline >= now())              -- pas expiré (DLRO passée)
```
Tri : `score DESC, created_at DESC`.

**Définition « traité »** (= sort de la liste) : le `status` a quitté `sourced` (sélection Solo/Tandem, ou `dropped`/écarté), **OU** `deferred_until` est positionné à une date future (snooze « voir plus tard »).

**Actions minimales requises sur chaque carte AO** (si pas déjà présentes) :
- **Écarter** → `status = 'dropped'` (sort de la liste, traçé audit).
- **Reporter** → set `deferred_until` (ex. +1 / +3 / +7 j, ou date au choix). L'AO réapparaît une fois la date atteinte.
- Les actions « métier » (sélection Solo/Tandem) sont déjà gérées par les modules Solo/Tandem.

**UI** : un compteur/segment distinguant « Nouveaux aujourd'hui » vs « En attente (jours précédents) » est souhaitable mais non bloquant ; au minimum, tout le backlog non-traité apparaît dans une seule liste triée par score.

**Coût** : faible — c'est une modification de la requête de liste + 2 boutons d'action. **Peut être livré indépendamment et avant le reste du Lot B.**

---

## Exigence 2 — Brief court (3-4 lignes) dans l'écran de résultat

**Besoin Board** : sur l'écran de résultat de l'AO, un brief synthétique de **3 à 4 lignes** rédigé par Claude.

**Implémentation** (aligne le Lot B, version courte) :
- Génération via **Anthropic Sonnet 4.6**, prompt versionné dans `ai_prompts`, run tracé dans `ai_runs`.
- Stockage du résultat dans une **nouvelle table `tender_briefs`** (1 brief courant par AO + historique de version). Régénérable.
- **Format imposé** : 3-4 lignes maximum, factuel — objet de l'AO, périmètre/lots clés, et 1 signal d'adéquation AlyoS. Pas de remplissage.
- **Provenance obligatoire** : le brief s'appuie sur `raw_data` de l'annonce (+ RC si disponible). Pas d'invention : si une donnée manque, le brief le dit (« montant non précisé »).
- **À la demande** (bouton « Générer le brief »), pas en masse sur les 288 AO bruts — maîtrise du coût API.

---

## Exigence 3 — Liens annonce + DCE/RC dans l'écran de résultat

- **Lien annonce** : `tenders.source_url` (déjà en base) → bouton « Voir l'annonce » (ouvre la source officielle dans un nouvel onglet).
- **Lien DCE** : `tenders.dce_url` (déjà en base) → bouton « Télécharger le DCE ».
- **RC** : le Règlement de Consultation est dans le zip DCE. V1 = lien direct vers le DCE (`dce_url`) ; le RC isolé (extraction + stockage dans `tender_documents` kind=`rc`) reste la cible V2 du Lot B. ⚠️ Tout téléchargement automatique externe (DCE/RC côté serveur) reste soumis à **validation Board** (cf. Lot B).

---

## Séquencement proposé

1. **Exigence 1 (report non-traités)** — quick win, livrable seul, à faire en premier (forte valeur d'usage immédiate).
2. **Exigences 2 + 3 (brief court + liens)** — cœur du Lot B (Alex), après stabilisation (clés JWT, RLS).

→ Board, cet addendum reflète-t-il bien ta demande ? Notamment : l'Exigence 1 (report) en quick win séparé, livrée avant le brief IA — d'accord ?
