# CC 2026-05-20 16:55 — Merge `feat/sourcing-mvp` → `feat/auth-password-pivot`

## Contexte

La branche `feat/auth-password-pivot` (pivot magic-link → mot de passe durable
acté 2026-05-10) avait pris du retard sur `feat/sourcing-mvp` qui a porté toute
la 1re PR module sourcing engine (décision ORM Drizzle 2026-05-18, schema
Drizzle v1, RLS FORCE 12 policies, seed 2 orgs Opendatasoft réel, 6 itérations
de fix CI pgTAP du 2026-05-18 au 2026-05-19).

Merge initié pour absorber le travail Drizzle dans la branche auth-pivot.
5 conflits attendus sur les fichiers que les 2 branches ont touchés en
parallèle :
- `CLAUDE.md` (auth-pivot a re-écrit la section auth ; sourcing-mvp a acté la
  décision ORM dans la même section État du projet)
- `DECISIONS.md` (les 2 branches ont étendu le journal séparément)
- `package.json` (auth-pivot a ajouté ses deps auth ; sourcing-mvp a ajouté
  drizzle/postgres/faker/zod et bumpé `tsx`)
- `pnpm-workspace.yaml` (arbitrage CTO esbuild 2026-05-18 vs valeur antérieure)
- `pnpm-lock.yaml` (dérivé des trois précédents)

## Décisions de résolution

Tous les 5 conflits résolus en faveur de **MERGE_HEAD (sourcing-mvp)** car la
branche auth-pivot était figée **avant** la décision ORM 2026-05-18 et la 1re PR
module sourcing engine (~9-13 jours / ~2 semaines de travail). HEAD reflète
l'état pré-décision, MERGE_HEAD reflète l'état actuel du produit.

| # | Fichier               | Choix     | Justification                                     |
|---|-----------------------|-----------|---------------------------------------------------|
| 1 | `CLAUDE.md` (2 hunks) | MERGE_HEAD | « ORM = Drizzle ACTÉ 2026-05-18 » + 1re PR engine |
| 2 | `DECISIONS.md`        | MERGE_HEAD | Batch n°11 ORM + 6 dérives pgTAP + verdict CTO    |
| 3 | `package.json`        | MERGE_HEAD | `tsx: 4.22.1` pinné (cohérence avec drizzle-kit, zod, faker pinnés exacts) |
| 4 | `pnpm-workspace.yaml` | MERGE_HEAD | `esbuild: false` (cohérent commentaire arbitrage CTO 2026-05-18) |
| 5 | `pnpm-lock.yaml`      | `--theirs` | Dérivé — aligné sur `tsx 4.22.1`                  |

## Validation locale

Pré-requis : `pnpm install --frozen-lockfile` (35 packages résolus, 3
downloads, lockfile inchangé).

| Étape                  | Outil                              | Résultat                         |
|------------------------|------------------------------------|----------------------------------|
| Typecheck              | `.\node_modules\.bin\tsc --noEmit` | 0 erreur                         |
| Lint                   | `.\node_modules\.bin\next lint`    | 0 warning, 0 erreur              |
| Tests unitaires        | `.\node_modules\.bin\vitest run`   | **206 tests / 13 fichiers PASS** |

Pas de DDL touchée par la résolution des conflits (les migrations
`src/db/migrations/0000-0003*` arrivent en clean-add depuis `sourcing-mvp`).
→ Pas de `pnpm db:dry-run` nécessaire (memory `feedback-postgres-dry-run-local`
ne se déclenche que si la PR introduit ou modifie du DDL — ici 0 modification
SQL côté HEAD).

## Suite

1. [PS_OPERATOR Yann] : `git commit` du merge (message standard pré-rempli
   par `MERGE_MSG`) + push sur `origin/feat/auth-password-pivot`.
2. CI GHA : `ci-db-rls` doit re-passer vert sur le HEAD post-merge (la PR #14
   avait fini verte au 2026-05-19 sur `feat/sourcing-mvp` après itération 2).
3. Reprise du chantier auth-password sur la branche fusionnée — toute la
   logique RLS, le seed et l'ORM Drizzle sont désormais disponibles pour
   poser le schema `users` avec `password_hash` + `password_must_change` +
   `password_changed_at` et le flow first-login.
