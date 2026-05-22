# PLAN — PR module Tandem (engine + cotraitance architecte)

**Émetteur** : Alex (dev) via Claude Code
**Date** : 2026-05-22
**Destinataire** : Board (info — zone verte, je n'attends pas l'OK pour démarrer)
**Spec** : `specs/module_tandem_engine_v1.md` + `specs/module_solo_engine_v1.md` (connecteur Odoo partagé) + `specs/architects_data_and_admin_v1.md`
**Branche cible** : `feat/tandem-engine` (créée par Yann après lecture de ce plan)
**Estimation totale** : **~ 8-9 jours** (spec dit 7 ; +1.5 j pour migration schéma `architects` + `odoo_opportunities` + seed fictif robuste, cf. §G)
**Renforts** : Camille (QA) sur tests, Hugo (reviewer) sur PR avant Board

---

## A. Découpe — 6 étapes ordonnées

> Chaque étape produit une PR partielle ou un lot de commits cohérent. La PR globale est livrée à la fin de l'étape 6. Camille teste en boucle dès l'étape 2.

| # | Étape | Sortie | Dépend de | Effort |
|---|-------|--------|-----------|--------|
| 1 | **Migration schéma + RLS** — étendre `architects`, refondre `odoo_opportunities` (multi-opp Tandem), créer `architect_opposition_tokens`, compléter `architect_responses.followup_sent_at`, allouer codes audit A16+ (cf. §F) | Migration Drizzle `0005_tandem_engine.sql` + `0006_tandem_rls.sql` (pgTAP couvert) | — | 1 j |
| 2 | **Seed architectes fictifs** (3-5 cabinets, mix tu/vous, spécialités/zones variées) + helper `db:seed:architects` dev-only | `src/db/seed/architects-fixture.ts` + test snapshot | Étape 1 | 0.5 j |
| 3 | **Connecteur Odoo partagé** (`src/lib/odoo/`) — client XML-RPC + `createOdooOpportunity(tenderId, { stage, origin, architectId? })` + mapping `crm.lead` + idempotence + mock testable | Module `src/lib/odoo/*` + tests vitest (mocked XML-RPC) | Étape 1 (table revue) | 1.5 j |
| 4 | **Matching V1 + sollicitation Brevo** — `src/lib/tandem/matching.ts` (règles pondérées + repondération données pauvres, cf. §H Q1), JWT 30 j (`src/lib/tandem/jwt.ts`), server action `sendArchitectSolicitation`, choix template TU/VOUS, P5 Haiku pour rationale, audit A5 + A16 (REQUEST), insertion `match_proposals` + `architect_tokens` + `brevo_messages` | Pages Server + lib + tests vitest | Étapes 1-3 | 1.5 j |
| 5 | **Page tokenisée publique + réponse architecte** — route `src/app/archi/[token]/page.tsx` (hors middleware, ajout `PUBLIC_ROUTES`), composant client M4/M4v1.1 selon registre, route POST `/api/archi/[token]/respond`, **page opposition RGPD** `/archi/oppose/[token]`, webhook Brevo `/api/webhooks/brevo` (HMAC), au `accepted` → appel `createOdooOpportunity(..., { architectId })` | UI + routes + tests E2E + audit A?? | Étapes 3-4 | 2 j |
| 6 | **Relance J+3 cron + UI short-list/preview** — composant short-list (M-D1), modale preview Brevo TU/VOUS éditable (M-D2), endpoint cron `/api/cron/tandem-followup` (Vercel cron), tests E2E complets (12 scénarios) | UI sourcing + cron + DECISIONS.md + note de suivi | Étape 5 | 1.5 j |

---

## B. Fichiers à créer/modifier (chemins concrets)

### Schéma BDD (Drizzle) — étape 1
- **MODIF** `src/db/schema/architects.ts` : ajouter `cabinet`, `contactName`, `website`, `zip`, `city`, `siren`, `headcount`, `companySize`, `companyCreatedAt`, `odooExternalId` (UNIQUE), `preferred` (bool), `solicitable` (bool, dérivé email non-vide), `active` (bool, RGPD droit d'opposition), `pastCollabsCount` (int), `notes` (déjà là). **Conserver** `firstname/lastname/title/email/tutoiement` (compat). 🟠 question CTO §H Q4.
- **MODIF** `src/db/schema/integrations.ts` — `odooOpportunities` : ajouter `architectId` (FK nullable), `origin` (text check 'solo'/'tandem'), `lastError` (text). **Retirer** l'`UNIQUE(tenderId)` actuel et **ajouter** les 2 index partiels (`uniq_opp_solo` quand `architect_id IS NULL`, `uniq_opp_tandem` sur `(tender_id, architect_id)` sinon).
- **MODIF** `src/db/schema/selections.ts` — `architectResponses` : ajouter `followupSentAt` (timestamptz), `tokenId` (FK `architect_tokens.id`).
- **NEW** `src/db/schema/rgpd.ts` — `architectOppositionTokens` (jti, architectId, createdAt, expiresAt, usedAt).
- **NEW** `src/db/migrations/0005_tandem_engine.sql` (généré via `pnpm drizzle-kit generate`).
- **NEW** `src/db/migrations/0006_tandem_rls.sql` — policies FORCE + tests cross-tenant sur les 5 tables Tandem (`architects`, `match_proposals`, `architect_responses`, `architect_tokens`, `odoo_opportunities`, `architect_opposition_tokens`).
- **MODIF** `src/db/schema/enums.ts` : ajout valeurs `auditAction` (A16+ — codes à confirmer, cf. §F).

### Seed fictif — étape 2
- **NEW** `src/db/seed/architects-fixture.ts` — 4 cabinets de test (mix tu/vous, spécialités scolaire/santé/tertiaire/réhab, zones 75/92/69/31), insertion sous `ALYOS_ORG_ID`, idempotent.
- **MODIF** `src/db/seed/index.ts` — branche `seedArchitectsFixture()` conditionnel `NODE_ENV !== 'production'`.

### Connecteur Odoo — étape 3
- **NEW** `src/lib/odoo/client.ts` — wrapper XML-RPC (auth `common.authenticate` + helpers `executeKw`), lecture secrets `.env.local` (`ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_API_KEY`).
- **NEW** `src/lib/odoo/mapping.ts` — `mapTenderToOdooLead(tender, input, architect?)` selon table §3.3 spec Solo.
- **NEW** `src/lib/odoo/opportunities.ts` — `createOdooOpportunity()` + idempotence (lookup `odooOpportunities` par `(tenderId, architectId)`) + log `last_error` si échec.
- **NEW** `src/lib/odoo/__mocks__/` — mock vitest (mode CI sans Odoo réel).
- **MODIF** `.env.example` — clés Odoo en placeholders.

### Module Tandem — étape 4
- **NEW** `src/lib/tandem/matching.ts` — `rankArchitects(tender, orgId): MatchScore[]` (top 3), filtre `solicitable=true AND active=true`, repondération §H Q1, helpers `inferCategoryFromCpv`, `extractDepartmentFromBuyer`, `countSolicitationsLast30Days`.
- **NEW** `src/lib/tandem/jwt.ts` — `generateArchitectToken({ tenderId, architectId, expiresIn: '30d' })` + `verifyArchitectToken(token)` (RS256, clés depuis `.env.local`), stockage `jti` en BDD (table `architect_tokens`).
- **NEW** `src/lib/tandem/ai-rationale.ts` — appel Haiku 4.5 (P5), provenance prompt versionné depuis `ai_prompts` BDD.
- **NEW** `src/app/sourcing/ao/[id]/tandem/actions.ts` — server actions `matchArchitectsForTender`, `sendArchitectSolicitation`. Audit A5 sur send.
- **NEW** `src/lib/brevo/client.ts` — wrapper Brevo API (transactional emails) + `getBrevoTemplateId(name)` (mapping en config).
- **NEW** `src/lib/brevo/template-picker.ts` — sélection TU/VOUS selon `architects.tutoiement` (cf. invariant CLAUDE §5).
- **NEW** `src/lib/brevo/variables.ts` — `buildBrevoVariables(tender, architect, token, opposeUrl)` (génère `{{archi_prenom}}`, `{{lien_ao}}`, `{{lien_opposition}}`, etc.).

### Page tokenisée + RGPD + webhook — étape 5
- **NEW** `src/app/archi/[token]/page.tsx` — Server Component, vérifie JWT, charge données, render M4/M4v1.1.
- **NEW** `src/app/archi/[token]/ArchitectResponseForm.tsx` — Client Component (3 boutons : oui/info/non + textarea optionnelle).
- **NEW** `src/app/archi/[token]/InvalidToken.tsx` — page erreur token (expiré/révoqué/invalide).
- **NEW** `src/app/api/archi/[token]/respond/route.ts` — POST handler (token check + update `architect_responses` + tender status + audit + trigger Odoo si `accepted` + Realtime).
- **NEW** `src/app/archi/oppose/[token]/page.tsx` — page publique opposition RGPD (1 clic → `architects.active=false`, mail confirmation D.8-like, audit A??).
- **NEW** `src/app/api/webhooks/brevo/route.ts` — POST handler, vérifie HMAC, append events dans `brevoMessages.events` (RPC ou update direct), idempotent sur `(message-id, event)`.
- **MODIF** `src/lib/auth/routes.ts` — ajouter `/archi/*` et `/api/webhooks/brevo` à `PUBLIC_ROUTES` (hors middleware domaine). 🔴 vérifier que le middleware reste actif sur tout le reste.

### UI + cron — étape 6
- **NEW** `src/app/sourcing/ao/[id]/tandem/ShortListView.tsx` — composant M-D1 (3 architectes scorés, rationale, boutons « choisir »).
- **NEW** `src/app/sourcing/ao/[id]/tandem/BrevoPreviewModal.tsx` — M-D2 (preview Brevo + toggle TU/VOUS + champ libre + envoi).
- **MODIF** `src/app/sourcing/ao-du-jour/SoloTandemModal.tsx` — au clic « Tandem », redirige vers `/sourcing/ao/[id]/tandem` (au lieu d'un placeholder).
- **NEW** `src/app/api/cron/tandem-followup/route.ts` — cron quotidien Vercel, scan `architect_responses` pending entre J-4 et J-3, envoi D.3/D.4, update `followup_sent_at`. Idempotent (1 relance max).
- **MODIF** `vercel.json` — déclarer le cron `0 8 * * *` UTC.

### Docs
- **MODIF** `DECISIONS.md` — entrées 2026-05-22 (schéma `odoo_opportunities` multi-opp, codes audit A16+, repondération matching pauvre, JWT RS256).
- **NEW** `notes-de-suivi/CC_260530_TANDEM_LIVRAISON.md` — post-livraison.

---

## C. Connecteur Odoo partagé — emplacement + contrat

**Emplacement** : `src/lib/odoo/` (réutilisé par Solo et Tandem, écrit **une fois** ici, dans cette PR Tandem — décision Board 2026-05-21 « coordonner les deux »).

**Contrat TypeScript** :
```ts
// src/lib/odoo/opportunities.ts
export interface OdooOppInput {
  stage: 'Sourcing' | 'Réponse cotraitance';
  origin: 'solo' | 'tandem';
  /** NULL en Solo ; renseigné en Tandem (1 opp par couple AO/archi partant) */
  architectId?: string;
}

export async function createOdooOpportunity(
  tenderId: string,
  input: OdooOppInput,
): Promise<{ odooId: number; created: boolean }>;
```

**Appel par Tandem** (route `POST /api/archi/[token]/respond` sur `status === 'accepted'`) :
```ts
await createOdooOpportunity(decoded.tenderId, {
  stage: 'Réponse cotraitance',
  origin: 'tandem',
  architectId: decoded.architectId,
});
```

**Idempotence** : lookup `odooOpportunities` par `(tender_id, architect_id)` (incluant `architect_id IS NULL` pour Solo). Si trouvé → retourne l'`odooId` existant, `created: false`. Couvre double-clic / retry cron / re-run.

**Gestion erreur Odoo** : try/catch, INSERT `last_error`, ne **jamais** rollback la réponse architecte (le geste métier est acquis, la synchro Odoo est rejouable). Bouton « Réessayer la synchro » côté UI (étape 6).

**Solo** (futur — PR séparée) : appelle le **même** module avec `architectId: undefined`, depuis `src/app/sourcing/ao-du-jour/actions.ts` à la confirmation Solo. Pas dans le périmètre de cette PR.

---

## D. Seed architectes fictif (dev/CI sans liste réelle Board)

**Fichier** : `src/db/seed/architects-fixture.ts`

**4 cabinets fictifs**, tous insérés sous `ALYOS_ORG_ID`, avec adresses email locales `@example.test` (jamais routées par Brevo en mode dev) :

| Cabinet | Contact | Tu/Vous | Spécialités | Départements | Préféré |
|---------|---------|---------|-------------|--------------|---------|
| Atelier Martin | Marc Martin | **TU** | scolaire, rehabilitation | 75, 92, 93 | TRUE |
| Cabinet Dubois & Associés | Catherine Dubois | VOUS | sante, equipement_public | 69, 38, 01 | FALSE |
| Studio Vert | Léa Boyer | TU | tertiaire, amenagement_paysage | 33, 17 | FALSE |
| Architectures du Sud | Pierre Sanchez | VOUS | logements_collectifs, rehabilitation | 31, 34, 11 | FALSE |

**Idempotent** : upsert sur `(organizationId, email)` (unique existant). Lancé par `pnpm db:seed:architects` (script dédié, hors `db:seed` prod pour éviter contamination). Couvre les 4 combinaisons TU/VOUS × spécialité riche/pauvre nécessaires aux 12 scénarios E2E.

**Quand la liste réelle Board arrive** (`specs/architects_seed_template.csv`) : on bascule sur l'import via l'écran admin (hors périmètre PR Tandem — PR admin séparée), le fixture reste pour la CI/dev.

---

## E. Tests prévus (noms — pas de code à ce stade)

### E2E Playwright (`e2e/tandem.spec.ts`) — 12 scénarios spec §4
1. `tandem_shortlist_displays_3_scored_architects`
2. `tandem_toggle_tu_vous_prefilled_from_architect_flag`
3. `tandem_send_solicitation_creates_jwt_and_status_awaiting_architect`
4. `tandem_tokenized_page_renders_without_login`
5. `tandem_architect_accepts_triggers_odoo_opportunity` (mock Odoo)
6. `tandem_architect_declines_sends_acknowledgment_email`
7. `tandem_architect_requests_info_stores_message`
8. `tandem_token_expired_after_30d_shows_error_page`
9. `tandem_token_revoked_by_admin_is_unusable`
10. `tandem_brevo_webhook_records_opened_and_clicked_events`
11. `tandem_realtime_push_notifies_user_on_architect_response`
12. `tandem_followup_cron_sends_d3_mail_at_j_plus_3`

**Bonus RGPD** (hors §4 mais bloquant pour Camille) :
- `tandem_rgpd_opposition_link_deactivates_architect`
- `tandem_rgpd_mention_present_in_first_email`

### pgTAP RLS (`db/tests/tandem_rls.sql`)
- `rls_architects_cross_tenant_read_denied`
- `rls_architect_responses_cross_tenant_write_denied`
- `rls_architect_tokens_cross_tenant_read_denied`
- `rls_match_proposals_cross_tenant_denied`
- `rls_odoo_opportunities_cross_tenant_denied`
- `rls_architect_opposition_tokens_cross_tenant_denied`
- `rls_audit_logs_immutable_no_update_no_delete` (régression check)

### Vitest unit
- `matching.ts` : 8-10 tests (score parfait, spécialité absente, géo adjacent, repondération données pauvres, top 3 tri, ex-aequo)
- `jwt.ts` : génération + vérif + expiration + révocation + signature invalide
- `template-picker.ts` : TU si `tutoiement=true`, VOUS sinon, override UI
- `opportunities.ts` : création OK, idempotence Solo (`architectId NULL`), idempotence Tandem `(tenderId, architectId)`, échec XML-RPC → `last_error`
- `variables.ts` : génération `{{lien_ao}}` + `{{lien_opposition}}` corrects, échappement HTML
- `webhook brevo` : signature HMAC valide/invalide, idempotence `(messageId, event)`
- `cron followup` : sélection J-4 à J-3, skip si `followup_sent_at` non null, idempotent

---

## F. Risques

### F.1. Codes audit_log manquants — 🟠 REQUEST Board nécessaire

Le registre `specs/audit_log_v1.md` couvre 15 actions (A1-A15). **Manquants pour Tandem** :
- **architect_response** (réponse archi sur page tokenisée — pas couvert par A5 qui est l'envoi)
- **architect_opposition** (RGPD art. 21 — clic sur lien d'opposition)
- **architect_followup_sent** (relance J+3 — distinct de A5 pour analytics)
- **brevo_webhook_received** (traçabilité événements Brevo — optionnel mais utile)
- **architect_edit / architect_import / architect_export** (écran admin — hors périmètre Tandem mais à allouer en même temps pour cohérence)

→ **Action** : je poste **`handoff/REQUEST_260522_1100_AUDIT_CODES_TANDEM.md`** après validation de ce plan, demandant allocation des codes **A16-A22** (à confirmer par CTO/Board). Je **n'invente pas** de code en attendant — j'utilise `audit_action` étendu mais le mapping vers les nouveaux codes attend l'OK CTO. **Bloque l'étape 4 partiellement** (l'audit A5 send fonctionne déjà ; les nouveaux audits sont posés en TODO commenté + test skipped → Camille débloque dès réponse Board).

### F.2. JWT architecte sur page hors middleware domaine

La route `/archi/[token]` est **publique** (pas de session AlyoS, l'architecte est un tiers externe). C'est **voulu et nécessaire** mais c'est une exception au principe « 100 % des routes derrière middleware domaine ». Mitigations :
- JWT signé **RS256** (clé privée jamais committée, dans `.env.local` Vercel)
- `jti` unique stocké en BDD → révocation immédiate via `architect_tokens.revoked`
- Expiration 30 j (cf. ADR Gate 2 arbitrage 1/A)
- Vérif révocation **à chaque requête** (pas seulement signature)
- Rate-limit Vercel par IP sur `/archi/*` (à configurer côté Vercel — TODO Yann)
- Audit `access_attempt` étendu pour tracer les accès `/archi/*` (succès et échec) — réutilise A13 existant
- Hugo (reviewer) vérifie **explicitement** la sécurité JWT avant validation

### F.3. Idempotence webhook Brevo

Brevo peut renvoyer plusieurs fois le même event (retry réseau, double delivery). Mitigation :
- Vérif HMAC (signature) avant traitement
- Append idempotent : check `(message-id, event, date)` dans `brevoMessages.events` JSONB avant ajout
- Si tentative de re-trigger d'une action métier (ex. accepted déjà traité) → no-op grâce à idempotence `createOdooOpportunity` sur `(tenderId, architectId)`

### F.4. RGPD art. 14 dans le 1er mail

Le template Brevo `architect_solicitation_TU/VOUS` (cf. `email_sollicitation_architecte_v1.md` §C) **doit** contenir la mention art. 14 + lien d'opposition. Vérification automatisée :
- Test vitest : la fonction `buildBrevoVariables()` produit `{{lien_opposition}}` non-vide pour le 1er envoi
- Test E2E `tandem_rgpd_mention_present_in_first_email` : capture le mail mocké (Brevo en mode dev), assert présence du bloc art. 14 + lien
- 🟠 question CTO §H Q3 : la mention art. 14 est-elle dans le template Brevo (côté Brevo, géré par Léa) ou injectée par notre variable `{{rgpd_block}}` (côté code) ? Spec dit « bloc en petits caractères sous la signature » — pas clair si template Brevo ou variable.

---

## G. Estimation : 8-9 jours (vs 7 j spec)

| Étape | Spec | Mon estim | Écart |
|-------|------|-----------|-------|
| Matching + UI short-list | 2 j | 2 j | OK |
| Server Action send + JWT | 1 j | 1 j | OK |
| Page tokenisée + 3 actions | 1.5 j | 1.5 j | OK |
| Webhook Brevo + cron | 1 j | 1 j | OK |
| Tests + audit | 1.5 j | 1.5 j | OK |
| **Bonus non chiffré spec** | — | **1.5-2 j** | Migration `architects` + refonte `odoo_opportunities` (multi-opp Tandem) + seed fictif + connecteur Odoo partagé + page opposition RGPD |
| **TOTAL** | **7 j** | **8-9 j** | +1.5-2 j |

Les +1.5-2 jours sont **structurants** (le connecteur Odoo bien écrit fait gagner 1 j à Solo après, la refonte `odoo_opportunities` évite une dette technique immédiate). Si trop : on découpe en 2 PR (Tandem core 7 j + Solo Odoo connector 1 j).

---

## H. Bloqué par le Board — impact sur la PR

| Sujet | Statut | Impact PR Tandem | Mitigation |
|-------|--------|------------------|------------|
| **Liste architectes réelle** (CSV) | en attente Board | aucun (seed fictif §D) | Import via écran admin (PR séparée) |
| **Accès Odoo** (URL, base, user, API key) | en attente Board (cf. `handoff/COLLECTE_ODOO_260521.md`) | tests E2E `tandem_architect_accepts_triggers_odoo_opportunity` **utilisent un mock XML-RPC** | Connecteur écrit et testé contre mock ; bascule vers Odoo réel = changer `.env.local` |
| **Pipeline + étape Odoo** (« AO publics » / « Sourcing » / « Réponse cotraitance ») | en attente Board | hardcodé en constante `src/lib/odoo/constants.ts` pour mock | À confirmer avant déploiement prod ; modification mineure |
| **Durée conservation RGPD** architectes | en attente Board (Gate 8) | aucun pour le code, mais **valeur provisoire** dans `rgpd_registre_architectes_DRAFT.md` (proposition 3 ans CTO §7.5) | Bandeau « valeur provisoire » + note Gate 8 |
| **Codes audit A16+** | REQUEST à poster post-plan (§F.1) | audit nouvelles actions en TODO + tests skipped tant que pas alloués | Débloque dès réponse CTO |

### Questions CTO ouvertes (🟠) — non bloquantes, à grouper en REQUEST après validation plan

- **Q1 — Repondération matching V1 données pauvres** : spec architects §7.4 recommande (a) repondérer (moins spécialité, plus géo+historique) tant que la donnée est pauvre. Confirmer la pondération exacte : `geo 30 / specialty 15 / history 35 / availability 15 / preference 5` au lieu du `30/20/25/15/10` du spec Tandem ? J'implémente la repondération par défaut + flag config pour basculer vers les poids spec quand la base sera enrichie.
- **Q2 — Conflit modèle `architects`** : le schéma actuel a `firstname/lastname/title/siret`. La spec import architects manipule `cabinet/contact_name/siren`. Je propose **garder** `firstname/lastname` (matching IA P5 et templates Brevo en dépendent), **ajouter** `cabinet/contact_name/siren` (compat import Odoo), **alias** `siret` → `siren` (déjà même longueur 14 vs 9 — pas tout à fait, en fait : SIRET = SIREN + 5 chars). Donc 2 colonnes distinctes `siren` (9) et `siret` (14). À confirmer.
- **Q3 — Mention RGPD art. 14** : injection via variable Brevo `{{rgpd_block}}` (côté code, type-safe) ou directement dans le template Brevo (côté Léa) ? Reco perso : variable code (testable en CI, on contrôle le contenu).
- **Q4 — `solicitable` colonne ou vue dérivée ?** : `solicitable` = `email IS NOT NULL`. Colonne stockée (denormalisée, perf matching) OU vue/expression dans la query ? Reco perso : colonne stockée + trigger ou regen à l'import (1 lookup BDD vs N).
- **Q5 — JWT clé RS256** : génération de la paire de clés. On utilise une clé Supabase existante ou on génère une dédiée `ARCHITECT_JWT_PRIVATE_KEY` / `ARCHITECT_JWT_PUBLIC_KEY` ? Reco perso : dédiée (rotation indépendante, isolation de risque).

---

## Synthèse — ce que je fais maintenant (zone verte)

1. Je poste ce plan (fait — fichier présent).
2. J'attends que **Yann** crée la branche `feat/tandem-engine` depuis `feat/sourcing-mvp`.
3. Pendant ce temps, je rédige **un seul** REQUEST groupé (`handoff/REQUEST_260522_1100_TANDEM_CTO.md`) couvrant §F.1 (codes audit) + §H Q1-Q5. Pas de blocage : je démarre l'étape 1 (migration + RLS) en parallèle, les 🟠 questions n'affectent que les étapes 2+.
4. À l'OK CTO sur le REQUEST, j'enchaîne étapes 2 → 6.
5. Camille en boucle dès l'étape 2 ; Hugo en relecture finale étape 6.
6. Yann commit + push à chaque étape (Conventional Commits `feat(tandem): ...`).

**Pas de code écrit. Pas de migration générée. Pas de fichier autre que ce plan.**
