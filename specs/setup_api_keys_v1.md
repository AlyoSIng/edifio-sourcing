# Procurement des clés API — edifio Sourcing v1.0

**Auteur** : [CEO Marc] + [CTO Sophie] + [PS_OPERATOR Yann]
**Date** : 2026-05-10
**Destinataire** : Board (TEISSIER)
**Statut** : Checklist actionnable pour démarrer la Gate 6 sans blocage

---

## Principe

Toutes les clés vivent à **deux endroits** :

1. **Local** : `C:\Dev\edifio-sourcing\.env.local` (jamais committé, dans `.gitignore`)
2. **Vercel** : Settings → Environment Variables → 2 environnements distincts (`preview` et `production`)

> **Règle d'or sécurité** : la même clé ne doit JAMAIS servir entre preview et production. Toujours **deux clés distinctes** par service.

---

## Tier 1 — BLOQUANT pour Alex (à faire maintenant)

### 🔴 Supabase (× 2 projets)

**Pourquoi maintenant** : Alex ne peut implémenter ni l'auth ni le schéma BDD sans Supabase. Bloquant absolu.

**Comment** :

1. Connecte-toi sur https://supabase.com avec ton compte AlyoS (créer si pas encore)
2. **Créer le projet PREVIEW** :
   - Bouton « New project »
   - Organization : AlyoS Ingénierie (créer si pas encore)
   - Project name : `edifio-sourcing-preview`
   - Database password : générer un mot de passe fort (24 caractères mini), **stocker dans un password manager**
   - Region : **`eu-central-1` (Frankfurt)** — strict UE
   - Pricing plan : **Free** (suffisant pour MVP)
   - Clique « Create new project » (1-2 minutes d'attente)
3. **Récupère 3 valeurs** dans Settings → API :
   - `Project URL` → `https://xxxxx.supabase.co`
   - `anon public` key (clé courte ~250 caractères)
   - `service_role` key (clé secrète plus longue — **ne JAMAIS exposer côté client**)
4. **Répète pour PROD** :
   - Project name : `edifio-sourcing-prod`
   - Plan : Free pour l'instant (passer à Pro 24 €/mois en Gate 9)
   - Récupère URL + anon + service_role

**Coût mensuel** : 0 € (Free × 2) jusqu'à Gate 9, puis 24 €/mois (Pro pour la prod uniquement)

**À communiquer à Alex** :

```
SUPABASE_URL=https://xxxxx-preview.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...     # /!\ ne JAMAIS l'exposer côté client
```

→ Tu peux soit me les coller ici (je les protège), soit les passer directement à Alex via Claude Code dans un message.

---

### 🔴 Anthropic API

**Pourquoi maintenant** : nécessaire pour le spike ORM (test des prompts IA) + tous les modules IA de Gate 6.

**Comment** :

1. https://console.anthropic.com → connexion compte AlyoS (créer si besoin)
2. **Workspace** → vérifier le workspace AlyoS (créer si besoin)
3. **API Keys** → bouton « Create Key »
4. Nommer la clé `edifio-sourcing-preview-2026-05` (la date aide au rotation)
5. Limit : recommande de fixer un **budget mensuel** sur le workspace (Settings → Limits → spending limit) : **100 €/mois max** au démarrage (cf. budget_infra prévisionnel ~20-60 €/mois)
6. Sauvegarder la clé (elle ne sera visible qu'une fois)
7. **Créer une deuxième clé** : `edifio-sourcing-prod-2026-05` pour la prod (non utilisée tant que Gate 9 n'est pas passée)

**À communiquer à Alex** :

```
ANTHROPIC_API_KEY=sk-ant-...
```

**Coût** : usage-based. ~12-72 €/mois estimé MVP (détail dans `budget_infra_v1.md`).

---

## Tier 2 — IMPORTANT (à faire dans la semaine)

### 🟠 Brevo (email transactionnel architectes)

**Pourquoi** : nécessaire pour les 8 templates Brevo (sollicitation, relance, diffusion, etc.). Non bloquant pour le spike ORM, mais nécessaire avant que l'étape #4 « Tandem » soit codée.

**Comment** :

1. https://app.brevo.com → connexion compte AlyoS (créer si besoin)
2. **Verify sender** : ajouter `no-reply@alyosingenierie.fr` ou `sourcing@alyosingenierie.fr` comme expéditeur vérifié (requiert un DNS check OVH — Alex te guidera sur les enregistrements SPF/DKIM)
3. **SMTP & API** → onglet API → bouton « Generate a new API key »
4. Nom : `edifio-sourcing-preview`
5. Sauvegarder la clé
6. **Plan** : Free (300 envois/jour) suffisant en MVP. À surveiller, migration Lite (~7 €/mois) si dépassement.

**À communiquer à Alex** :

```
BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=no-reply@alyosingenierie.fr
BREVO_SENDER_NAME=edifio Sourcing
```

**Coût** : 0 € au MVP (Free tier).

---

### 🟠 Resend (email notifications utilisateurs)

**Pourquoi** : nécessaire pour le template D.7 (tender_summary_to_user en mode Solo) + notifs internes.

**Comment** :

1. https://resend.com → connexion compte AlyoS
2. **Domains** → ajouter `alyosingenierie.fr` (ou un sous-domaine `notif.alyosingenierie.fr`)
3. Suivre les instructions DNS (SPF + DKIM) à ajouter chez OVH
4. **API Keys** → bouton « Create API Key »
5. Nom : `edifio-sourcing-preview`
6. Permissions : **Full access** (envoi)
7. Sauvegarder la clé

**À communiquer à Alex** :

```
RESEND_API_KEY=re_...
RESEND_SENDER_EMAIL=notif@alyosingenierie.fr
```

**Coût** : 0 € au MVP (Free tier 3 000 envois/mois).

---

### 🟠 Fly.io (container scraping Playwright)

**Pourquoi** : indispensable au scraping Francmarchés / MP.info / PLACE — sans ça pas de sourcing complet. Non bloquant pour les premières étapes Gate 6 (init, middleware, auth) mais à anticiper.

**Comment** :

1. https://fly.io/app/sign-up → créer un compte (peut connecter avec GitHub AlyoSIng)
2. Région : **Frankfurt (fra)** — strict UE
3. **Personal Access Tokens** → Settings → Tokens → « Create access token »
4. Nom : `edifio-sourcing-deploy`
5. Sauvegarder le token

**À communiquer à Alex** :

```
FLY_API_TOKEN=...
FLY_APP_NAME=edifio-sourcing-scraper
```

**Coût** : ~5 €/mois pour un container 256 Mo (cf. budget_infra).

---

## Tier 3 — UTILE mais peut attendre

### 🟡 BOAMP / data.gouv.fr

**Comment** : l'API est publique sans clé pour les premiers tests. Alex pourra inscrire la clé optionnelle plus tard si rate-limited.

→ Tu n'as rien à faire maintenant.

### 🟡 Sentry (monitoring erreurs)

**Pourquoi** : utile dès Gate 7 (déploiement staging) pour capturer les erreurs runtime.

**Comment** :

1. https://sentry.io → compte AlyoS, organization AlyoS Ingénierie
2. **Projects** → New Project → Platform **Next.js**
3. Nom : `edifio-sourcing`
4. Plan : **Developer (free)** — 5 000 erreurs/mois suffit MVP
5. Copier le **DSN**

**À communiquer à Alex** :

```
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
SENTRY_AUTH_TOKEN=...
```

**Coût** : 0 € au MVP.

### 🟡 Vercel Analytics

**Comment** : activé automatiquement dans Vercel Dashboard → Project → Analytics → Enable. Pas de clé à gérer.

---

## Tier 4 — Hors MVP

| Service | Quand l'activer |
|---------|-----------------|
| **Odoo** (XML-RPC) | Phase 2 — si AlyoS dispose d'un Odoo interne, à configurer en Gate 6+. Si pas d'Odoo AlyoS, ce module reste désactivé. |
| **PLACE** (creds compte AlyoS) | Lors de l'implémentation du scraping PLACE. Tu fourniras à Alex tes identifiants de compte PLACE (Vault Supabase). |

---

## Fichier `.env.example` à committer dans le repo

Alex maintiendra un fichier `.env.example` à la racine du repo, listant TOUTES les variables d'environnement attendues, **sans aucune valeur**. C'est le template que tu cloneras en `.env.local` localement.

Exemple attendu :

```bash
# === Supabase (preview) ===
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# === Anthropic ===
ANTHROPIC_API_KEY=

# === Brevo ===
BREVO_API_KEY=
BREVO_SENDER_EMAIL=
BREVO_SENDER_NAME=edifio Sourcing

# === Resend ===
RESEND_API_KEY=
RESEND_SENDER_EMAIL=

# === Fly.io ===
FLY_API_TOKEN=
FLY_APP_NAME=

# === Sentry (Gate 7+) ===
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=

# === App config ===
NEXT_PUBLIC_APP_URL=http://localhost:3000
ALLOWED_EMAIL_DOMAIN=@alyosingenierie.fr
```

---

## Procédure recommandée

### Aujourd'hui (avant qu'Alex démarre étape #2)

1. ✅ Créer **2 projets Supabase** (preview + prod) → récupérer URL + anon + service_role × 2
2. ✅ Créer **1 clé Anthropic** preview + 1 clé prod → fixer limit 100 €/mois
3. Communiquer à Alex (via Claude Code) : URLs Supabase preview + anon key + Anthropic key

### Cette semaine

4. Créer **Brevo** + DNS vérifié + clé API preview
5. Créer **Resend** + DNS vérifié + clé API preview
6. Créer **Fly.io** + token preview

### Plus tard

7. **Sentry** en Gate 7 (déploiement staging)
8. **PLACE** quand Alex implémente le scraping PLACE
9. **Odoo** si AlyoS a un Odoo interne (sinon hors MVP)

---

## Stockage et sécurité

| Lieu | Usage |
|------|-------|
| **Password manager personnel** (1Password / Bitwarden / KeePass) | Sauvegarde maître de toutes les clés + DB passwords Supabase |
| **`.env.local`** sur la machine d'Alex | Dev local — jamais committé |
| **Vercel Environment Variables** | Preview + Production deploys |
| **Supabase Vault** | Credentials par-organization (Odoo, PLACE) — accessible côté serveur uniquement |

**Aucune clé ne doit JAMAIS** :
- Apparaître dans le code source
- Être committée (vérifier `git diff --cached` avant chaque commit)
- Être envoyée par email ou Slack en clair
- Être partagée hors AlyoS

---

## En cas de fuite (procédure rapide)

1. **Révoquer immédiatement** la clé compromise dans la console du service
2. **Générer une nouvelle clé**
3. Mettre à jour `.env.local` + Vercel env vars
4. **Audit log** : entrée dans `DECISIONS.md` avec date, cause, impact estimé
5. Si données utilisateur exposées → procédure RGPD (cf. `rgpd_registre_v1.md`)

---

*Checklist à actualiser à chaque ajout de service tiers. Toute nouvelle API tierce non listée ici nécessite une remontée Cowork pour validation Board.*
