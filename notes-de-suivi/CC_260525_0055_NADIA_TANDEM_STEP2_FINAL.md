# CC — Nadia · Module Tandem · Livraison finale étape 2 (5 sous-étapes)

**Date** : 2026-05-25 00:55
**Émetteur** : Nadia (`dev_tandem`) via Claude Code
**Destinataire** : Board (information) + Yann (`ps_operator`) pour commit/push + ouverture PR
**Branche** : `feat/tandem-engine-step2` (HEAD `cb59bb1` au démarrage sous-étape 5)
**Plan référent** : `notes-de-suivi/CC_260524_1320_NADIA_PLAN_TANDEM_ETAPE2.md`
**Brief** : message Board 2026-05-25 sous-étape 5

---

## TL;DR

Étape 2 du module Tandem livrée en 5 sous-étapes (matcher V1 RS256 → connecteur Odoo + Brevo + Server Action → page tokenisée + opposition + webhook → **UI short-list + preview Brevo + cron J+3 + tests E2E**).

**Statut final** : 735 / 735 tests Vitest verts · 0 warning ESLint · TypeScript clean · build env-clean compatible (résilience runtime try/catch absorbé sur tous les Server Components qui touchent `db.select`).

---

## Récap des 5 sous-étapes

| # | Sortie | Commit | Statut |
|---|--------|--------|--------|
| 1 | Branche + `.env.example` placeholders JWT base64 | `9e7642e` (fusionné) | ✅ |
| 2 | Matcher V1 + JWT RS256 + tests Vitest | `9e7642e` | ✅ |
| 3 | Connecteur Odoo partagé + sollicitation Brevo + bloc RGPD + Server Action | `db4b4c1` | ✅ |
| 4 | Page tokenisée `/archi/[token]` + opposition `/archi/oppose/[token]` + webhook Brevo HMAC | `cb59bb1` | ✅ |
| 5 | **UI short-list `/sourcing/ao/[id]/tandem` + preview Brevo M-D2 + cron J+3 + tests E2E + note finale** | À committer (Yann) | ✅ |

---

## Métriques sous-étape 5

| Indicateur | Valeur |
|------------|--------|
| Fichiers ajoutés (untracked) | 10 |
| Fichiers modifiés | 3 (`TenderCardActions.tsx`, `opportunities.test.ts`, `vercel.json`) |
| Tests Vitest ajoutés (sous-étape 5) | **19 tests / 3 fichiers** (`followup-cron.test.ts` 7, `route.test.ts` 7, `page-data.test.ts` 5) |
| Tests Vitest cumulés branche (TOTAL projet) | **735 / 735 passing** sur 50 fichiers |
| Tests E2E Playwright (étape 2 Tandem) | **7 scénarios** dans `e2e/tandem.spec.ts` |
| Migrations Drizzle | **0** (sous-étape 5 réutilise schéma posé étape 1) |
| Routes API ajoutées | 1 (`/api/cron/tandem-followup`) |
| Pages App Router ajoutées | 1 (`/sourcing/ao/[id]/tandem`) |
| Composants Client ajoutés | 2 (`TandemShortlistClient`, `BrevoPreviewModal`) |
| Vérifications sécurité | timingSafeEqual cron secret · XSS-safe preview (zéro `dangerouslySetInnerHTML`) · auth check défensif page Server Component · UUID validation côté server · pas de leak JWT dans les logs cron |

---

## Scope couvert vs spec `module_tandem_engine_v1.md`

| Section spec | Couvert ? | Sous-étape | Notes |
|--------------|----------|------------|-------|
| §3.1 Matching V1 (`rankArchitects`) | ✅ | 2 | Profil `sparse_data` 30/15/35/15/5 actif par défaut, flag `MATCHING_WEIGHTS_PROFILE` bascule sur `mature` post-enrichissement |
| §3.2 Short-list UI (M-D1) | ✅ | **5** | Page Server + Client `TandemShortlistClient`, déclenche `matchArchitectsForTender` au mount si 0 proposal persistée |
| §3.2 Preview Brevo (M-D2) | ✅ | **5** | Modale `BrevoPreviewModal` avec toggle TU/VOUS, bloc RGPD inclus, XSS-safe (pas de `dangerouslySetInnerHTML`), note libre 500 char max |
| §3.3 Server Action `sendArchitectSolicitation` | ✅ | 3 | UPSERT `match_proposals` + `architect_tokens` + `architect_responses` + UPDATE `tenders.status` + Brevo send + audit A5 |
| §3.4 Page tokenisée `/archi/[token]` + 3 actions | ✅ | 4 | Sub `accept` / `decline` / `info_requested` via `/api/archi/[token]/respond` |
| §3.5 Trigger Odoo opportunity à `accepted` | ✅ | 4 (consume) | `createOdooOpportunity(tenderId, { stage, origin: 'tandem', architectId })` consommé depuis la route POST respond |
| §3.6 Webhook Brevo HMAC | ✅ | 4 | `/api/webhooks/brevo` avec HMAC-SHA256 + append idempotent JSONB events |
| §3.7 Relance automatique J+3 | ✅ | **5** | `/api/cron/tandem-followup` (Vercel cron `0 7 * * *` quotidien) + `runTandemFollowups` lib + idempotence via `followup_sent_at` + max 1 relance |
| §4 Tests E2E (13 scénarios) | ⚠️ Partiel | **5** | 7 scénarios sur 13 livrés en E2E surface (auth, route cron, public routes, opposition, JWT invalide). Les 6 manquants (acceptation Odoo, refus D.8, push Realtime, webhook trace, relance J+3 effective, token révoqué) nécessitent une BDD live + Brevo mock — back-loggés pour Gate 7 plan_recette. Pas un blocker MVP. |

---

## Décisions techniques sous-étape 5 (zone verte, info Board)

1. **Vercel cron retenu vs pg_cron** (cf. brief sous-étape 5) : route `/api/cron/tandem-followup` avec auth bearer `CRON_SECRET` (timingSafeEqual constant-time). Plus simple à tester E2E, pas de migration BDD, alignement parfait avec le cron sourcing existant.
2. **Schedule cron `0 7 * * *`** (07:00 UTC = 09:00 Europe/Paris heure d'été). Décalé volontairement du cron sourcing (`30 4 * * 1-5`) pour ne pas saturer la Vercel function concurrency.
3. **Lien de relance = lien racine `/archi/`** : la spec §3.7 ne demande pas de re-signer un nouveau JWT pour la relance. En V1, le mail de relance pointe sur la racine et invite l'archi à rouvrir l'ancien mail (token original encore valide 30 j). À re-signer en V2 si feedback terrain.
4. **Pattern résilience runtime** appliqué à `/sourcing/ao/[id]/tandem` : try/catch absorbé autour de `loadTandemShortlistData`, fallback `<ErrorBanner role="alert">`. Aligné memory `feedback_nextjs_runtime_page_resilience`.
5. **Préview Brevo en JSX text, pas en HTML brut** : sécurité XSS par défaut (React échappe automatiquement les noms de cabinet `<script>` etc.). Le HTML envoyé via Brevo reste construit côté serveur via `buildBrevoVariables` (lui-même XSS-safe via `escapeHtml`).
6. **Correction bug TS pré-existant (sous-étape 3)** : `src/lib/odoo/opportunities.test.ts` ligne 29 — signature générique `executeKw<T>` réparée avec cast `0 as T`. Hors scope sous-étape 5 mais fixé pour ne pas bloquer la CI typecheck.

---

## Liste des fichiers à committer pour Yann (sous-étape 5)

**Untracked à `git add` :**

```
e2e/tandem.spec.ts
src/app/api/cron/tandem-followup/route.test.ts
src/app/api/cron/tandem-followup/route.ts
src/app/sourcing/ao/[id]/tandem/BrevoPreviewModal.tsx
src/app/sourcing/ao/[id]/tandem/TandemShortlistClient.tsx
src/app/sourcing/ao/[id]/tandem/page-data.test.ts
src/app/sourcing/ao/[id]/tandem/page-data.ts
src/app/sourcing/ao/[id]/tandem/page.tsx
src/lib/tandem/followup-cron.test.ts
src/lib/tandem/followup-cron.ts
notes-de-suivi/CC_260525_0055_NADIA_TANDEM_STEP2_FINAL.md
```

**Modifiés à `git add` :**

```
src/app/sourcing/ao-du-jour/TenderCardActions.tsx   (router.push après tandem)
src/lib/odoo/opportunities.test.ts                  (fix TS executeKw<T>)
vercel.json                                         (ajout cron tandem-followup)
```

**À NE PAS committer** (ce sont des handoff/notes/design pour d'autres tâches déjà existantes sur le working tree) :

```
design/design-system/                       (Alex)
handoff/BRIEF_CHANTIER_NEXT_260522.md       (Steve)
handoff/DIAGNOSTIC_260524_1756_STASH_NADIA.md (Steve)
handoff/SPEC_260524_DESIGN_SYSTEM_INTEGRATION.md (Alex)
notes-de-suivi/COWORK_260522_TOPO_LIVRABLES_SOIR.md (Steve)
```

---

## Demande à Yann (commit + push + PR)

```
yann — sous-étape 5 prête. peux-tu enchaîner :

(1) git add (liste ci-dessus exclusivement — voir "À NE PAS committer")
(2) commit :
    feat(tandem): ui short-list + preview brevo + cron j+3 + tests e2e (etape 2 sous-5)
(3) push origin feat/tandem-engine-step2
(4) ouvrir la PR vers main avec le draft ci-dessous

aucune migration BDD, aucune touche env Vercel additionnelle (CRON_SECRET
existe déjà depuis le cron sourcing). pas de pg_cron — Vercel cron via
vercel.json (déjà patché dans le commit).
```

---

## PR title + body draft

**Title** : `feat(tandem): module Tandem complet — matching V1, page tokenisée, sollicitation Brevo, cron J+3 (étape 2)`

**Body** :

```markdown
## Summary

Livre l'étape 2 complète du module Tandem (cotraitance architecte) — 5 sous-étapes
fusionnées du plan complet `handoff/PLAN_TANDEM_NADIA_260522.md` :

1. **Matching V1** architecte ↔ AO (`src/lib/tandem/matching.ts`) — pondération
   `30/15/35/15/5` profil `sparse_data` (décision Board 24/05 Q1), normalisation
   accents+casse OBLIGATOIRE des deux côtés (décision Board 22/05 d), flag
   `MATCHING_WEIGHTS_PROFILE` pour bascule `mature` post-enrichissement.
2. **JWT RS256** architecte (`src/lib/tandem/jwt.ts`) — `aud=architect`,
   `iss=edifio-sourcing`, exp 30 j, `jti` BDD pour révocation cible. Clés
   posées par Board 24/05.
3. **Connecteur Odoo partagé** (`src/lib/odoo/*`) — XML-RPC + idempotence via
   index partiels `uniq_opp_solo`/`uniq_opp_tandem`, contrat `createOdooOpportunity(tenderId, { stage, origin, architectId? })` consommé par Solo (Alex) ET Tandem.
4. **Sollicitation Brevo** + bloc RGPD art.14 — Option A Q3 Board : variable
   code `{{rgpd_block}}` injectée côté serveur, XSS-safe via `escapeHtml`.
5. **Page tokenisée publique** `/archi/[token]` (3 actions) + page d'opposition
   `/archi/oppose/[token]` (single-use) + webhook Brevo HMAC-SHA256 (events
   JSONB idempotents).
6. **UI short-list** `/sourcing/ao/[id]/tandem` + modale preview Brevo M-D2
   (toggle TU/VOUS, échappement XSS, bloc RGPD inclus en preview).
7. **Cron J+3 Vercel** `/api/cron/tandem-followup` (quotidien `0 7 * * *`),
   idempotent via `followup_sent_at`, max 1 relance par couple (tender, archi).

Audit log : action A16 `architect_response` allouée à l'étape 1, A5
`architect_solicit` strict validé.

Décisions Board en provenance des messages 22/05 et 24/05 toutes incorporées.

## Test plan

- [ ] **Camille (QA)** : `pnpm test` → 735 / 735 verts (à vérifier en CI)
- [ ] **Camille (QA)** : `pnpm lint` → 0 warning (à vérifier en CI)
- [ ] **Camille (QA)** : `pnpm typecheck` → clean (à vérifier en CI)
- [ ] **Camille (QA)** : `pnpm test:rls` (pgTAP) → vert (schéma sous-étape 1 déjà testé)
- [ ] **Camille (QA)** : `pnpm test:e2e` → 7 scénarios Playwright `tandem.spec.ts` verts (ceux qui ne dépendent pas de DB tournent en CI ; les autres skippés explicitement)
- [ ] **Hugo (reviewer)** focus sécurité :
  - JWT RS256 : signature + audience + `jti` BDD lookup → relire `jwt.ts` + `architect-page-data.ts`
  - HMAC webhook Brevo : timing-safe compare → relire `webhook-hmac.ts`
  - Cron secret : `crypto.timingSafeEqual` + refus par défaut si `CRON_SECRET` absent → relire `route.ts`
  - XSS preview Brevo : aucun `dangerouslySetInnerHTML` dans la modale → relire `BrevoPreviewModal.tsx`
  - Audit A16 strict-validé : payload conforme spec → relire `api/archi/[token]/respond/route.ts`
- [ ] **Hugo (reviewer)** focus archi :
  - Contrat partagé `createOdooOpportunity` : interface compatible Solo + Tandem
  - Pattern résilience runtime appliqué aux nouvelles pages Server Component
  - Build env-clean compatible : aucun import top-level qui touche `process.env.DATABASE_URL`
- [ ] **Hugo (reviewer)** focus RLS :
  - Toutes les queries portent le filtre `organizationId` explicite (defense in depth applicative — RLS reste posée en sous-étape 1)

## Périmètre du PR (par couche)

- **BDD / migrations** : aucune (sous-étape 1 fournit `architect_responses.tokenId` + `followup_sent_at`, `architect_opposition_tokens`, audit A16).
- **API routes** : `/api/archi/[token]/respond` (POST), `/api/archi/oppose/[token]` (page), `/api/webhooks/brevo` (POST), `/api/cron/tandem-followup` (GET/POST).
- **App Router pages** : `/sourcing/ao/[id]/tandem` (Server Component), `/archi/[token]` (public, Server Component), `/archi/oppose/[token]` (public).
- **Server Actions** : `matchArchitectsForTender`, `sendArchitectSolicitation` (`/sourcing/ao/[id]/tandem/actions.ts`).
- **Libs métier** : `src/lib/tandem/{matching,jwt,opposition-jwt,ai-rationale,architect-page-data,followup-cron}.ts`, `src/lib/brevo/{client,template-picker,variables,rgpd-block,webhook-hmac}.ts`, `src/lib/odoo/{client,mapping,opportunities}.ts`.
- **UI components** : `TandemShortlistClient`, `BrevoPreviewModal`, `ArchitectTandemPageBody`, `ArchitectResponseForm`, `TokenInvalidPage`.

## Hors scope (back-log étape 3 Tandem ou Gate 7)

- Re-signature JWT pour mail de relance J+3 (V1 : mail de relance pointe vers la racine `/archi/` — l'archi rouvre l'ancien mail). V2 : nouveau JWT signé.
- Test E2E Playwright complet (accept→Odoo, decline→D.8, push Realtime user, webhook trace, token révoqué admin) — nécessite environnement BDD live + mocks externes orchestrés. Plan recette Gate 7 dédié.
- Bouton admin « révoquer le token » côté UI (la révocation BDD est déjà supportée par `architectTokens.revoked` ; il faut juste un endpoint admin).
- Bouton admin « voir tous les archis » (fallback si matcher V1 propose 3 archis non pertinents — spec §8 mitigation).
- Page admin pour saisir manuellement une réponse archi (cas archi répond par téléphone) — flag `tokenId NULL` déjà supporté en BDD.

## Décisions Board incorporées

- 22/05 (a) : pondération matching `MATCHING_WEIGHTS_PROFILE` flag + profil `sparse_data` par défaut
- 22/05 (c) : `architect_responses.tokenId` + `followupSentAt` (étape 1)
- 22/05 (d) : normalisation accents+casse des deux côtés du matcher
- 22/05 audit A16 `architect_response` (étape 1)
- 24/05 Q1 : pondération `30/15/35/15/5`
- 24/05 Q3 (Option A) : bloc RGPD en variable code `{{rgpd_block}}`
- 24/05 Q4 : `architects.solicitable` GENERATED (étape 1)
- 24/05 Q5 : clés JWT RS256 dédiées `ARCHITECT_JWT_*` (audience `architect`)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## Back-log post-étape 2 Tandem (info étape 3 si décidée)

- E2E Playwright sur env live BDD pour les 6 scénarios spec §4 manquants
- Re-signature JWT relance J+3 (V2 confort UX)
- Admin UI : révocation token + saisie réponse manuelle + dashboard sollicitations en cours
- Métriques pour observer dérives matching (taux acceptation par archi, taux d'usage du fallback connexe à 50 %)
- Phase 2 : `confirmSoloSelection` côté Alex consommera `createOdooOpportunity(tenderId, { origin: 'solo' })` — contrat partagé déjà posé

---

## Anomalies / dette identifiée

- **Tests E2E étape 2** ne couvrent que la surface (auth, public routes, route cron). Les scénarios avec BDD live (acceptation → opp Odoo, refus → D.8, push Realtime) sont back-loggés Gate 7. Camille validera la décomposition.
- **Sous-étape 3 (commit `db4b4c1`)** avait introduit une erreur typecheck dans `opportunities.test.ts` ligne 29 — fix inclus dans cette sous-étape 5 (`executeKw<T>` réparé). C'était un legacy CI non-bloquant (typecheck CI passait via une indulgence du runner) mais inutile de laisser ça à Hugo.

---

*Sous-étape 5 livrée — zone verte. Aucune zone orange CTO, aucune zone rouge Board. Yann : commit + push + PR. Camille + Hugo : revue après push.*
