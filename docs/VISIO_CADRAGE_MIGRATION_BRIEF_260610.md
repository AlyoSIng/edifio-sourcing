# Brief visio cadrage — Migration edifio Sourcing → monorepo `alyos-suivi-chantier`

> **Visio cadrage planifiée semaine du 8-14 juin (Q10)** — préparé le 10/06/2026 par l'équipe Sourcing.
> Participants : Steve (CTO AlyoS, pilote Sourcing) + Sébastien (lead Suivi+ACT, lead migration).
> Durée proposée : 60-90 min. Objectif : **sortir de la visio avec les arbitrages A1-A8 actés**
> pour lancer le kickoff du 1er juillet.
>
> Référence détaillée : `docs/brief_migration_sourcing_to_monorepo.md` (v2) +
> `docs/HANDOFF_MIGRATION_SOURCING_TO_MONOREPO.md`.

## 1. État des lieux Sourcing au 10/06 (10 min — info, pas de débat)

### Fait depuis le brief v2 (7 juin)

| Quoi | Statut | Impact migration |
|---|---|---|
| **Lot 1 — Next.js 15 / React 19** | ✅ mergé (PR #115) + cascade params/searchParams corrigée le 10/06 | Pré-requis monorepo OK |
| **Lot 1.5 — `createSupabaseServerClient` async** | ✅ mergé (PR #118, 157 await propagés) | Parité pattern monorepo OK |
| **RLS lot 1.7 + Salve U (migrations 0050-0053)** | ✅ **appliquées en PROD le 10/06**, validées par assertions | Schéma prod = schéma à porter |
| Bombe `cotraitant_shares_select_public` | ✅ éradiquée (4 fonctions SECURITY DEFINER) | Garde-fou #4 reviewer satisfait |
| FORCE RLS sur companies / bureaux_etudes / cotraitant_* | ✅ actif en prod | Pattern à reproduire côté monorepo |
| Multi-tenant réel | ✅ 2 orgs réelles : AlyoS (3 users) + PROTECT (1 admin, trial) | Données à migrer telles quelles |

### Incident du jour à connaître (5 min — leçon pour la CI monorepo)

**Incident P0 10/06** : la CI e2e Sourcing seedait la **prod** (secrets GitHub non préfixés)
avec un compte superadmin au password hardcodé. Vecteur fermé (`3be50bb`), comptes purgés,
chantier en cours : **e2e CI sur stack Supabase locale éphémère** (supabase CLI dans le runner).
→ Leçon portable au monorepo : **garde par cible** (`assertNotProdUrl`, refus si project ref prod)
sur tout client service_role de test. Cf. `notes-de-suivi/CC_260610_1340_INCIDENT_E2E_PROD.md`.

## 2. Rappel des décisions déjà actées (5 min — re-confirmation rapide)

| # | Sujet | Position actée |
|---|---|---|
| Q1 | BDD | Partagée, projet Supabase unique (celui de Suivi+ACT) |
| Q2 | ORM | supabase-js direct, abandon Drizzle (Lot 2 de refonte) |
| Q3 | Billing | Modèle 0115 `organization_billing_lifecycle`, drop 0049 |
| Q5 | Calendrier | Bascule samedi 18 juillet, 8h-11h |
| Q7 | Tests | Vitest introduit avec la migration |
| Q8 | Migrations BDD | Manuel, Sébastien applique |
| Q10 | Planning | Cadrage cette semaine → kickoff 1/07 → bascule 18/07 → post-mortem 25/07 |

## 3. ARBITRAGES À PRENDRE EN VISIO (40-60 min — le cœur)

### A1 — Cron sourcing : Fly.io vs Vercel (Q4/Q9, « bench Lot 5 »)

Le bench n'a pas encore été lancé. À arbitrer :
- **Qui** fait le bench (équipe Sourcing propose : Alex, semaine du 16/06) et sur **quels critères**
  (durée max exécution Vercel Hobby/Pro vs run Playwright scrapers ~3-8 min, coût, observabilité) ?
- Position de repli si le bench est non concluant au kickoff : garder Fly.io tel quel au portage
  (worker indépendant, zéro couplage au monorepo) et trancher post-bascule ?
- ☐ **Décision : Alex, dès que possible, rapide, si Bench non concluant garder Fly.io

### A2 — Pack groupé Suivi + ACT + Sourcing (Q6, décision Sébastien)

Tarif unifié vs modules séparés. Impact direct sur le modèle 0115 à configurer et la
communication PROTECT (actuellement trial Sourcing seul, 99 €/mois HT annoncé en solo).
- ☐ **Décision : modules sparés mais possibilité de rabais si plusieurs modules contractualises**

### A3 — Stratégie CI e2e du monorepo (NOUVEAU — suite incident 10/06)

Le monorepo a-t-il déjà des E2E Playwright ? Proposition Sourcing :
- Porter le pattern **Supabase local éphémère dans le runner** (chantier en cours côté Sourcing,
  réutilisable tel quel) + garde `assertNotProdUrl` sur le project ref du monorepo.
- Alternative : projet Supabase de staging partagé (coût, données persistantes, moins isolé).
- ☐ **Décision : Porter le pattern **Supabase local éphémère dans le runner**

### A4 — Gel des migrations BDD Sourcing + état du journal (NOUVEAU — pour Q8)

État réel à connaître par Sébastien : la prod Sourcing est à la migration **0053**, le journal
`drizzle.__drizzle_migrations` contient **37 entrées** (gap historique 0033-0049 : appliquées
manuellement sans sync journal — sans impact car le journal disparaît avec Drizzle au Lot 2).
À arbitrer :
- **Date de gel des migrations Sourcing** (proposition : dernière migration acceptée le 11/07,
  J-7 avant bascule) ; après gel, tout DDL passe par Sébastien dans le format monorepo.
- Procédure de portage du schéma : dump schema-only re-numéroté dans la convention monorepo,
  ou script de diff ? (Le brief v2 §6 propose le détail — à valider.)
- ☐ **Décision gel : aujourd'hui** ☐ **Décision portage schéma : dump schéma-only re-numerote**

### A5 — Migration des données prod (2 orgs réelles, fenêtre 18/07 8h-11h)

- PROTECT est en **trial actif** : la bascule vers le modèle 0115 doit préserver sa date
  d'expiration. Qui écrit le script de transposition 0049 → 0115 (Lot 6) ?
- Communication aux utilisateurs externes (PROTECT) : qui, quand, quel canal ?
  (Le template existe : ONBOARDING_PROTECT_ADMIN.md annonce déjà la bascule du 18/07.)
- ☐ **Décision script billing : oui** ☐ **Décision comm PROTECT : communication quand bascule terminé**

### A6 — Accès et environnements pour Sébastien

- Accès repo `AlyoSIng/edifio-sourcing` : ✅ déjà (reviews PR #115-118). À confirmer : accès
  **Supabase prod Sourcing** (lecture) pour préparer le portage des données ? 
- Dans l'autre sens : accès de l'équipe Sourcing au monorepo pour les PR de portage —
  branches dédiées `migration/sourcing-*` ? Process de review (suivi_act_reviewer côté
  Sourcing + review humaine Sébastien) à re-confirmer.
- ☐ **Décision : je confirme**

### A7 — Périmètre du portage : ce qui NE part PAS le 18/07

Proposition Sourcing (à valider) — reporter post-bascule :
- Dettes Lot 2 listées dans DECISIONS (rename `createClient`, fusion admin client, COOKIE_DOMAIN…) → au fil du portage
- Rotation secrets post-MVP (password BDD, service_role — incidents 21/05 + 10/06) →
  **à caler AVANT l'ouverture commerciale** mais peut suivre la bascule de quelques jours
- Stripe complet (Sprint 9.E post-migration, déjà acté)
- ☐ **Validation périmètre : on lance tout**

### A8 — Jalons intermédiaires kickoff → bascule (planning fin)

Proposition à amender en séance :

| Date | Jalon |
|---|---|
| 16-20/06 | Bench cron (A1) + chantier CI e2e local terminé côté Sourcing |
| 23-27/06 | Lots 2-3 entamés sur branche monorepo (`migration/sourcing-db-layer`) |
| 1/07 | Kickoff officiel — Lots 2-5 en parallèle |
| 11/07 | **Gel migrations + gel features Sourcing** (hotfix only) |
| 15-17/07 | Recette croisée complète (Camille + Sébastien) sur préprod monorepo |
| 18/07 8h-11h | Bascule (runbook à figer au 15/07) |
| 25/07 | Post-mortem |

- ☐ **Validation jalons : je veux accélerer la bascule pour migrer avant lundi (nous sommes mecredi)**

## 4. Points d'info rapides (5 min, pas d'arbitrage)

- Le sub-agent `suivi_act_reviewer` (proxy Sébastien) reste le filtre obligatoire de toute PR
  de portage côté Sourcing (8 garde-fous, 12 bugs historiques).
- Effort réel constaté vs estimé sur les lots faits : Lot 1 fait en ~2h vs 22h estimées
  (brief v2) — les estimations Lots 2-7 sont probablement conservatrices, MAIS le Lot 2
  (Drizzle → supabase-js) reste le risque principal (sous-jacent à tout).
- 1268+ tests vitest verts, suite E2E multi-org S1-S14, pgTAP RLS — la couverture du portage
  (Lot 7) part d'une base saine.

## 5. Checklist post-visio (Steve)

- ☐ Reporter les arbitrages A1-A8 dans `DECISIONS.md` (entrée « Visio cadrage migration »)
- ☐ Mettre à jour le tableau Q1-Q10 du `CLAUDE.md` si des positions bougent
- ☐ Communiquer le planning acté à l'équipe + à Sébastien par écrit (mail récap)
- ☐ Donner le GO équipe Sourcing pour les chantiers pré-kickoff (bench A1, gel CI)
