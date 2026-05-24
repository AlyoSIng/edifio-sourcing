# CC — Nadia · Tandem étape 2, sous-étapes 1 + 2 livrées (matcher + JWT + IA)

**Date** : 2026-05-24 14:35
**Émetteur** : Nadia (`dev_tandem`) via Claude Code
**Destinataire** : Board (information) + Yann (`ps_operator`) pour 1er commit
**Branche** : `feat/tandem-engine-step2`
**Plan référent** : `notes-de-suivi/CC_260524_1320_NADIA_PLAN_TANDEM_ETAPE2.md`

---

## Livrables sous-étape 1 — Format JWT figé

- `.env.example` enrichi avec un bloc dédié **Architect JWT (module Tandem)** + bloc Brevo (5 templates IDs + secret HMAC webhook).
- **Format figé** documenté en JSDoc + `.env.example` : **base64 mono-ligne** (recommandé Vercel), avec fallback PEM brut auto-détecté côté `loadArchitectKeys()`. Pas de `\n` échappés à gérer côté ops.
- Règle d'or réécrite : paire DIFFÉRENTE Prod ≠ Preview ≠ Local.

## Livrables sous-étape 2 — Matcher V1 + JWT RS256 + Haiku rationale

### Code (3 modules, 0 dépendance ajoutée)

- `src/lib/tandem/jwt.ts` — sign/verify RS256 sur **`node:crypto` natif** (pas
  de lib JWT externe ajoutée — Node 22+, Vercel Node runtime). Audience `architect`,
  issuer `edifio-sourcing`, TTL 30 j, `jti` UUID v4. Détection format clé auto
  (base64 ↔ PEM ↔ PEM avec `\n` littéraux). Hook `dbCheck(jti)` optionnel pour
  la révocation (le module reste pur, pas de couplage Drizzle).
- `src/lib/tandem/matching.ts` — `rankArchitects`, pondération **`30/15/35/15/5`**
  (profil `sparse_data` — décision Q1 Board 24/05) avec flag `MATCHING_WEIGHTS_PROFILE`
  qui bascule sur `mature` (`30/20/25/15/10`). Normalisation accents+casse via
  `normalizeForMatching` **des deux côtés** (titre AO ↔ keywords). Extraction
  département : rawData BOAMP > code postal buyer (gestion Corse 2A/2B). Table
  d'adjacence départements (sous-ensemble métropole, à étendre au fil de l'eau).
  Spécialités : 16 codes du vocabulaire contrôlé + table de proximité pour bonus
  "connexe" 50 %.
- `src/lib/tandem/ai-rationale.ts` — fallback déterministe (toujours dispo, pas
  de coût) + hook `AiRationaleClient` injectable pour brancher Haiku P5 quand
  `src/lib/ai/anthropic.ts` arrivera (hors périmètre étape 2). Cap 220 chars.

### Tests (42 tests verts, 100% module pur)

- `matching.test.ts` (23 tests) : normalisation accents/casse, départements,
  adjacence symétrique, scoring per-architecte (exact/connexe/cap/dégressif),
  profils sparse/mature, ranking top N.
- `jwt.test.ts` (12 tests) : sign+verify, expired, signature invalide, audience,
  issuer, révoqué (dbCheck), inconnu, jti unique, décodage 3 formats (base64,
  PEM brut, PEM avec `\n` littéraux).
- `ai-rationale.test.ts` (7 tests) : fallback score 0, fallback score positif,
  cap 220, hook IA OK / throw / null / absent.

### Qualité

- `pnpm typecheck` : OK
- `pnpm test src/lib/tandem` : 42/42 OK (482 ms)
- `next lint --dir src/lib/tandem` : 0 warning, 0 error

---

## Pourquoi `node:crypto` et pas `jose`

Décision zone verte (technique standard, pas d'écart spec) : pas de dépendance
ajoutée tant que la page archi reste en **Node runtime** (défaut Next.js 14
App Router sur Vercel). Si on bascule en Edge runtime plus tard (perf cold
start), il faudra switcher à `jose` (Web Crypto) — c'est un swap de 30 lignes,
borné à `jwt.ts`. Documenté dans le JSDoc du module.

---

## Coordination Alex

- Fichiers d'Alex touchés sur la branche (RejectReasonModal, TenderCardActions,
  actions.test.ts, queries.test.ts) : **je n'ai rien modifié**. Ces fichiers
  proviennent du merge `main` au moment du création de la branche. Pas de
  conflit attendu.
- `.env.example` : append-only à la fin (bloc Brevo + bloc Architect JWT). Si
  Alex a besoin d'ajouter des vars admin (`ADMIN_*`), même fichier mais
  blocs disjoints — pas de conflit.

---

## Prochaine action — Sous-étape 3

Connecteur Odoo partagé + sollicitation Brevo + bloc RGPD `{{rgpd_block}}` +
Server Action `matchArchitectsForTender` / `sendArchitectSolicitation`. Effort
~2 j. Je continue tout de suite **après commit Yann** de cette première
tranche (pour ne pas accumuler trop de code non poussé en cas d'incident
machine).

---

## Demande à Yann (commit zone verte)

```
yann — peux-tu commit les livrables sous-étapes 1+2 sur feat/tandem-engine-step2 ?

Périmètre du commit (rien d'autre — ne pas committer les changements Alex
ao-du-jour qui sont déjà staged depuis main) :

  - .env.example
  - src/lib/tandem/jwt.ts
  - src/lib/tandem/jwt.test.ts
  - src/lib/tandem/matching.ts
  - src/lib/tandem/matching.test.ts
  - src/lib/tandem/ai-rationale.ts
  - src/lib/tandem/ai-rationale.test.ts
  - notes-de-suivi/CC_260524_1320_NADIA_PLAN_TANDEM_ETAPE2.md
  - notes-de-suivi/CC_260524_1435_NADIA_TANDEM_STEP2_SOUSETAPES_1_2.md

Message proposé (Conventional Commits, subject lowercase strict cf. ma
memory commitlint) :

  feat(tandem): matcher v1 + jwt rs256 + rationale haiku (etape 2 sous-etapes 1+2)

  - matcher V1 ponderation 30/15/35/15/5 (profil sparse_data, Q1 Board)
  - flag MATCHING_WEIGHTS_PROFILE pour bascule mature post-enrichissement
  - normalisation accents+casse OBLIGATOIRE des 2 cotes (DECISIONS 22/05 (d))
  - extraction departement rawData BOAMP > code postal buyer (Corse 2A/2B)
  - JWT RS256 architecte sur node:crypto natif (0 dep ajoutee)
  - audience=architect, issuer=edifio-sourcing, TTL 30j, jti UUID v4
  - decodeKeyFromEnv : base64 mono-ligne OU PEM brut OU PEM \n litteraux
  - hook dbCheck(jti) optionnel pour revocation (module pur, pas Drizzle)
  - fallback rationale deterministe + hook AiRationaleClient injectable
  - .env.example : bloc Architect JWT + bloc Brevo (5 templates + HMAC secret)
  - 42 tests vitest verts, typecheck OK, lint clean

Aucune migration BDD dans ce commit — la sous-etape 1 du plan a juste fige
le format runtime. Etape 1 du plan complet (migrations 0005+0006) deja
mergee dans main via PR #28.
```

---

*Sous-étapes 1+2 livrées en zone verte. Pas de blocage, pas d'escalade CTO,
pas d'escalade Board. Sous-étape 3 démarre à mon prochain tour.*
