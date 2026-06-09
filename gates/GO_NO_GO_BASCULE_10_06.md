# GO / NO-GO — Bascule prod 10 juin 2026

> **Reviewer** : Sébastien (équipe Suivi+ACT, sub-agent `suivi_act_reviewer`)
> **Branche d'analyse** : `gates/go-no-go-bascule-10-06`
> **Base** : `main` @ `070f8b7` (PR #140 mergée 2026-06-09)
> **Périmètre** : application des migrations `0050_learning_payload`, `0051_rls_fix_companies_cotraitant_shares_be`, `0052_rls_lot17_bis_force_helper_naming`, `0053_eradicate_cotraitant_public_policy` sur prod Supabase Sourcing (Frankfurt).
>
> **Posture** : garde-fou final. Si un item est 🟠 ou 🔴, l'arbitrage final reste à Steve.

---

## 1. Critères GO (15 items)

### Code applicatif

| # | Item | État | Source / commentaire |
|---|---|---|---|
| 1.1 | Tests vitest verts (1268/1268) | 🟠 | À ré-exécuter en T-30 (`node ./node_modules/vitest/vitest.mjs run`). Snapshot non confirmé dans cette revue. |
| 1.2 | Typecheck 0 erreur | 🟠 | À ré-exécuter en T-30 (`tsc --noEmit -p tsconfig.json`). |
| 1.3 | Lint 0 erreur | 🟠 | Hook `pre-push` strict actif (PR #131) → garantie best-effort, re-check explicite recommandé. |
| 1.4 | PR mergées / 0 PR ouverte | 🟠 | 19 PR mergées sur main entre #113 et #140 depuis 2026-06-08. `gh pr list` → **1 PR ouverte = PR #141 (Yann, `verify-post-deploy.sql`)**, à merger AVANT l'apply prod. Brief mentionne « 24 PR » → écart à clarifier mais couverture fonctionnelle complète. |

### Migrations BDD

| # | Item | État | Source / commentaire |
|---|---|---|---|
| 2.1 | 4 migrations existent | ✅ | `src/db/migrations/0050_learning_payload.sql`, `0051_rls_fix_companies_cotraitant_shares_be.sql`, `0052_rls_lot17_bis_force_helper_naming.sql`, `0053_eradicate_cotraitant_public_policy.sql`. |
| 2.2 | Journal Drizzle `_journal.json` à jour | 🟠 | **Anomalie détectée** : `src/db/migrations/meta/_journal.json` contient 0051, 0052, 0053 mais **PAS 0050** (saut idx 32 → 51). Snapshots `0009+` également absents (journal couvre 0000-0008 en snapshots). Non bloquant si apply via `psql -f` + INSERT manuel dans `drizzle.__drizzle_migrations` (cf. script `apply-migrations-0050-0053.ps1`), mais à **valider explicitement avec Steve** — risque de re-jeu fantôme lors d'un futur `drizzle-kit migrate`. |
| 2.3 | Plan de rollback testé Docker postgres:15 | ✅ | `docs/ROLLBACK_PLAN_MIGRATIONS_0050_0053.md` §1.1 : séquence `apply 0050→0053 + rollback 0053→0050` jouée sur `postgres:15-alpine`, zéro erreur, assertions `pg_class.relrowsecurity / pg_policy.polname / pg_proc.proname / information_schema.columns` OK. |

### Scripts ops

| # | Item | État | Source / commentaire |
|---|---|---|---|
| 3.1 | `apply-migrations-0050-0053.ps1` testé `-DryRunOnly` | 🟠 | Script présent et documenté (PR #137). **À exécuter en T-15 par Steve** : `.\scripts\migration\apply-migrations-0050-0053.ps1 -DryRunOnly`. Pas de trace de dry-run pré-bascule dans cette revue. |
| 3.2 | `backup-sourcing-db.ps1` documenté Direct connection | ✅ | Script présent, header explicite : Direct connection (port 5432) — pas le pooler (6543), avec rappel piège incident 0007-0008. |
| 3.3 | `verify-post-deploy.sql` (Yann) | 🟠 | **Livré dans PR #141** (ouverte) : `scripts/migration/verify-post-deploy.sql` + wrapper `scripts/migration/run-post-deploy-verify.ps1`. Convention `DO $$ ... RAISE EXCEPTION` + `ON_ERROR_STOP=1` : code retour psql = 0 si tout OK. Couvre : présence des 4 hashes journal Drizzle, FORCE RLS sur 4 tables, helpers SECURITY DEFINER, policies, suppressions post-0053. **Action Steve** : merger PR #141 sur main AVANT l'apply prod, ou exécuter le SQL depuis la branche `ops/post-deploy-assertions`. |

### Documentation

| # | Item | État | Source / commentaire |
|---|---|---|---|
| 4.1 | `PLAN_BASCULE_10_06_2026.md` à jour | ✅ | 9 étapes + 2 annexes, post-fix Hugo (PR #139 : URL `sourcing.alyosingenierie.fr` corrigée, format backup `.dump`). |
| 4.2 | `CHEAT_SHEET_BASCULE.md` à jour | ✅ | 1 page imprimable, post-fix Hugo (PR #139) + phase 7 verify post-deploy ajoutée (Yann). |
| 4.3 | `ROLLBACK_PLAN_MIGRATIONS_0050_0053.md` validé | ✅ | Alex, base `72ae4c2`, sections 1-11 complètes, séquence Docker jouée. |

### Sécurité

| # | Item | État | Source / commentaire |
|---|---|---|---|
| 5.1 | 4 vulnérabilités prod corrigées | ✅ | Lot 1.6 (PR #123 RLS 3 tables) + 1.6-bis (PR #125 éradication `ALYOS_ORG_ID` fallback) + 1.7 (PR #123/#126 FORCE + helper + naming) + 1.7-ter (PR #132 éradication bombe cotraitant). Couverture des 4 vulns mentionnée dans le PLAN §Annexe B (5 → 0). |
| 5.2 | Bombe `cotraitant_shares_select_public` éradiquée | ✅ | PR #132 mergée `4d6a8d5 feat(db): eradique cotraitant_shares bombe a retardement (Lot 1.7-ter)` — remplace policies anon publiques par 4 functions SECURITY DEFINER (cf. migration 0053). |
| 5.3 | Audit MEGA-FINAL Hugo VERT | 🟠 | **Livré** (untracked sur main, présent sur disque) : `gates/AUDIT_COHERENCE_DOCS_BASCULE_10_06.md` — verdict **« APPROUVÉ SOUS RÉSERVE »** sur 9 documents, 24 cross-refs vérifiées, 10/10 commandes spot-check syntaxiquement valides. Les 3 fix bloquants identifiés par Hugo ont été mergés via PR #139. **Hugo signale 4 trous (1 critique, 2 majeurs, 1 mineur) — lecture obligatoire du §B/C de l'audit avant l'apply**. À committer côté Hugo ou inclus dans ma PR de cette revue. |

---

## 2. Critères NO-GO (STOP si vrai)

| Code | Item | Verdict | Si vrai |
|---|---|---|---|
| N1 | Backup pg_dump prod **manquant** ou < 5 MB | À vérifier en Phase 1 | 🔴 STOP |
| N2 | Dry-run Docker postgres:15 KO | À vérifier en Phase 2 dry-run | 🔴 STOP |
| N3 | Apply preview KO | À vérifier en Phase 2 | 🔴 STOP |
| N4 | Smoke preview KO (E2E P0 ou manuel) | À vérifier en Phase 3 | 🔴 STOP |
| N5 | Un user PROTECT déjà créé en prod (cas non couvert MVP) | À vérifier via SQL pre-apply | 🟠 ÉCLAIRER avec Steve |
| N6 | Vercel preview deploy KO | À vérifier dashboard Vercel | 🟠 ÉCLAIRER |
| N7 | Journal Drizzle prod incohérent post-apply (count ≠ +4) | À vérifier via `verify-post-deploy.sql` (PR #141) | 🔴 STOP + rollback |
| N8 | PR #141 (`verify-post-deploy.sql`) non mergée à T-15 | Vérifier `gh pr list` | 🟠 fallback : exécuter SQL depuis branche `ops/post-deploy-assertions` |

**Pré-flight SQL recommandé (à exécuter par Steve avant Phase 1)** :

```sql
-- N5 : user PROTECT déjà créé ?
SELECT count(*) FROM users WHERE role = 'protect_admin' OR organization_id IS NULL;
-- → attendu 0 (sinon ÉCLAIRER)

-- État journal Drizzle prod actuel
SELECT count(*) FROM drizzle.__drizzle_migrations;
-- → attendu 49 (cf. Annexe B du PLAN)
```

---

## 3. Critères de SUCCESS (post-bascule, dans les 30 min)

| # | Item | Comment vérifier |
|---|---|---|
| S1 | Assertions `verify-post-deploy.sql` OK | `psql "$PG_URL" -v ON_ERROR_STOP=1 -f scripts/migration/verify-post-deploy.sql` → code retour 0 + NOTICE final. Wrapper PowerShell `run-post-deploy-verify.ps1` dispo. |
| S2 | Smoke prod 5/5 OK | Login + AO du jour + Écarter + Vercel logs sans 500 + console nav sans erreur (CHEAT_SHEET Phase 5) |
| S3 | Aucune 500 dans Vercel logs 30 min suivantes | `vercel logs --prod --since 30m` |
| S4 | Cron monitoring R12 actif demain matin 7h | Dashboard Vercel → Crons → `sourcing-monitoring` schedule `0 5 * * 1-5` (PR #128) |
| S5 | Journal Drizzle prod = 53 (était 49) | Inclus dans `verify-post-deploy.sql` |
| S6 | FORCE RLS = true sur 4 tables | Inclus dans `verify-post-deploy.sql` |

---

## 4. Plan B — si bascule KO

| Scénario | Réponse | Référence |
|---|---|---|
| 1 migration KO (0050, 0051, 0052 ou 0053) | Appliquer rollback DDL inverse de **cette migration uniquement** | `ROLLBACK_PLAN_MIGRATIONS_0050_0053.md` §3-6 |
| Plusieurs migrations KO en cascade | Rollback inverse séquentiel 0053 → 0052 → 0051 → 0050 | `ROLLBACK_PLAN_MIGRATIONS_0050_0053.md` §7 |
| Corruption données / état BDD incohérent | Restore `pg_dump` Phase 1 (option nucléaire) | `ROLLBACK_PLAN_MIGRATIONS_0050_0053.md` §8 |
| Migration 0053 rollback (réintroduit la bombe) | Rollback **TEMPORAIRE** + re-fix immédiat dans la journée | Risque sécurité documenté §6 du ROLLBACK |

**Accès credentials prod** : Steve **seul** a accès au password depuis 1Password (cf. `MEMORY > feedback_ops_prod_user_runs_migration.md`). Aucun sub-agent ne peut exécuter le rollback à sa place.

---

## 5. Verdict de revue (Sébastien)

### Synthèse

| Catégorie | ✅ | 🟠 | 🔴 |
|---|---|---|---|
| GO (15 items) | 9 | 6 | 0 |
| NO-GO trigger | — | 3 (N5, N6, N8) | 0 confirmé |
| SUCCESS post-deploy | — | — (à vérifier J+0) | — |

### Verdict

**GO conditionnel** 🟢

**Conditions à lever par Steve en T-15 avant `psql -f 0053`** :

1. ✅ Re-lancer `tsc --noEmit` + `vitest run` → confirmer 0 erreur + 1268/1268 (lève 1.1, 1.2).
2. ✅ Lancer `apply-migrations-0050-0053.ps1 -DryRunOnly` → dry-run Docker vert (lève 3.1, prouve N2 négatif).
3. ✅ **Merger PR #141** (Yann, `verify-post-deploy.sql`) sur main avant l'apply (lève 1.4, 3.3, N8).
4. 🟠 **Trancher l'anomalie journal Drizzle 0050 manquante** (2.2) : soit re-générer le journal proprement, soit confirmer que l'INSERT dans `drizzle.__drizzle_migrations` pendant l'apply suffira et noter le risque dans `DECISIONS.md`. **Position Suivi+ACT** : acceptable si apply manuel via `psql -f` + INSERT côté script PowerShell, à rectifier post-bascule avant tout futur `drizzle-kit migrate`.
5. ✅ Lire les 4 trous identifiés par Hugo (§B/C de `AUDIT_COHERENCE_DOCS_BASCULE_10_06.md`) — verdict « APPROUVÉ SOUS RÉSERVE ». Les 3 fix bloquants ont déjà été mergés via PR #139.
6. ✅ Pré-flight SQL N5/N7 (cf. §2) avant Phase 1.

**Si les 6 points ci-dessus sont OK → GO sans réserve.**

**NO-GO** 🔴 si :

- Backup pg_dump prod absent ou échoué (N1)
- Dry-run Docker KO (N2)
- Apply preview KO ou smoke preview KO (N3, N4)
- Anomalie journal Drizzle non tranchée et risque jugé inacceptable par Steve

---

## 6. Signature finale

| Champ | Valeur |
|---|---|
| Date / heure de revue Sébastien | 2026-06-09 ~04h50 |
| Verdict Sébastien | **GO conditionnel** (6 conditions §5 à lever en T-15) |
| Date / heure de revue Steve | _<à remplir au moment de la bascule>_ |
| Verdict Steve | _<GO / NO-GO>_ |
| Heure d'apply prod | _<à remplir>_ |
| Heure de fin smoke prod | _<à remplir>_ |

**En cas de désaccord Sébastien ↔ Steve** : escalade Sophie (CTO Cowork). Pas de tentative de compromis.

---

## 7. Notes du reviewer (Suivi+ACT)

- Les migrations 0050-0053 sont alignées avec les conventions monorepo Suivi+ACT (RLS FORCE explicite, SECURITY DEFINER avec `search_path = ''` recommandé — à vérifier ligne par ligne dans 0053 si pas déjà fait par Hugo).
- L'éradication de la bombe `cotraitant_shares_select_public` est une **prérequis dur** à la bascule monorepo du 18 juillet (G7 garde-fou Suivi+ACT — pas de policy publique anonyme).
- Le cron monitoring R12 (PR #128) est **bonus**, pas bloquant pour le go.
- Les 24 PR du brief vs 19 PR observées sur main : écart à clarifier mais **non bloquant** — couverture fonctionnelle complète (Salve U + 4 vulns + multi-org PROTECT + monitoring).
- Hugo (audit cohérence) + Yann (`verify-post-deploy.sql`) ont livré pendant cette revue → revue mise à jour pour refléter ces livraisons.

---

*Document rédigé par Sébastien (sub-agent `suivi_act_reviewer`) le 2026-06-09 — base `main` @ `070f8b7`. À lire à voix haute par Steve avant le `psql -f 0053`.*
