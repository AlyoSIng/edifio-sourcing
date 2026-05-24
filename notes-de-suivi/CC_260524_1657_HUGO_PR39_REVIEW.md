# Revue PR #39 — AO du jour : popover Reporter +1j/+3j/+7j + wording Écarter/Reporter

**Relecteur** : Hugo (`reviewer`)
**Date** : 2026-05-24 16h57
**Branche** : `feat/ao-du-jour-report-shortcuts` @ `84f6bc6`
**URL PR** : https://github.com/AlyoSIng/edifio-sourcing/pull/39
**Spec source** : `handoff/SPEC_ADDENDUM_260524_AO_DU_JOUR_REPORT_ET_BRIEF.md` §Exigence 1
**Périmètre** : 7 fichiers, +464 / -49 (2 composants UI client + 3 fichiers tests + 2 notes)

---

## Verdict global

**APPROUVÉ AVEC RÉSERVES**

La PR fait ce que la spec demande : popover Reporter avec 3 shortcuts (24h/72h/168h),
wording UI verbatim (« Reporter » / « Écarter »), identifiants techniques inchangés,
tests étendus solides. **Aucun bloquant sécurité.** Une réserve **MEDIUM** sur le
bornage de `hoursOffset` (validation trop permissive côté serveur) à arbitrer Board
avant merge — `2 medium` + `3 low` au total.

CI locale verte :
- `vitest run src/app/sourcing/ao-du-jour/actions.test.ts src/lib/sourcing/queries.test.ts` → **36/36 PASS** (1.51 s)
- `tsc --noEmit` → **0 erreur**
- `next lint` sur `src/app/sourcing/ao-du-jour` + `e2e` → **0 warning**

---

## Périmètre vérifié

### 1. Server Actions inchangées — OK

`src/app/sourcing/ao-du-jour/actions.ts` non modifié par la PR (vérifié `git show 84f6bc6`).
Signatures, validation, transaction, audit log A14/A15, RLS-via-`organizationId` filter
identiques à PR n°5. **Aucun bypass introduit.**

### 2. Calcul `deferred_until` côté serveur — OK (sécurité)

`actions.ts:303` :
```ts
deferredUntil: sql`now() + (${hoursOffset} * interval '1 hour')`
```
Le client n'envoie **que** un entier `hoursOffset`. Le `now() + interval` est calculé
côté Postgres. **Aucun risque qu'un client malicieux envoie une date `deferred_until`
arbitraire** pour bypass le filtre liste. RETURNING relit la valeur calculée, audit log A14
trace l'ISO réel. Bon pattern, conservé.

### 3. Popover — sécurité / a11y — OK

`TenderCardActions.tsx:177-211` :
- Pas de `dangerouslySetInnerHTML`, pas d'`innerHTML`, rendu React pur → **pas de XSS possible**.
- `aria-haspopup="menu"` + `aria-expanded` dynamique + `role="menu"` / `role="menuitem"` :
  conforme ARIA Authoring Practices.
- Click-outside via `mousedown` window listener + `node.contains(e.target)` correct.
- Escape via `keydown` window listener.
- Cleanup `removeEventListener` dans le `return` du `useEffect` : pas de leak.
- Pas de dépendance Radix ajoutée (KISS conforme JSDoc).

### 4. Wording verbatim — OK

Recherche `Grep "Différer|Rejeter"` sur `src/` :
- `TenderCard.tsx:10` : commentaire JSDoc legacy, **pas du wording UI**.
- `page.tsx:22` : commentaire JSDoc legacy, **pas du wording UI**.
- `db/schema/tenders.ts:71` : doc colonne, **pas du wording UI**.
- `lib/sourcing/queries.ts:14` : commentaire, **pas du wording UI**.
- `lib/audit/schemas.ts:266` + `:291` : doc des audit actions A14/A15, **identifiants techniques inchangés conformément à la spec**.

Les identifiants techniques `tender_defer`, `tender_reject`, `eventType=deferred`, `eventType=rejected`,
`status='dropped'`, `deferTenderAction`, `rejectTenderAction` sont **tous préservés** comme demandé.

### 5. Memory `feedback_nextjs_build_env_clean` — OK

Recherche `Grep "@/db/client"` sur `src/app/sourcing/ao-du-jour/` :
- `actions.ts:41` : OK, c'est un fichier `"use server"`.
- `page.tsx:5` : OK, c'est un Server Component avec try/catch absorbé.
- **`TenderCardActions.tsx` et `RejectReasonModal.tsx` ne touchent PAS `@/db/client`** : pas de nouvel import top-level qui ferait planter `next build` env-clean.

### 6. Memory `feedback_nextjs_runtime_page_resilience` — OK

`page.tsx:70-82` conserve le try/catch absorbé + ErrorBanner. Aucune nouvelle code path
ajoutée par la PR ne contourne cette protection (la PR ne touche pas `page.tsx`).

### 7. Tests — globalement solides

- **`actions.test.ts`** (+43 lignes) : nouveau `it.each` sur les 3 shortcuts (24/72/168) qui
  vérifie audit `hours_offset` ET `tender_events.data.extra.hours_offset`. Bon verrou contre
  un cap silencieux ou off-by-one.
- **`queries.test.ts`** (+52 lignes) : verrou structural via `PgDialect.sqlToQuery()` sur
  les 4 conditions WHERE (`organization_id`, `status`, `deadline`, `deferred_until`). C'est un **vrai garde-fou**
  (pas un snapshot fragile) — si quelqu'un retire le filtre `deferred_until` lors d'un refacto,
  les regex `/"deferred_until"\s+is\s+null/i` et `/"deferred_until"\s*<\s*now\(\)/i` pètent.
- **`e2e/tender-actions.spec.ts`** (+74 lignes) : nouveau test « Reporter — popover ouvre 3 shortcuts »
  + test « Wording verbatim — Différer/Rejeter ont disparu ». Test skip-policy documentée
  (cf. JSDoc, conforme consigne « ne jamais désactiver pour verdir CI »).

---

## Findings priorisés

### MEDIUM-1 — `deferTenderAction` n'a pas de whitelist stricte `{24, 72, 168}`

**Fichier** : `src/app/sourcing/ao-du-jour/actions.ts:285-287` (inchangé par la PR, mais nouvellement exposé par les shortcuts)
**Constat** :
```ts
if (!Number.isInteger(hoursOffset) || hoursOffset <= 0) {
  return { ok: false, error: "invalid_input" };
}
```
La validation accepte **tout entier positif** : `1`, `48`, `999`, `87600` (10 ans), `Number.MAX_SAFE_INTEGER`.

**Risque concret** :
- Un utilisateur authentifié `@alyosingenierie.fr` peut, via DevTools, appeler
  `deferTenderAction(uuid, 87600)` pour différer un AO de 10 ans → il sort du digest
  AO du jour quasi-définitivement. **Bypass du filtre liste possible côté client.**
- Ce n'est pas un vecteur externe (auth + domaine requis), mais c'est un écart de
  défense-en-profondeur : la source de vérité UI déclare 3 valeurs (`DEFER_SHORTCUTS`,
  `TenderCardActions.tsx:64-68`), le serveur devrait re-valider la même whitelist.

**Recommandation** :
```ts
const ALLOWED_HOURS_OFFSETS = [24, 72, 168] as const;
if (!ALLOWED_HOURS_OFFSETS.includes(hoursOffset as (typeof ALLOWED_HOURS_OFFSETS)[number])) {
  return { ok: false, error: "invalid_input" };
}
```
Ou bornage souple `0 < hoursOffset <= 24 * 30` (max 30 jours) si la spec V1.x prévoit
une date picker custom. **Décision Board nécessaire** : la spec Exigence 1 dit « +1 / +3 / +7 j,
ou date au choix » — laisser une porte ouverte pour la date au choix ? Si oui, MEDIUM-1 devient LOW.

**Action** : à arbitrer par Sophie (CTO) avant merge. Le commentaire JSDoc dans
`TenderCardActions.tsx:60-63` dit lui-même « le server action ré-valide `hoursOffset > 0
entier` — toute valeur cohérente passe » : c'est aligné avec le code mais pas avec une
défense stricte côté serveur.

### MEDIUM-2 — `actions.test.ts` ne teste pas les bornes hors whitelist

**Fichier** : `src/app/sourcing/ao-du-jour/actions.test.ts:456-484`
**Constat** : tests existants pour `hoursOffset` négatif, zéro, non-entier. **Manque** :
- `hoursOffset = 48` (hors whitelist mais entier positif) → actuellement PASS (devient `{ ok: true }`)
- `hoursOffset = 999999` (bornage absent)
- `hoursOffset = NaN` → `Number.isInteger(NaN) === false` → OK déjà couvert via le test « non-entier »
- `hoursOffset = Infinity` → `Number.isInteger(Infinity) === false` → OK couvert

**Recommandation** : si Board tranche pour whitelist stricte (MEDIUM-1), ajouter au moins
1 test `it("rejette hoursOffset = 48 (hors whitelist)")`. Si Board tranche pour bornage
souple, ajouter `it("rejette hoursOffset > 30 jours (720h)")`.

### LOW-1 — Click-outside listener sur `mousedown` peut consommer le clic du bouton parent

**Fichier** : `src/app/sourcing/ao-du-jour/TenderCardActions.tsx:118-123`
**Constat** : le listener click-outside est posé sur `mousedown` (pas `click`). Comme le
bouton « Reporter » lui-même est **dans** `deferContainerRef`, `node.contains(e.target)` est
true → pas de fermeture immédiate. **OK fonctionnellement.** Edge case potentiel : si un
parent intercepte `mousedown` et `stopPropagation()` ailleurs dans la page, le listener
serait court-circuité. Pas observé pour le moment.

**Recommandation** : aucune action requise V1. Documenter dans un commentaire « si on
ajoute des dropdowns concurrents, considérer un focus trap / portail Radix ».

### LOW-2 — Pas de focus management quand le popover s'ouvre

**Fichier** : `src/app/sourcing/ao-du-jour/TenderCardActions.tsx:191-211`
**Constat** : à l'ouverture du popover, le focus reste sur le bouton « Reporter ». L'utilisateur
clavier doit faire Tab pour naviguer vers le premier `menuitem`. Pour un vrai pattern
ARIA `menu`, le focus devrait sauter automatiquement sur le premier `menuitem`, et les
flèches Up/Down devraient naviguer entre items (cf. WAI-ARIA Authoring Practices §Menu).

**Recommandation** : nice-to-have pour V1.x — ajouter `useEffect` qui pose `focus()` sur
le premier `menuitem` à l'ouverture + handler `ArrowDown/ArrowUp`. **Non bloquant**, la PR
est utilisable au clavier via Tab.

### LOW-3 — Test E2E « Wording verbatim » ne vérifie pas les ARIA labels

**Fichier** : `e2e/tender-actions.spec.ts:177-189`
**Constat** : le test vérifie le **texte visible** des boutons (`getByRole("button", { name: /^Reporter$/i })`).
La maquette pourrait régresser si quelqu'un mettait un `aria-label="Différer cet AO"`
sur le bouton (alors que le texte visible reste « Reporter »). Playwright `name` matche
l'accessible name (qui prend l'aria-label en priorité), donc en pratique c'est couvert,
**mais** on ne teste pas explicitement le `title` (tooltip natif).

**Recommandation** : ajouter une assertion `expect(reporterBtn).toHaveAttribute("title", /Reporte l'AO/)`
si on veut verrouiller le tooltip. Nice-to-have.

---

## Décision recommandée

**APPROUVÉ AVEC RÉSERVES** — merge possible **après arbitrage Board sur MEDIUM-1** :

- **Option A (recommandée par Hugo)** : Alex ajoute la whitelist stricte `{24, 72, 168}` côté `deferTenderAction`
  + 1 test `actions.test.ts` qui rejette `hoursOffset = 48`. Effort estimé : **15 minutes**.
  Re-soumission pour relecture express → merge le même jour.
- **Option B** : Board accepte le bornage souple actuel (entier positif) au motif que V1.x prévoira
  une date picker custom (cf. spec « ou date au choix »). Dans ce cas : ajouter au minimum un
  bornage `hoursOffset <= 720` (30 jours max) pour éviter le « différé 10 ans ». Effort : **10 minutes**.
- **Option C** : merge tel quel et ouvrir un ticket follow-up sécurité avec deadline P1.
  Acceptable mais expose à un finding QA Camille / Phase 2 audit.

LOW-1 / LOW-2 / LOW-3 → suggestions, **pas de blocage**.

**Sécurité** : pas de bypass auth, pas de RLS contournée, audit log A14/A15 immutable
inchangé, secret-free, pas de nouvel import `@/db/client` côté client. **Aucun veto.**

---

Hugo
