> **[CLOS 2026-05-21]** — Handoff obsolète, plus d'action Cowork attendue.
> La branche `feat/sourcing-mvp` (porteuse du stash `stash@{0} cowork-sync-260519-pre-pr2`) a été mergée puis supprimée local + origin. Les fixes RLS it2 (`AS RESTRICTIVE` sur `insert_by_member`) sont en vigueur sur `main` depuis PR #14 (cf. `src/db/migrations/0002_rls.sql`). Le contenu condensé du stash n'a pas été récupéré et ne le sera pas. Trace dans `DECISIONS.md` (entrée 2026-05-21).

---

# REQUEST — Arbitrage stash Cowork sur `DECISIONS.md` + `specs/schema_v1.sql`

**Date** : 2026-05-19 20:30
**De** : Steve (Board) via Yann (ps_operator) + Alex (dev)
**Pour** : Sophie (CTO), Marc (CEO), Théo (Graphiste), Léa (CMO)
**Référence** : `notes-de-suivi/CC_260519_1900_STASH_COWORK_SYNC.md` (note d'origine du stash)
**Échéance souhaitée** : avant J+1 — débloque le démarrage de PR #2 (connecteur BOAMP) sur tree propre
**Priorité** : moyenne — pas de blocker technique immédiat (PR #14 mergée, fixes 2026-05-18/19 déjà sur `main`), mais le stash empile une régression silencieuse si appliqué tel quel

## Contexte

Hier (2026-05-18 soir), une sync Cowork parallèle à la PR #14 (Sophie sur `DECISIONS.md`, Théo/Léa sur `specs/schema_v1.sql`) a écrit dans le working tree local de `feat/sourcing-mvp` une version **antérieure aux fixes finaux** appliqués côté dev (it2 du 2026-05-19 : `insert_by_member AS RESTRICTIVE` + commit `e7f5403`).

Yann a isolé ces 2 fichiers dans un stash (`stash@{0}` sur `feat/sourcing-mvp`, nommé `cowork-sync-260519-pre-pr2`) pour préserver le travail Cowork sans perdre les fixes dev. Inspection précise du stash réalisée ce soir avant rédaction du handoff.

## Diff observé

- `DECISIONS.md` : **-43 / +11** lignes. Le stash remplace **10 entrées détaillées** du 18-19/05 (livrables seed étape 5/6, fix pgTAP RLS it1+it2, 6 fix CI Postgres consécutifs avec post-mortems) par **3 entrées condensées « Batch n°12 »** focalisées uniquement sur le bug `idx_tenders_deadline` 42P17. La trace complète des fix RLS it2 disparaît. Footer datestamp régresse au 2026-05-18.
- `specs/schema_v1.sql` : **-7 / +6** lignes. Le stash applique le fix `idx_tenders_deadline` (retrait `WHERE deadline > now()`, OK), **mais retire** la déclaration `AS RESTRICTIVE` de la policy `insert_by_member ON architects` et son commentaire explicatif — ce qui **réintroduit le bug PERMISSIVE OR'd** corrigé dans `e7f5403` du 2026-05-19 (la PR #14 a déjà la version corrigée côté `src/db/migrations/0002_rls.sql`).

Diff intégral capturé localement chez Yann : `C:\tmp\stash-inspection.diff`, `C:\tmp\stash-decisions.diff`, `C:\tmp\stash-schema.diff`. Disponibles sur demande pour collage dans Cowork.

## Question 1 — Quelle base de travail Cowork ?

**Pourquoi ça compte** : si Cowork a édité depuis une base pré-it2 (état du 2026-05-18 matin, avant les fixes RLS it1+it2), un `git stash pop` réintroduirait le bug PERMISSIVE OR'd et écraserait la trace des post-mortems CI Postgres dans `DECISIONS.md`. Si Cowork s'est re-synchronisé entre-temps sur HEAD post-it2, alors le stash reflète une intention délibérée de **condenser** la trace dev et de **revenir en arrière** sur la policy — auquel cas il y a un désaccord de fond à arbitrer.

**Ce qu'on demande** : confirmation explicite de la base sur laquelle Sophie + Théo/Léa ont édité. Trois statuts possibles :
- **(a)** base pré-it2 (working tree non-resynchronisé) → le stash est un artefact d'écrasement non-intentionnel, on drop sans regret côté schema_v1.sql, on cherry-pick juste les apports Cowork sur DECISIONS.md.
- **(b)** base HEAD post-it2 (re-sync acquise) + retrait volontaire de `AS RESTRICTIVE` → désaccord de fond sur la sémantique de la policy `insert_by_member`. Il faut un arbitrage CTO avant de toucher au schéma.
- **(c)** base HEAD post-it2 mais retrait `AS RESTRICTIVE` involontaire (édition manuelle erronée Théo/Léa lors du formatage) → on drop le bloc schema_v1.sql du stash, on garde les apports DECISIONS.md.

**Note d'impact** : tant que la question n'est pas tranchée, on bloque l'application du stash et on démarre PR #2 BOAMP sur HEAD tel quel (les fixes it2 restent en vigueur).

## Question 2 — Sort de la condensation « Batch n°12 » de `DECISIONS.md`

**Pourquoi ça compte** : la version Cowork condense 10 entrées détaillées (post-mortems CI Postgres, livrables seed étape 5/6, it1+it2 RLS) en 3 entrées « Batch n°12 ». Sur le plan opérationnel, la trace détaillée a une vraie valeur de debug rétrospectif (relire pourquoi `idx_tenders_deadline` a cassé en CI vanilla Postgres, par exemple). Sur le plan lisibilité Board, la version condensée est plus digeste pour un onboarding ou un audit Gate. Les deux ont du sens — c'est une décision éditoriale Cowork, pas dev.

**Ce qu'on demande** : choix de format pour `DECISIONS.md` côté Cowork :
- **(a)** garder la trace détaillée HEAD (verbosité élevée, debug-friendly), drop le condensé Cowork.
- **(b)** appliquer le condensé Cowork comme nouvelle section (`## Batch n°12 (résumé)` en tête + détails archivés en `DECISIONS_archive.md`), additif non-destructif.
- **(c)** remplacer entièrement la version détaillée par le condensé Cowork (destructif côté traçabilité dev).

**Si (b) ou (c)** : prévoir d'inclure aussi l'entrée CTO « Leçon Gate 5 v2 » présente dans la version Cowork mais absente de HEAD (à reformuler post-arbitrage Question 1).

## Sortie attendue

Une réponse Cowork dans `/handoff/RESPONSE_AAMMJJ_HHMM_STASH_COWORK_DECISIONS_SCHEMA.md` qui tranche :
- Question 1 → statut (a), (b) ou (c) + justification 2 lignes
- Question 2 → format (a), (b) ou (c) + intention sur « Leçon Gate 5 v2 »

Après réponse, Yann exécute l'action :
- Cherry-pick ciblé via `git checkout stash@{0} -- <fichier>` puis édition manuelle.
- `git stash drop stash@{0}` une fois la décision matérialisée dans un commit traçable sur `feat/sourcing-mvp`.

Pas d'action Board entre-temps. Steve démarre PR #2 BOAMP sur HEAD `feat/sourcing-mvp` (= `024279b`) sans toucher au stash.
