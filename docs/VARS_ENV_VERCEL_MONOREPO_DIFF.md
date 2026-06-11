# Diff env vars Vercel — bascule `edifio-sourcing` → `alyos-suivi-chantier`

**Auteur :** `ps_operator` (Yann) — `2026-06-11`
**Cible :** projet Vercel `alyos-suivi-chantier`, team `teissiers-projects` (plan Hobby)
**Échéance :** **vendredi 12/06 soir** — poser tous les secrets côté monorepo avant le DNS-cutover du dimanche 14/06 8h.
**Source de vérité :**
- runtime Sourcing → `C:\Dev\edifio-sourcing` (branche `main`, commit `cd63d17`)
- runtime monorepo → `C:\Dev\alyos-suivi-chantier\app` (working copy locale au 11/06)

> **Méthode** : grep statique `process.env.XXX` dans `src/`, `scripts/`, `middleware.ts`,
> configs (`next.config.mjs`, `vercel.json`, `drizzle.config.ts`, `playwright.config.ts`,
> `vitest.config.ts`), `tests/`, `e2e/`. Complété par recherche des lookups dynamiques
> (`process.env[xxx]`) sur les patterns `BREVO_TEMPLATE_ID_*` (template-picker) — 3 vars
> Sourcing ratées par le 1er grep ont été rattrapées (`DECLINE_ACKNOWLEDGMENT`,
> `DOSSIER_DIFFUSION_TU`/`_VOUS`).
> **Pas d'Edge Function Supabase** (`supabase/functions/`) dans le repo : seul
> `supabase/config.toml` est présent. À confirmer (cf. § ambiguïtés).

---

## 1. Liste exhaustive des env vars Sourcing (runtime + jobs + ops)

44 vars uniques.

| Nom | Où elle est lue (chemins typiques) | Statut côté monorepo |
|---|---|---|
| `ANTHROPIC_API_KEY` | `src/lib/anthropic/*`, scoring AI | `DÉJÀ PRÉSENTE` |
| `ARCHITECT_JWT_PRIVATE_KEY` | `src/lib/architect/jwt.ts` | `DÉJÀ PRÉSENTE` (`modules/sourcing/lib/tandem/jwt.ts`) |
| `ARCHITECT_JWT_PUBLIC_KEY` | `src/lib/architect/jwt.ts` | `DÉJÀ PRÉSENTE` (`modules/sourcing/lib/tandem/jwt.ts`) |
| `BOAMP_FIXTURE_MOCK` | `src/db/seed/fetch-boamp-fixture.ts` | `OBSOLÈTE` (seed-only, jamais runtime Vercel) |
| `BREVO_API_KEY` | `src/lib/brevo/client.ts` | `DÉJÀ PRÉSENTE` |
| `BREVO_SENDER_EMAIL` | `src/lib/brevo/client.ts` | `DÉJÀ PRÉSENTE` |
| `BREVO_SOURCING_API_KEY` | `src/lib/brevo/client.ts` (override Sourcing) | `DÉJÀ PRÉSENTE` |
| `BREVO_TEMPLATE_ID_ARCHITECT_FOLLOWUP_TU` | `src/lib/brevo/template-picker.ts` (lookup) | `DÉJÀ PRÉSENTE` (`modules/sourcing/lib/brevo/template-picker.ts`) |
| `BREVO_TEMPLATE_ID_ARCHITECT_FOLLOWUP_VOUS` | idem | `DÉJÀ PRÉSENTE` (idem) |
| `BREVO_TEMPLATE_ID_ARCHITECT_SOLICITATION_TU` | idem | `DÉJÀ PRÉSENTE` (idem) |
| `BREVO_TEMPLATE_ID_ARCHITECT_SOLICITATION_VOUS` | idem | `DÉJÀ PRÉSENTE` (idem) |
| `BREVO_TEMPLATE_ID_ARCHITECT_DECLINE_ACKNOWLEDGMENT` | idem (lookup dynamique, raté grep direct) | `DÉJÀ PRÉSENTE` (idem) |
| `BREVO_TEMPLATE_ID_ARCHITECT_DOSSIER_DIFFUSION_TU` | idem (lookup dynamique) | `DÉJÀ PRÉSENTE` (idem) |
| `BREVO_TEMPLATE_ID_ARCHITECT_DOSSIER_DIFFUSION_VOUS` | idem (lookup dynamique) | `DÉJÀ PRÉSENTE` (idem) |
| `BREVO_WEBHOOK_SECRET` | `src/app/api/webhooks/brevo/route.ts` | `DÉJÀ PRÉSENTE` |
| `COOKIE_DOMAIN` | `src/lib/supabase/server.ts` (SSR cookies) | `À CRÉER` — voir ambiguïté n°1 (le monorepo utilise `SUPABASE_COOKIE_DOMAIN`) |
| `CRON_SECRET` | `src/app/api/cron/*` (Bearer Vercel cron) | `DÉJÀ PRÉSENTE` |
| `DATABASE_URL` | `src/db/client.ts`, `drizzle.config.ts` | `À CRÉER` — voir ambiguïté n°2 (monorepo n'a pas Drizzle direct) |
| `E2E_TEST_ROUTES_ENABLED` | `src/app/api/_e2e/**`, `tests/` | `OBSOLÈTE` (tests Sourcing CI-only, pas runtime prod) |
| `MATCHING_WEIGHTS_PROFILE` | `src/lib/matching/weights.ts` | `DÉJÀ PRÉSENTE` (`modules/sourcing/lib/tandem/matching.ts`) |
| `NEXT_PUBLIC_APP_ENV` | divers banners environnement (dev/staging/prod) | `À CRÉER` — voir ambiguïté n°3 (monorepo utilise `NEXT_PUBLIC_APP_URL`) |
| `NEXT_PUBLIC_SITE_URL` | mails, links, CSP | `DÉJÀ PRÉSENTE` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/supabase/client.ts` | `DÉJÀ PRÉSENTE` |
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/supabase/client.ts` | `DÉJÀ PRÉSENTE` |
| `NODE_ENV` | universal (auto-fourni Vercel) | `DÉJÀ PRÉSENTE` (auto) |
| `ODOO_API_KEY` | `src/lib/odoo/client.ts` | `À CRÉER` ou `OBSOLÈTE` — voir ambiguïté n°4 |
| `ODOO_DB` | idem | `À CRÉER` ou `OBSOLÈTE` — idem |
| `ODOO_SYNC_ENABLED` | idem (toggle) | `À CRÉER` ou `OBSOLÈTE` — idem |
| `ODOO_URL` | idem | `À CRÉER` ou `OBSOLÈTE` — idem |
| `ODOO_USER` | idem | `À CRÉER` ou `OBSOLÈTE` — idem |
| `PAPPERS_API_KEY` | `src/lib/pappers/client.ts` | `DÉJÀ PRÉSENTE` (`modules/act/actions/enrich-company-pappers.ts`) |
| `PGDATABASE` | `scripts/db/*.ps1` (ops locale Steve) | `OBSOLÈTE` (jamais sur Vercel — session shell Steve) |
| `PGHOST` | idem | `OBSOLÈTE` (idem) |
| `PGPASSWORD` | idem | `OBSOLÈTE` (idem — cf. memory `feedback_ops_prod_user_runs_migration`) |
| `PGPORT` | idem | `OBSOLÈTE` (idem) |
| `PGUSER` | idem | `OBSOLÈTE` (idem) |
| `R12_MONITORING_RECIPIENT` | `src/app/api/cron/sourcing-monitoring/route.ts` | `DÉJÀ PRÉSENTE` (`api/cron/sourcing-monitoring/route.ts`) |
| `RESEND_API_KEY` | `src/lib/resend/client.ts` (mails admin/auth) | `DÉJÀ PRÉSENTE` |
| `RESEND_API_SOURCING_KEY` | `src/lib/resend/client.ts` (override sourcing) | `DÉJÀ PRÉSENTE` |
| `RESEND_ENDPOINT_OVERRIDE` | tests d'intégration | `DÉJÀ PRÉSENTE` (CI only) |
| `RESEND_FROM_EMAIL` | `src/lib/resend/client.ts` | `DÉJÀ PRÉSENTE` |
| `SCRAPER_BASE_URL` | `src/lib/sourcing/connectors/scraping-client.ts`, `src/app/api/cron/sourcing-run/route.ts`, `src/app/api/webhooks/scraper-done/route.ts` | `À CRÉER` — voir ambiguïté n°5 |
| `SCRAPER_TRIGGER_SECRET` | idem | `À CRÉER` — voir ambiguïté n°5 |
| `SUPABASE_SERVICE_ROLE_KEY` | API routes serveur-only | `DÉJÀ PRÉSENTE` |
| `VERCEL_URL` | preview deploy redirect logic | `DÉJÀ PRÉSENTE` (auto Vercel) |

> **Note** : `CI`, `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_SKIP_WEB_SERVER` sont volontairement exclus du tableau — variables CI GitHub Actions uniquement, jamais posées sur Vercel.

---

## 2. Secrets uniquement (handoff Steve — case à cocher avant cutover)

Cette check-list est **prête à être imprimée**. Steve pose les valeurs lui-même dans sa session vendredi soir (cf. memory `feedback_ops_prod_user_runs_migration`).

### À CRÉER côté monorepo

- [ ] `COOKIE_DOMAIN` — environnements Vercel : **Production / Preview / Development** ⚠ ou renommer en `SUPABASE_COOKIE_DOMAIN` (cf. ambiguïté n°1)
- [ ] `DATABASE_URL` — environnements Vercel : **Production / Preview / Development** ⚠ cf. ambiguïté n°2 (monorepo = supabase-js direct, peut-être inutile)
- [ ] `NEXT_PUBLIC_APP_ENV` — environnements Vercel : **Production / Preview / Development** ⚠ ou aligner sur `NEXT_PUBLIC_APP_URL` du monorepo (ambiguïté n°3)
- [ ] `ODOO_API_KEY` — environnements Vercel : **Production** (uniquement si Odoo conservé — ambiguïté n°4)
- [ ] `ODOO_DB` — environnements Vercel : **Production** (idem)
- [ ] `ODOO_SYNC_ENABLED` — environnements Vercel : **Production** (idem ; valeur attendue `true`/`false`)
- [ ] `ODOO_URL` — environnements Vercel : **Production** (idem)
- [ ] `ODOO_USER` — environnements Vercel : **Production** (idem)
- [ ] `SCRAPER_BASE_URL` — environnements Vercel : **Production / Preview** (cron Fly.io ; ambiguïté n°5 sur timing)
- [ ] `SCRAPER_TRIGGER_SECRET` — environnements Vercel : **Production / Preview** (Bearer trigger Fly.io ; idem)

### À VÉRIFIER côté monorepo (DÉJÀ PRÉSENTE mais valeur peut diverger entre les 2 projets Vercel)

> Steve : ouvrir le projet Vercel `alyos-suivi-chantier` et confirmer que la valeur posée est bien celle de la prod Sourcing (pas une valeur de dev/staging héritée).

- [ ] `ANTHROPIC_API_KEY`
- [ ] `ARCHITECT_JWT_PRIVATE_KEY` (PEM multi-lignes — copier intégralement, attention aux retours chariot)
- [ ] `ARCHITECT_JWT_PUBLIC_KEY` (idem)
- [ ] `BREVO_API_KEY`
- [ ] `BREVO_SOURCING_API_KEY`
- [ ] `BREVO_WEBHOOK_SECRET`
- [ ] `BREVO_TEMPLATE_ID_ARCHITECT_FOLLOWUP_TU` (entier)
- [ ] `BREVO_TEMPLATE_ID_ARCHITECT_FOLLOWUP_VOUS` (entier)
- [ ] `BREVO_TEMPLATE_ID_ARCHITECT_SOLICITATION_TU` (entier)
- [ ] `BREVO_TEMPLATE_ID_ARCHITECT_SOLICITATION_VOUS` (entier)
- [ ] `BREVO_TEMPLATE_ID_ARCHITECT_DECLINE_ACKNOWLEDGMENT` (entier)
- [ ] `BREVO_TEMPLATE_ID_ARCHITECT_DOSSIER_DIFFUSION_TU` (entier)
- [ ] `BREVO_TEMPLATE_ID_ARCHITECT_DOSSIER_DIFFUSION_VOUS` (entier)
- [ ] `CRON_SECRET` (Bearer Vercel cron — DOIT être identique à celui de la prod Sourcing actuelle pour préserver l'auth des crons importés)
- [ ] `PAPPERS_API_KEY`
- [ ] `RESEND_API_KEY`
- [ ] `RESEND_API_SOURCING_KEY`
- [ ] `RESEND_FROM_EMAIL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` (⚠ projet Supabase unique cf. Q1 — la valeur doit être strictement celle du projet Supabase partagé)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` (idem Q1)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` (idem Q1)
- [ ] `NEXT_PUBLIC_SITE_URL` — DOIT valoir `https://sourcing.edifio.fr` côté Production monorepo (URL utilisateur identique post-cutover)
- [ ] `MATCHING_WEIGHTS_PROFILE`
- [ ] `R12_MONITORING_RECIPIENT`

---

## 3. Tableau récapitulatif final

| Env Vercel | Vars total attendues | Présentes côté monorepo (estim.) | À créer | À supprimer post-bascule |
|---|---:|---:|---:|---:|
| **Production** | 33 | 23 | **10** (dont 5 Odoo conditionnels, 2 Scraper, 3 renommages potentiels) | 0 (les vars `PG*`, `BOAMP_FIXTURE_MOCK`, `E2E_TEST_ROUTES_ENABLED` n'ont jamais été posées en prod Vercel — rien à supprimer côté monorepo) |
| **Preview** | 28 | 22 | **6** (Odoo exclu en Preview, Scraper recommandé pour QA) | 0 |
| **Development** | 24 | 22 | **2** (`DATABASE_URL`, `NEXT_PUBLIC_APP_ENV` — si conservés ; sinon 0) | 0 |

> **Lecture** : la colonne "Présentes côté monorepo" est une **estimation par grep statique**, pas une lecture de l'API Vercel (interdite par le brief). Steve doit confirmer le compte exact en ouvrant la page Settings → Environment Variables du projet `alyos-suivi-chantier` vendredi soir.

---

## 4. ⚠ À arbitrer Steve avant cutover

### Ambiguïté n°1 — `COOKIE_DOMAIN` vs `SUPABASE_COOKIE_DOMAIN`
Le middleware monorepo (`app/src/middleware.ts`, l.40) documente une var **`SUPABASE_COOKIE_DOMAIN`** mais n'en lit aucune via `process.env` (le code lit seulement `CSP_ENFORCE`). Sourcing lit `COOKIE_DOMAIN` brut dans `src/lib/supabase/server.ts`.
**Question** : doit-on (a) poser `COOKIE_DOMAIN` à l'identique pour préserver le code Sourcing porté tel quel, (b) renommer en `SUPABASE_COOKIE_DOMAIN` pour s'aligner sur la convention monorepo, ou (c) les deux le temps de la transition ?
Impact si mauvais choix : SSO cassé → utilisateur déconnecté en boucle dimanche matin.

### Ambiguïté n°2 — `DATABASE_URL` côté monorepo
La décision Q2 (visio 10/06) acte **supabase-js direct, pas Drizzle dans le monorepo final**. Conséquence : `DATABASE_URL` n'a probablement plus de raison d'exister côté Vercel monorepo. **MAIS** les scripts ops (`scripts/db/migrate.ts`, post-déploiement) et les tests RLS pgTAP peuvent encore en avoir besoin.
**Question** : on pose `DATABASE_URL` côté Production monorepo (sécurité) ou on confirme que tous les usages ont basculé sur supabase-js et on s'en passe ?
Impact si mauvais choix : crash au prochain run du cron `sourcing-monitoring` si une dépendance Drizzle a été laissée par mégarde dans le module porté.

### Ambiguïté n°3 — `NEXT_PUBLIC_APP_ENV` vs `NEXT_PUBLIC_APP_URL`
Sourcing utilise `NEXT_PUBLIC_APP_ENV` (valeurs `dev`/`staging`/`prod` pour bannière env). Monorepo utilise `NEXT_PUBLIC_APP_URL` (URL de base). Conventions différentes, pas équivalents.
**Question** : ajouter `NEXT_PUBLIC_APP_ENV` au monorepo (et le brancher dans le composant bannière porté), ou virer la bannière côté monorepo ?
Impact si rien fait : bannière "DEV" affichée en prod (cosmétique mais embarrassant client).

### Ambiguïté n°4 — Odoo : porté ou pas ?
Aucune trace d'`ODOO_*` dans `C:\Dev\alyos-suivi-chantier\app\src` ni dans `app/scripts`. Code Sourcing complet (`src/lib/odoo/client.ts` + tests). Le brief de migration ne tranche pas explicitement (Q1-Q10 de la visio 10/06 ne mentionnent pas Odoo).
**Question** : la sync Odoo (CRM partners) est-elle portée en vague 2 ? Si oui → 5 vars `ODOO_*` à créer en Production monorepo. Si non → 5 vars à marquer `OBSOLÈTE` et code Odoo à retirer côté Sourcing pré-cutover.
Impact si non traité : `loadOdooConfigFromEnv()` throw au démarrage du module sourcing porté → crash silencieux ou erreur 500 sur la route qui appelle Odoo.

### Ambiguïté n°5 — `SCRAPER_*` : poser maintenant ou attendre câblage vague 2 ?
La route `app/src/app/api/cron/sourcing-run/route.ts` du monorepo est un **stub `throwNotWired`** (cf. l.16-21 du fichier). Tant que le câblage vague 2 n'est pas fait, les vars `SCRAPER_BASE_URL`/`SCRAPER_TRIGGER_SECRET` ne sont pas lues — donc inutiles. **MAIS** :
- la décision Q4 acte le maintien de Fly.io → ces vars seront indispensables dès le câblage ;
- Vercel cron `sourcing-run` du monorepo est déjà déclaré dans `vercel.json` (planning `30 4 * * 1-5`) → il va tourner dès lundi 15/06 matin et écrire row "error" tant que pas wiré.
**Question** : on les pose vendredi par sécurité (= zéro impact tant que non lues, et zéro risque le jour où Alex pousse le câblage) ou on attend ?
**Recommandation Yann** : poser vendredi (coût = 0, bénéfice = éviter un redéploiement à chaud quand le câblage arrive).

### Ambiguïté n°6 — crons manquants côté monorepo `vercel.json` (hors périmètre env vars, mais signalé)
Le `vercel.json` du monorepo ne contient **que 6 crons** alors que les routes existent pour 9 (manque : `tandem-followup`, `library-expiry-digest`, `dossier-zip-cleanup`). Sourcing les a tous les 3 dans son `vercel.json` actuel. Si ces routes ne sont pas déclenchées par Vercel cron côté monorepo après cutover, on perd 3 fonctionnalités auto.
**Question** : c'est volontaire (orchestration ailleurs) ou un oubli à corriger avant dimanche ?
Impact : pas d'impact env vars, mais à signaler dans le runbook bascule.

### Ambiguïté n°7 — pas d'Edge Function Supabase trouvée
Le brief mentionne `functions/sourcing-run/` à grep. Or `C:\Dev\edifio-sourcing\supabase\` ne contient que `config.toml` (pas de dossier `functions/`). Aucun appel `Deno.env.get(...)` trouvé dans le repo.
**Question** : confirmation que la spec Edge Function a été abandonnée au profit du cron Vercel + Fly.io ? Si oui → cette partie du brief peut être ignorée. Si non → il existe un dépôt Edge séparé que je n'ai pas inspecté.

---

## 5. Méthode de reproduction (pour audit Sébastien si besoin)

```powershell
# Côté Sourcing — extraction process.env.*
grep -rhoE "process\.env\.[A-Z0-9_]+" `
  "C:/Dev/edifio-sourcing/src" `
  "C:/Dev/edifio-sourcing/scripts" `
  "C:/Dev/edifio-sourcing/middleware.ts" `
  | Sort-Object -Unique

# Côté monorepo — extraction process.env.*
grep -rhoE "process\.env\.[A-Z0-9_]+" `
  "C:/Dev/alyos-suivi-chantier/app/src" `
  "C:/Dev/alyos-suivi-chantier/app/scripts" `
  | Sort-Object -Unique

# Cas spéciaux — lookup dynamique BREVO_TEMPLATE_ID_*
grep -rn "BREVO_TEMPLATE_ID_ARCHITECT" `
  "C:/Dev/edifio-sourcing/src/lib/brevo/" `
  "C:/Dev/alyos-suivi-chantier/app/src/modules/sourcing/lib/brevo/"
```

---

**Fin du document.**
