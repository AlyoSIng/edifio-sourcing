# Note de suivi — P2 écran admin `/sourcing/admin/profil` (Alex)

**Date** : 2026-05-22, 13h58 FR
**Auteur** : Alex (`dev`)
**Statut** : Zone verte — pour information Board (delegation niveau ÉQUILIBRÉ)
**Branche cible** : `feat/admin-profil-search` (à créer depuis `feat/sourcing-mvp` à jour)
**Effort estimé restant** : ~3 jours (cf. PLAN_ALEX_260522 P2)

---

## Sources lues

- `handoff/PLAN_ALEX_260522_REFONTE_UI.md` §P2 (le plan validé)
- `CLAUDE.md` + 5 recos Q1-Q5 validées Board 22/05 soir (DECISIONS.md)
- `specs/audit_log_v1.md` §A3 (`search_profile_change`)
- `specs/module_sourcing_engine_v1.md` §3.5 (matchesProfile)
- `src/db/schema/config.ts` (table `search_profiles` — déjà OK pour P2, pas de modif schéma)
- `src/db/schema/enums.ts` (A3 `search_profile_change` déjà alloué dans `auditAction`, pas de touche)
- `src/db/types/jsonb.ts` (`SearchProfileKeywords` + `AuditLogDataSearchProfileChange`)
- `src/lib/audit/index.ts` + `schemas.ts` (le placeholder `searchProfileChangeSchema` est à upgrader strict)
- `src/lib/sourcing/queries.ts` (pattern lecture profil)
- `src/app/sourcing/ao-du-jour/actions.ts` (pattern Server Action + audit + revalidatePath)
- `src/app/sourcing/admin/users/page.tsx` (pattern Server Component admin auth-check)
- `src/db/seed/prod.ts` (structure profil AlyoS seedé : keywords + cpv 45/71 + geo 33/40/47/64 + 33000)

---

## Constat préalable

- **WT clean** sur `feat/sourcing-mvp` au commit `7c41be4` (PR #27 mergée). Pull à jour avec PR #26 + #27.
- **A3 `search_profile_change` est déjà dans l'enum Postgres** `audit_action` (cf. `enums.ts:124`).
  Aucune nouvelle migration BDD à créer. Aucun risque de conflit avec Nadia (étape Tandem A16).
- **`searchProfileChangeSchema` est PLACEHOLDER** côté `src/lib/audit/schemas.ts:140` —
  je l'upgrade en strict (`operation` enum, `diff` map, `profile_id` UUID).
- **`exact_keywords` non câblé dans `filter.ts`** (PR #26 mergée). Décision par défaut (cf. brief) :
  je l'expose en édition dans le form mais ne touche pas à `filter.ts`. REQUEST clarification posté.
- **Schéma `search_profiles` complet** : `keywords` JSONB (positive/negative/exact), `cpv_codes`
  text[], `geo_zones` text[], `market_types` text[], `amount_min/max` numeric, `active` boolean.
  **Aucune migration nécessaire**, on édite ce qui existe.

---

## Plan court (5 étapes)

1. **Helpers BDD** `src/lib/profile/queries.ts` (NEW) — `getActiveSearchProfile()` + `updateSearchProfile()`,
   mock-friendly (DI client Drizzle), filtre tenant explicite `organization_id = ALYOS_ORG_ID`,
   defense-in-depth + `WHERE id = $1 AND organization_id = $2`. Pas de modif schéma.
2. **Schéma Zod** `src/lib/profile/schema.ts` (NEW) — `searchProfileUpdateSchema` avec contraintes
   strictes Q3/Q4/Q5 : array ≤ 100, string ≤ 100, dedup + trim, CPV `/^\d{2,8}$/`, geo FR
   `/^\d{2,3}$/ | /^2[AB]$/`, marketTypes enum fermé, montants ≥ 0 et `min ≤ max` (refine).
   Upgrade en passe le placeholder A3 `searchProfileChangeSchema` en strict.
3. **Server Action** `src/app/sourcing/admin/profil/actions.ts` (NEW) — `updateProfileAction()`,
   auth + isAdmin defense-in-depth, parse Zod, transaction Drizzle (UPDATE + computed `diff`),
   audit A3 `search_profile_change` non-bloquant post-commit, `revalidatePath`
   `/sourcing/admin/profil` + `/sourcing/ao-du-jour`.
4. **Page + Form** `src/app/sourcing/admin/profil/page.tsx` (Server Component, NEW) +
   `ProfileForm.tsx` (Client Component, NEW) + `ChipInput.tsx` (Client Component, NEW) — pattern
   identique à `/sourcing/admin/users/page.tsx` (EdifioLogo + footer mono). 8 sections d'édition :
   positive / negative / exact keywords (ChipInput), CPV (ChipInput regex digit), geo (ChipInput
   regex département FR), marketTypes (multi-select enum), amountMin / amountMax (numeric inputs).
5. **Tests Vitest + Scaffold E2E** : `src/lib/profile/queries.test.ts` (mocks Drizzle, mêmes patterns
   que `queries.test.ts` existant) + `src/lib/profile/schema.test.ts` (valid/invalid cases) +
   `src/lib/audit/schemas.test.ts` (upgrade test A3 placeholder → strict) +
   `e2e/admin-profil.spec.ts` (scaffold 5 scénarios, `test.fixme` pour Camille).

---

## Questions résiduelles à grouper en REQUEST

- 🟠 **Q-exact_keywords** : strict match (casse + accents) ? insensible casse+accents (cohérent
  filter.ts post-PR #26) ? keyword d'exclusion de marque ? clarifier avant câblage `filter.ts`.
  Décision par défaut V1 : éditable dans le form, pas câblé filter.ts (PR séparée).
- 🟠 **Q-CPV wildcard** : la spec §3.5 mentionne `45*` (préfixe famille). Je permets en lecture
  côté `filter.ts` (déjà géré par `startsWith()`), mais en saisie form je valide uniquement
  digits 2-8 sans wildcard explicite. OK ? Si oui je documente que `45` (2 digits) = wildcard
  préfixe famille construction BTP.
- 🟠 **Q-`active` toggle** : la spec Q2 du Board 22/05 est « 1 profil unique éditable ».
  Donc je n'expose PAS le toggle `active` dans cette PR (le profil existant reste actif). OK ?

---

## Coordination

- ❌ Pas de touche `src/db/schema/*` (Nadia A16 + déjà OK pour P2)
- ❌ Pas de touche `src/db/migrate.ts`, `src/middleware.ts`, `src/lib/text/normalize.ts`,
  `src/lib/sourcing/filter.ts`, `src/app/globals.css`, `tailwind.config.ts`, `src/app/layout.tsx`
- ❌ Pas de touche `.env*` (Yann gère JWT architects)
- ✅ `src/lib/audit/schemas.ts` : upgrade A3 placeholder → strict — pas de conflit avec Nadia
  (elle bosse sur `architects` enum, pas `audit_action`)
- ✅ Branche dédiée `feat/admin-profil-search` (je la créerai en local, Yann commitera dessus)
- ✅ Pas de commit ni push : Yann reprend la main pour le commit Conventional `feat(admin): ...`

---

## Méthode

- TDD light : tests Vitest **après** code mais avant push (CI = filet de sécurité — pgTAP RLS
  cross-tenant déjà couvert par PR antérieures pour `search_profiles`)
- Camille (qa) prendra le relais sur E2E + RLS cross-tenant fine
- Hugo (reviewer) check : (a) auth+isAdmin defense-in-depth, (b) Zod côté serveur jamais bypass
  client, (c) audit A3 posé après commit, (d) `revalidatePath` sur les 2 routes impactées

→ Démarrage immédiat P2.1.
