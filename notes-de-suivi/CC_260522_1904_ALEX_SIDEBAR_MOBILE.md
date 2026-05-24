# CC 2026-05-22 19:04 — Alex — Tâche A7 Sidebar mobile hamburger

## Contexte

- Q1 Board validée 22/05 : refonte UI mobile responsive
- PR #32 (refonte UI complète) mergée. Sidebar AppShell actuellement masquée
  totalement en mobile (`hidden md:flex`) — pas de fallback navigation
- PR #36 (refonte landing) encore ouverte → ne PAS toucher
  `src/components/landing/LandingHeader.tsx` (conflit potentiel)
- Branche `feat/sidebar-mobile-hamburger` créée depuis `main` (ff-only OK)

## Plan (4 étapes)

1. **Créer** `src/components/app-shell/SidebarMobileDrawer.tsx` (Client Component)
   - State `open` interne (`useState`), `useEffect` Escape + body scroll lock
   - Drawer fixed left-0, animation `translate-x-full → translate-x-0`
   - Backdrop click + Escape + click sur lien ferme le drawer
   - A11y : `role="dialog"`, `aria-modal="true"`, `aria-label`, focus 1er lien
   - Réutilise `NAV_ITEMS` + `isItemActive` (data-driven, pas de duplication)
2. **Modifier** `Topbar.tsx` : ajouter bouton hamburger `md:hidden` à gauche
   - Le drawer héberge son propre bouton trigger (lift state via Context simple
     ou state local au Topbar qui inclut le drawer). **Choix retenu** : Topbar
     possède le state et rend SidebarMobileDrawer en mobile uniquement.
   - Alternative envisagée : Context AppShell → rejet, overkill pour 1 state
3. **Modifier** `Sidebar.tsx` : déjà en `hidden md:flex` → rien à changer (cf.
   ligne 37 actuelle). Vérifier seulement que le layout AppShell ne casse pas.
4. **Tests** : scaffold E2E `e2e/sidebar-mobile.spec.ts` en `test.fixme()`
   (4 cas pour Camille). Pas de test unit (composant UI pur).

## Validations

- `pnpm typecheck` : 0 erreur
- `pnpm test` : pas de régression
- `pnpm build` env-clean : 18 pages (même nombre, pas de nouvelle route)

## Non-touches confirmées

- ❌ `src/components/landing/*` (PR #36)
- ❌ `src/app/sourcing/*`, `src/app/api/*`
- ❌ Schema BDD, migrations
- ❌ `nav-items.ts` (data-driven OK)
- ❌ Pas de nouvelle dépendance npm (CSS Tailwind only)
