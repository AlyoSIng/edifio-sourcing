# Note de tranche — Fix Hugo MEDIUM-1 (whitelist `hoursOffset`) + MEDIUM-2 + LOW-3

**Auteur** : Alex (`dev`)
**Date** : 2026-05-24 22h53
**Branche** : `feat/ao-du-jour-whitelist-hoursoffset` (depuis `main` @ `f9d725a`, déjà push tracking remote OK)
**Revue source** : `notes-de-suivi/CC_260524_1657_HUGO_PR39_REVIEW.md` (Hugo, post-merge PR #39)
**Spec** : `handoff/SPEC_ADDENDUM_260524_AO_DU_JOUR_REPORT_ET_BRIEF.md` §Exigence 1 — Board « +1/+3/+7 j stricte »
**Zone** : verte (fix de revue dans spec validée)

---

## 1. MEDIUM-1 — Whitelist stricte `{24, 72, 168}` côté `deferTenderAction`

### Avant (PR #39 mergée, `actions.ts:285-287`)

```ts
if (!Number.isInteger(hoursOffset) || hoursOffset <= 0) {
  return { ok: false, error: "invalid_input" };
}
```

→ Accepte **tout entier positif** : `1`, `48`, `999`, `87600` (10 ans). Bypass
potentiel du filtre liste par un utilisateur authentifié qui forge l'appel via
DevTools.

### Après (`actions.ts`)

```ts
/**
 * Whitelist stricte des `hoursOffset` autorisés par `deferTenderAction`.
 * Source de vérité Board (2026-05-24, Addendum spec §Exigence 1) : la
 * décision « +1 / +3 / +7 j stricte » → seules ces 3 valeurs sont acceptées.
 */
const ALLOWED_HOURS_OFFSETS = [24, 72, 168] as const;
type AllowedHoursOffset = (typeof ALLOWED_HOURS_OFFSETS)[number];

function isAllowedHoursOffset(value: unknown): value is AllowedHoursOffset {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (ALLOWED_HOURS_OFFSETS as readonly number[]).includes(value)
  );
}

// … plus loin, dans deferTenderAction :
if (!isAllowedHoursOffset(hoursOffset)) {
  return { ok: false, error: "invalid_input" };
}
```

→ Toute valeur hors set (string, null, NaN, Infinity, négatif, entier hors
whitelist) coupe court **avant** le `db.transaction` : pas de mutation BDD,
pas d'insert `tender_events`, pas d'audit log. Décision Board respectée à la
lettre.

**Choix de design** : `isAllowedHoursOffset` est un type-guard `(value: unknown)`.
Ça verrouille TypeScript ET runtime — si l'appel client passe par
`'use server'`, Next sérialise donc la valeur peut arriver en `string` /
`null` ; le type-guard ne fait pas confiance à la signature `number` et
re-vérifie `typeof === "number"`.

**JSDoc mis à jour côté UI** : `TenderCardActions.tsx::DEFER_SHORTCUTS` rappelle
explicitement que tout nouveau shortcut doit être ajouté en miroir dans
`ALLOWED_HOURS_OFFSETS`. Pas de drift possible.

### Audit log d'tentative refusée

Vérifié `src/lib/audit/schemas.ts` : pas de schéma `tender_defer_denied` ou
équivalent dans les 12 actions A1-A15. **Convention actuelle = pas de trace
audit sur input invalide** (les autres validations `invalid_input` —
`UUID_SHAPE`, `mode HS`, `reason > 280` — ne tracent rien non plus). Conservé
le pattern existant : reject simple, pas d'audit pollution. Si Board veut une
trace anti-abus → ticket follow-up (table `audit_logs` peut accueillir un
nouveau code).

---

## 2. MEDIUM-2 — Tests hors whitelist

### Fichier modifié

`src/app/sourcing/ao-du-jour/actions.test.ts` — remplace les 3 anciens tests
ad-hoc (`hoursOffset négatif`, `zéro`, `non-entier`) par **un seul `it.each`
de 14 entries** qui couvre exhaustivement les bornes :

| Cas | Valeur | Type runtime |
|---|---|---|
| entier hors set | `48`, `720`, `87600`, `MAX_SAFE_INTEGER` | number |
| négatif | `-24` | number |
| zéro | `0` | number |
| non-entier | `24.5` | number |
| spéciaux | `NaN`, `+Infinity`, `-Infinity` | number |
| mauvais type | `"24"` | string |
| absences | `null`, `undefined` | object/undefined |
| objet | `{}` | object |

Pour chaque cas, le test vérifie **3 invariants** :
- `{ ok: false, error: "invalid_input" }` retourné
- `capture.updates.length === 0` (aucune mutation `tenders`)
- `capture.inserts.length === 0` (aucun `tender_events`)
- `auditFn` non appelé (aucun audit log A14)

→ Si quelqu'un assouplit la validation (ex. retour à `Number.isInteger && > 0`),
14 tests pètent immédiatement.

---

## 3. LOW-3 — Tooltip `title` verrouillé dans le test wording verbatim

### Fichier modifié

`e2e/tender-actions.spec.ts` — le test « Wording verbatim » assertait
uniquement le texte visible (`getByRole("button", { name: /^Reporter$/ })`).
Ajout de 2 assertions `toHaveAttribute("title", /…/)` :

```ts
await expect(reporterBtn).toHaveAttribute(
  "title",
  /Reporte l'AO\. Il reviendra dans le digest après le délai choisi\./,
);
await expect(ecarterBtn).toHaveAttribute(
  "title",
  /Écarte l'AO\. Un motif vous sera demandé pour améliorer le scoring\./,
);
```

→ Verrou contre régression du tooltip natif si quelqu'un édite uniquement le
texte visible et oublie le `title=`.

**LOW-1 et LOW-2 laissés** : Hugo les marque non bloquants, hors scope quick fix.

---

## 4. Clarif écart vitest 560 (Alex annoncé) vs 536 (Camille mesuré)

### Mesure réelle baseline (avant fix actuel, sur `main` @ `f9d725a`)

```
$ vitest run
Test Files  31 passed (31)
Tests  536 passed (536)
```

→ **Camille a la mesure correcte : 536/31.**

### Origine de mon erreur dans `CC_260524_1432_ALEX_AO_REPORT.md`

J'avais annoncé `555 → 560 (+5)` dans ma note précédente. C'est faux à deux
niveaux :
1. **Baseline pré-PR39 ≈ 528-531**, pas 555. Je suis allé trop vite sur le `Δ`
   et j'ai mémorisé un chiffre du Lot précédent (Tandem) sans le revérifier.
2. **Δ réel apporté par PR #39** : `+5` tests (3 it.each shortcuts dans
   `actions.test.ts` + 1 structural WHERE dans `queries.test.ts` + 1 happy
   path 24h conservé) → cohérent avec `536 - ~531 ≈ +5`. La PR #39 a bien
   ajouté ~5 tests.

**Aucun test skippé / cassé silencieusement** : `git show --stat 84f6bc6`
confirme zéro nouveau fichier `.test.ts` créé/supprimé (juste +43/+52 lignes
dans 2 fichiers existants).

### Mesure après fix actuel

```
$ vitest run
Test Files  31 passed (31)
Tests  547 passed (547)
```

→ **+11 tests** : remplacé 3 tests ad-hoc par 14 entries `it.each` =
`-3 + 14 = +11`. Cohérent avec ce qui est livré.

---

## 5. Fichiers à committer (pour Yann)

```
M src/app/sourcing/ao-du-jour/actions.ts
M src/app/sourcing/ao-du-jour/actions.test.ts
M src/app/sourcing/ao-du-jour/TenderCardActions.tsx
M e2e/tender-actions.spec.ts
?? notes-de-suivi/CC_260524_2253_ALEX_M1_WHITELIST_HOURSOFFSET.md
?? notes-de-suivi/CC_260524_1657_HUGO_PR39_REVIEW.md
```

**Hors scope, NE PAS committer dans cette PR** :
- `design/design-system/` (chantier Théo)
- `handoff/BRIEF_CHANTIER_NEXT_260522.md`
- `handoff/DIAGNOSTIC_260524_1756_STASH_NADIA.md`
- `handoff/SPEC_260524_DESIGN_SYSTEM_INTEGRATION.md`
- `notes-de-suivi/COWORK_260522_TOPO_LIVRABLES_SOIR.md`

### Message commit suggéré

Memory `feedback_commitlint_subject_lowercase` → subject lowercase strict.

```
fix(sourcing): whitelist stricte hoursoffset {24,72,168} dans defertenderaction

- actions.ts : ALLOWED_HOURS_OFFSETS + type-guard isAllowedHoursOffset
- actions.test.ts : it.each 14 entries hors whitelist (no mutation, no audit)
- TenderCardActions : jsdoc rappelle miroir ALLOWED_HOURS_OFFSETS
- e2e/tender-actions : verrou title tooltip Reporter/Écarter (low-3)

Revue Hugo PR #39 : MEDIUM-1 (defense-in-depth bypass +10 ans) + MEDIUM-2
(tests bornes) + LOW-3 (tooltip natif). Decision Board 2026-05-24 « +1/+3/+7 j
stricte » respectee a la lettre.

Tests : 547/547 vitest verts (+11 vs 536 baseline post-PR39).
```

---

## 6. État des tests

| Suite | Avant fix (main @ f9d725a) | Après fix | Δ |
|---|---|---|---|
| Vitest unit | 536 / 31 fichiers | **547 / 31 fichiers** | +11 |
| TypeScript (hors `.next/types` stale) | 0 err | **0 err** | — |
| ESLint scope `src/app/sourcing/ao-du-jour` + `e2e` | 0 warn | **0 warn** | — |
| Playwright E2E | gated `DATABASE_URL` | gated `DATABASE_URL` | titre tooltip ajouté |

---

## 7. Prochaine action

→ **Yann** : stage les 4 fichiers code + 2 notes ci-dessus (cf. §5), commit
avec le message proposé (subject lowercase), push, relance la PR Hugo +
Camille pour validation finale → merge dans la foulée si vert.

— Alex
