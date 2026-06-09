# Husky hooks — pre-commit léger + pre-push strict

> Reconfiguration acté nuit 9 juin 2026 — fix bug switch de branche pendant commit.

## Contexte

Le hook `pre-commit` initial faisait tourner `lint-staged` avec **Prettier ET ESLint --max-warnings 0**.
Sur un commit massif (>40 fichiers), 2 problèmes :

1. **OOM ESLint** : process tué (signal KILLED) → commit refusé bien que le code soit propre
2. **🐛 Bug switch de branche** : Husky+lint-staged exécute un `git stash` + `git checkout` interne. Sur certains setups (worktree multiples, branches actives en parallèle), ça basculait la branche courante pendant le commit. **3 occurrences observées en une nuit** (Yann ops, Alex Lot 1.7-bis, Sébastien quick start).

## Solution adoptée

| Hook | Tourne | Pourquoi |
|---|---|---|
| `pre-commit` | **Prettier seul** | Rapide (~2-5 s), pas de switch de branche |
| `pre-push` | **ESLint full + typecheck** | Validations strictes avant de partager le code |

## Fichiers

- `.husky/pre-commit` → lance `lint-staged --config .lintstagedrc.pre-commit.json`
- `.lintstagedrc.pre-commit.json` → Prettier `--check` sur les staged
- `.husky/pre-push` → ESLint full sur `src/` + `tsc --noEmit`
- `package.json` `lint-staged` → config legacy avec Prettier seul (utilisée si on lance `lint-staged` à la main sans `--config`)

## Comment ça marche

### À chaque commit

```
$ git commit -m "feat: ..."
==> Prettier check sur les fichiers staged
[OK] commit créé
```

Si Prettier détecte un format incorrect → erreur explicite, fix avec `pnpm prettier --write <fichier>` puis re-commit.

### À chaque push

```
$ git push origin <branche>
==> ESLint full sur src/
==> Typecheck
[OK] Validations pre-push passées
==> push effectif
```

Si ESLint ou typecheck KO → push refusé. Fix puis re-push.

## Skip ponctuel (rare et déconseillé)

```bash
# Skip TOUS les hooks pour cette opération
HUSKY=0 git commit -m "..."
HUSKY=0 git push origin <branche>
```

⚠️ **MEMORY** : `--no-verify` est interdit (sauf cas exceptionnel documenté).
`HUSKY=0` est l'alternative officielle Husky. À justifier dans la PR.

## Cas d'usage légitimes pour skip

- Commit massif d'un codemod auto (déjà validé manuellement)
- Hot-fix de prod urgent (à régulariser avec un commit fix-up après)
- Branches docs uniquement (sans code applicatif)

Tous les autres cas → fix les erreurs, ne skip pas.

## Performance

| Phase | Avant | Après |
|---|---|---|
| `git commit` | 5-30 s (ESLint sur staged + OOM possible) | **~2-5 s** (Prettier seul) |
| `git push` | rien | **~30-90 s** (ESLint full + typecheck) |

Net gain : on déplace le lourd au moment qui s'y prête (avant share = push), pas au moment d'itérer (commit).

## Dette / TODO

- Configurer **GitHub Actions CI** comme dernière ligne de défense (déjà en place : `ci.yml`)
- Envisager `--cache` ESLint pour accélérer le pre-push
- Mesurer le coût du pre-push sur des push fréquents (cycle dev rapide) — basculer sur juste typecheck si trop lourd

## Références

- Husky v9 docs : https://typicode.github.io/husky/
- Bug observé : 3 occurrences nuit 8-9 juin 2026 (cf. DECISIONS.md)
- Réco initiale : Sébastien dans review Lot 1.5 (PR #118)
