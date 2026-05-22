# PLAN — PR module Tandem (engine + cotraitance architecte) — Nadia

**Émetteur** : Nadia (`dev_tandem`) via Claude Code
**Date** : 2026-05-22
**Destinataire** : Board (information — zone verte, je n'attends pas l'OK pour démarrer la zone verte)
**Précédent** : `handoff/PLAN_TANDEM_ALEX_260522.md` (plan d'Alex de ce matin, conservé en historique — défrichage déjà fait, je ne le réécris pas)
**Spec** : `specs/module_tandem_engine_v1.md` + `specs/module_solo_engine_v1.md` (connecteur Odoo partagé) + `specs/architects_data_and_admin_v1.md` (à refondre — décision (a) du 22/05)
**Branche cible** : `feat/tandem-engine` (depuis `feat/sourcing-mvp`, créée par Yann)
**Estimation** : **~ 7-8 jours** (vs 8-9 d'Alex — gain ~1 j car les 4 décisions du 22/05 ferment plusieurs questions ouvertes et la refonte propre `architects` est plus rapide que l'extension avec compat)
**Renforts** : Camille (`qa`) sur tests, Hugo (`reviewer`) sur PR avant Board
**Ownership** : Nadia porte Tandem de bout en bout ; Alex travaille **en parallèle** sur refonte UI + admin profil + bug `/admin/users` (zéro conflit attendu — cf. §C)

---

## Intégration des 4 décisions Board 2026-05-22

| Décision | Impact plan |
|---|---|
| **(a) Refonte propre `architects`** (pas de patch, pas d'alias `firstname`/`lastname`/`siret`) | Migration 0005 refait la table : DROP/CREATE colonnes côté Drizzle, pas de double-colonne. Audit d'impact code **fait** ce matin (Grep) — seuls fichiers touchés : `src/db/schema/architects.ts` + `src/db/seed/index.ts` (fakers regen). Aucune route, aucun composant UI ne consomme `firstname`/`lastname`/`siret` aujourd'hui. **Q2 du plan d'Alex tombe.** |
| **(b) Code audit A16 = `architect_response`** alloué officiellement | Ajout direct dans `enums.ts` (`auditAction` pgEnum) + entrée A16 dans `specs/audit_log_v1.md`. **Pas de REQUEST audit.** Les autres codes (opposition, followup, webhook, edit/import/export) restent à allouer plus tard pour Alex (admin architects) — pas dans mon périmètre Tandem strict. |
| **(c) `tokenId` + `followupSentAt` sur `architect_responses`** | Ajoutés directement dans la migration 0005, `tokenId` = FK `architect_tokens(id)`, `followupSentAt` = `timestamptz NULL`. Cron J+3 (étape 5) update cette colonne, contrainte d'idempotence trivial (`WHERE followup_sent_at IS NULL`). |
| **(d) Normalisation accents+casse OBLIGATOIRE** côté matcher | Nouveau helper `src/lib/text/normalize.ts` exporte `normalizeForMatching(s: string): string` (NFD + retrait diacritiques + lowercase + trim + collapse espaces). Appelé des **deux côtés** dans `matching.ts` (titre AO ↔ mots-clés spécialité). Tests unitaires obligatoires : `Bâtiment` ↔ `batiment`, `ÉCOLE` ↔ `ecole`, `Réhabilitation` ↔ `rehabilitation`. **Coordonne** avec Alex : si lui crée déjà un helper côté UI (slug, recherche), on factorise dans le même fichier (sinon je crée, il réutilise). |

---

## A. Découpe — 6 étapes (vs 6 d'Alex, mais étapes 1 + 2 fusionnées et plus rapides)

| # | Étape | Sortie | Effort |
|---|-------|--------|--------|
| 1 | **Refonte schéma `architects` + ajouts `architect_responses` + RLS** — refonte propre (cabinet/contact_name/siren + enrichissements), ajout `tokenId`+`followupSentAt` sur `architect_responses`, refonte `odoo_opportunities` (multi-opp Tandem cf. spec Solo §3.2-3.3), création `architect_opposition_tokens`. Migration `0005_tandem_engine.sql` (drizzle-kit) + `0006_tandem_rls.sql` natif (pgTAP cross-tenant sur les 5 tables Tandem). **Inclut** `auditAction` A16 `architect_response` + entrée `specs/audit_log_v1.md`. **Seed fictif** 4 cabinets idempotents (TU/VOUS × spécialités riches/pauvres) dans `src/db/seed/architects-fixture.ts`. | 1.5 j |
| 2 | **Helper normalisation + matching V1 + JWT** — `src/lib/text/normalize.ts` (helper partagé, à coordonner avec Alex), `src/lib/tandem/matching.ts` (règles pondérées + repondération données pauvres §H Q1, **toutes comparaisons texte normalisées des deux côtés**), `src/lib/tandem/jwt.ts` (RS256, jti BDD, révocation), `src/lib/tandem/ai-rationale.ts` (Haiku 4.5 P5, prompt versionné BDD). Tests vitest : 8-10 sur matching (dont `Bâtiment↔batiment`, `ÉCOLE↔ecole`), 5 sur jwt. | 1.5 j |
| 3 | **Connecteur Odoo partagé** — `src/lib/odoo/{client,mapping,opportunities,constants}.ts` + mocks vitest. `createOdooOpportunity(tenderId, { stage, origin, architectId? })` avec idempotence sur `(tenderId, architectId)` (NULL en Solo). **Écrit ici, partagé avec Solo (Alex y branchera son `confirmSoloSelection` plus tard).** `.env.example` mis à jour. Tests : création OK, idempotence Solo/Tandem, échec XML-RPC → `last_error`. | 1 j |
| 4 | **Sollicitation Brevo + server action** — `src/lib/brevo/{client,template-picker,variables}.ts`, `src/app/sourcing/ao/[id]/tandem/actions.ts` (`matchArchitectsForTender`, `sendArchitectSolicitation`). Choix template TU/VOUS depuis `architects.tutoiement` (override UI). Inject `{{lien_opposition}}` + bloc RGPD art.14 (cf. §H Q3 — reco code, à confirmer Léa/CTO si reste 🟠). Insert `match_proposals` + `architect_tokens` + `brevo_messages`, status tender `awaiting_architect`, audit A5 `architect_solicit`. | 1 j |
| 5 | **Page tokenisée publique + réponse architecte + RGPD opposition + webhook Brevo** — `/archi/[token]/page.tsx` (Server Component, JWT verify, render M4/M4v1.1 selon `tutoiement`), `ArchitectResponseForm.tsx` (Client, 3 boutons + textarea optionnel), `POST /api/archi/[token]/respond` (update + audit **A16** + trigger Odoo si `accepted` + Realtime), `/archi/oppose/[token]/page.tsx` (1 clic → `architects.active=false` + mail confirmation D.8 + audit), `POST /api/webhooks/brevo` (HMAC + append idempotent `(messageId, event)`). **Exception middleware** : `/archi/*` et `/api/webhooks/brevo` ajoutés à `PUBLIC_ROUTES` (`src/lib/auth/routes.ts`) — exception validée par spec Tandem §3.4 et arbitrage 1/A Gate 2, **à confirmer côté Hugo (reviewer)** sécurité JWT. | 2 j |
| 6 | **UI short-list M-D1 + preview Brevo M-D2 + cron J+3 + tests E2E complets** — composant short-list scorée (rationale Haiku), modale preview/édition Brevo (toggle TU/VOUS + champ libre), branchement depuis `SoloTandemModal` (au clic Tandem → `/sourcing/ao/[id]/tandem`), `/api/cron/tandem-followup` (Vercel cron `0 8 * * *` UTC, idempotent via `followupSentAt`), 12 scénarios E2E `tandem.spec.ts` + 2 bonus RGPD. **Si la refonte UI d'Alex n'est pas finie** : on utilise les composants existants `src/components/ui/*` sans refacto (cf. §C). DECISIONS.md + note de suivi `notes-de-suivi/CC_260530_TANDEM_LIVRAISON.md`. | 1.5 j |

**Total : ~7.5 j** — entre les 7 j de la spec et les 8-9 j d'Alex. Gain réel : les 4 décisions du 22/05 ferment Q2 (modèle architects), allègent l'allocation audit (A16 acquis), et la coordination Alex/Nadia évite les doublons sur la refonte palette/typography.

---

## B. Fichiers à créer / modifier (delta vs plan Alex)

Tous les fichiers du plan d'Alex restent valides **sauf** :

- **`src/db/schema/architects.ts`** : pas d'extension/alias — **refonte propre**. Colonnes finales (cf. décision (a)) :
  - `id`, `organizationId`, `cabinet` (NOT NULL), `contactName` (nullable, `dirigeant_sirene` fallback), `email` (NOT NULL pour `solicitable=true`, nullable global pour fiches non-solicitable importées), `phone`, `website`, `zip`, `city`, `siren` (9 chars, NULLABLE, plus de SIRET 14), `headcount`, `companySize`, `companyCreatedAt`, `odooExternalId` UNIQUE, `geoZones text[]`, `specialtyCodes text[]`, `notes`, `tutoiement bool default false`, `preferred bool default false`, `solicitable bool` (cf. §H Q4 — colonne stockée, dérivée à l'insert/update via trigger ou checked dans seed/import), `active bool default true`, `pastCollabsCount int default 0`, `createdAt`, `updatedAt`.
  - **Pas** de `firstname`/`lastname`/`title`/`siret`/`references`/`partnershipStatus` — décision (a).
  - Templates Brevo TU/VOUS : on parse `contactName` côté `variables.ts` (split sur 1er espace = `{{archi_prenom}}`, reste = `{{archi_nom}}`). Si `contactName` NULL → fallback « partenaire ». Documenté.

- **`src/db/seed/index.ts`** : faker regen pour matcher le nouveau schéma (`cabinet`, `contactName`, `siren`), pas de bug bloquant.

- **`src/lib/text/normalize.ts`** (NEW) : helper `normalizeForMatching(s)` + tests `normalize.test.ts`. **Si Alex en crée un côté UI ce sprint** : on factorise dans le même fichier (Alex re-exporte depuis `src/lib/text/`).

- **Pas de question Q2** dans le REQUEST CTO (tombe avec décision (a)).

- **Pas de question audit codes** dans le REQUEST CTO (A16 acquis ; les codes admin architects sont le périmètre Alex, pas le mien).

---

## C. Coordination avec Alex — fichiers partagés

| Fichier / zone | Qui priorise | Règle |
|---|---|---|
| `src/db/schema/architects.ts` + `architect_responses.ts` + `architect_tokens.ts` + `match_proposals.ts` + `integrations.ts` (odoo_opportunities) | **Nadia** | Refonte propre Tandem, Alex ne touche pas. |
| `src/db/schema/search_profiles.ts` (admin profil) | **Alex** | Hors mon périmètre, je ne touche pas. |
| `src/db/schema/enums.ts` | **Partagé** | Append-only sur `auditAction`. Si Alex ajoute des codes admin (edit/import/export), il les met **après** A16 dans le tableau (l'ordre pgEnum compte — cf. note Gate du commentaire actuel ligne 117). Coordination via commits séparés. |
| `src/lib/odoo/*` | **Nadia** | J'écris le connecteur partagé (décision Board 21/05). Alex le réutilisera pour `confirmSoloSelection` plus tard. |
| `src/lib/text/normalize.ts` | **Nadia crée, Alex réutilise** | Si Alex a déjà un helper UI (slug/recherche) : on factorise dans `src/lib/text/` (Nadia ajoute `normalizeForMatching`, Alex peut ajouter `slugify`, `searchableText`, etc.). |
| `src/components/ui/*` (palette/typography refonte Alex) | **Alex** | Je ne refacto pas la palette. Pour M-D1 / M-D2 (étape 6) j'utilise les composants existants. Si la refonte d'Alex livre avant mon étape 6 : je migre, sinon je reste sur l'existant. **Pas de blocage croisé.** |
| `src/app/sourcing/admin/users` (bug existant) | **Alex** | Hors mon périmètre. |
| `middleware.ts` + `src/lib/auth/routes.ts` | **Partagé, lecture seule sauf ajout `PUBLIC_ROUTES`** | Je n'**ajoute** que `/archi/*` et `/api/webhooks/brevo` à `PUBLIC_ROUTES`. Je ne **modifie pas** la logique du middleware. Hugo (reviewer) vérifie. |
| `CLAUDE.md` / `DECISIONS.md` | **Append-only** | Pas de conflit si on ajoute chacun à la fin. |

→ **Pas de conflit attendu sur des fichiers identiques.** Les zones de friction (`enums.ts`, `normalize.ts`, palette UI) sont couvertes par les règles ci-dessus.

---

## D. Exception middleware — page `/archi/[token]` publique

**Confirmation explicite** : la page tokenisée `/archi/[token]/page.tsx` ainsi que `/archi/oppose/[token]` et `/api/webhooks/brevo` sont **publiques hors middleware domaine** `@alyosingenierie.fr`. Justifications :

- Architecte = tiers externe (personne physique B2B), pas de session AlyoS.
- Brevo = service tiers qui POST sans Auth (HMAC à la place).
- Spec module_tandem_engine_v1.md §3.4 prévoit ce flux.
- Arbitrage 1/A Gate 2 (BOARD-OK 2026-05-07) : JWT 30 j révocable, signé RS256, jti BDD.

**Compensations sécurité** :
- JWT RS256, clé privée jamais committée (cf. §H Q5 — reco clé dédiée `ARCHITECT_JWT_PRIVATE_KEY`).
- Vérif `jti` + `revoked` + `expiresAt` à **chaque requête** (pas seulement signature).
- Audit `access_attempt` étendu (A13 existant) tracé sur tous les accès `/archi/*`.
- HMAC sur webhook Brevo (signature + idempotence `(messageId, event)`).
- Rate-limit Vercel sur `/archi/*` (config Yann, hors mon périmètre code).
- Hugo (reviewer) **vérifie explicitement** la sécurité JWT avant validation Board.

---

## E. Risques — delta vs plan Alex

| Risque | Statut | Mitigation |
|---|---|---|
| **F.1 Codes audit manquants** (plan Alex) | ✅ **Fermé pour Tandem** | A16 alloué par décision (b). Les autres codes (opposition, followup, webhook, admin edit/import/export) sont allouables au fil de l'eau : je propose `architect_opposition`, `architect_followup_sent`, `brevo_webhook_received` comme A17-A19 dans le REQUEST si nécessaire. Si zone orange, je tag dans le code et bouge sans bloquer. |
| **F.2 JWT hors middleware** | Inchangé | §D ci-dessus + Hugo. |
| **F.3 Idempotence webhook Brevo** | Inchangé | HMAC + `(messageId, event)` dans `brevoMessages.events` JSONB. |
| **F.4 RGPD art. 14** | Partiellement résolu | Décision (b)+(d) ne touchent pas ça. Reste 🟠 Q3 : variable code vs template Brevo. Reco perso : variable code (testable CI). À trancher CTO. |
| **NOUVEAU — Matcher bug latent normalisation** | ✅ **Fermé par décision (d)** | Helper `normalizeForMatching` côté deux côtés + tests obligatoires `Bâtiment↔batiment`, `ÉCOLE↔ecole`. Pas de zone orange. |

---

## F. Questions résiduelles pour REQUEST CTO

Sur les 5 questions du plan Alex (Q1-Q5), audit post-décisions 22/05 :

| Q | Sujet | Statut post-22/05 |
|---|---|---|
| **Q1** Pondération matching données pauvres | 🟠 **OUVERTE** | Décision (d) ferme la normalisation mais pas la pondération. Reste à confirmer `geo 30 / specialty 15 / history 35 / availability 15 / preference 5` (repondéré) vs spec stricte `30/20/25/15/10`. → REQUEST. |
| **Q2** Conflit modèle architects firstname/lastname vs cabinet/contact_name | ✅ **FERMÉE** par décision (a) refonte propre. Pas de double-colonne, pas d'alias. |
| **Q3** Mention RGPD art. 14 — variable code vs template Brevo | 🟠 **OUVERTE** | Reco perso : variable code `{{rgpd_block}}` (type-safe, testable). À confirmer avec Léa (CMO) qui maintient les templates Brevo. → REQUEST. |
| **Q4** `solicitable` colonne stockée vs vue dérivée | 🟠 **OUVERTE** (mais reco forte) | Reco : colonne stockée + dérivée à l'insert/update (trigger ou checked en code). 1 lookup BDD vs N. → REQUEST (courte, je propose la solution). |
| **Q5** JWT clé RS256 — dédiée vs réutilisation Supabase | 🟠 **OUVERTE** (mais reco forte) | Reco : dédiée `ARCHITECT_JWT_*` (rotation indépendante, isolation de risque). → REQUEST. |

→ **REQUEST CTO posté** : `handoff/REQUEST_260522_NADIA_TANDEM_CTO.md` (4 questions Q1, Q3, Q4, Q5 — courtes, recommandations explicites, je continue l'étape 1 en parallèle).

---

## G. Synthèse — ce que je fais maintenant (zone verte)

1. ✅ Plan posté (ce fichier).
2. ✅ REQUEST CTO posté (4 questions résiduelles).
3. ⏭️ J'attends que Yann crée la branche `feat/tandem-engine`.
4. ⏭️ Je démarre **étape 1** (refonte schéma + RLS + seed + A16 + audit_log_v1.md) en parallèle de l'arbitrage CTO. Les 4 questions n'affectent que les étapes 2+, je débloque dès réponse.
5. Camille en boucle dès l'étape 2 (matching + JWT testables) ; Hugo en relecture finale étape 6 (focus sécurité JWT + RLS + idempotence).
6. Yann commit + push à chaque étape (Conventional Commits `feat(tandem): ...`).

**Pas de code écrit. Pas de migration générée. Pas de fichier autre que ce plan et le REQUEST.**

---

*Plan court rafraîchi à partir du plan Alex 260522. Coordination Alex/Nadia explicitée §C. Décisions Board 22/05 (a/b/c/d) intégrées. Estimation : 7-8 jours.*
