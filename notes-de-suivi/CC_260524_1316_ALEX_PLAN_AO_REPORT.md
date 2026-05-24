# Plan court — Quick win « AO du jour : report + écarter »

**Auteur** : Alex (`dev`)
**Date** : 2026-05-24 13h16
**Spec** : `handoff/SPEC_ADDENDUM_260524_AO_DU_JOUR_REPORT_ET_BRIEF.md` §Exigence 1
**Décisions résiduelles** : `handoff/ANSWER_260524_ALEX_P2_PROFIL_RESIDU.md`
**Zone** : 🟢 verte — spec validée Board, plan posté pour information.

---

## Constat de départ (audit du code existant)

Une grande partie de la spec **est déjà implémentée** par la PR n°5 (mergée
2026-05-21, arbitrages Board A/B/C). Détail :

- ✅ Colonne `tenders.deferred_until` existe (migration 0004) + index partiel.
- ✅ Enum `audit_action` : `tender_defer` (A14) et `tender_reject` (A15) déjà alloués.
- ✅ `getTendersOfTheDay()` filtre **déjà** :
  `status='sourced' AND (deadline IS NULL OR deadline > now()) AND (deferred_until IS NULL OR deferred_until < now())`
  → conforme stricte à la spec Exigence 1.
- ✅ Server Action `rejectTenderAction` → `status='dropped'` + audit `tender_reject` + `tender_events`.
- ✅ Server Action `deferTenderAction` → pose `deferred_until` + audit `tender_defer` + `tender_events`.
- ✅ Carte AO : 3 boutons Sélectionner / Différer / Rejeter avec modales.

**→ Aucune migration BDD nécessaire. Le filtre SQL est déjà bon. L'audit log est déjà câblé.**

## Écarts vs spec Exigence 1 (à corriger)

1. **UX « Reporter »** : aujourd'hui un bouton « Différer » qui pose un offset
   fixe de **24h**. La spec demande des **shortcuts +1j / +3j / +7j** (laissé
   à mon appréciation UX). Je retiens un **popover shadcn** au clic sur
   « Reporter » avec 3 boutons rapides +1j / +3j / +7j (pas de date picker
   custom en V1 — KISS, on revisera si besoin).
2. **Wording** : « Rejeter » → **« Écarter »** (verbatim spec Board). « Différer »
   → **« Reporter »** (verbatim spec Board). À aligner aussi sur la modale
   `RejectReasonModal` (titre + libellés).
3. **Test unit query** : ajouter explicitement des cas
   `deadline=null/futur/passé` × `deferred_until=null/futur/passé` (aujourd'hui
   couverts implicitement, on verrouille avec assertions ciblées sur la
   construction du WHERE — pattern existant dans `queries.test.ts`).
4. **Test E2E** : `e2e/tender-actions.spec.ts` existe déjà — je vérifie qu'il
   couvre bien « clic Écarter → AO disparait » et « clic Reporter +3j → AO disparait ».
   Si non, je complète.

## Pas dans le scope de ce quick win

- KPI compteur « Nouveaux aujourd'hui » vs « En attente » (spec §UI marquée
  « souhaitable mais non bloquant »). Je le note au backlog Lot B, on prendra
  position après le brief IA.
- Migration RLS / pgTAP nouveau test : pas de nouvelle colonne, donc rien à
  ajouter côté policies — les actions Écarter/Reporter passent déjà par les
  policies tenant_isolation existantes (audit pgTAP `08_tender_actions_cross_tenant.sql`
  cité dans `queries.test.ts`).
- Audit log nouvelle action : on réutilise `tender_defer` / `tender_reject`,
  pas d'`ALTER TYPE audit_action ADD VALUE`.

## Plan d'exécution (5 étapes)

1. **Yann** : créer branche `feat/ao-du-jour-report-shortcuts` depuis `main`
   (je suis sur `feat/sidebar-mobile-hamburger` actuellement).
2. **Wording** : renommer libellés UI dans `TenderCardActions.tsx`,
   `RejectReasonModal.tsx`, tooltips, `actions.ts` JSDoc. Code identifiants
   anglais inchangés (`rejectTenderAction`, `deferTenderAction` — interne).
3. **UX Reporter** : remplacer le clic direct « Différer » par un popover
   shadcn (`<Popover>` + 3 boutons « +1 jour », « +3 jours », « +7 jours »).
   Mapping côté action : 24 / 72 / 168 heures. Garde-fou `hoursOffset` validation
   serveur déjà OK (>0 entier).
4. **Tests** :
   - Vitest : étendre `actions.test.ts` avec 3 cas `hoursOffset=24|72|168` →
     audit `hours_offset` correct.
   - Vitest : compléter `queries.test.ts` avec assertions ciblées sur les 4
     conditions du WHERE (org/status/deadline/deferred_until).
   - E2E `tender-actions.spec.ts` : ajouter clic Reporter +3j → AO disparait
     + clic Écarter → AO disparait. Vérifier rendu wording « Écarter » / « Reporter ».
5. **Note de suivi** : `notes-de-suivi/CC_260524_HHMM_ALEX_AO_REPORT.md` +
   PR ouverte avec checklist Camille (tests verts) / Hugo (revue).

## Risques / blocages anticipés

- **shadcn `Popover`** : vérifier qu'il est installé (`pnpm list @radix-ui/react-popover`).
  Sinon `pnpm add` + Yann commit le `pnpm-lock.yaml`.
- **Pas de DDL** dans ce quick win → la memory `feedback_postgres_dry_run_local` ne
  s'applique pas. Idem `feedback_nextjs_build_env_clean` (pas de nouvel import
  `@/db/client` dans middleware/route nouvelle).
- **Memory `feedback_nextjs_runtime_page_resilience`** : la page est déjà
  wrappée try/catch + ErrorBanner (PR #22). Rien à ajouter.

## Démarrage

J'attaque l'étape 1 (demande Yann) en parallèle d'esquisser le popover dans
ma tête. La suite enchaîne dès que Yann a la branche.

— Alex
