# PR #3 module sourcing engine — Scoring V1 + cron Vercel

**Date** : 2026-05-20 21:55
**Auteur** : Alex (DEV) via Board (Steve)
**Branche** : `feat/sourcing-scoring-cron`
**Référence amont** : `specs/module_sourcing_engine_v1.md` §3.4-3.6 + §3.8 + `notes-de-suivi/CC_260520_1000_PR2_BOAMP.md`
**Statut** : Code livré, tests verts, **prête à ouvrir** vers `main` (Yann)

---

## Synthèse exécutive

PR #3 du module sourcing engine livrée en 5 étapes (filter / dedup / scoring / route cron / tests). Périmètre : la chaîne `BOAMP fetch → normalize → dedup → filter par profil → scoring V1 règles → insert idempotent` orchestrée derrière un cron Vercel quotidien protégé par `CRON_SECRET`.

Hors scope confirmé (PRs ultérieures) : connecteurs scraping PLACE/FM/MP.info via Fly.io, scoring IA Haiku complémentaire, push notifications Realtime, branche audit log `cron_run` (l'enum `audit_action` ne contient pas cette valeur).

---

## Décisions tranchées (cf. `DECISIONS.md` 2026-05-20)

1. **Barème scoring V1** = spec §3.6 intact (base 50, +20 exact, +10 par positif, +15 CPV exact, clamp [0, 100])
2. **Pas de seuil d'insertion** sur le score — tout AO qui passe `filter` est inséré, le seuil de notification (≥60) viendra avec la PR push notifs
3. **Cron Vercel** = `30 4 * * 1-5` UTC = 6h30 Europe/Paris en été (5h30 en hiver)

---

## Mapping étape → fichiers livrés

| # | Étape | Fichiers | Tests Vitest |
|---|-------|----------|--------------|
| 1 | `matchesProfile()` §3.5 | `src/lib/sourcing/filter.ts` + `.test.ts` | 15 |
| 2 | Dedup SHA-256 §3.4 | `src/lib/sourcing/dedup.ts` + `.test.ts` | 17 |
| 3 | Scoring V1 règles §3.6 | `src/lib/sourcing/scoring.ts` + `.test.ts` | 14 |
| 4 | Orchestrateur pipeline | `src/lib/sourcing/orchestrator.ts` + `.test.ts` | 8 |
| 5 | Route cron + auth Bearer | `src/app/api/cron/sourcing-run/route.ts` + `.test.ts` | 7 |
| — | Schedule cron | `vercel.json` *(nouveau)* | — |
| — | Doc env | `.env.example` (`CRON_SECRET`) | — |

**Total** : 61 nouveaux tests verts.

---

## Validations locales

| Vérif | Résultat |
|---|---|
| `vitest run` (suite globale) | **396/396 verts** |
| `tsc --noEmit` (strict) | 0 erreur |
| `eslint` sur les 10 nouveaux fichiers | 0 warning, 0 erreur |
| `next build` env-clean (sans `DATABASE_URL`) | OK — route `ƒ /api/cron/sourcing-run` reconnue dynamique |

> Le check `next build` env-clean est explicitement effectué pour reproduire `ci-build` Vercel/GitHub Actions — cf. mémoire `feedback_nextjs_build_env_clean.md`. La route importe `db` qui est un Proxy lazy, donc l'import est sans effet de bord — vérifié.

---

## Architecture livrée

```
POST /api/cron/sourcing-run (route Vercel)
  ↳ auth Bearer ${CRON_SECRET}        ← refusée 401 sans secret
  ↳ db.select(searchProfiles WHERE active=true)
  ↳ runSourcingForProfiles(profiles, { connector: BOAMP, db })
       ├── pour chaque profil :
       │     ↳ runSourcingForProfile(profile)
       │          ├── connector.fetchSinceLastRun(profileId, now - 24h)
       │          ├── normalize(raw) × N
       │          ├── dedupBatch(normalized)          ← hash SHA-256 composite
       │          ├── matchesProfile(t, profile) × N  ← filtre §3.5
       │          ├── scoreTender(t, profile) × N     ← barème §3.6 sans IA
       │          └── insertTender(t, { score, ... }) ← idempotent (ON CONFLICT)
       │     ↳ ProfileRunResult { fetched, dedupSkipped, filtered, inserted, updated, errors, durationMs }
       └── log structuré [cron:sourcing-run] + retour JSON summary

vercel.json → schedule "30 4 * * 1-5" UTC
```

---

## Hors scope acté (à venir)

- **Connecteurs PLACE / Francmarchés / MP.info** via container Fly.io scraping (PR #4)
- **Scoring IA Haiku 4.5 complémentaire** (PR #7) — branche audit `ai_run` + lecture prompts depuis `ai_prompt_versions`
- **Push notifications Realtime** (seuil notif ≥ 60 à câbler dans cette PR)
- **Filtrage par `cron_time` du profil** (V1 : tous les profils actifs tournent au même cron Vercel)
- **Trace cron en audit log** : nécessite ajouter `cron_run` à l'enum `audit_action` (migration Drizzle + bump spec audit) — pour l'instant, trace structurée via `console.log` (Vercel logs / Datadog)
- **Test E2E Playwright S1.1** (`plan_recette_gate7_v1.md`) — à câbler quand Supabase test instance dispo Gate 7

---

## Action ouverte avant merge

- **Yann** : ouvrir la PR `feat/sourcing-scoring-cron` → `main`, vérifier que la pipeline GitHub Actions (lint + typecheck + vitest + RLS pgTAP + ci-build) passe, et configurer la variable `CRON_SECRET` côté Vercel project settings avant déploiement preview (sinon la route répondra 401 à chaque tick cron Vercel).
