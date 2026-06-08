# PRÉP — Lot 1 : Upgrade Next 14.2 → 15.x / React 18.3 → 19.x

> Steve 2026-06-08 — préparation Lot 1 (fenêtre 12-17 juin 2026, prérequis
> alignement avec le monorepo Suivi+ACT qui tourne déjà sur Next 15.5 / React 19).
>
> Audit en lecture seule avant ouverture de la branche `chore/upgrade-next15-react19`.
> Sert de checklist d'exécution pour ne rien rater.

## 1. Pourquoi cet upgrade

| Repo | Next | React |
|---|---|---|
| edifio-sourcing (actuel) | **14.2.35** | **18.3.1** |
| alyos-suivi-chantier (cible) | **15.5** | **19** |

Sans upgrade, la migration `sourcing/*` vers le monorepo échoue dès la première
import : la signature des Server Actions, le typage `params`, et le pattern
Client/Server diffèrent en Next 15.

**Conclusion CR visio §4** : upgrader Sourcing AVANT la bascule, en autonomie,
sur sa branche jetable. Réduit l'effort de migration de plusieurs jours.

## 2. Périmètre impacté (audit grep)

### 2.1 Breaking change #1 — `params` & `searchParams` async

Next 15 transforme `params: { id: string }` en `params: Promise<{ id: string }>`.
Idem `searchParams`.

**Impact** : **32 occurrences dans 25 fichiers**.

Pages dynamiques `app/*` les plus exposées :
- `src/app/sourcing/ao/[id]/**` (8 fichiers : page, tandem, dossier, cerfa, pieces…)
- `src/app/sourcing/superadmin/organizations/[id]/**` (3 fichiers : page, billing/page, autre)
- `src/app/sourcing/{architectes,bureaux-etudes,entreprises}/[id]/page.tsx`
- `src/app/sourcing/profil/formations/[slug]/page.tsx`
- `src/app/archi/[token]/page.tsx`, `src/app/cotraitant/[token]/page.tsx`,
  `src/app/archi/opposition/[token]/page.tsx`
- Routes API : `api/admin/users/[id]/regenerate-password`,
  `api/archi/[token]/respond`, `api/webhooks/brevo`

**Transformation à faire** :
```ts
// AVANT
export default async function Page({ params }: { params: { id: string } }) {
  const { id } = params;
}
// APRÈS
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}
```

**Automatisable** via le codemod officiel :
```bash
npx @next/codemod@canary next-async-request-api .
```
À lancer en début de Lot 1 → couvre ~90 % des sites. Le reste est manuel.

### 2.2 Breaking change #2 — `cookies()` & `headers()` async

Same story : retournent maintenant des `Promise`.

**Impact** : **3 occurrences dans 3 fichiers** (très faible).
- `src/lib/supabase/server.ts` (createSupabaseServerClient — point névralgique)
- `src/components/app-shell/Sidebar.tsx`
- `src/app/api/test/seed-session/route.ts`

**Transformation** :
```ts
// AVANT
const cookieStore = cookies();
// APRÈS
const cookieStore = await cookies();
```

`createSupabaseServerClient` est appelé partout via `await` (déjà async) →
la propagation est triviale, le codemod la gère.

### 2.3 Breaking change #3 — React 19 typings

React 19 modifie :
- `useFormState` → renommé `useActionState` (déplacé de `react-dom` à `react`)
- `JSX.IntrinsicElements` accessible via `React.JSX.IntrinsicElements`
- `forwardRef` n'est plus nécessaire pour les `ref` props (Next gère)

**Impact `useFormState`** : 4 fichiers seulement.
- `src/app/forgot-password/ForgotPasswordForm.tsx`
- `src/app/reset-password/ResetPasswordForm.tsx`
- `src/app/sourcing/admin/profil/ProfileForm.tsx`
- `src/app/login/LoginForm.tsx`

Codemod React 19 :
```bash
npx codemod@latest react/19/use-action-state
```

### 2.4 Breaking change #4 — `next/font` → maintenant `next/font` (renamed)

Déjà OK depuis Next 13 — vérifier.

### 2.5 Caching changes (Next 15)

Next 15 modifie les défauts de cache :
- `GET` route handlers : **non cachés par défaut** (Next 14 = cachés)
- `fetch()` requests : **non cachés par défaut** (Next 14 = cachés)
- `<Link>` client-side : **prefetch full = false par défaut**

**Impact** : à auditer manuellement sur nos routes API GET + les call sites
fetch() dans `lib/`. Risque de **régression perf** silencieuse → ajouter
`export const dynamic = 'force-static'` ou `cache: 'force-cache'` aux call sites
qui en bénéficiaient.

À auditer : tous les `route.ts` GET + tous les `fetch(` non-Anthropic
non-Brevo dans `lib/`.

## 3. Dépendances satellites à upgrader

Versions actuelles :
| Package | Actuel | Cible Next 15 / React 19 |
|---|---|---|
| `next` | 14.2.35 | **15.x** (dernière stable) |
| `react` | ^18.3.1 | **^19** |
| `react-dom` | ^18.3.1 | **^19** |
| `@types/react` | ^18.3.28 | **^19** |
| `@types/react-dom` | ^18.3.7 | **^19** |
| `eslint-config-next` | 14.2.35 | **15.x** |
| `@playwright/test` | ^1.59.1 | OK (compat) |
| `tailwindcss` | ^3.4.19 | OK (compat) |
| `typescript` | ^5.9.3 | OK (compat React 19 dès 5.4) |
| `vitest` | ^4.1.5 | OK (compat) |
| `zod` | 4.1.13 | OK (compat) |

À surveiller (peut nécessiter bump mineur) :
- `lucide-react` (déjà compat 19 si récent)
- `react-hook-form` (compat 19 dès v7.54)
- toute lib avec un peer dep `react@^18` strict → à patcher au cas par cas

## 4. Plan d'exécution proposé (3 jours / 2 personnes-jour)

### Jour 1 — Codemods automatisés (4 h)
1. Branche `chore/upgrade-next15-react19` depuis main
2. `pnpm add next@15 react@19 react-dom@19 @types/react@19 @types/react-dom@19 eslint-config-next@15`
3. Codemod `next-async-request-api` → commit séparé `chore: async params/searchParams (codemod)`
4. Codemod `react/19/use-action-state` → commit séparé
5. `pnpm typecheck` → reste rouge à ce stade, normal

### Jour 2 — Fixes manuels (6-8 h)
1. Fix typecheck : tous les sites manqués par les codemods
2. Audit cache : route handlers GET + fetch() → ajouter `force-static`/`cache: 'force-cache'` aux endroits sensibles (export CSV, /sourcing/ao-du-jour, etc.)
3. `pnpm lint` → fix warnings React 19 (refs, useFormStatus signatures)
4. `pnpm test` → adapter les tests qui mockaient `params` ou `cookies()`
5. `pnpm build` → vérifie qu'on compile

### Jour 3 — Validation E2E + smoke (4 h)
1. `pnpm test:e2e` Playwright sur les flows critiques (login, dossier, AO du jour)
2. Smoke local : navigation manuelle 10 min sur l'app
3. Si OK : push branche, ouvrir PR vers main
4. **Review obligatoire : suivi_act_reviewer** (sub-agent Sébastien) — il doit valider la conformité Next 15 monorepo
5. Si reviewer OK : Hugo (`reviewer`) en seconde lecture
6. Merge main si CI verte

## 5. Risques identifiés

| Risque | Mitigation |
|---|---|
| Codemod casse un fichier obscur | Commits séparés codemod vs fix manuel → git revert facile |
| Cache régression silencieuse | Audit manuel exhaustif des route handlers GET et fetch() |
| `supabase/server.ts` cookies() async impacte 100+ appels | Une seule fonction à patcher (déjà async) → propagation gérée par TS |
| Lib tierce incompatible React 19 | `--legacy-peer-deps` en fallback, sinon attendre v compatible |
| Tests mockent params sync | Refacto mocks pour wrapper en `Promise.resolve()` |
| Drizzle / Supabase Auth incompat | Aucune (Drizzle 0.39 + supabase-js compat React 19) |

## 6. Critères de fin de Lot 1

- [ ] `pnpm typecheck` vert
- [ ] `pnpm lint --max-warnings 0` vert
- [ ] `pnpm test` vert (toute la suite Vitest)
- [ ] `pnpm test:e2e` vert sur 3 flows critiques (login, AO du jour sélectionner/écarter, dossier compile ZIP)
- [ ] `pnpm build` vert env-clean (sans DATABASE_URL — règle MEMORY)
- [ ] PR ouverte avec checklist d'audit cache cochée
- [ ] suivi_act_reviewer vert (G1-G8 ok pour Next 15)
- [ ] Hugo (reviewer) vert

## 7. Effort total

- Audit (ce doc) : ✅ fait (~1 h)
- Codemods + install : ~4 h
- Fix manuel typecheck : ~6 h
- Audit cache + fix : ~4 h
- E2E + smoke : ~4 h
- Review + corrections : ~4 h
- **Total : ~22 h / ~3 jours-homme**

Aligne avec le brief migration v2 (Lot 1 estimé 2-4 j).

---

**Statut : prêt à dérouler dès fin Lot 0b (POC chromium-min).**
