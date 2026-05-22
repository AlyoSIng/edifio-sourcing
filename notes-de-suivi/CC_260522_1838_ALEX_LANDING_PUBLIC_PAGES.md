# CC 260522 18h38 — Alex (`dev`) — Refonte landing + 5 pages publiques DS edifio

**Branche** : `feat/refonte-landing-public-pages` (créée depuis `feat/sourcing-mvp` à jour de origin)
**Périmètre** : refonte landing `/` selon M15 + habillage DS des 5 pages publiques (`/forbidden`, `/forgot-password`, `/reset-password`, `/auth/error`, `/about`) + metadata OG sur la landing.
**Statut** : 🟢 zone verte — Board 2026-05-22 (soir) a validé la M15 marketing telle quelle ; plan posté pour information.

## Contexte

- PR #30 mergée → tokens DS edifio dispos (`brand-red`, `ink`, `paper`, `paper-2`, `line`, etc.) + classes `pill-eyebrow` et `marketing-h1` dans `globals.css`
- PR #33 mergée → AppShell + pages internes `/sourcing/*` + `/login` habillés DS
- M15 (`design/maquettes/maquettes_v3_landing.html`) complète : header nav, hero (pill eyebrow + H1 52px split-color + CTAs), section « Que recouvre ? », section « Notre suite » (4 cards), spotlight ink avec stats, footer 4 colonnes
- ADR-012 référence : 3 patterns marketing (pill eyebrow rose pâle, H1 52px tracked, split-color rouge)

## Plan d'exécution

### Étape 1 — Composants atomiques `src/components/landing/*` (découpe propre)

- `LandingHeader.tsx` — header navigation (logo + nav inline + CTA « Se connecter » → `/login`)
- `LandingHero.tsx` — pill eyebrow + H1 split-color + lead + 2 CTAs (« Accéder à edifio Sourcing » + « En savoir plus »). Conserve `HashErrorHandler` à monter au-dessus dans la page.
- `LandingMarqueBox.tsx` — section « Que recouvre la marque ? » (info-box paper-2)
- `LandingSuiteSection.tsx` — section « Notre suite » avec 4 cards (`ProductCard` interne). edifio Sourcing en `active` (CTA → `/login`, badge exclusif + bordure brand-red), edifio Suivi en `external` (lien `suivi.edifio.fr`), AO et ACT en `comingSoon` (CTA grisé)
- `LandingSpotlight.tsx` — section ink avec 3 stats (50–80h économisées / 4 plateformes / 10 min de revue dossier IA) + CTA
- `LandingFooter.tsx` — footer 4 colonnes (logo+description, Produits, AlyoS, Légal) + bottom-bar copyright

### Étape 2 — Refonte `src/app/page.tsx`

Compose les 6 sous-composants. Conserve `HashErrorHandler` (mount sans rendu visible). Ajoute metadata OG (`title`, `description`, `openGraph`, `twitter`) dans le même fichier.

### Étape 3 — Habillage DS `src/app/forbidden/page.tsx`

Remplace `bg-neutral-50`, `border-neutral-200`, `bg-neutral-900`, etc. par `bg-paper-2`, `border-line`, `bg-brand-red` + `shadow-card`. Conserve le copy déjà bien rédigé (M8). Footer mono inline → on tient à une note « © AlyoS Ingénierie {year} ».

### Étape 4 — Habillage DS `src/app/forgot-password/page.tsx`

Mêmes substitutions de classes. Le `ForgotPasswordForm` (Client Component) n'est pas touché dans le périmètre — uniquement le shell de la page.

### Étape 5 — Habillage DS `src/app/reset-password/page.tsx`

Idem — shell uniquement. Le `ResetPasswordForm` (Client Component) gère déjà son rendu propre.

### Étape 6 — Habillage DS `src/app/auth/error/page.tsx`

Migration neutral-* → DS edifio. Conserve la logique `describeError(code)`.

### Étape 7 — Habillage DS `src/app/about/page.tsx`

Page V1 sobre (existe déjà). Migration neutral-* → DS edifio. **Pas d'enrichissement de copy** (cf. tâche backlog CMO Léa).

### Étape 8 — Validation locale

- `pnpm typecheck` : 0 erreur
- `pnpm test` : pas de régression
- `pnpm build` env-clean (sans `DATABASE_URL`) : doit passer (pages publiques ne lisent pas la BDD)

## Limites strictes respectées

- ❌ Aucune touche `src/app/sourcing/*` (Tandem + admin)
- ❌ Aucune touche `src/app/login/*` (déjà habillé)
- ❌ Aucune touche `src/app/api/*`, `src/db/*`, `src/lib/*`, `src/middleware.ts`
- ❌ Aucun hex en dur — tokens DS uniquement
- ❌ Aucun commit / push — laissé à Yann (`ps_operator`)

## Effort estimé

- Étapes 1-2 (landing + 6 sous-composants + metadata OG) : ~0.5j
- Étapes 3-7 (5 pages publiques en habillage shell) : ~0.5j
- Étape 8 (validations) : 30 min

## Backlog (hors scope cette PR)

- A7 — Sidebar mobile hamburger (~0.3j)
- A2bis — Enrichissement copy `/about` (CMO Léa)
- A8bis — Image OG réelle 1200×630 (Cowork B3 Théo)
