# infra/playwright — Worker Playwright (Fly.io EU)

Worker Node 20 + Fastify 5 + Playwright 1.49.1 déployé sur **Fly.io région `cdg`**
(Paris CDG, fallback `fra` Frankfurt). Sert de **runner de scraping AO**
déclenché par l'orchestrateur edifio Sourcing via Supabase Realtime.

> **Statut Gate 6** : squelette hello-world. Aucune logique Playwright réelle ici.
> L'objectif est de valider la chaîne `Dockerfile → image → Fly machine → /healthz`.

## Stack figée

| Composant       | Version pinned        | Justification                                  |
| --------------- | --------------------- | ---------------------------------------------- |
| Base image      | `mcr.microsoft.com/playwright:v1.49.1-jammy` | Navigateurs déjà installés, Ubuntu Jammy LTS. |
| Node            | 20.x (fourni image)   | LTS active.                                    |
| Fastify         | `5.0.0`               | API HTTP minimaliste.                          |
| supabase-js     | `2.45.4`              | Realtime + service_role.                       |
| tsx             | `4.19.2`              | Exécution TS directe (pas de build step).      |
| playwright      | `1.49.1`              | Aligné base image.                             |

## Variables d'environnement

| Nom                          | Portée   | Description                                         |
| ---------------------------- | -------- | --------------------------------------------------- |
| `PORT`                       | Public   | Port HTTP (8080 par défaut, convention Fly.io).     |
| `SUPABASE_URL`               | Secret   | URL projet Supabase EU.                             |
| `SUPABASE_SERVICE_ROLE_KEY`  | Secret   | service_role — bypass RLS, JAMAIS au client.        |
| `SCRAPER_TRIGGER_SECRET`     | Secret   | Bearer attendu sur `POST /v1/scrape`.               |
| `WEBHOOK_TARGET_URL`         | Secret   | URL de retour vers Next API (push résultats).       |

Les secrets sont injectés via `fly secrets set …` (pas dans `fly.toml`).
Côté developer machine, mettre `FLY_API_TOKEN` dans `.env.local` (jamais commit).

## Endpoints

- `GET  /healthz` → `{ status: 'ok', version: '0.1.0' }` — healthcheck Fly.
- `POST /v1/scrape` (Bearer `SCRAPER_TRIGGER_SECRET`) →
  body `{ tender_id, odoo_url }` ⇒ `{ accepted: true, job_id: '<uuid>' }`
  *(stub Gate 6, pas d'exécution Playwright réelle)*.

## Realtime

Au démarrage, subscribe le channel Supabase `orchestrator-scraping`
(broadcast). Tous les events reçus sont loggés. C'est le canal qui
déclenchera les jobs réels en Gate 7+.

## Build local (Docker requis)

```powershell
# Depuis la racine du repo
docker build -t edifio-playwright-worker:0.1.0 infra/playwright/
docker run --rm -p 8080:8080 `
  -e SUPABASE_URL="https://xxxxx.supabase.co" `
  -e SUPABASE_SERVICE_ROLE_KEY="eyJ…" `
  -e SCRAPER_TRIGGER_SECRET="dev-only" `
  edifio-playwright-worker:0.1.0

# Test
curl http://localhost:8080/healthz
```

## Deploy Fly.io (Gate 7 — OK Board requis)

```powershell
cd infra/playwright
fly launch --copy-config --no-deploy   # première fois uniquement
fly secrets set SUPABASE_URL="…" SUPABASE_SERVICE_ROLE_KEY="…" `
                SCRAPER_TRIGGER_SECRET="…" WEBHOOK_TARGET_URL="…"
fly deploy
```

## Régions Fly.io

- Primaire : **`cdg`** (Paris CDG, France) — voir
  <https://fly.io/docs/reference/regions/>.
- Fallback : `fra` (Frankfurt, Germany) si saturation.
- Toutes deux UE — conforme exigence « données sensibles UE strict » (CLAUDE.md §7).
