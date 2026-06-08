# SPIKE — Cron `sourcing-run` sur Vercel via `@sparticuz/chromium-min`

> Steve 2026-06-08 — Lot 0b de la migration `edifio-sourcing` → monorepo.
> Livré sur branche `spike/cron-vercel-chromium` (jetable, ne sera pas mergée).
>
> **Statut : code POC livré, exécution bench EN ATTENTE DU PREVIEW VERCEL.**

## Verdict

⏳ **EN ATTENTE** — le code POC est prêt mais l'exécution du bench requiert
un déploiement preview Vercel. Verdict définitif sera apposé après le run
preview et l'arbitrage Sébastien.

## Pourquoi pas de bench local

Tentative initiale `node scripts/bench-chromium-min.mjs` sur Windows :

```
spawn C:\Users\alyos\AppData\Local\Temp\chromium ENOENT
```

`@sparticuz/chromium-min` package un binaire **Linux x64** (ciblé Lambda /
Vercel Function), incompatible Windows. C'était documenté en PREP §6 comme
risque connu — la solution est de mesurer dans l'environnement cible.

## Code livré

| Fichier | Rôle |
|---|---|
| `src/lib/sourcing/spike/chromium-launcher.ts` | Helper réutilisable `launchChromium()` (jetable) |
| `scripts/bench-chromium-min.mjs` | Bench standalone Node (jetable, échec attendu sur Windows) |
| `src/app/api/spike/chromium-bench/route.ts` | API route Next.js qui exécute le bench sur Vercel Function |

Dépendances ajoutées :
- `@sparticuz/chromium-min@149.0.0`
- `puppeteer-core@25.1.0`

## Méthode bench (sur Vercel preview)

3 runs back-to-back depuis un seul HTTP request → on mesure :

| Métrique | Quoi |
|---|---|
| `launchMs` | Durée `puppeteer.launch()` (1er run = download chromium) |
| `navigationMs` | Durée `page.goto()` + `domcontentloaded` |
| `scrapingMs` | Extraction DOM (10 premiers liens) |
| `totalMs` | Somme |
| `memoryPeakMB` | Pic `heapUsed` via setInterval 100ms |
| `nbResults` | Sanity check (0 = scraping foiré) |

Cible : BOAMP HTML public (`https://www.boamp.fr/pages/recherche/?searchText=ingenierie`)
Fallback : `https://www.francemarches.com/recherche?q=ingenierie` (si BOAMP bloque le user-agent headless, passer `?fallback=1`).

Seuils Sébastien (visio cadrage 2026-06-07 §4) :
- durée moyenne warm < **50 s**
- RAM pic max < **500 Mo**

## Procédure d'exécution

### 1. Déploiement preview Vercel

À l'ouverture de la PR `spike/cron-vercel-chromium`, Vercel déploie
automatiquement une preview. Récupérer l'URL preview dans la PR GitHub.

### 2. Setter l'env var `SPIKE_TOKEN` sur preview Vercel

Dashboard Vercel → projet `edifio-sourcing` → Settings → Environment Variables
→ `SPIKE_TOKEN` = `<token aléatoire>` → **Preview only**.
Redéployer pour que la variable soit prise en compte.

### 3. Appeler l'endpoint

```powershell
$Token = "<le token configuré>"
curl -H "x-spike-token: $Token" `
  https://edifio-sourcing-<preview-id>.vercel.app/api/spike/chromium-bench
```

Réponse JSON attendue :

```json
{
  "ok": true,
  "targetUrl": "https://www.boamp.fr/...",
  "seuilDureeMs": 50000,
  "seuilRamMB": 500,
  "coldRun": { "runIndex": 1, "launchMs": ..., "totalMs": ..., "memoryPeakMB": ..., "nbResults": ... },
  "warmRuns": [ { "runIndex": 2, ... }, { "runIndex": 3, ... } ],
  "avgTotalWarm": ...,
  "maxRamWarm": ...,
  "verdict": "PASS" | "FAIL" | "INSUFFICIENT"
}
```

### 4. Copier le JSON dans la section « Résultats » ci-dessous

## Résultats

```
(à remplir après le run preview Vercel)
```

| Run | launch ms | nav ms | scrape ms | total ms | mem peak Mo | nbResults |
|---|---|---|---|---|---|---|
| 1 (cold) | — | — | — | — | — | — |
| 2 (warm) | — | — | — | — | — | — |
| 3 (warm) | — | — | — | — | — | — |
| **Moyenne warm** | — | — | — | — | — | — |

## Interprétation (à compléter après run)

- Cold start : `total run 1` ms vs Fly.io worker permanent (~50 ms)
- Warm : `avgTotalWarm` ms vs seuil **50 000 ms**
- RAM : `maxRamWarm` Mo vs seuil **500 Mo**
- Coût Vercel Function Pro : inclus (limite 60 s)
- Coût Fly.io actuel : ~10 €/mois

## Recommandation (à compléter)

- Si `verdict: PASS` → **bascule Vercel Function OK**, Lot 5 (Sprint cron)
  porte le cron vers Vercel, abandon worker Fly.io. Économie ~10 €/mois,
  un env de moins à gérer post-migration.
- Si `verdict: FAIL` → **reste Fly.io**, confirmer le worker actuel +
  budget conservé. Lot 5 porte le worker tel quel vers le compte Fly.io
  monorepo (changement DNS uniquement).
- Si `verdict: INSUFFICIENT` → relancer 3 runs, escalade Sébastien si
  toujours pas concluant.

## Limites du POC

- Mesure depuis une seule **région preview Vercel** (Frankfurt likely),
  pas représentative si la prod est en plusieurs régions.
- Cible BOAMP uniquement — les 8 scrapers Sourcing actuels (PLACE,
  francmarches, marchespublicsinfo, mpe76, marchesonline, marchespublicsnormandie,
  maregionsud, departement13) ont des profils RAM différents (login + JS lourd).
  Le POC mesure le **pire cas pour le profil le plus simple** — si on
  passe ici, on passe probablement sur les autres ; si on échoue, les
  autres seront pires.
- Pas de tests de charge ou de concurrence (1 invocation à la fois).
- Pas de mesure de **cold start après idle long** (Vercel Function endort
  les containers après inactivité — testable en attendant 10 min entre 2 runs).

## Action suivante (post-run)

- Compléter ce document avec le JSON de résultats
- Mettre à jour le verdict explicite (PASS / FAIL)
- Notifier Sébastien dans la PR avec le verdict
- Si PASS : ticket Lot 5 (Sprint cron) — portage cron sourcing-run vers Vercel
- Si FAIL : ticket Lot 5 — portage worker Fly.io vers compte monorepo

---

**Lot 0b — Code POC livré 2026-06-08. Bench exécuté : EN ATTENTE.**
