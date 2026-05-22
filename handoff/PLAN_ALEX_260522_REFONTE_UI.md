# PLAN ALEX — Refonte UI + Profil + Bug admin users

**Date** : 2026-05-22
**Auteur** : Alex (`dev`)
**Statut** : Zone verte — pour information Board (delegation niveau ÉQUILIBRÉ)
**Contexte** : réordonnancement Board du 2026-05-22, Tandem repris par Nadia (`dev_tandem`).
**Sources lues** : `CLAUDE.md`, `design/tokens.json`, `design/maquettes/maquettes_v4_sourcing_modules.html`, `design/maquettes/maquettes_v5_admin_architectes.html`, `notes-de-suivi/COWORK_260521_LIVRABLES_DESIGN_SPEC_PARALLELE.md`, `specs/module_sourcing_engine_v1.md` §3.5, `specs/audit_log_v1.md`, `src/db/schema/config.ts`, `src/app/sourcing/**`, `src/app/api/admin/users/**`, `src/middleware.ts`, `src/components/EdifioLogo.tsx`, `src/app/globals.css`, `tailwind.config.ts`.

---

## Constat de départ

Côté code, l'UI est encore en mode « shadcn + Tailwind neutre » :
- `globals.css` ne déclare **aucun** token couleur edifio (juste `--marketing-pill-*` + `--font-display`). Aucun `--paper`, `--ink`, `--alyos-red`, `--line` côté CSS vars consommables par Tailwind.
- `tailwind.config.ts` n'expose ni la palette, ni les radius, ni les ombres du DS — uniquement les font families.
- `<body className="font-sans antialiased">` sans background `paper` ni texte `ink`.
- Toutes les pages (login, ao-du-jour, admin/users) utilisent `bg-neutral-*` / `text-neutral-*` / `border-neutral-*` / `bg-neutral-900` (CTA). Aucun rouge edifio.
- Aucun shell app : pas de sidebar (M-A en propose une `ink` avec sections Sourcing / Pilotage / Admin), pas de top-bar.
- `EdifioLogo` est OK (pin rouge `#FF0033` en dur, wordmark `font-display`) — mais sera consommé différemment dans la sidebar (mode dark).

Plan structuré sur 3 priorités, ~15 étapes au total.

---

## P1 — Refonte esthétique alignée maquettes v4 (5 étapes, ~3–4 j)

L'objectif : faire que `/sourcing/ao-du-jour`, `/login`, `/sourcing/admin/users` ressemblent vraiment aux maquettes (palette papier, sidebar ink, CTA rouge, typo Space Grotesk display, footer AlyoS). Pas Tandem (Nadia).

### P1.1 — Couche tokens CSS vars + Tailwind (fondation)

**Fichiers** :
- `src/app/globals.css` — ajouter `:root { --paper, --paper-2, --paper-3, --ink, --ink-2, --line, --line-2, --muted, --alyos-red, --alyos-red-dark, --alyos-red-light, --white, --status-* }` + classes `bg-paper`, `font-mono-tight` etc. en `@layer base`. Conserver `--marketing-pill-*` (ADR-012).
- `tailwind.config.ts` — `extend.colors` : `paper.{DEFAULT,2,3}`, `ink.{DEFAULT,2}`, `line.{DEFAULT,2}`, `brand.{red,red-dark,red-light}` (alias edifio, **on garde le nom legacy `alyos-red` dans tokens.json** comme noté §3 note Cowork 21/05). `extend.borderRadius` (`xs/sm/md/lg/full`), `extend.boxShadow` (`card/modal/logo`), `extend.spacing` du DS.
- `src/app/layout.tsx` — `<body className="bg-paper font-sans text-ink antialiased">`.

**Risques** :
- Casser des composants existants qui utilisent `border-neutral-200` → on **garde** les classes neutral en parallèle, on n'oblige pas le renommage en passe 1.
- Naming token `alyos-red` vs `brand-red` : note Cowork §3 dit « ne pas renommer à la volée ». Compromis : on expose **les deux alias** dans Tailwind (`brand-red` ET `alyos-red`) pointant sur la même valeur `#FF0033`, on ne renomme rien dans `tokens.json`. Refacto naming = passe ultérieure coordonnée Nadia / Théo.

**Estimation** : 0,5 j (fondation, test visuel léger).

### P1.2 — Composant `<AppShell>` (sidebar + topbar) — `(app)` route group

**Fichiers** :
- Création de `src/app/sourcing/layout.tsx` (route layout Next 14) qui wrap les pages `/sourcing/*` dans `<AppShell>`.
- Création de `src/components/app-shell/AppShell.tsx`, `Sidebar.tsx`, `SidebarLink.tsx`, `SidebarSection.tsx`, `Topbar.tsx`.
- Sidebar : `bg-ink text-white`, sections « Sourcing / Pilotage / Admin », `SidebarLink active` avec `bg-brand-red`. Badge mono pour compteurs (cf. M-A ligne 60-66). Visible Admin uniquement (`isAdmin(profile)`), liens `/sourcing/ao-du-jour`, `/sourcing/admin/profil` (futur), `/sourcing/admin/users`.
- Topbar minimaliste : titre de page + email user à droite + bouton « Se déconnecter ».

**Risques / 🟠** :
- Mobile : M-A est dessiné desktop. Pour le MVP on cache la sidebar `< lg` avec un toggle (hamburger). Question CTO : ok pour V1 sidebar uniquement desktop, mobile = empty topbar avec menu déroulant ? **À confirmer Sophie** mais je propose oui (simple, MVP interne).
- Conflit Nadia : Nadia va probablement ajouter des liens sidebar pour le module Tandem (`/sourcing/tandem/*`). Le fichier `Sidebar.tsx` sera donc partagé → je le pose avec une **structure data-driven** (`const NAV_ITEMS = [...]`) que Nadia n'a qu'à compléter, pas à restructurer.

**Estimation** : 1 j.

### P1.3 — Refonte `/sourcing/ao-du-jour` (page + TenderCard)

**Fichiers** :
- `src/app/sourcing/ao-du-jour/page.tsx` — supprimer le `EdifioLogo` inline (passe dans AppShell), passer le `<main>` à `bg-paper`, header titre Space Grotesk 32px ink, score badges en `font-mono`.
- `src/app/sourcing/ao-du-jour/TenderCard.tsx` — refonte selon M-A : carte `bg-white border-line shadow-card rounded-md`, header `<h3>` Space Grotesk medium 18px ink, métadonnées `font-mono text-muted text-xs uppercase`, ring de score à droite (cercle SVG ou `conic-gradient`), 3 boutons d'action en bas (Sélectionner = `bg-brand-red text-white`, Différer = `border-line text-ink`, Rejeter = `text-muted hover:text-ink`).
- `EmptyState.tsx` + `ErrorBanner.tsx` — alignés M-E (états vide / erreur avec icône + copy poli).

**Risques** :
- Le score ring SVG vient direct de M-A (ligne ~190+). Recopier le markup tel quel.
- `TenderCard` est référencé par les Server Actions PR n°5 (`SoloTandemModal`, `RejectReasonModal`) — refonte UI sans toucher au câblage business.

**Estimation** : 1 j.

### P1.4 — Refonte `/login` (page + LoginForm)

**Fichiers** :
- `src/app/login/page.tsx` — fond `bg-paper`, carte centrale `bg-white border-line shadow-card rounded-lg`, `<h1>` Space Grotesk 32px (pas `marketing-h1` 52px qui est pour pages publiques marketing edifio.fr selon ADR-012 §Pattern 2, mais on peut garder en H1 réduit).
- `src/app/login/LoginForm.tsx` — inputs `border-line-2 focus:border-brand-red focus:ring-brand-red/20`, bouton submit `bg-brand-red hover:bg-brand-red-dark text-white shadow-logo`.
- Bandeau « Outil interne AlyoS Ingénierie » `bg-paper-2 text-muted` au lieu de `bg-neutral-50`.

**Estimation** : 0,5 j.

### P1.5 — Refonte `/sourcing/admin/users` (page + dialog + bouton)

**Fichiers** :
- `src/app/sourcing/admin/users/page.tsx` — header aligné M16 (maquette v5), tableau `border-line shadow-card`, status pills avec couleurs `--status-*` du DS.
- `src/app/sourcing/admin/users/InviteUserDialog.tsx` — modale `shadow-modal radius-lg`, CTA rouge edifio, inputs `border-line-2`.
- `src/app/sourcing/admin/users/RegeneratePasswordButton.tsx` — bouton secondaire `border-line text-ink hover:bg-paper-2`.
- Footer mono `text-muted` (déjà en place).

**Estimation** : 0,5 j.

---

## P2 — Écran admin `/sourcing/admin/profil` (5 étapes, ~3 j)

Édition du profil de recherche AlyoS — table `search_profiles` (cf. `src/db/schema/config.ts`). C'est la cause du 264/288 AO filtrés ce soir → débloque le métier.

### P2.1 — Helpers BDD : lecture + écriture profile

**Fichier** : `src/lib/sourcing/profile.ts`.
- `getActiveSearchProfile(orgId)` → renvoie le row complet (pas seulement `name` comme aujourd'hui).
- `updateSearchProfile(orgId, profileId, patch)` → UPDATE Drizzle avec validation Zod.
- Réutilise `db` lazy (cf. `getTendersOfTheDay`).

**🟠 Question CTO** : V1, on assume **1 seul profil actif** par org (AlyoS, mono-tenant). Si plusieurs profils potentiels, l'écran liste + edit. Simple sur 1 row pour le MVP : OK ? Je propose **1 row éditable** (création/suppression de profils = Phase 2).

**Estimation** : 0,5 j.

### P2.2 — Schéma Zod + Server Actions

**Fichier** : `src/app/sourcing/admin/profil/actions.ts`.
- `SearchProfileFormSchema` Zod : `positiveKeywords: string[]`, `negativeKeywords: string[]`, `exactKeywords: string[]` (case-sensitivity à confirmer en P2.5), `cpvCodes: string[]` (regex `^\d{2,8}\*?$`), `geoZones: string[]` (regex `^[0-9]{2,3}$` ou code région), `marketTypes: string[]` (enum : `travaux | services | fournitures | moe`), `amountMin: number | null`, `amountMax: number | null`.
- Server Action `updateProfileAction` : auth admin defense-in-depth, validation Zod, UPDATE, `revalidatePath('/sourcing/admin/profil')`, audit log.

**Risques** :
- Wildcards CPV (`45*`) déjà documentés §3.5 spec sourcing. À supporter au moins en saisie (validation regex souple).

**Estimation** : 0,5 j.

### P2.3 — Audit log `search_profile_change` (code A3 — DÉJÀ ALLOUÉ)

**Bonne nouvelle** : code A3 existe déjà dans `specs/audit_log_v1.md` (`search_profile_change` avec `operation ∈ create|update|delete|activate|deactivate`). Pas besoin de REQUEST Board pour un nouveau code → on log avec `operation: "update"` et `diff: { ... }` (avant / après).

**Fichier** : appel `audit({ action: 'search_profile_change', ... })` depuis la Server Action. Schémas Zod côté `src/lib/audit/schemas.ts` à compléter si pas déjà.

**Estimation** : 0,25 j.

### P2.4 — UI page édition

**Fichiers** :
- `src/app/sourcing/admin/profil/page.tsx` (Server Component) — fetch profile, défense admin, passe à `<ProfileForm>`.
- `src/app/sourcing/admin/profil/ProfileForm.tsx` (`"use client"`) — `useFormState` + Server Action. UI : sections (Mots-clés, CPV, Géo, Type de marché, Montant) avec inputs « tag » (chips ajoutables/supprimables, pattern ChipInput maison léger, pas de shadcn).
- Style aligné DS (P1.1 fait au préalable, sinon `bg-paper` etc. sont déjà dispo).

**Estimation** : 1 j.

### P2.5 — Tests + handoff Camille

- Test Vitest unit : `SearchProfileFormSchema` rejette montants négatifs, accepte wildcards CPV, etc.
- Camille (QA) écrira l'E2E Playwright (créer profil vide → ajouter mots-clés → save → re-load → vérifier persistance + entry dans `audit_logs` via `auth.admin.listUsers` snapshot).

**🟠 Questions CTO groupées** :
1. `exact_keywords` : sensible à la casse (`includes` strict) ou normalisé (lowercase + strip diacritics) ? Spec §3.5 ne tranche pas — je propose **case-sensitive strict** sinon `positive_keywords` suffit.
2. `market_types` : enum fermé (`travaux/services/fournitures/moe`) ou libre ? Je propose enum fermé V1.
3. `geo_zones` : codes département FR (`75`, `92`, `2A`) ou codes région INSEE (`11`, `84`) ? Je propose département V1 (plus simple, granularité utile aux conducteurs AlyoS).

→ **Une seule REQUEST groupée** `handoff/REQUEST_260522_HHMM_PROFIL_RECHERCHE_OPTIONS.md` posté avant P2.4 si Sophie ne tranche pas en passant.

**Estimation** : 0,5 j (côté code) + Camille (E2E).

---

## P3 — Bug `/sourcing/admin/users` API renvoie HTML (3 étapes, ~0,5 j)

Le symptôme `Unexpected token <` côté UI = un fetch JSON qui reçoit du HTML. Diag rapide.

### P3.1 — Reproduction + identification du chemin défaillant

**Action** :
- Démarrer `pnpm dev` en local avec un user admin connecté.
- Ouvrir DevTools Network → cliquer « Inviter un collaborateur » → soumettre. Inspecter la requête POST `/api/admin/users` : status, content-type, body.
- Idem cliquer « Renvoyer » sur un user provisoire → POST `/api/admin/users/<uuid>/regenerate-password`.

**Hypothèses à tester (par ordre de probabilité)** :
1. **Session expirée** côté browser → middleware redirige `/api/admin/users` → `/login` (302 → page HTML). Le browser suit le redirect par défaut (`fetch` redirect:'follow') et reçoit la page login HTML → JSON.parse échoue. **Très probable**.
2. Throw au top-level de la route handler avant `NextResponse.json` (par ex. `createSupabaseAdminClient()` qui throw si `SUPABASE_SERVICE_ROLE_KEY` manquant) → Next.js renvoie sa page d'erreur HTML. Couvert par try/catch global déjà en place mais le `createSupabaseAdminClient()` est appelé HORS du try-catch dans `regenerate-password/route.ts` ligne 68 → throw potentiel si env manquante.
3. Le `RegeneratePasswordButton` parse `.catch(() => ({}))` puis ignore le body → si la réponse n'est pas du JSON, on tombe sur `Unexpected token <` quand `await resp.json()` est appelé **avant** le `.catch` ? Non, le `.catch` capture déjà. À re-vérifier.

### P3.2 — Patch ciblé selon root cause

**Si hypothèse 1** (le plus probable) :
- Patch `InviteUserDialog.tsx` + `RegeneratePasswordButton.tsx` : ajouter `redirect: 'manual'` au `fetch` ET tester `if (resp.type === 'opaqueredirect' || resp.status === 0)` → afficher message « Session expirée, reconnecte-toi » + redirect `/login`.
- Alternative plus propre : faire en sorte que le middleware retourne **toujours JSON 401** sur `/api/admin/*` quand pas de session (au lieu de `redirectToLogin`). Cf. middleware ligne 103-105 → manque le check `isProtectedApiRoute(pathname)` avant le redirect. **Fix middleware = solution propre**.

**Si hypothèse 2** :
- Wrap `createSupabaseAdminClient()` dans le try/catch racine (déjà OK pour POST principal, à vérifier sur regenerate).

### P3.3 — Tests + non-régression

- Vitest unit middleware : ajouter cas « API route sans session → JSON 401, pas redirect HTML ».
- Vitest unit `InviteUserDialog` : mock fetch qui renvoie HTML → vérifier état d'erreur propre (pas de crash).

**Estimation totale P3** : 0,5 j.

---

## Coordination avec Nadia (`dev_tandem`)

Fichiers partagés / risque de conflit Git :

| Fichier | Risque | Mitigation |
|---|---|---|
| `src/app/globals.css` | élevé — P1.1 modifie les tokens CSS | je pose les tokens en premier (P1.1 prioritaire). Nadia consomme via `bg-paper`/`text-brand-red` ensuite. Je ping Nadia avant push. |
| `tailwind.config.ts` | élevé — P1.1 ajoute palette/radius/shadows | idem, P1.1 d'abord. Nadia se contente d'utiliser les classes. |
| `src/components/app-shell/Sidebar.tsx` | moyen — Nadia ajoutera ses liens Tandem | structure data-driven `NAV_ITEMS` exposée pour qu'elle complète sans refactorer. |
| `src/app/sourcing/layout.tsx` | faible — fichier créé en P1.2 | une fois posé, plus de conflit. |
| `src/components/EdifioLogo.tsx` | nul — pas de modif planifiée | — |
| `src/components/ui/*` (shadcn) | nul à ce stade — Nadia pourrait ajouter Dialog/Sheet | si elle ajoute des primitives shadcn, je consommerai. Pas de doublons. |
| `src/db/schema/*.ts` | nul — P2 ne modifie pas le schéma | Nadia touche `architects`, je touche zéro DB ce sprint. |
| Connecteur Odoo | nul — je ne touche pas | tout Nadia. |

**Convention** :
- Je merge P1.1 (tokens) sur `feat/sourcing-mvp` en priorité, **petite PR isolée** → Nadia rebase ensuite, 0 conflit attendu.
- Je préviens Nadia avant chaque push touchant à Sidebar / layout / globals.

---

## Questions CTO ouvertes (groupables en 1 REQUEST)

🟠 **Q1 — UI** : sidebar V1 desktop-only avec menu déroulant mobile (hamburger), OK ?
🟠 **Q2 — Profil** : 1 row éditable (MVP) vs CRUD multi-profils ? Je propose 1 row.
🟠 **Q3 — exact_keywords** : case-sensitive strict ou normalisé ?
🟠 **Q4 — market_types** : enum fermé (`travaux/services/fournitures/moe`) OK ?
🟠 **Q5 — geo_zones** : codes département FR V1 OK ?

→ Si Sophie ne répond pas en passant, je groupe en `handoff/REQUEST_260522_HHMM_UI_REFONTE_ET_PROFIL.md` avant de commencer P2.

---

## Estimations consolidées

| Priorité | Effort dev | Effort Camille (QA) | Effort Hugo (review) |
|---|---|---|---|
| P1 — Refonte UI | 3–4 j | 0,5 j (E2E visuel light) | 0,5 j |
| P2 — Écran profil | 3 j | 1 j (E2E + audit log check) | 0,5 j |
| P3 — Bug admin users | 0,5 j | 0,25 j | 0,25 j |
| **Total Alex** | **~6,5–7,5 j** | | |

Pas de coupage prod, pas de migration BDD, pas de commit (Yann), pas de touche Tandem. Plan zone verte → je commence par P1.1 dès validation Yann sur la branche.

---

*Plan posté pour information Board (delegation niveau ÉQUILIBRÉ — Board 2026-05-21). Démarrage prévu : P1.1 dès cette session, sans attente de validation.*
