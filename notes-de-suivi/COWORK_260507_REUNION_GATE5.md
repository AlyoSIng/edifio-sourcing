# Note de suivi — Réunion Gate 5 « Architecture & stack technique »

**Date** : 2026-05-07
**Application** : edifio Sourcing
**Présents** : [CTO Sophie Vasseur] (pilote), [CEO Marc] (co-pilote), [BOARD TEISSIER]
**Rédacteur** : [CEO Marc]
**Statut** : Gate 5 validée par le Board avec **un arbitrage reporté** (ORM)

---

## 1. Décisions prises

| # | Décision | Pris par | Motif |
|---|----------|----------|-------|
| 1 | **Structure monorepo cible** : Turborepo + pnpm workspaces. Apps `suivi`, `ao`, `act` (existantes), `sourcing` (à créer). Packages partagés `@edifio/ui`, `@edifio/db`, `@edifio/auth`, `@edifio/lib-ai`, `@edifio/lib-integrations`, `@edifio/tsconfig`. | [CTO] + [BOARD] | Cohérence avec les autres modules edifio. Inventaire concret à mener par [PS_OPERATOR] début Gate 6. |
| 2 | **Arbitrage 1/A — Worker scraping hybride.** Vercel Cron + Edge Function Supabase pour les APIs (BOAMP). Container Fly.io EU (~5 €/mois) pour les sessions Playwright (Francmarchés, MP.info, PLACE). | [BOARD] | Vercel Functions Pro insuffisant (60 s) sur Playwright, Enterprise hors budget. Fly.io EU dans le budget infra-only. |
| 3 | **Arbitrage 2/A — PLACE en scraping authentifié.** Pas d'API officielle accessible aux soumissionnaires. Credentials par compte chiffrés Supabase Vault. Fallback silencieux + alerte UI si pas configuré. | [BOARD] | Vérification technique côté CTO : l'API PLACE est réservée acheteurs/SI fournisseurs, pas candidats. |
| 4 | **Arbitrage 3 — ORM REPORTÉ.** Décision Drizzle vs Prisma reportée par le Board. | [BOARD] | Raisons non explicitées. CTO impose un cadre de report (cf. Section 2). |
| 5 | **Arbitrage 4/A — Adaptateur Odoo unique avec détection auto.** Une interface `OdooAdapter` avec branchements internes minimaux par version (17/18/19). Pas d'adapters versionnés séparés. | [BOARD] | XML-RPC stable depuis 15 ans, divergences sur champs custom uniquement. |
| 6 | **Arbitrage 5/A — UI hybride : shadcn/ui + custom Edifio.** shadcn/ui pour primitives universelles (Button, Input, Dialog, Select, Tabs, Toast, Tooltip), thématisées via tokens DS. Composants custom pour patterns métier : carte AO, kanban-card, side-by-side IA, page tokenisée architecte. Tout sous `@edifio/ui`. | [BOARD] | Effort initial faible (~2 sem), DS Edifio préservé via tokens, accessibilité Radix UI native. |
| 7 | **Modèle de données détaillé** : 22+ tables (organizations, users, memberships, search_profiles, platforms, platform_credentials, architects, tenders, tender_lots, tender_documents, tender_events, selections, match_proposals, architect_responses, architect_tokens, response_files, presentation_library, ai_prompts, ai_runs, odoo_opportunities, brevo_messages, notifications, audit_logs, learning_events). RLS FORCE sur 100 % des tables multi-tenant. | [CTO] + [BOARD] | Couvre l'intégralité des epics Gate 2. Schéma Drizzle/Prisma à livrer Gate 6 (selon arbitrage 3). |
| 8 | **Plan sécurité validé** : chiffrement at-rest + TLS 1.3 + Vault Supabase + SSO Edifio OIDC + MFA admin + RLS FORCE + rate limiting + CSP strict + 12 actions auditées + sauvegardes PITR 7j + export quotidien OVH Object Storage EU + DPA prestataires. | [CTO] + [BOARD] | Conformité Gate 8 préparée dès cadrage. |
| 9 | **Self-host fonts acté** : Inter, Space Grotesk, JetBrains Mono téléchargés depuis fontsource.org au build, servis depuis `/public/fonts/`. Aucun appel à fonts.googleapis.com. | [CTO] + [BOARD] | PWA offline + RGPD + perf LCP. Action ouverte depuis Gate 3, formellement actée. |
| 10 | **Stratégie de tests** : Vitest unit (≥70 % global, ≥90 % `lib-ai` et `matching-engine`) + RTL composants critiques + pgTAP RLS (100 %, bloquant Gate 6) + Playwright E2E sur 3 parcours Gate 2 + axe-core RGAA AA Gate 9 + k6 post-MVP. | [CTO] + [BOARD] | Couverture des contraintes NF Gate 2. |
| 11 | **Pipeline CI/CD** : GitHub Actions (lint + typecheck + tests + build) → Vercel preview deploy par PR → merge main → production deploy + migrations. Conventional Commits + Changesets. | [CTO] + [BOARD] | Observabilité par PR + rollback Supabase migration history. |
| 12 | **Audit log immutable** sur 12 actions sensibles : connexion, modification rôle, profil de recherche, sélection AO, envoi sollicitation (registre tu/vous loggué), diffusion dossier (par `user` → push admin), génération IA (prompt + cost), création opportunité Odoo, modification base architectes, export RGPD, révocation token archi, suppression de données. Rétention 5 ans. | [CTO] + [BOARD] | Combine la contrainte Gate 2 (12 actions) avec la compensation Gate 2 arbitrage 3/A (audit + push admin sur diffusion par `user`). |

---

## 2. Désaccords / arbitrages remontés au Board

| # | Sujet | Position A | Position B | Arbitrage Board |
|---|-------|------------|------------|-----------------|
| 1 | Worker scraping | Hybride Vercel + Fly.io | Vercel Enterprise | **A retenue** |
| 2 | API PLACE | Scraping authentifié | API officielle | **A retenue** (pas d'API candidat) |
| 3 | ORM | Drizzle | Prisma | **REPORTÉ par Board** |
| 4 | Adaptateur Odoo | Couche unique | Adapters versionnés | **A retenue** |
| 5 | UI | Hybride shadcn + custom | Custom from scratch | **A retenue** |

### 2bis — Cadre du report ORM (proposition CTO acceptée)

- **Spike technique 2 jours** mené par [DEV Alex] début Gate 6.
- Prototype : `tenders` + `architects` + `architect_responses` avec RLS strict + JSON columns + job cron Edge Function exécutant scoring sur 100 AO.
- **Critères pondérés** : cold start (50 %), DX migrations + types (25 %), compat Supabase + RLS (15 %), maturité écosystème (10 %).
- **Décision finale** prise par [CTO Sophie] sur base du spike, dans la 1ʳᵉ semaine Gate 6.
- **Contrainte ferme** : aucune migration committée avant décision ORM.
- **Escalade Board** uniquement si désaccord [DEV Alex] / [CTO Sophie].

---

## 3. Actions à mener

| # | Action | Responsable | Échéance |
|---|--------|-------------|----------|
| 1 | Production document Gate 5 (PDF) | [CEO] | 2026-05-07 |
| 2 | Mise à jour `DECISIONS.md` (12 décisions Gate 5) | [CEO] | 2026-05-07 |
| 3 | Inventaire monorepo `edifio-platform` (apps + packages existants) | [PS_OPERATOR Yann] | Début Gate 6 |
| 4 | Spike ORM Drizzle vs Prisma (2 jours) | [DEV Alex] + [CTO] | Début Gate 6 |
| 5 | Création app `apps/sourcing` dans le monorepo une fois inventaire fait | [DEV Alex] + [PS_OPERATOR] | Gate 6 |
| 6 | Mise en place container Fly.io EU pour Playwright | [PS_OPERATOR Yann] | Gate 6 |
| 7 | Configuration Supabase Vault pour credentials plateformes + Odoo | [DEV Alex] + [CTO] | Gate 6 |
| 8 | Wrap Anthropic API dans `@edifio/lib-ai` avec prompts versionnés en BDD | [DEV Alex] + [CTO] | Gate 6 |
| 9 | Configuration GitHub Actions + Vercel preview | [PS_OPERATOR Yann] | Début Gate 6 |
| 10 | Setup pgTAP pour tests RLS (bloquant Gate 6) | [DEV Alex] | Gate 6 |
| 11 | Convocation Gate 6 (MVP fonctionnel) | [CEO] | Sur OK Board |

---

## 4. Risques identifiés

- **Inventaire monorepo non confirmé** : si `edifio-platform` n'est pas un Turborepo/pnpm, ou si la structure diverge de la cible, [DÉSACCORD] technique majeur à remonter Board en début Gate 6. Mitigation : [PS_OPERATOR] fait l'inventaire AVANT tout commit.
- **Spike ORM non concluant** : si Drizzle et Prisma se valent sur les critères, décision arbitraire CTO. Mitigation : critères pondérés objectifs, le résultat tranchera.
- **PLACE bloque le scraping** (CAPTCHA, IP banning) : risque réel. Mitigation : User-Agent rotation, headless detection bypass standard, et plan B = exclusion PLACE de l'offre Tier Sourcing si bloqué.
- **Coût Fly.io EU sous-estimé** : si volumétrie scraping > prévisionnel, ~5 €/mois peut grimper à 20-30 €. Mitigation : monitoring usage hebdo + alerte 80 % du budget mensuel.
- **Migrations Drizzle/Prisma sur RLS strict** : pgTAP doit s'exécuter sur DB éphémère avec `auth.jwt()` simulé, complexité non triviale. Mitigation : librairie `supabase-test-helpers` + setup CI dédié.

---

## 5. Prochaine étape

- **Gate suivante** : Gate 6 — MVP fonctionnel (sortie côté Claude Code par [DEV Alex] + [PS_OPERATOR Yann])
- **Première étape Gate 6** : inventaire monorepo + spike ORM (parallélisable, ~3 jours combinés)
- **Pilote** : [DEV Alex] (Claude Code), supervision [CTO Sophie] (Cowork pour escalades)
- **Date prévue** : à convoquer dès OK Board sur la suite. **Cette gate est longue** (10-12 semaines).

---

*Note de suivi clôturée le 2026-05-07 par [CEO Marc].*
