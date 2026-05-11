# 00 — ONBOARDING SOURCING-EDIFIO

**Date** : 2026-05-07
**Rédacteur** : [CEO] Marc, Directeur Général
**Application** : Sourcing-Edifio (nom de code = nom commercial)
**Sponsor / Board** : TEISSIER (Alyos Ingénierie)
**Statut** : Onboarding clôturé — Gate 1 à lancer

---

## 1. Synthèse en une phrase

Sourcing-Edifio est une **PWA SaaS multi-tenant** qui automatise le cycle complet d'un appel d'offres BTP — sourcing multi-plateformes → sélection → mobilisation architecte → préparation dossier (IA) → diffusion → suivi Kanban → synchronisation CRM Odoo — au sein de l'écosystème **Edifio.fr** (aux côtés de Suivi-Edifio et AO-Edifio).

---

## 2. Réponses aux 10 questions Phase 0

| # | Question | Réponse |
|---|----------|---------|
| 1 | Nom de code / commercial | **Sourcing-Edifio** (identique) |
| 2 | Cas d'usage | Automatiser le cycle complet AO public BTP : sourcing multi-plateformes (BOAMP, PLACE, Francmarchés, marches-publics.info), sélection (Mode 1 propre / Mode 2 cotraitance architecte), sollicitation architecte via Brevo + page tokenisée, préparation dossier IA (analyse RC, checklist, CERFA, mémoire technique), diffusion, suivi Kanban + Calendrier + Synthèse, push vers Odoo CRM. |
| 3 | Public cible | **SaaS multi-clients dès le MVP**. Multi-tenancy stricte avec RLS Supabase par `organization_id`. |
| 4 | Design source | edifio.fr + application Suivi-Edifio + fichier `edifio-design-system.html` joint. Module partagé `@edifio/ui` à factoriser dans le monorepo. |
| 5 | Top 5 fonctionnalités | (1) Sourcing automatique quotidien sur 4 plateformes ; (2) Notification & vue « AO du jour » + sélection ; (3) Mode 1 — réponse en propre + opportunité Odoo ; (4) Mode 2 — matching architecte + sollicitation Brevo + page publique tokenisée ; (5) Préparation dossier IA (Claude API : analyse RC, mapping pièces, pré-remplissage CERFA, mémoire technique). |
| 6 | Stack | **Imposée par le brief** : Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui thématisé ; Supabase EU (Postgres + Auth + Storage + Realtime + Edge Functions) ; Vercel EU ; Brevo (transactionnel architectes) ; Resend (notifications utilisateurs) ; Claude API (Sonnet 4.6 + Haiku 4.5) ; Odoo XML-RPC ; Playwright (scraping). ORM Drizzle vs Prisma à arbitrer en Gate 5. |
| 7 | Hébergement | **Vercel EU + Supabase Frankfurt** — UE strict, exigence RGPD. Domaine `sourcing.edifio.fr` (DNS OVH). |
| 8 | Données sensibles | **OUI** — contacts professionnels architectes (RGPD : intérêt légitime / consentement à documenter), données entreprise (CERFA pré-remplis), tokens d'accès architecte. Mesures : RLS stricte, DPA signés (Anthropic, Brevo, Resend, Supabase, Vercel), audit log, JWT révocables 30 j, droit à l'effacement. Gate 8 sera dense. |
| 9 | Délai MVP | **~14 semaines** (2 sem cadrage Gates 1–5 + 10–12 sem dev Gates 6–7). |
| 10 | Budget | **Coûts d'infra et d'API uniquement** (Vercel, Supabase, Anthropic, Brevo, Resend, OVH). Développement assuré en interne via Claude Code et ses sub-agents `dev` (Alex) et `ps_operator` (Yann). Pas de prestation externe sauf arbitrage Board. |

---

## 3. Décisions de cadrage complémentaires (validées avec le Board ce jour)

- **Repo** : monorepo `edifio-platform` **existant à étendre**. Sourcing-Edifio s'y greffe comme nouvelle app. Inventaire complet (apps + packages partagés `ui`, `db`, `lib-ai`, `lib-integrations`) à mener par [CTO Sophie] en début de Gate 5, avant tout commit côté Sourcing.
- **SSO Edifio** : **déjà opérationnel**. Sourcing-Edifio s'y branche via OAuth/OIDC dès la Gate 6. [CTO Sophie] récupère endpoints + métadonnées IdP avant la Gate 5.

---

## 4. Arbitrages techniques connus à statuer en Gate 5

1. Worker scraping : Vercel Functions (Pro 60 s / Enterprise 300 s) vs container externe (Fly.io / Railway / OVH).
2. API PLACE : accès officiel à confirmer, sinon scraping authentifié avec credentials par compte.
3. ORM : Drizzle (Edge-first, plus léger) vs Prisma (DX, écosystème mature).
4. Adaptateur Odoo : couche unique multi-versions (17/18/19) ou adaptateurs versionnés.
5. shadcn/ui vs composants custom Edifio : niveau de réécriture pour matcher la charte (impact direct Gate 3 Design).

---

## 5. Points marketing à instruire en Gate 1 puis Gate 4

- Positionnement Sourcing-Edifio dans la suite Edifio (sélecteur de module commun, narratif unifié).
- Naming des modes (« Mode 1 / Mode 2 » à muscler — Léa proposera des alternatives).
- Modèle de tarification SaaS (impact direct du business case Gate 1).
- Cohérence ton de voix avec Suivi-Edifio et AO-Edifio.

---

## 6. Calendrier prévisionnel

| Phase | Durée cible | Échéance indicative |
|-------|-------------|---------------------|
| Cadrage (Gates 1 à 5) | 2 semaines | ~2026-05-21 |
| MVP (Gates 6 et 7) | 10 à 12 semaines | ~2026-08-13 |
| Audit & Go-Live (Gates 8 et 9) | 2 semaines | ~2026-08-27 |

---

## 7. Note de méthode

Le brief v1.0 fourni par le Board couvre déjà, partiellement, les Gates 1, 2, 5 et 8. Cela ne réduit pas le nombre de gates mais accélère leur instruction : chaque pilote part avec une matière dense, son travail consiste à challenger, compléter, formaliser et faire valider.

---

*Document onboarding clôturé. Lance officielle de la Gate 1 dans la foulée.*
