# Follow-up sécurité post-incident BDD prod — règle password URI-safe + hardening `migrate.ts`

**Date** : 2026-05-21 21:35
**Auteur** : Alex (DEV) via Board (Steve)
**Branche** : `feat/migrate-pgenv-uri-safe-doc` (parent `main` SHA `859c99e`)
**Référence amont** : incident BDD prod 2026-05-21 (commit `08be830` `docs(incident): trace P1 login prod + P2 BDD prod vide`) + memory locale `followup_post_mvp_security_rotations.md`
**Statut** : code + doc + tests livrés — prêt pour push

---

## Synthèse exécutive

Suite immédiate au double incident **P1/P2 prod** du 2026-05-21 documenté en `08be830` : pendant la résolution, le password BDD prod a **leaké deux fois** dans la journée — paste accidentel en chat de coordination, puis dump dans une stack trace `postgres-js@3.4.9 TypeError: Invalid URL` provoquée par un `#` non percent-encodé dans l'URI Session Pooler. La rotation finale du password (4ᵉ rotation) a été explicitement reportée post-MVP par Steve, le risque résiduel étant assumé sur la durée du MVP.

En revanche, trois chantiers correctifs **structurels** ont été exécutés avant la rotation pour fermer la classe entière de ce bug et durcir la procédure future :

1. **Règle password BDD prod URI-safe-only** actée formellement (charset `A-Za-z0-9-_.`, interdits explicites `# & $ ! + @ : / ? = %` cf. RFC 3986 §2.2). Un password URI-safe pur élimine la possibilité même d'un `TypeError: Invalid URL` côté `postgres-js`, et casse le piège du percent-encoding manuel à chaque rotation.

2. **Hardening `src/db/migrate.ts`** : ajout du support de la forme éclatée `PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT` qui **prime** sur `DATABASE_URL` quand les 4 vars obligatoires sont posées. Le password ne transite plus jamais dans une chaîne susceptible d'être loguée comme URI. 7 nouveaux tests Vitest verrouillent les 7 branches du contrat.

3. **Documentation `docs/DEPLOY.md`** mise à jour avec la convention password URI-safe (nouvelle section avant la règle d'or), Étape 2 du runbook refondue en 2 options (A recommandée PG*, B legacy DATABASE_URL), Étape 9 nettoyage étendue aux 5 vars PG*, note A.4 pour l'équivalent éclaté des snippets ops.

---

## Changements

### Fichiers modifiés (4)

1. **`src/db/migrate.ts`** (+76 / -17)
   - Nouvelle fonction pure exportée `resolveDbConfig(env)` qui retourne soit `{kind:'url', url}` soit `{kind:'parts', host, user, password, database, port}`.
   - Préférence forme éclatée : si les 4 PG* obligatoires (`PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`) sont posées non-vides → `kind:'parts'` (avec warn si `DATABASE_URL` aussi posée).
   - `PGPORT` optionnel, défaut 5432.
   - Forme éclatée incomplète (1 à 3 vars sur 4) → throw clair listant les manquants.
   - Aucune var PG* posée → fallback `assertDatabaseUrl` existant préservé (rétro-compat 8 tests baseline).
   - `main()` instancie `postgres()` soit en URI (chemin existant) soit en options object `{host, port, user, password, database, max:1, prepare:false, ssl:'require'}` (forme documentée postgres-js v3.4, Supabase managed exige `ssl:'require'`).
   - Log de démarrage explicite `[migrate] Mode env : URL` ou `[migrate] Mode env : eclate (PG*)`.
   - Warn pooler 6543 portée aux deux modes (URL via `isPgBouncerPooler`, parts via `cfg.port === 6543`).
   - JSDoc en-tête mis à jour : `assertDatabaseUrl, resolveDbConfig, isPgBouncerPooler`.

2. **`tests/unit/db/migrate.test.ts`** (+85 / -3)
   - Import élargi : `resolveDbConfig` ajouté.
   - Nouveau `describe("resolveDbConfig")` : **7 cas** couvrant les 7 branches du contrat :
     - aucune env posée → throw mentionnant `DATABASE_URL` ;
     - `DATABASE_URL` seule → `kind:'url'` ;
     - 4 PG* posées sans `PGPORT` → `kind:'parts'`, port défaut 5432 ;
     - 4 PG* + `PGPORT='6543'` → `kind:'parts'`, port 6543 ;
     - PG* incomplet (2/4) → throw, message liste `PGPASSWORD` et `PGDATABASE` manquants ;
     - PG* complet **et** `DATABASE_URL` posée → précédence PG* (kind:'parts') ;
     - PG* avec valeurs vides `''` → comptent comme absentes, throw mentionne `PGHOST`.
   - Header JSDoc complété (3 invariants au lieu de 2).
   - Total fichier : **15 cas Vitest** (vs 8 baseline → +7 nets).

3. **`docs/DEPLOY.md`** (+88 / -6)
   - **Nouvelle section** « Conventions password BDD prod (URI-safe-only) » insérée avant la règle d'or `DATABASE_URL` : charset autorisé, liste explicite des interdits avec référence RFC 3986 §2.2, justification incident 2026-05-21, snippet PowerShell de génération 32 caractères URI-safe.
   - **Règle d'or `DATABASE_URL`** étendue d'un paragraphe « Alternative recommandée : forme éclatée `PG*` » pointant vers le nouveau support.
   - **Étape 2 du runbook refondue** en deux options :
     - Option A (recommandée) — forme éclatée `PG*` avec validation masquée ;
     - Option B (legacy) — URI `DATABASE_URL` avec rappel explicite du risque leak password si non URI-safe.
   - **Étape 9 nettoyage** étendue aux 5 vars PG*.
   - **Note A.4** ajoutée : signale que les snippets ops supposent la forme URL et donne l'équivalent éclaté trivial.

4. **`DECISIONS.md`** (+72 / 0)
   - Entrée datée `2026-05-21` titrée « Follow-up sécurité post-incident BDD prod : règle password URI-safe + hardening `migrate.ts` ».
   - 4 sous-entrées : (a) `[BOARD-OK]` règle password URI-safe-only, (b) `[LIVRABLE]` hardening `migrate.ts`, (c) `[LIVRABLE]` doc `DEPLOY.md`, (d) `[PORTÉE]` exécution avant rotation finale (reportée post-MVP), referme chantiers 3 et 4 du post-mortem.

### Fichier laissé non tracké (hors scope)

- `src/db/seed/prod-seed-report.json` — artefact local du seed prod 2026-05-20, non tranché. **Volontairement non staged**.

---

## Validation locale

| Vérification | Résultat |
|---|---|
| `pnpm exec tsc --noEmit` | **0 erreur** |
| `pnpm exec eslint src/db/migrate.ts tests/unit/db/migrate.test.ts` | **0 erreur** |
| `pnpm vitest run tests/unit/db/migrate.test.ts` | **15 / 15 PASS** (8 baseline + 7 nouveaux `resolveDbConfig`) |
| Aucune nouvelle dépendance npm | ✓ |
| Aucune migration BDD | ✓ |
| Aucun fichier hors scope touché | ✓ (4 fichiers, untracked `prod-seed-report.json` laissé non tracké) |
| Aucun secret dans le diff | ✓ (vérifié manuellement avant push) |

---

## Suite

Rappel des chantiers du post-mortem 2026-05-21 et de leur statut :

1. **Checklist setup Vercel** (durcie post-incident P1 login prod) — **ouvert**, PR ultérieure.
2. **Vérification post-déploiement durcie** (smoke E2E + count tenders > 0 + check audit_log) — **ouvert**, PR ultérieure.
3. **Hardening `migrate.ts` support PG* URI-safe** — **fermé** par cette PR.
4. **Documentation `DEPLOY.md` URI-safe + Option A/B** — **fermé** par cette PR.

Restent ouverts (tracés en memory locale `followup_post_mvp_security_rotations.md`) :

- **Rotation finale du password BDD prod** (4ᵉ rotation) — reportée explicitement post-MVP par décision Board 2026-05-21. Précondition : password généré selon la règle URI-safe-only nouvellement actée.
- **Audit des transcripts Claude Code de la journée 2026-05-21** — vérifier qu'aucune autre fuite de credential n'est passée inaperçue. Post-MVP, lié à la rotation ci-dessus.
- **Refactor `migrate.ts` PGHOST en doc DEPLOY** — déjà adressé par cette PR (Étape 2 Option A documente le mapping Dashboard Supabase → vars PG*).

---

*Note rédigée par Alex via Claude Code, sur instruction Board (Steve). Aucune action distante (push, PR, déploiement) déclenchée par Alex — Yann commit + push + ouverture PR après validation Board, Board mergera après revue.*
