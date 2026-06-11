# Handoff Sébastien — J-3 bascule monorepo (mer 11/06)

**De :** Steve (CTO AlyoS, équipe Sourcing)
**Pour :** Sébastien (lead Suivi+ACT, lead migration)
**Date :** 2026-06-11
**Réponses attendues :** **jeudi 12/06 fin de journée** (sinon impact GO/NO-GO samedi)

---

## 1. PR #5 prête à merger

**[migration/sourcing-app → main](https://github.com/AlyoSIng/alyos-suivi-chantier/pull/5)** — code app monorepo (181 fichiers, 4 modules vague 2 + socle 5a + typing db).

**État CI :**
- ✅ `verify` (lint + typecheck + unit tests) — 5m4s
- ✅ `Vercel` preview deployment — `Ready`
- ✅ `Vercel Preview Comments`

**Notes pour ta review :**
- Stratégie de merge `-X theirs` utilisée sur les conflits `dossier/` et `admin/` (la couche app sourcing prime sur les variantes monorepo héritées). Documenté dans le body de la PR.
- `pnpm-lock.yaml` re-généré avec corepack pnpm 11.1.1 + lockfile-only (+620 lignes pour aligner sur les 38 deps vague 2).
- 2 locks co-habitent volontairement (`package-lock.json` pour `verify` CI runner, `pnpm-lock.yaml` pour Vercel build). À unifier post-bascule.

---

## 2. 4 questions à confirmer

### Q1 — `COOKIE_DOMAIN` vs `SUPABASE_COOKIE_DOMAIN` (risque SSO cassé J-day)

Sourcing actuel lit `COOKIE_DOMAIN` (`src/lib/supabase/server.ts`). Le monorepo utilise `SUPABASE_COOKIE_DOMAIN`. Pour la bascule du DNS `sourcing.edifio.fr`, la valeur cible doit être `.edifio.fr` (cookie partagé sourcing + futur app.edifio.fr) ou `sourcing.edifio.fr` (cookie isolé).

→ **Confirme** la convention monorepo + la valeur cible pour la prod.

### Q2 — `DATABASE_URL` côté monorepo

Q2 visio 10/06 a acté supabase-js direct (abandon Drizzle). Mais le script de transposition `scripts/migration/transpose/` utilise psql pour les opérations DDL/identity. Conserve-t-on `DATABASE_URL` comme env var monorepo, ou uniquement en variable de session Steve pour les ops manuelles ?

→ **Confirme** : env var Vercel monorepo ou pas.

### Q3 — `NEXT_PUBLIC_APP_ENV` (bannière env)

Sourcing utilise `NEXT_PUBLIC_APP_ENV` (`dev` / `staging` / `prod`) pour afficher une bannière. Le monorepo utilise `NEXT_PUBLIC_APP_URL`. Quelle convention on garde post-bascule pour `sourcing.edifio.fr` (prod), preview Vercel (staging), et dev local ?

→ **Confirme** la convention.

### Q4 — Module Odoo (5 vars : `ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_API_KEY`, `ODOO_SYNC_ENABLED`)

Le module Odoo XML-RPC (sync clients / factures) est utilisé en Sourcing actuel. Est-il **porté dans le monorepo Suivi+ACT** (auquel cas on conserve les 5 vars) ou bien **abandonné / déplacé hors web app** (auquel cas on les retire de la liste à porter) ?

→ **Tranche** : porte / pas porte.

---

## 3. Findings importants à clarifier

### F1 — Aucun dossier `supabase/functions/` dans `edifio-sourcing`

Mon brief mentionnait des Edge Functions Supabase (cf. spec orchestrateur). Yann a confirmé : seul `supabase/config.toml` existe dans le repo Sourcing. Soit jamais créées, soit dans un repo séparé que je n'ai pas. **Tu en as la trace de ton côté ?**

### F2 — Cron `sourcing-run` côté monorepo = stub `throwNotWired`

`app/src/app/api/cron/sourcing-run/route.ts:16-21` lève une erreur "not wired" si appelée. Sans fix : aucun AO ne tomberait lundi 15/06 matin.

→ **Alex (dev) câble en cours** : la route va appeler le worker Fly.io existant (arbitrage A1 visio 10/06 = Fly.io conservé). PR séparée à venir d'ici ce soir.

### F3 — `vercel.json` monorepo déclare 6 crons, 9 routes existent

Routes sans cron déclaré : `tandem-followup`, `library-expiry-digest`, `dossier-zip-cleanup`. Pas bloquant pour la bascule (features secondaires) mais à ajouter post-bascule quand le plan Vercel passera en Pro.

---

## 4. Accès à confirmer

- ✅ Accès repo `AlyoSIng/alyos-suivi-chantier` (déjà OK — tu merges les PR).
- ☐ Accès **Supabase prod Sourcing** lecture pour préparer la transposition dimanche ? (Le runbook dimanche prévoit que je lance `pnpm db:export-prod-sourcing` depuis ma session, donc cet accès est optionnel mais utile pour les contrôles a priori.)
- ✅ Workflow `suivi_act_reviewer` proxy côté Sourcing : validé.

---

## 5. Récap document env vars complet

Cf. `docs/VARS_ENV_VERCEL_MONOREPO_DIFF.md` — 44 vars inventoriées, 10 à créer + 24 à vérifier + 7 ambiguïtés. Je pose les secrets côté monorepo **vendredi soir** une fois tes réponses Q1-Q4 reçues.

---

## 6. Échéances rappel

| Date | Jalon |
|---|---|
| **jeu 12/06 fin de journée** | Tes réponses Q1-Q4 + F1-F2 + merge PR #5 |
| ven 12/06 soir | Je pose les secrets monorepo Vercel + Alex pousse PR cron sourcing-run câblé |
| sam 13/06 matin | Recette croisée (Camille × toi) sur preview Vercel monorepo |
| sam 13/06 18h | GO / NO-GO |
| **dim 14/06 8h-11h** | Bascule (runbook `docs/RUNBOOK_BASCULE_MONOREPO_140626.md`) |
| sem du 16/06 | Post-mortem + rotations sécurité post-MVP |

---

Merci. Si quoi que ce soit te paraît flou ou si l'une des questions mérite une visio plutôt qu'un message asynchrone, dis-le — je peux caler 30 min jeudi matin avant 10h.

— Steve
