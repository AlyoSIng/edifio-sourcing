# CC — Nadia · Plan étape 2 Module Tandem (matching + page tokenisée + Brevo)

**Date** : 2026-05-24 13:20
**Émetteur** : Nadia (`dev_tandem`) via Claude Code
**Destinataire** : Board (information — zone verte) + Yann (`ps_operator`) pour création branche + commits
**Plan référent** : `handoff/PLAN_TANDEM_NADIA_260522.md` (plan complet 7.5 j)
**Brief mission** : message Board du 2026-05-24 (clés JWT RS256 posées, débloque l'étape 2)
**Note JWT** : `handoff/NOTE_260524_ARCHITECT_JWT_KEYS.md` (clés générées, format à figer par mes soins)

---

## État au démarrage

- ✅ **Étape 1 livrée et mergée** (PR #28, commit `c03dfef`) : refonte schéma `architects` propre, migration `0005_tandem_engine.sql` + `0006_tandem_rls.sql`, `architect_responses.tokenId` + `followupSentAt`, `odoo_opportunities` multi-opp, table `architect_opposition_tokens`, audit A16 `architect_response`, helper `src/lib/text/normalize.ts` (NFD+lowercase) + tests, seed fictif architectes idempotent. pgTAP RLS aligné par commit `1c5e652`.
- ✅ **Décisions Board confirmées** (Q1/Q3/Q4/Q5 dans la mission du 24/05) :
  - **Q1** : pondération `30/15/35/15/5` + flag `MATCHING_WEIGHTS_PROFILE` ('sparse_data' | 'mature').
  - **Q3** : Option A — bloc RGPD art.14 en variable code `{{rgpd_block}}`.
  - **Q4** : `solicitable` colonne `GENERATED ALWAYS AS (email IS NOT NULL) STORED` — **déjà en BDD étape 1**, rien à refaire.
  - **Q5** : clé JWT RS256 **dédiée** (`ARCHITECT_JWT_PRIVATE_KEY` / `ARCHITECT_JWT_PUBLIC_KEY`), `aud=architect`, 30 j, révocable.
- ✅ **Clés JWT RS256 posées** par le Board (Vercel Prod + Preview distincte + `.env.local`).
- ⏭️ **Format JWT à figer par mes soins** : je décide **base64 mono-ligne décodé au runtime** (plus simple à manipuler côté Vercel env, pas de `\n` échappés à gérer). Documenté dans `.env.example` (placeholders) à l'étape 2.

---

## Plan court — 5 étapes (sous-étapes du plan complet étape 2-5)

| # | Étape | Sortie | Effort |
|---|-------|--------|--------|
| **1** | **Branche `feat/tandem-engine-step2` depuis `main` (Yann)** — repart de main propre, pas de la branche sidebar mobile d'Alex. Pose `.env.local` avec les clés JWT (déjà fait côté Board, je vérifie le format au runtime). Mise à jour `.env.example` : placeholders `ARCHITECT_JWT_PRIVATE_KEY=` + `ARCHITECT_JWT_PUBLIC_KEY=` + `ARCHITECT_JWT_PUBLIC_KEY_BASE64=true` (format figé : base64 mono-ligne). | 0.25 j |
| **2** | **Matcher V1 + JWT RS256** — `src/lib/tandem/matching.ts` (rankArchitects, pondération `30/15/35/15/5` + flag `MATCHING_WEIGHTS_PROFILE`, normalize **des 2 côtés**), `src/lib/tandem/jwt.ts` (signArchitectToken / verifyArchitectToken, RS256, `aud=architect`, `iss=edifio-sourcing`, `exp=30d`, jti BDD via `architect_tokens` pour révocation), `src/lib/tandem/ai-rationale.ts` (Haiku 4.5 P5, fallback string si API down). Vitest : 10 tests matching (dont `Bâtiment↔batiment`, `ÉCOLE↔ecole`, pondération sparse/mature, geo département/limitrophe, history capé à 5×5=25, availability dégressive), 6 tests JWT (sign+verify OK, expired, revoked en BDD, mauvaise audience, signature invalide, jti unique). | 1.5 j |
| **3** | **Connecteur Odoo partagé + sollicitation Brevo + bloc RGPD** — `src/lib/odoo/{client,mapping,opportunities}.ts` (XML-RPC, `createOdooOpportunity(tenderId, { stage, origin, architectId? })`, idempotence via index partiels `uniq_opp_solo`/`uniq_opp_tandem`, retries + `lastError`). `src/lib/brevo/{client,template-picker,variables,rgpd-block.ts}` (variable code `{{rgpd_block}}` Q3, parse `contactName` split 1er espace, fallback « partenaire »). `src/app/(app)/sourcing/ao/[id]/tandem/actions.ts` : Server Action `matchArchitectsForTender` + `sendArchitectSolicitation` (insert `match_proposals` + `architect_tokens` + `brevo_messages`, status tender `awaiting_architect`, audit `architect_solicit` A5). Vitest : connecteur Odoo (mocks XML-RPC, 4 tests), template-picker (TU/VOUS + override, 4 tests), rgpd-block (présent, lien opposition généré, 3 tests). | 2 j |
| **4** | **Page tokenisée publique `/archi/[token]` + 3 actions + opposition RGPD + webhook Brevo** — `src/app/archi/[token]/page.tsx` (Server Component, JWT verify, gestion `invalid`/`expired`/`revoked`, render M4/M4v1.1 selon `architects.tutoiement`), `ArchitectResponseForm.tsx` (Client, 3 boutons + textarea optionnel pour `info_requested`), `POST /api/archi/[token]/respond` (update `architect_responses` + audit **A16** `architect_response` + trigger `createOdooOpportunity` si `accepted` + Realtime broadcast user), `/archi/oppose/[token]/page.tsx` + Server Action (`architects.active=false` + mark `architect_opposition_tokens.usedAt` + audit + mail D.8), `POST /api/webhooks/brevo` (HMAC + append idempotent `(messageId, event)` dans `brevo_messages.events` JSONB). **Ajout `PUBLIC_ROUTES` dans `src/lib/auth/routes.ts`** : `/archi/*` + `/api/webhooks/brevo` + `/api/archi/*`. **Hugo (reviewer) flag focus sécurité JWT/HMAC**. | 2 j |
| **5** | **UI short-list M-D1 + preview Brevo M-D2 + cron J+3 + tests E2E + note finale** — composant short-list scorée avec rationale Haiku, modale preview/édition Brevo (toggle TU/VOUS + champ libre), branchement depuis `SoloTandemModal` (au clic Tandem → page short-list `/sourcing/ao/[id]/tandem`), `/api/cron/tandem-followup` (Vercel cron quotidien, idempotent via `followupSentAt`, max 1 relance). Playwright `e2e/tandem.spec.ts` (12 scénarios spec §4 + 2 bonus RGPD : bloc art.14 présent, opposition fonctionne). pgTAP RLS si nouvelles tables touchées (a priori : non, tout est posé étape 1). DECISIONS.md + note finale `notes-de-suivi/CC_260530_TANDEM_LIVRAISON.md`. | 1.5 j |

**Total étape 2 : ~7.25 j** — aligné sur l'estimation plan complet (les étapes 2 à 6 du plan complet sont fusionnées en 5 sous-étapes ici car l'étape 1 du plan complet est déjà livrée).

---

## Coordination Alex / fichiers partagés

Inchangé par rapport au plan du 22/05 §C. Points de friction actifs :

- **`src/lib/text/normalize.ts`** : déjà créé par mes soins étape 1. Alex peut y ajouter `slugify`, `searchableText`, etc. si besoin (append-only, pas de conflit).
- **`src/db/schema/enums.ts`** : `auditAction` déjà étendu A16 étape 1. Si Alex doit ajouter codes admin (edit/import/export), append-only à la fin du tableau.
- **`middleware.ts` + `src/lib/auth/routes.ts`** : j'**ajoute uniquement** `/archi/*` + `/api/archi/*` + `/api/webhooks/brevo` à `PUBLIC_ROUTES`. Pas de modification de la logique middleware. Hugo vérifie.
- **`src/components/ui/*`** : pas de refacto palette. J'utilise les composants existants (refonte UI v4/v5 d'Alex déjà mergée commit `d2cdd29`).
- Branche Alex actuelle `feat/sidebar-mobile-hamburger` : j'évite tout merge croisé, je repars de `main`.

---

## Zone de risque flaggée

- **JWT clé format runtime** : je documente dans `.env.example` que le format figé est **base64 mono-ligne décodé par `Buffer.from(env, 'base64').toString('utf8')` au runtime**. Si Yann a posé la clé en PEM brut avec `\n` échappés sur Vercel, je gère les deux formats dans `loadArchitectKeys()` (détection automatique : commence par `-----BEGIN` → PEM brut sinon → base64). Évite la friction ops.
- **`createOdooOpportunity` côté Solo** : Alex écrit `confirmSoloSelection` plus tard. Je pose l'interface partagée `(tenderId, { stage, origin, architectId? })` et je documente le contrat dans le JSDoc du connecteur.
- **Webhook Brevo HMAC** : la spec ne pose pas l'algo. Je prends `HMAC-SHA256` avec secret `BREVO_WEBHOOK_SECRET` (à ajouter à `.env.example`). Si Brevo impose un autre algo, je rebascule à l'étape 5.

---

## Ce que je fais maintenant (zone verte)

1. ✅ Plan posté (ce fichier) — Yann committera.
2. ⏭️ **Demande à Yann** : créer branche `feat/tandem-engine-step2` depuis `main` (commit `c03dfef`). Plan court 3 étapes ci-dessous.
3. ⏭️ Sous-étape 1 du plan (vérif clés JWT format + `.env.example` mise à jour).
4. ⏭️ Sous-étape 2 (matcher + JWT) — Camille en boucle dès que `matching.ts` est testable (`pnpm vitest run src/lib/tandem`).
5. ⏭️ Sous-étapes 3 → 5 enchaînées, Hugo en relecture finale focus sécurité JWT + HMAC webhook + RLS RPC.
6. ⏭️ PR ouverte `feat/tandem-engine-step2` → `main` quand tout est vert (Camille + Hugo + CI).

---

## Demande à Yann (zone verte branche standard)

```
yann — peux-tu créer la branche `feat/tandem-engine-step2` depuis `main`
(commit c03dfef, point de référence après merge tandem étape 1), et me
ping ? je commence immédiatement la sous-étape 1 (vérif clés JWT format
runtime + update .env.example placeholders). Pas de push initial nécessaire
— je travaillerai en local et tu pousseras à mon premier commit.
```

---

*Plan court ÉTAPE 2 — zone verte, j'avance. Pas de blocage, pas de zone orange, pas de zone rouge. Estimation 7.25 j alignée plan complet.*
