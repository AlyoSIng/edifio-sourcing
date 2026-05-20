# Note de suivi — [Réunion post-spike ORM] Décision Drizzle

**Date** : 2026-05-18
**Application** : edifio Sourcing
**Présents** : [CEO Marc], [CTO Sophie], [BOARD TEISSIER]
**Absents excusés** : [CMO Léa] (non concernée), [GRAPHISTE Théo] (non concerné), [DEV Alex] (côté Claude Code — a livré le rapport spike PR #13 pour décision)
**Rédacteur** : [CEO Marc]
**Référence** : ouvre suite à `Session ORM bouclée. À +.` du 2026-05-15 → reprise post-spike ORM le 2026-05-18

---

## 1. Décisions prises

| # | Décision | Pris par | Motif |
|---|----------|----------|-------|
| 1 | **ORM TypeScript = Drizzle 0.39** (`drizzle-orm` + `drizzle-kit` + `postgres-js`) | [CTO Sophie] sur la base du vote dev [Alex] + validation [BOARD] | Score pondéré Gate 5 : Drizzle **7,80 / 10** vs Prisma **5,30 / 10** = écart 2,50 points (audité par CTO). 3 écarts DX disqualifiants Prisma observés au code (`upsertMany` absent, `Json` opaque × 9 colonnes jsonb, `TRUNCATE` absent API native). Driver Deno Drizzle stable vs Prisma expérimental. Stress-test (relâche cold start Drizzle 8→6) conserve écart 1,50 point > seuil arbitrage. |
| 2 | **3 conditions formelles de validation** | [CTO Sophie] | (1) Bench cold start Edge Function Deno réel bloquant pré-Gate 9, (2) re-seed payload Opendatasoft réel 25 KB médiane à la 1re PR module sourcing, (3) branches spike conservées 30 jours (suppression différée 2026-06-17). |
| 3 | **ADR-013 livré** (`specs/adr_013_orm_drizzle.md`) | [CTO Sophie] | Formalise contexte, décision, motifs (4 critères pondérés détaillés), conséquences techniques + opérationnelles, alternatives rejetées, conditions formelles, versionning. |
| 4 | **DECISIONS.md batch n°11 ajouté** | [CEO Marc] | 8 entrées tracées (rapport livré, vote dev, verdict CTO, validation Board, ADR-013 livré, CLAUDE.md amendé, prochaine étape Alex, cleanup branches programmé). |
| 5 | **CLAUDE.md amendé v1.1** | [CTO Sophie] | Section État du projet : statut ORM passé de « REPORTÉE » à « ACTÉE 2026-05-18 ». Premières actions Gate 6 #5 : remplacement du spike par 1re PR module sourcing. Limites strictes : ligne « Committer une migration BDD avant la décision ORM » remplacée par « Modifier le schéma BDD sans `drizzle-kit generate` puis revue CTO ». Commandes utiles : ajout `pnpm drizzle-kit generate` + `pnpm drizzle-kit migrate` + `pnpm db:seed` + `pnpm db:reset`. |
| 6 | **Section `## Verdict CTO` du rapport spike remplie** (`gates/06_ORM/DECISION_ORM_260518.md`) | [CTO Sophie] | Commentaires CTO + 3 conditions formelles + prochaine étape Alex. À pusher côté repo par Yann pour finaliser le rapport mergé sur main. |
| 7 | **INDEX.md à jour** | [CEO Marc] | Section Gate 6 — Arbitrages ajoutée. ADR-013 indexé. Handoff `ANSWER_260515_1430_PREREQ_SPIKE_ORM.md` indexé. Stats actualisées (60+ décisions, 13 ADR). Navigation par usage enrichie d'une entrée « comprendre le choix ORM ». |

---

## 2. Désaccords / arbitrages remontés au Board

Aucun désaccord. Le verdict CTO valide le vote dev tel quel. La validation Board a été OUI sans réserve.

---

## 3. Actions à mener

| # | Action | Responsable | Échéance |
|---|--------|-------------|----------|
| 1 | Commit + push de la section `## Verdict CTO` remplie côté repo `AlyoSIng/edifio-sourcing` (fichier `gates/06_ORM/DECISION_ORM_260518.md`) | [PS_OPERATOR Yann] | 2026-05-18 fin journée |
| 2 | Synchroniser Cowork → Repo via `bootstrap-edifio-sourcing-v2.ps1 -SyncOnly` (pour pousser ADR-013, DECISIONS.md, CLAUDE.md, INDEX.md, cette note) | [BOARD] + [PS_OPERATOR Yann] | 2026-05-18 fin journée |
| 3 | Démarrage 1re PR module sourcing engine sur base Drizzle (migration `subscription_tier` enum + schema v1 + RLS + seed Opendatasoft réel) | [DEV Alex] | À démarrer 2026-05-19 |
| 4 | Bench cold start Edge Function Supabase Deno réel (condition 1 CTO) | [DEV Alex] + [PS_OPERATOR Yann] | Pré-Gate 9 — bloquant |
| 5 | Reminder cleanup branches spike sur origin (condition 3 CTO) | [PS_OPERATOR Yann] | 2026-06-17 SI condition 1 validée |
| 6 | Audit Prettier `.prettierignore` : vérifier que `specs/adr_013_orm_drizzle.md` et `gates/06_ORM/` sont bien exclus côté repo | [PS_OPERATOR Yann] | 2026-05-18 (vérification rapide post-sync) |

---

## 4. Risques identifiés

1. **Cold start Prisma non mesuré quantitativement.** Risque que l'extrapolation 700-1100 ms soit trop conservative. Mitigation : condition 1 CTO (bench Edge Function réel pré-Gate 9). Si écart réel < 200 ms → post-mortem + ADR-013 amendé v1.1.
2. **Seed jsonb sous-dimensionné dans le spike** (10 KB médiane au lieu de 25 KB Q1 Cowork). Risque que les mesures upsert batch_100 60 ms ne soient pas représentatives en prod. Mitigation : condition 2 CTO (re-seed payload Opendatasoft réel à la 1re PR).
3. **Rampe d'apprentissage Drizzle** plus longue qu'attendue (équipe a plus d'expérience Prisma). Mitigation : buffer 1-2 jours dans planning Gate 6 (accepté par Sophie en réunion). Mise à disposition de la branche `spike/orm-drizzle` comme référence pédagogique pendant 30j.
4. **Driver-adapter Deno Prisma reste un mouvement d'écosystème.** Si Prisma stabilise l'adapter en Q3-Q4 2026 ET déprécie l'engine Wasm, la décision pourrait être révisée. Coût de bascule Drizzle → Prisma ultérieur estimé modeste (schema déclaratif + migrations SQL portables).

---

## 5. Prochaine étape

- **Sync repo** : `bootstrap-edifio-sourcing-v2.ps1 -SyncOnly` pour pousser ADR-013 + DECISIONS.md + CLAUDE.md + INDEX.md + cette note + le rapport amendé `gates/06_ORM/DECISION_ORM_260518.md` (section Verdict CTO remplie).
- **Démarrage 1re PR module sourcing engine** par Alex sur base Drizzle dès le 2026-05-19.
- **Pas de gate Cowork à programmer** dans l'immédiat — la Gate 6 (MVP fonctionnel) ne se déclenchera qu'à l'issue des 9-13 jours de dev module sourcing + tandem + IA dossier (~5-6 semaines de dev sur Claude Code).
- **Réunion Cowork suivante** : convocation par le CEO uniquement si :
  - (a) Alex remonte un handoff bloquant via `/handoff/REQUEST_*.md`
  - (b) Un risque sécu / RGPD émerge et exige escalade CTO
  - (c) Le Board demande un point d'étape

---

## 6. Annexe — Liens utiles

- **Rapport spike (source de la décision)** : [`gates/06_ORM/DECISION_ORM_260518.md`](../gates/06_ORM/DECISION_ORM_260518.md) (219 lignes, section Verdict CTO remplie en réunion)
- **ADR de formalisation** : [`specs/adr_013_orm_drizzle.md`](../specs/adr_013_orm_drizzle.md)
- **Handoff prérequis spike** : [`handoff/ANSWER_260515_1430_PREREQ_SPIKE_ORM.md`](../handoff/ANSWER_260515_1430_PREREQ_SPIKE_ORM.md)
- **DECISIONS.md batch n°11** : `DECISIONS.md` § 2026-05-18
- **CLAUDE.md amendé v1.1** : `CLAUDE.md` § État du projet + Premières actions Gate 6 #5 + Limites strictes + Commandes utiles
- **INDEX.md mis à jour** : `INDEX.md` § Gates 6 — Arbitrages + Specs techniques (ADR-013) + Handoff + Statistiques

---

*Réunion close 2026-05-18. Spike ORM clôturé. Module sourcing engine peut démarrer côté Claude Code. Prochaine convocation Cowork sur événement bloquant ou point d'étape Board.*
