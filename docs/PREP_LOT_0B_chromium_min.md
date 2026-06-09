# PRÉP — Lot 0b : POC `@sparticuz/chromium-min` sur Vercel Function

> Steve 2026-06-08 — préparation Lot 0b (livrable arbitrage Q4 avant kickoff
> migration du 1er juillet, deadline cible **25 juin 2026**).
>
> Ce document est rédigé en lecture seule avant ouverture de la branche
> `spike/cron-vercel-chromium`. Sert de plan d'exécution dès qu'Alex aura
> terminé la salve U (apprentissage par écartement) et que la branche
> sera mergeable.

## 1. Objectif du POC

Décider si le scraping cron Sourcing peut migrer du worker Fly.io vers une
**Vercel Function** en utilisant `@sparticuz/chromium-min` (chromium serverless).

**Seuils de bascule actés visio cadrage 2026-06-07 §4 (Sébastien)** :

| Métrique | Seuil bascule Vercel | Hors seuil → Fly.io |
|---|---|---|
| Durée d'exécution | < 50 s | ≥ 50 s |
| RAM pic | < 500 Mo | ≥ 500 Mo |

Coût comparé :
- Fly.io worker actuel : ~10 €/mois (toujours up, scaling manuel)
- Vercel Function Pro : inclus (limite 60 s / 1024 Mo par invocation,
  pas de coût d'idle)

Le gain potentiel n'est pas tant le coût que la **simplification d'infra**
(suppression du worker Fly.io, un environnement de moins à gérer post-migration).

## 2. Architecture actuelle (rappel)

App Next.js (Vercel) ─── POST /v1/scrape ───► Worker Fly.io
                                                      │
                                                      │ Playwright headless
                                                      ▼
                                              Plateforme (PLACE,
                                              francmarches, …)
                                                      │
       Webhook ◄────── POST /api/webhooks/scrape ─────┘
       Next.js                            (résultats)

Code worker Fly.io : **hors de ce repo** (image Docker dédiée). Pour le POC,
on ne reproduit pas le worker — on mesure si chromium-min standalone tient
les contraintes sur **une cible publique simple**.

## 3. Choix de la cible POC

Pas besoin de reproduire les 8 plateformes pour mesurer chromium-min.
**Cible retenue : BOAMP HTML officiel** (https://www.boamp.fr/pages/recherche/
?searchText=ingenierie).

Pourquoi BOAMP plutôt que PLACE/marchespublicsinfo :
- ✅ Pas de credentials (pas de login à reproduire)
- ✅ HTML structuré, results listés sans login
- ✅ Volume représentatif (~10-30 résultats par page)
- ✅ Site stable, pas de captcha agressif
- ❌ JS dynamique léger — c'est précisément le profil chromium-min standard

Si BOAMP refuse les user-agents headless (cas observé sur certaines sources),
**fallback** : https://www.francemarches.com/recherche?q=ingenierie (HTML
public sans login).

## 4. Métriques à mesurer (3 runs : 1 cold + 2 warm)

| Métrique | Comment | Pourquoi |
|---|---|---|
| `launchMs` | t0 → après `puppeteer.launch()` | Coût initialisation chromium-min |
| `navigationMs` | `page.goto()` → `domcontentloaded` | Coût réseau + render initial |
| `scrapingMs` | Extraction des 10 premiers résultats | Coût DOM querying |
| `totalMs` | Somme | À comparer aux 50 s |
| `memoryPeakMB` | max `process.memoryUsage().heapUsed` (poll 100 ms) | À comparer aux 500 Mo |
| `nbResults` | Nombre d'AO extraits | Sanity check (0 = scraping foiré) |

3 runs en série pour distinguer **cold start** (run 1 — premier
téléchargement du binaire chromium) vs **warm** (runs 2-3 — binaire en cache).

## 5. Plan d'exécution (à dérouler après merge salve U)

### 5.1 Setup branche (5 min)
```bash
git checkout main
git pull --ff-only
git checkout -b spike/cron-vercel-chromium
```

### 5.2 Install deps (5 min)
```bash
.\node_modules\.bin\pnpm add @sparticuz/chromium-min puppeteer-core
```
(astuce MEMORY : `pnpm` pas dans le PATH → fallback `node_modules\.bin\`)

Versions cibles (à vérifier à l'install) :
- `@sparticuz/chromium-min@^131` (aligné avec puppeteer-core 21+)
- `puppeteer-core@^21` ou `^22` (compatible chromium-min 131)

### 5.3 Helper `lib/sourcing/spike/chromium-launcher.ts` (30 min)
```ts
import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";

const CHROMIUM_REMOTE_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar";

export async function launchChromium() {
  const t0 = Date.now();
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(CHROMIUM_REMOTE_URL),
    headless: chromium.headless,
  });
  return { browser, launchMs: Date.now() - t0 };
}
```

### 5.4 Script bench `scripts/bench-chromium-min.mjs` (1 h)
- 3 runs back-to-back sur BOAMP
- Poll mémoire toutes les 100 ms
- Affiche un récap JSON aligné colonnes

### 5.5 Exécution + rapport (45 min)
- `node scripts/bench-chromium-min.mjs`
- Rédige `docs/SPIKE_CRON_VERCEL_CHROMIUM.md` (200-300 mots + tableau)
- Verdict explicite : « BASCULE VERCEL OK » ou « RESTE FLY.IO »

### 5.6 Commit (sans push) (5 min)
```
spike(0b): poc @sparticuz/chromium-min pour cron vercel
```
Yann pushe ensuite.

## 6. Risques identifiés

| Risque | Mitigation |
|---|---|
| Test **local** ≠ runtime Vercel réel | Documenter limite + 2e run en preview Vercel après merge sur branche spike |
| BOAMP user-agent blocking | Fallback francemarches.com |
| Téléchargement binaire chromium lent en cold start | C'est précisément ce qu'on veut mesurer |
| `puppeteer-core` vs `playwright-core` | Sébastien (Suivi+ACT) utilise `puppeteer-core` → on s'aligne, c'est aussi le standard `@sparticuz/chromium-min` |

## 7. Décision attendue post-POC

| Verdict | Action côté migration |
|---|---|
| **Bascule Vercel OK** | Lot 5 (Sprint cron) : portage cron vers Vercel Function, abandon worker Fly.io. Économie ~10 €/mois + un env de moins. |
| **Reste Fly.io** | Confirmer le worker actuel + budget conservé. Lot 5 : portage du worker tel quel vers le compte Fly.io monorepo (changement DNS uniquement). |

## 8. Effort total estimé

- Setup + code : ~2 h
- Exécution + rapport : ~1 h
- **Total : ~3 h (½ journée)**

Si chromium-min refuse de fonctionner en local Windows (cas non testé), on
escalade à Sébastien pour qu'il fasse le bench depuis son env Linux — pas
de blocage.

---

**Statut : prêt à dérouler dès fin salve U.**
