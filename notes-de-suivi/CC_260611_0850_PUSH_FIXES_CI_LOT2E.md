# Note de suivi — Push fixes CI + outillage transposition Lot 2e

**Date** : 2026-06-11 ~08h50 (heure Paris)
**Agent** : Yann (ps_operator)
**Branche** : `main` (011c19f..2564fd3)

## Commits poussés

| Hash | Message | Contenu |
|---|---|---|
| `79df1cd` | `fix(ci): journal gap 0033-0049 + storage local stack + middleware-check adr-014` | `supabase/config.toml`, `.github/workflows/ci.yml`, `src/db/migrations/meta/_journal.json`, `DECISIONS.md` |
| `2564fd3` | `chore(migration): outillage transposition donnees sourcing vers monorepo (lot 2e)` | `scripts/migration/transpose/` (7 fichiers, 1359 lignes) |

**Écart vs demande Board** : type `ops` demandé pour le commit 2, **substitué par `chore`** —
`commitlint.config.js` n'étend que `@commitlint/config-conventional` (types standards
uniquement), `ops` aurait été rejeté par le hook et `--no-verify` est interdit.
Scope/sujet/body conservés à l'identique.

Scan secrets : diffs relus intégralement, zéro secret (seul placeholder `<1Password>`
en commentaire dans les scripts transpose ; garde anti-prod `loogmtltwkhvczdiurqs`
vérifiée présente dans `04-load-data.ps1`). Exclusions respectées : `gates/AUDIT_*`,
`.claude/worktrees/` non commités. Hooks verts : prettier, commitlint, ESLint full +
typecheck (pre-push).

## Run CI sur 2564fd3

- Workflow `ci` : run **27328955902**
- Workflow `ci-db-rls` : run **27328955903**

| Job | Statut | Commentaire |
|---|---|---|
| ci-lint | VERT | |
| ci-typecheck | VERT | |
| ci-test | VERT | |
| ci-build | VERT | |
| ci-middleware-check | VERT | **Fix ADR-014 validé** (job structurellement rouge avant) |
| ci-e2e | (voir verdict final) | Stack locale + storage OK, anti-prod OK, **migrations OK**, **seed OK** (bug `trial_started_at` éradiqué) → Playwright atteint = objectif salve atteint |
| ci-db-rls | **ROUGE** | Rouge AVAL révélé par le fix journal — voir ci-dessous |

## Échec ci-db-rls — diagnostic

- Le fix journal **fonctionne** : 0033 → 0047 appliquées pour la 1re fois en CI.
- Échec sur **`0048_buyers_directory.sql:66`** : `CREATE POLICY ... TO authenticated`
  → `PostgresError: role "authenticated" does not exist`.
- Cause : le job `ci-db-rls` tourne sur `postgres:15` nu ; le step
  « Prepare Supabase auth schema stub » (`.github/workflows/db-rls.yml`) crée le schéma
  `auth`, `auth.users`, `auth.jwt()`, `auth.uid()` mais **pas les rôles Supabase**.
  0048 n'avait jamais été exécutée en CI (gap journal) → bug latent.
- 0052/0053 référencent aussi ces rôles mais via blocs
  `DO ... EXCEPTION WHEN undefined_object` (« Role authenticated absent (CI local), skip »)
  — convention déjà en place, non applicable à un `CREATE POLICY ... TO`.
- **Fix proposé (pour Alex, zone verte)** : ajouter au step stub de `db-rls.yml`
  un `CREATE ROLE authenticated NOLOGIN` idempotent (pattern
  `DO $$ ... IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') ...`),
  plutôt que modifier 0048 (gel migrations A4 + déjà appliquée en prod).
  NB : `ci-e2e` n'est pas touché (stack Supabase réelle = rôle présent).

## Suite

- Verdict final ci-e2e + extraits si rouge : reporté au Board dans le chat.
- `DECISIONS.md` : entrée Yann ajoutée (commit à suivre avec cette note).
