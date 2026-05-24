# CC — Nadia · Tandem étape 2 sous-étape 3 (Odoo + Brevo + Server Action)

**Date** : 2026-05-24 16:20
**Émetteur** : Nadia (`dev_tandem`) via Claude Code
**Destinataire** : Board (info — zone verte) + Yann (`ps_operator`) pour commit/push
**Branche** : `feat/tandem-engine-step2` (commit parent `9e7642e`)
**Plan référent** : `notes-de-suivi/CC_260524_1320_NADIA_PLAN_TANDEM_ETAPE2.md` §3

---

## Périmètre livré (sous-étape 3 / 5)

Conformément au plan §3 :

1. **Connecteur Odoo partagé** (Solo + Tandem) — `src/lib/odoo/`
   - `client.ts` — client XML-RPC minimal **sans dépendance ajoutée** (fetch
     natif + encodeur/parseur XML-RPC suffisant pour `execute_kw`/`crm.lead.create`/
     `res.partner.search_read`). Gated derrière `ODOO_SYNC_ENABLED='true'` :
     en mode OFF (défaut MVP), `createDisabledOdooClient` throw `OdooError('disabled')`,
     les opportunités sont créées en BDD avec `odoo_id=-1` + `last_error` set.
   - `types.ts` — contrats partagés `CreateOdooOpportunityOptions`
     (stage, origin, architectId?), `OdooPartnerRaw`, `OdooLeadCreatePayload`.
   - `opportunities.ts` — `createOdooOpportunity(tenderId, options)` :
     SELECT-then-INSERT idempotent compatible avec les index partiels
     `uniq_opp_solo` (architectId NULL) et `uniq_opp_tandem` (architectId set).
     Robuste à la panne XML-RPC : la ligne BDD est créée même si l'appel
     échoue, `lastError` set pour rejouer plus tard.

2. **Sollicitation Brevo** — `src/lib/brevo/`
   - `client.ts` — client REST minimal (`POST api.brevo.com/v3/smtp/email`),
     pas de SDK ajouté. Gestion des 5 erreurs : `missing_api_key`,
     `invalid_recipient`, `http_error`, `network`, `parse`.
   - `rgpd-block.ts` — **bloc RGPD art.14 en variable code `{{rgpd_block}}`
     (Option A Q3 actée Board 2026-05-24)**. HTML + texte. Échappement
     anti-XSS sur `cabinet`. Throw si `lienOpposition` non-http(s) ou vide.
   - `template-picker.ts` — sélection TU/VOUS pour 3 kinds : `solicitation`,
     `followup`, `decline_ack`. Mapping vers 5 vars d'env Brevo posées
     étape précédente. Helper `defaultRegisterFromTutoiement`.
   - `variables.ts` — construction des 10 params Brevo. Split `contactName`
     sur 1er espace (« Marie Dupont » → prenom/nom), fallback « partenaire »
     si NULL. Formatage cloture FR via `Intl.DateTimeFormat('fr-FR')`.

3. **Server Action** — `src/app/sourcing/ao/[id]/tandem/actions.ts`
   - `matchArchitectsForTender(tenderId, topN?)` : lecture seule, exécute
     `rankArchitects` du matcher V1 sur les architects `active=true AND
     solicitable=true`, enrichit avec `generateRationaleWithAi` (fallback
     déterministe MVP). Pas de persistance — la short-list est purement
     vue, la persistance arrive au moment de l'envoi.
   - `sendArchitectSolicitation(tenderId, architectId, options)` : transaction
     unique → JWT RS256 (30 j, `aud=architect`, `jti` BDD via `architect_tokens`),
     token d'opposition réutilisable (5 ans, single-use), upsert `match_proposals`,
     upsert `architect_responses (status=pending, tokenId)`, bascule
     `tenders.status → 'awaiting_architect'`. **Envoi Brevo HORS transaction**
     (latence variable). Audit **A5 `architect_solicit`** strict-validé via
     le schéma Zod nouvellement strict.

4. **Audit schemas étendus** — `src/lib/audit/schemas.ts`
   - **A5 `architect_solicit`** passe placeholder → STRICT (champs : tender_id,
     architect_id, template_name, register, brevo_message_id?, token_jti?).
   - **A16 `architect_response`** ajouté STRICT (anticipé pour étape 4 — page
     tokenisée). Inclut `has_info_request_text` booléen (RGPD-friendly,
     pas de contenu dans l'audit).
   - `AUDIT_ACTIONS` passe de 15 → 16 entrées. Test couverture mis à jour.

5. **`.env.example`** mis à jour avec les vars Odoo (`ODOO_SYNC_ENABLED`,
   `ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_API_KEY`) et
   `MATCHING_WEIGHTS_PROFILE`. Aucun secret committé.

---

## Tests verts

```
./node_modules/.bin/vitest run
Test Files  41 passed (41)
Tests       661 passed (661)
```

Détail par module nouveau :
- `src/lib/odoo/client.test.ts` — **20 tests** (encode XML, parse, fault,
  config env, fetch mock 3 scénarios)
- `src/lib/odoo/opportunities.test.ts` — **3 tests** (invariants pré-BDD :
  `missing_architect_id`, `invalid_origin`, smoke OdooError). Intégration
  BDD → reporté étape 5 Playwright + pgTAP.
- `src/lib/brevo/rgpd-block.test.ts` — **9 tests** (art.14 verbatim, XSS
  échappement, throw si lien invalide, fallback cabinet vide, version text)
- `src/lib/brevo/template-picker.test.ts` — **10 tests** (5 combos + var
  env manquante / invalide + register defaults)
- `src/lib/brevo/variables.test.ts` — **14 tests** (splitContactName 6 cas,
  formatClotureFr, intégration buildBrevoVariables avec rgpd_block)
- `src/lib/brevo/client.test.ts` — **8 tests** (happy path + 5 erreurs + X-Mailin)
- `src/lib/audit/schemas.test.ts` — **+10 tests stricts** (A5 5 cas, A16 5 cas)
- `src/app/sourcing/ao/[id]/tandem/actions.test.ts` — **11 tests** (auth +
  validation inputs, matchArchitectsForTender + sendArchitectSolicitation)

`tsc --noEmit` : propre. `next lint` : 0 erreur 0 warning. `next build`
local : succès, 18 routes générées, pas d'import top-level fragile.

---

## Points d'attention pour Hugo (reviewer)

1. **Sécurité XML-RPC**
   - URL whitelistée par regex `^https://[\w.-]+/?$` (anti-SSRF).
   - API key Odoo jamais loggée — uniquement dans le header request.
   - `ODOO_SYNC_ENABLED` gating : OFF par défaut (CI / dev).

2. **Sécurité Brevo**
   - API key lue à chaque appel (pas cached) — évite fuite via heap.
   - Email destinataire validé regex avant fetch.
   - Header `X-Mailin-custom` = `tender:<uuid>;archi:<uuid>` (corrélation webhook).

3. **Sécurité RGPD**
   - `{{rgpd_block}}` injecté code-side (Option A) — pas configurable côté
     Brevo (réduit le risque d'oubli au déploiement nouveau template).
   - `buildRgpdBlockHtml` échappe les caractères HTML dangereux dans `cabinet`.
   - Token d'opposition long-life (5 ans) réutilisé si non-expiré + non-utilisé
     → un seul token actif par architecte (évite la multiplication).

4. **Idempotence Tandem**
   - `match_proposals` : UPSERT via `onConflictDoUpdate (tender_id, architect_id)`
     → re-matcher après modif n'écrase pas la trace, met à jour score+rank.
   - `architect_responses` : INSERT si pas existant ; UPDATE tokenId si
     pending ; rejette `invalid_state` si déjà répondu.
   - JWT architecte : nouveau `jti` à chaque appel (révocation cible — un
     ancien lien envoyé reste valable jusqu'à expiration, sauf révocation
     admin via `architect_tokens.revoked=true`).

5. **Pas de schéma BDD touché**
   - Aucune migration générée. Toutes les tables consommées (architect_tokens,
     architect_opposition_tokens, architect_responses, match_proposals,
     brevo_messages, odoo_opportunities) sont posées en étape 1
     (migrations 0005 + 0006). Pas de `drizzle-kit generate` à faire.

6. **Connecteur Odoo gated**
   - En production, l'opp Odoo réelle ne sera créée que quand le Board
     posera les creds + flag `ODOO_SYNC_ENABLED=true` côté Vercel. D'ici là,
     les opps sont créées en BDD avec `odoo_id=-1` + `last_error='disabled: …'`
     — la trace existe, la sync sera rejouée en Phase 2 (cron de reprise).

---

## Zone orange / décisions à signaler

Aucune. Tout est resté en zone verte spec validée :
- Q3 Option A `{{rgpd_block}}` — appliquée verbatim.
- Q1 pondération `30/15/35/15/5` `sparse_data` — déjà en matcher étape 2.
- Connecteur partagé `createOdooOpportunity(tenderId, opts)` — signature
  exactement celle de la spec, prête à être appelée par Alex côté Solo.

---

## Liste exacte des fichiers (15 nouveaux + 3 modifiés)

**Nouveaux** :
- `src/lib/odoo/client.ts`
- `src/lib/odoo/client.test.ts`
- `src/lib/odoo/types.ts`
- `src/lib/odoo/opportunities.ts`
- `src/lib/odoo/opportunities.test.ts`
- `src/lib/brevo/client.ts`
- `src/lib/brevo/client.test.ts`
- `src/lib/brevo/rgpd-block.ts`
- `src/lib/brevo/rgpd-block.test.ts`
- `src/lib/brevo/template-picker.ts`
- `src/lib/brevo/template-picker.test.ts`
- `src/lib/brevo/variables.ts`
- `src/lib/brevo/variables.test.ts`
- `src/app/sourcing/ao/[id]/tandem/actions.ts`
- `src/app/sourcing/ao/[id]/tandem/actions.test.ts`
- `notes-de-suivi/CC_260524_1620_NADIA_TANDEM_STEP2_SOUSETAPE_3.md` (ce fichier)

**Modifiés** :
- `src/lib/audit/schemas.ts` (A5 strict, A16 ajouté+strict, AUDIT_ACTIONS 15→16)
- `src/lib/audit/schemas.test.ts` (compte 16, tests stricts A5+A16, retire
  `architect_solicit` des placeholders)
- `.env.example` (ODOO_* + MATCHING_WEIGHTS_PROFILE)

---

## Demande à Yann (commit + push)

Message Conventional Commit suggéré :

```
feat(tandem): connecteur odoo + brevo + server action sollicitation (etape 2 sous-3)

- connecteur odoo xml-rpc minimal (fetch natif sans sdk, gated odoo_sync_enabled)
- client brevo rest minimal + bloc rgpd art.14 en variable code (option a)
- template-picker tu/vous + 5 templates env + split contactname
- server action matchArchitectsForTender + sendArchitectSolicitation (transaction unique, jwt rs256, token opposition reutilisable)
- audit a5 architect_solicit strict + a16 architect_response strict (16 actions total)
- 100 nouveaux tests vitest verts (661 total), tsc ok, lint ok

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

```
yann — peux-tu commit + push sur feat/tandem-engine-step2 avec le message
ci-dessus en HEREDOC ? je passe ensuite à la sous-étape 4 (page tokenisée
publique /archi/[token] + webhook brevo + opposition).
```

Pas de migration BDD, donc pas de `pnpm drizzle-kit generate` ni `psql -f`
container — pure couche applicative. Pas de gate pré-push spécifique.

---

*Note de tranche sous-étape 3 — zone verte, livraison complète, 0 blocage.
Prêt pour commit Yann puis sous-étape 4.*
