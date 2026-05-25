# Clôture — Module Tandem étape 2 (état PRs et E2E)

**Date** : 2026-05-25
**Agent** : Nadia (dev_tandem) — rattrapage documentaire

---

## Contexte

La nuit du 24→25/05 avait pour objectif de solder les commits Tandem étape 2 et
les correctifs a11y sidebar (PR #42). Cette note clôture la traçabilité de l'état
réel des PRs et du module Tandem à 08h00 le 25/05.

---

## PRs mergées

| PR | Titre | Commit de merge | Merge |
|---|---|---|---|
| #42 | feat(sidebar): sidebar mobile hamburger | — | Mergée par Steve avant ou en début de session nuit |
| #43 | chore(husky): migrate pre-commit to lint-staged | commit `139c351` | 07:04 UTC le 25/05 |

---

## PRs ouvertes

| PR | Titre | Branche | Etat |
|---|---|---|---|
| #44 | fix(a11y): sidebar mobile — focus trap + inert + restitution focus + close on route change | `fix/sidebar-a11y-remediation` | Ouverte, en attente review Hugo |

Contenu de PR #44 (commit `0118496`) :
- Fixes P1.1-P1.4 + R2 Camille sur `SidebarMobileDrawer.tsx`
- 5 `test.fixme` levés → 5 tests réels dans `e2e/sidebar-mobile.spec.ts`
- Nouveau script `scripts/e2e-local.ps1` (wrapper PS1 pour E2E local)

---

## Module Tandem — état des fichiers core

Les fichiers core Tandem (schéma, seed, RLS, connecteur) sont en place depuis
la branche `feat/tandem-engine` (étape 1 livrée, cf. `DECISIONS.md` §2026-05-25
étape 1). Ils sont en working tree non-committés, en attente du commit Yann.

Périmètre fichiers Tandem étape 2 en working tree (non exhaustif — liste complète
dans `CC_260525_0055_NADIA_TANDEM_STEP2_FINAL.md` si ce fichier existe) :
- `src/lib/tandem/` (matching, sollicitation, followup-cron)
- `src/app/sourcing/ao/[id]/tandem/` (page-data, actions, page)
- `src/app/api/archi/[token]/respond/` (page publique tokenisée architecte)
- `src/app/api/cron/tandem-followup/` (cron J+3)
- `src/lib/brevo/variables.ts` (variables templates TU/VOUS)

---

## Etat E2E

### Sidebar mobile

- 5 `test.fixme` levés dans `e2e/sidebar-mobile.spec.ts` → 5 tests réels
  avec assertions `aria-modal`
- Validation locale impossible : `.env.local` pointe sur la BDD prod Supabase
  (rotation post-MVP en attente — cf. memory `followup_post_mvp_security_rotations`).
  Tout run E2E local risquerait de créer des sessions de test sur la prod.
- Validation attendue en CI (`ci-e2e` job, `.github/workflows/ci.yml`) où
  `SUPABASE_SERVICE_ROLE_KEY` et `E2E_TEST_ROUTES_ENABLED=1` sont posés via
  secrets GitHub et où les users de test sont nettoyés par `afterAll`.

### Tandem

- Les tests E2E Tandem déjà livrés (étape 1) passent
- 6 scénarios Tandem backlog annotés `test.skip` en attente Gate 7 :
  ce choix est confirmé et documenté — ils ne seront levés qu'après validation
  Gate 7 (matching V1 complet + intégration Brevo + page tokenisée en prod)

---

## Tâches restantes (non bloquantes pour la clôture de cette note)

- Review Hugo sur PR #44 (a11y sidebar)
- Commit Yann des fichiers Tandem étape 2 en working tree
- Apply migration 0007 (à préparer) : dry-run Steve + apply prod
- Rotation `.env.local` vers DB dev (bloquant E2E local, cf. C-ENV-001)
- `tmp/` à ajouter au `.gitignore` (reco Nadia, anti-leak scripts d'analyse XLSX)

---

## Notes sources

- `notes-de-suivi/CC_260525_NIGHT_RECAP.md` (recap session nuit)
- `handoff/REQUEST_260525_CLOTURE_NUIT_DEBLOCAGE_LOT56_57.md` §A.3
- `DECISIONS.md` §2026-05-25 PR feat/tandem-engine étape 1
