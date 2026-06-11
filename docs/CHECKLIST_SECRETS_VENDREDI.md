# Check-list secrets Vercel monorepo — vendredi 12/06 soir

**Auteur :** `ps_operator` (Yann) — `2026-06-12` (J-2 bascule)
**Cible :** projet Vercel `alyos-suivi-chantier`, team `teissiers-projects` (plan Hobby)
**Échéance :** **vendredi 12/06 fin de journée** — avant le DNS-cutover du dimanche 14/06 8h.
**Source de vérité arbitrages :** [`docs/HANDOFF_SEBASTIEN_J3_BASCULE_260611.md`](./HANDOFF_SEBASTIEN_J3_BASCULE_260611.md) + [`docs/VARS_ENV_VERCEL_MONOREPO_DIFF.md`](./VARS_ENV_VERCEL_MONOREPO_DIFF.md) §6.

---

## Mode d'emploi (30 min top chrono)

Steve, tu cocheras ce document au fur et à mesure. **Tu n'as pas à revenir sur le diff** — toutes les valeurs connues sont écrites ci-dessous, les valeurs sensibles sont à récupérer dans ta session 1Password.

Deux chemins possibles, au choix :
- **Chemin A — UI Vercel** : Settings → Environment Variables du projet `alyos-suivi-chantier`, sélectionner les 3 environnements (`Production`, `Preview`, `Development`) au moment de la création.
- **Chemin B — Loader PowerShell** : créer un fichier local `.env.monorepo.production` (KEY=VALUE par ligne, jamais commité — `.gitignore` couvert), puis lancer le script. Cf. fin de doc.

Quel que soit le chemin : **vérifier que `vercel link` pointe bien sur `alyos-suivi-chantier`** (et NON pas l'ancien `edifio-sourcing`).

---

## Bloc A — Secrets À CRÉER (5 vars, arbitrages Q1-Q4 actés 12/06)

### A1 — `SUPABASE_COOKIE_DOMAIN` (Q1 acté 12/06)

- [ ] Nom : `SUPABASE_COOKIE_DOMAIN`
- [ ] Valeur **Production** : `.edifio.fr` (point initial inclus, cookie partagé multi-app)
- [ ] Valeur **Preview** : `.vercel.app` (cookie sur le domaine des previews — vérifier comportement SSO sur preview ; si problème, mettre vide)
- [ ] Valeur **Development** : `localhost`
- [ ] Environnements à cocher dans Vercel : **Production / Preview / Development**

### A2 — `DATABASE_URL` (Q2 acté 12/06)

- [ ] Nom : `DATABASE_URL`
- [ ] Valeur **Production** : depuis ta session 1Password — entrée `Supabase Frankfurt prod — pooler URI` (la même que côté Sourcing actuel).
  Format : `postgresql://postgres.<project>:<password>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`
  **Rappel sécurité** (cf. memory `followup_post_mvp_security_rotations` + `feedback_ops_prod_user_runs_migration`) : ne pas afficher cette valeur dans le chat ; password URI-safe-only ; tu colles dans ta session, Yann ne voit jamais.
- [ ] Valeur **Preview** : même valeur que Production (le projet Supabase est unique, cf. Q1 visio 10/06).
- [ ] Valeur **Development** : URL Supabase local (`postgresql://postgres:postgres@localhost:54322/postgres`) si tu lances Supabase local, sinon laisser vide et utiliser `.env.local` seulement.
- [ ] Environnements à cocher dans Vercel : **Production / Preview** (Development optionnel)

### A3 — `NEXT_PUBLIC_APP_URL` (Q3 acté 12/06)

- [ ] Nom : `NEXT_PUBLIC_APP_URL`
- [ ] Valeur **Production** : `https://sourcing.edifio.fr`
- [ ] Valeur **Preview** : `https://$VERCEL_URL` (Vercel exposera `VERCEL_URL` à runtime, mais ici on a besoin d'une chaîne statique — donc poser `https://alyos-suivi-chantier-git-main-teissiers-projects.vercel.app` ou laisser le code lire `process.env.VERCEL_URL` en fallback)
- [ ] Valeur **Development** : `http://localhost:3000`
- [ ] Environnements à cocher dans Vercel : **Production / Preview / Development**

### A4 — `SCRAPER_BASE_URL` (recommandation Yann : poser vendredi)

- [ ] Nom : `SCRAPER_BASE_URL`
- [ ] Valeur **Production** : `https://edifio-sourcing-scraper.fly.dev` (worker Fly.io EU existant — confirmer dans Fly.io dashboard si tu as un doute)
- [ ] Valeur **Preview** : même valeur que Production (1 seul worker Fly.io pour le moment)
- [ ] Environnements à cocher dans Vercel : **Production / Preview**

### A5 — `SCRAPER_TRIGGER_SECRET` (sert pour les 2 directions Vercel↔Fly)

- [ ] Nom : `SCRAPER_TRIGGER_SECRET`
- [ ] Valeur **Production** : depuis ta session 1Password — entrée `Fly.io scraper — shared bearer`. **Strictement identique** à la valeur posée côté Fly.io secrets (sinon le webhook `Fly→Vercel /api/webhooks/scraper-done` rejettera).
- [ ] Valeur **Preview** : même valeur que Production.
- [ ] Environnements à cocher dans Vercel : **Production / Preview**
- [ ] ⚠ **Ne pas poser de `SCRAPER_WEBHOOK_SECRET`** — cette var **n'existe pas** dans le code mergé (confirmation Alex 11/06). `SCRAPER_TRIGGER_SECRET` couvre les 2 directions (trigger Vercel→Fly **et** webhook Fly→Vercel).

---

## Bloc B — Secrets À VÉRIFIER (déjà présentes côté monorepo, valeur à confirmer)

> Pour chaque var : ouvrir Settings → Environment Variables du projet `alyos-suivi-chantier`, lire la valeur posée, la comparer à la prod Sourcing actuelle (entrée 1Password ou ancienne config Vercel `edifio-sourcing`). Si divergence → corriger.

### B1 — Clés API tierces

- [ ] `ANTHROPIC_API_KEY` (Production / Preview)
- [ ] `BREVO_API_KEY` (Production / Preview)
- [ ] `BREVO_SOURCING_API_KEY` (Production / Preview — override Sourcing)
- [ ] `BREVO_WEBHOOK_SECRET` (Production)
- [ ] `PAPPERS_API_KEY` (Production / Preview)
- [ ] `RESEND_API_KEY` (Production / Preview)
- [ ] `RESEND_API_SOURCING_KEY` (Production / Preview — override Sourcing)
- [ ] `RESEND_FROM_EMAIL` (Production / Preview)

### B2 — Supabase (projet unique Q1 visio 10/06)

- [ ] `SUPABASE_SERVICE_ROLE_KEY` — **STRICTEMENT** celle du projet Supabase partagé (Frankfurt prod)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — idem
- [ ] `NEXT_PUBLIC_SUPABASE_URL` — idem (`https://<project>.supabase.co`)

### B3 — Auth Tandem (JWT architecte)

- [ ] `ARCHITECT_JWT_PRIVATE_KEY` (PEM multi-lignes — Production uniquement ; attention aux `\n` si copie depuis 1Password texte brut)
- [ ] `ARCHITECT_JWT_PUBLIC_KEY` (idem)

### B4 — Cron Vercel + monitoring

- [ ] `CRON_SECRET` — **DOIT** être identique à celui de la prod Sourcing actuelle (sinon les crons Vercel importés vont rejeter 401 lundi matin)
- [ ] `R12_MONITORING_RECIPIENT` (Production)
- [ ] `MATCHING_WEIGHTS_PROFILE` (Production)

### B5 — URLs et IDs templates

- [ ] `NEXT_PUBLIC_SITE_URL` — doit valoir `https://sourcing.edifio.fr` côté Production (URL utilisateur identique post-cutover)
- [ ] `BREVO_SENDER_EMAIL` (Production / Preview)
- [ ] `BREVO_TEMPLATE_ID_ARCHITECT_FOLLOWUP_TU` (entier, Production)
- [ ] `BREVO_TEMPLATE_ID_ARCHITECT_FOLLOWUP_VOUS` (entier, Production)
- [ ] `BREVO_TEMPLATE_ID_ARCHITECT_SOLICITATION_TU` (entier, Production)
- [ ] `BREVO_TEMPLATE_ID_ARCHITECT_SOLICITATION_VOUS` (entier, Production)
- [ ] `BREVO_TEMPLATE_ID_ARCHITECT_DECLINE_ACKNOWLEDGMENT` (entier, Production)
- [ ] `BREVO_TEMPLATE_ID_ARCHITECT_DOSSIER_DIFFUSION_TU` (entier, Production)
- [ ] `BREVO_TEMPLATE_ID_ARCHITECT_DOSSIER_DIFFUSION_VOUS` (entier, Production)

---

## Bloc C — Reporté post-bascule (Q4 acté 12/06)

> **NE PAS POSER vendredi soir.** À recâbler post-bascule quand la sync Odoo sera portée côté monorepo.

- ~~`ODOO_URL`~~ → reporté
- ~~`ODOO_DB`~~ → reporté
- ~~`ODOO_USER`~~ → reporté
- ~~`ODOO_API_KEY`~~ → reporté
- ~~`ODOO_SYNC_ENABLED`~~ → reporté

---

## Bloc D — Récap fin de session

> **Périmètre total documenté** : 5 (Bloc A à créer) + 24 (Bloc B à vérifier)
> + 5 (Bloc C reportées Odoo) = **34 vars dans le périmètre du J-2**.
> Recompte effectué le 12/06 dans le cadre de l'audit Camille (F-06).

À la fin (≈ 30 min), tu dois avoir :
- [ ] **5 vars créées** (Bloc A : `SUPABASE_COOKIE_DOMAIN`, `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `SCRAPER_BASE_URL`, `SCRAPER_TRIGGER_SECRET`)
- [ ] **24 vars vérifiées / corrigées** (Bloc B : B1=8 + B2=3 + B3=2 + B4=3 + B5=8)
- [ ] **0 var Odoo** posée (Bloc C — 5 vars reportées : `ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_API_KEY`, `ODOO_SYNC_ENABLED`)
- [ ] Aucun `SCRAPER_WEBHOOK_SECRET` posé
- [ ] Aucun `COOKIE_DOMAIN` (sans préfixe `SUPABASE_`) posé
- [ ] Aucun `NEXT_PUBLIC_APP_ENV` posé

Vérification finale :
- [ ] Onglet Settings → Environment Variables du projet `alyos-suivi-chantier` montre ≈ **29 vars en Production** (5 créées + 24 vérifiées). Si l'onglet en affiche moins, refaire le pointage Bloc B ; si plus, c'est probablement des vars Suivi/ACT pré-existantes — ne pas y toucher.
- [ ] Redéployer Production une fois (sinon les nouvelles vars ne sont pas exposées au runtime) — ⚠ Pas avant que le merge PR #5 soit acté.

---

## Annexe — Loader PowerShell (Chemin B optionnel)

Si tu préfères pousser via script PowerShell plutôt que UI Vercel, j'ai écrit hier le loader idempotent :

**Chemin du script :** `C:\Dev\edifio-sourcing\scripts\migration\ops\01-vercel-env-loader.ps1`

**Workflow** :
1. À la racine du repo `C:\Dev\edifio-sourcing\`, créer **localement** un fichier `.env.monorepo.production` (déjà couvert par `.gitignore`, pattern `.env.monorepo*`). Format : `KEY=VALUE` par ligne, encodage UTF-8 LF.
2. Y poser les 5 vars du Bloc A (et éventuellement les vars du Bloc B si tu veux tout pousser en une passe — le script skip les vars déjà présentes côté Vercel).
3. Vérifier que le repo est linké au bon projet Vercel : `vercel link` (choisir scope `teissiers-projects`, projet `alyos-suivi-chantier`).
4. **Dry-run d'abord** (zéro écriture, affiche le plan) :
   ```powershell
   cd C:\Dev\edifio-sourcing
   .\scripts\migration\ops\01-vercel-env-loader.ps1 -DryRun
   ```
5. Si le plan est conforme, lancer le push réel :
   ```powershell
   .\scripts\migration\ops\01-vercel-env-loader.ps1
   ```
   Le script demande une confirmation interactive (`PUSH-MONOREPO-PROD` à taper exactement).
6. Une fois terminé, supprimer le fichier `.env.monorepo.production` :
   ```powershell
   Remove-Item -LiteralPath .env.monorepo.production
   ```

**Garde-fous embarqués** :
- Vérification que `.vercel/project.json` est présent ET affichage du `projectId` linké (anti-doigt-qui-glisse vers `edifio-sourcing`).
- Refus des valeurs vides (poser `<TBD>` explicite si voulu).
- Refus des caractères de contrôle (CR/BOM/null) — encodage UTF-8 LF obligatoire.
- Aucune valeur n'est affichée dans la sortie standard (longueur seule).

---

**Fin de la check-list.**
