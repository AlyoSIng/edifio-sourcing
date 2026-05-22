# CC 2026-05-22 15h24 — Alex · Refonte UI pages app live (P1 suite)

**Auteur** : Alex (`dev`)
**Branche** : `feat/refonte-ui-pages-v1` (créée depuis `feat/sourcing-mvp` à jour de `origin/feat/sourcing-mvp` au commit `c0a0569`)
**Zone autonomie** : 🟢 verte — spec validée par Board 22/05 + maquettes Cowork v4/v5 + tokens DS PR #30.
**Aucune touche** : périmètre Tandem / data-fetching / BDD / middleware / Server Actions (cf. limites strictes énoncées par le Board).

---

## Contexte

Toutes les pages app live utilisent encore Tailwind « standard » (`bg-neutral-50`, `bg-[#FF0033]` en hex en dur). La palette DS edifio est posée (PR #30) : on remplace par les classes nommées (`bg-paper`, `bg-brand-red`) et on aligne sur les maquettes M-A (AO du jour) + M-E (états) + M16 (pattern admin).

## Plan court (7 étapes)

1. **AppShell global** — `src/components/app-shell/AppShell.tsx` + `Sidebar.tsx` + `Topbar.tsx` + `Footer.tsx` + `nav-items.ts` (data-driven, exposé pour Nadia/Tandem). Wrapping via `src/app/sourcing/layout.tsx`.
2. **`/sourcing/ao-du-jour`** — refonte `page.tsx` (KPI row, toolbar) + `TenderCard.tsx` (score ring SVG + 3 actions stylées) + `EmptyState.tsx` (M-E pattern « rien ce matin ») + `ErrorBanner.tsx` (`role="alert"` border-error). Pas de touche aux Server Actions / queries.
3. **`/login`** — refonte `page.tsx` + `LoginForm.tsx` : carte centrée fond `--paper-2`, logo edifio en haut, bouton `bg-brand-red`, erreur `--error-bg`, footer mono.
4. **`/sourcing/admin/users`** — refonte `page.tsx` + `InviteUserDialog.tsx` + `RegeneratePasswordButton.tsx` : table pattern M16 (`data-table` th `--paper-2` mono uppercase), bouton primaire `bg-brand-red`, chips de rôle/statut DS.
5. **`/sourcing/admin/profil`** — habillage `ProfileForm.tsx` : sections fieldset titres `font-display`, séparateurs `border-line`, ChipInput stylé `--paper-3` (déjà en place côté composant — j'ajuste les couleurs), boutons primaire `bg-brand-red` / ghost.
6. **Note de suivi finale** (ce fichier complété).
7. **`pnpm typecheck` + `pnpm test`** verts. Pas de touche aux tests existants — Camille (qa) ajoutera les visual regression Playwright après.

## Coordination Nadia (Tandem)

L'AppShell expose **`src/components/app-shell/nav-items.ts`** (constante `NAV_ITEMS: NavSection[]`) — Nadia peut y ajouter ses liens Tandem (`Cotraitance`, etc.) sans toucher au composant `Sidebar`. Forme exposée :

```ts
export interface NavItem {
  href: string;
  label: string;
  icon: string; // emoji ou clé future SVG
  badge?: number | string;
  matchPrefix?: string; // détection "active" sur préfixe d'URL
  adminOnly?: boolean;
}
export interface NavSection {
  title: string;
  items: NavItem[];
}
export const NAV_ITEMS: NavSection[] = [...];
```

JSDoc complète dans le fichier.

## Limites respectées

- ❌ Aucune touche au schéma BDD, aux migrations, aux queries (`getTendersOfTheDay`, `getActiveSearchProfile`, `updateProfileAction`).
- ❌ Aucune valeur hex en dur (`#FF0033`) dans le JSX livré.
- ❌ Aucune touche au middleware ni à `lib/sourcing/filter.ts` / `lib/text/normalize.ts` / `lib/audit/*`.
- ❌ Aucune touche aux composants Tandem (le périmètre Nadia).
- ✅ Naming strict `edifio` lowercase dans tous les strings UI.

## État final (session 15h24-16h00)

### Étape 1 — AppShell global (~330 lignes nouvelles)

Nouveaux fichiers :
- `src/components/app-shell/AppShell.tsx` — wrapper Server Component (49 l.)
- `src/components/app-shell/Sidebar.tsx` — Client Component avec `usePathname` (135 l.)
- `src/components/app-shell/Topbar.tsx` — Server Component + sous-comp Client `SignOutButton` (50 l.)
- `src/components/app-shell/SignOutButton.tsx` — Client minimal (37 l.)
- `src/components/app-shell/Footer.tsx` — Server pur (15 l.)
- `src/components/app-shell/actions.ts` — Server Action `signOutAction` (23 l.)
- `src/components/app-shell/nav-items.ts` — config data-driven `NAV_ITEMS` + JSDoc Nadia (115 l.)
- `src/app/sourcing/layout.tsx` — layout nested wrap AppShell sur `/sourcing/*` (43 l.)

**Coordination Nadia** : `NAV_ITEMS: NavSection[]` exposé dans
`src/components/app-shell/nav-items.ts`. Ajouter une entrée Tandem ne demande
AUCUN refacto. Slot pré-câblé `Cotraitance` en `comingSoon: true`.

### Étape 2 — `/sourcing/ao-du-jour` (+158 / -120 lignes)

- `src/app/sourcing/ao-du-jour/page.tsx` — refonte complète : retrait du logo/footer local (l'AppShell les fournit), eyebrow pill date, KPI row 3 cases, layout liste vertical
- `src/app/sourcing/ao-du-jour/TenderCard.tsx` — refonte avec **score ring SVG** dynamique (couleur dérivée du score), grid 3 colonnes [ring 64px | main | actions], libellé deadline coloré selon urgence
- `src/app/sourcing/ao-du-jour/EmptyState.tsx` — emoji ☕ + texte M-E + lien admin profil (si admin)
- `src/app/sourcing/ao-du-jour/ErrorBanner.tsx` — `role="alert"` fond `--error-bg`, border-left error, copy aligné M-E « Sourcing indisponible »
- `src/app/sourcing/ao-du-jour/TenderCardActions.tsx` — remplacement `bg-[#FF0033]` hex en dur → `bg-brand-red` + tons DS pour Différer/Rejeter

### Étape 3 — `/login` (+57 / -22 lignes)

- `src/app/login/page.tsx` — fond `bg-paper-2`, carte centrée logo en haut (pin rouge + wordmark + sub mono), bannière info domaine, ergonomie M7
- `src/app/login/LoginForm.tsx` — inputs DS edifio (`border-line-2`, focus `brand-red`), bouton `bg-brand-red`, erreur `border-l-error bg-error-bg`

### Étape 4 — `/sourcing/admin/users` (+95 / -45 lignes)

- `src/app/sourcing/admin/users/page.tsx` — header + sous-titre dynamique, table pattern M16 (`thead bg-paper-2` mono uppercase), chips rôle + statut DS, état vide gracieux
- `src/app/sourcing/admin/users/InviteUserDialog.tsx` — modale `role="dialog" aria-modal`, fond `bg-ink/45`, carte shadow-modal, champs DS, bouton primaire `bg-brand-red`
- `src/app/sourcing/admin/users/RegeneratePasswordButton.tsx` — texte succès `text-success`, erreur `text-error`, bouton border `line-2`

### Étape 5 — `/sourcing/admin/profil` (+30 / -28 lignes)

- `src/app/sourcing/admin/profil/page.tsx` — retrait logo/footer/EdifioLogo local (AppShell global), bannières d'erreur DS
- `src/app/sourcing/admin/profil/ProfileForm.tsx` — sections fieldset avec `border-t border-line pt-6` (séparateurs DS), toast succès `border-success bg-success-bg`, chips de types de marché actifs en `bg-brand-red`, boutons primaire `bg-brand-red` / ghost
- `src/components/ui/ChipInput.tsx` — chips fond `bg-paper-3 border-line`, focus container `border-brand-red`, erreur `text-error`

### Étape 6 — Tests + lint

- `pnpm typecheck` → **OK** (0 erreur)
- `pnpm test` (Vitest 31 fichiers) → **532/532 passed** en 13,05 s
- `pnpm lint` (Next/ESLint, --max-warnings 0) → **clean** après nettoyage d'1 var inutilisée (`scoreLabel` dans TenderCard)
- `pnpm build` env-clean : non vérifié dans cette session (sandbox bash a refusé l'exécution avec env vars vides). À faire par Yann avant push (cf. memory user `Next.js build env-clean avant push`).

### Étape 7 — git status

Branche : `feat/refonte-ui-pages-v1` (depuis `feat/sourcing-mvp` @ `c0a0569`).
- 13 fichiers modifiés (M)
- 3 fichiers/dossiers ajoutés (??) :
  - `notes-de-suivi/CC_260522_1524_ALEX_REFONTE_UI.md`
  - `src/app/sourcing/layout.tsx`
  - `src/components/app-shell/` (8 fichiers)

Aucun commit créé — c'est Yann (`ps_operator`) qui staging + commit + push.

## Suggestion message de commit pour Yann

```
feat(ui): refonte pages app live alignée maquettes DS edifio v4/v5

- AppShell global (Sidebar + Topbar + Footer) wrappant /sourcing/*
- NAV_ITEMS data-driven exposé pour module Tandem (Nadia)
- /sourcing/ao-du-jour : score ring SVG, KPI row, layout M-A
- /login : carte centrée DS edifio, palette brand-red/paper-2/error-bg
- /sourcing/admin/users : table pattern M16, modale invite DS
- /sourcing/admin/profil : sections fieldset border-line, ChipInput DS

Tests : 532/532 verts, typecheck OK, lint clean.
Aucune touche au data-fetching ni au schéma BDD.
```

## Questions résiduelles (à grouper REQUEST si besoin)

Aucune ambiguïté forte rencontrée sur les maquettes M-A / M-E / M16. Quelques
détails laissés en MVP simple avec commentaires JSDoc explicites :

1. **Sidebar mobile** — masquée < `md`. Le menu hamburger viendra dans une PR
   ultérieure (cf. décision Board Q1 sidebar mobile). Pas d'arbitrage requis.
2. **Header `x-pathname`** — j'avais initialement essayé de récupérer le
   pathname via `next/headers` Server Component, mais ça nécessitait de modifier
   `src/middleware.ts` (limite stricte). J'ai basculé la `Sidebar` en Client
   Component avec `usePathname` (commentaire JSDoc Sidebar pour le rationale).
   Coût minime — la Sidebar reste mostly static.
3. **`TenderCard` score breakdown 4 barres** — pas livré en V1 (les sous-scores
   `CPV/Géo/Montant/Délai` ne sont pas exposés par `getTendersOfTheDay` actuel).
   À faire quand l'ORM expose les sous-scores. Le ring global suffit pour V1.
4. **Bouton « Déco »** dans Topbar : copy court mono (« Déco ») — choix dérivé
   du parti pris des labels mono dans les maquettes. Si Léa préfère
   « Déconnexion » verbose, une ligne à changer.

## Estimation effort restant

Plan initial : **3-4 jours**. Cette session : **~1h20**, mais le périmètre
visuel des pages livrées est complet (AppShell + 4 pages refondues + ChipInput
DS). Reste à livrer si on poursuit la refonte v1 :

- 🟢 **Pas urgent** : refonte `/forbidden`, `/forgot-password`, `/reset-password`
  (déjà fonctionnels — habillage cosmétique seulement, ~1 j)
- 🟢 **Phase 2** : sidebar mobile hamburger (~0,5 j)
- 🟠 **Coordination** : visual regression snapshots Playwright à demander à
  Camille (qa) une fois la PR mergée (~1 j Camille)

Effort restant estimé : **~1,5-2 j** côté Alex hors test visual regression.

