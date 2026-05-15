# Spec — Module Sourcing automatique d'AO

**Auteurs** : [CTO Sophie] + [CEO Marc]
**Date** : 2026-05-14
**Statut** : Spec préparée pour Alex après finalisation de l'auth
**Cible** : Gate 6 étape 6+ *(après le pivot auth + spike ORM tranché)*
**Référence** : `specs/schema_v1.sql` *(tables `tenders`, `platforms`, `search_profiles`, etc.)* + `specs/ai_prompts_v1.md` *(P4 scoring complémentaire)*

---

## 1. Vue d'ensemble

Le module sourcing scanne quotidiennement 4 plateformes de marchés publics, normalise les avis, dé-doublonne, score, et insère dans `tenders` les AO matchant les profils de recherche actifs. Lance le cron Vercel à HH:MM Europe/Paris.

### Plateformes cibles (Gate 6)

| Code | Nom | Type d'accès | Volume estimé/jour France BTP |
|------|-----|--------------|-------------------------------|
| `boamp` | BOAMP | **API ouverte** `data.boamp.fr` | ~500-1500 AO/jour |
| `place` | PLACE (marchés-publics.gouv.fr) | **Scraping authentifié** *(creds par compte)* | ~300-800 AO/jour |
| `francmarches` | Francmarchés | **Scraping non-authentifié** | ~200-600 AO/jour |
| `mp_info` | marches-publics.info | **Scraping non-authentifié** | ~100-400 AO/jour |

**Total brut estimé** : ~1100-3300 AO/jour. Après filtrage profil + dédup cross-plateformes : ~5-30 AO/jour/profil sélectionnés.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Vercel Cron (déclenchement HH:MM Europe/Paris par profil actif)    │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ HTTP POST /api/cron/sourcing-run
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Vercel API Route /api/cron/sourcing-run                            │
│  - Authentification CRON_SECRET                                     │
│  - Récupère search_profiles WHERE active=true AND cron_time<=now    │
│  - Pour chaque profil → orchestrateur                               │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Supabase Edge Function : sourcing-orchestrator                     │
│  - Pour chaque plateforme du profil :                               │
│    - boamp → fetcher-boamp-api.ts (API directe)                     │
│    - place → relai vers Fly.io scraper container                    │
│    - francmarches → relai vers Fly.io scraper container             │
│    - mp_info → relai vers Fly.io scraper container                  │
│  - Reçoit AO bruts, normalise, dédup, score, INSERT                 │
│  - Audit log + métriques (durée, volumes, échecs)                   │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ message Supabase Realtime
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Container Fly.io EU (scraper Playwright)                           │
│  - Worker process autonome                                          │
│  - Headless Chromium, contexts isolés par plateforme                │
│  - Session cookies persistantes (volume Fly)                        │
│  - Retry exponentiel, anti-rate-limit, anti-bot rotation user-agent │
│  - Renvoie résultats via webhook HTTPS vers Supabase Edge Function  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Composants à implémenter

### 3.1. Connecteur BOAMP (API)

**Fichier** : `src/lib/sourcing/connectors/boamp.ts`

```typescript
interface BoampConnector {
  fetchSinceLastRun(profileId: UUID, lastRunAt: Date): Promise<RawTender[]>
}
```

**Endpoint** : `https://data.boamp.fr/api/2/datasets/boamp/records` *(Opendatasoft, ouvert)*

**Paramètres** :
- `where`: filtre par `datepublication >= lastRunAt`
- `rows`: 1000 par page
- `start`: pagination
- `sort`: `datepublication desc`

**Pas d'authentification requise** *(API publique data.gouv.fr)*. Rate limit ~500 req/min, sans clé. Avec une clé API gratuite obtenable sur data.gouv.fr : 5000 req/min.

**Mapping vers `RawTender`** *(à enrichir selon ce que retourne réellement l'API au sprint)* :

```typescript
{
  external_ref: record.idweb,       // "25-XYZ-12345"
  platform_code: 'boamp',
  title: record.objet,
  buyer: record.acheteur_nom,
  cpv: record.codecpv_principal,
  amount: record.montant_estime,
  deadline: record.dateremise,
  dce_url: record.url_consultation,
  source_url: `https://www.boamp.fr/avis/detail/${record.idweb}`,
  raw_data: record,
}
```

### 3.2. Connecteurs scraping (PLACE, Francmarchés, MP.info)

**Fichier** : `src/lib/sourcing/connectors/{place,francmarches,mp_info}.ts`

Pattern uniforme :

```typescript
interface ScrapingConnector {
  fetchSinceLastRun(profileId: UUID, lastRunAt: Date, credentials?: VaultRef): Promise<{
    runId: string;  // identifiant pour suivre la session Fly.io
    estimatedDuration: number;  // pour timeout côté orchestrateur
  }>;
}
```

Le connecteur **délègue** au container Fly.io :
1. POST HTTPS authentifié vers `https://edifio-sourcing-scraper.fly.dev/v1/scrape`
2. Body : `{ platform, profileFilters, lastRunAt, credentialsVaultRef? }`
3. Container Fly accuse réception immédiate avec un `runId`
4. Lance le scraping en async
5. À la fin, POST un webhook vers `https://edifio-sourcing.vercel.app/api/webhooks/scraper-done` avec les résultats

**Authentification scraper Fly.io** : header `Authorization: Bearer ${SCRAPER_TRIGGER_SECRET}` *(déjà documenté en setup `.env.local`)*.

**Container Fly.io** *(à coder dans un repo dédié `edifio-sourcing-scraper` ou sous-dossier `scraper/`)* :

```typescript
// scraper/server.ts
import { fastify } from 'fastify';
import { chromium } from 'playwright';

const app = fastify();
const browser = await chromium.launch({ headless: true });  // warm browser

app.post('/v1/scrape', async (req, reply) => {
  if (req.headers.authorization !== `Bearer ${process.env.SCRAPER_TRIGGER_SECRET}`) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
  const { platform, profileFilters, lastRunAt, credentialsVaultRef } = req.body;
  const runId = randomUUID();

  // Réponse immédiate, le scraping continue en background
  reply.send({ runId, estimatedDuration: 60 });

  // Async
  process.nextTick(async () => {
    try {
      const results = await scrapePlatform(platform, profileFilters, lastRunAt, credentialsVaultRef);
      await postWebhook(runId, results);
    } catch (e) {
      await postWebhook(runId, { error: String(e) });
    }
  });
});
```

### 3.3. Normalisation

**Fichier** : `src/lib/sourcing/normalize.ts`

```typescript
function normalize(raw: RawTender): NormalizedTender {
  return {
    external_ref: raw.external_ref,
    platform_id: lookupPlatformId(raw.platform_code),
    title: trimAndCapitalize(raw.title),
    buyer: trimAndCapitalize(raw.buyer),
    cpv: parseCpvCodes(raw.cpv),  // string → string[] de codes 8 digits
    amount: parseAmount(raw.amount),  // string "1 234 567,89 €" → 1234567.89
    deadline: parseDate(raw.deadline),  // FR/ISO → Date
    dce_url: normalizeUrl(raw.dce_url),
    source_url: raw.source_url,
    raw_data: raw.raw_data,  // pour debug et apprentissage
  };
}
```

Convention de mots-clés *(extraction depuis title + objet)* à passer dans `keywordsExtracted` pour le matching profil ensuite.

### 3.4. Dé-doublonnage cross-plateformes

**Fichier** : `src/lib/sourcing/dedup.ts`

**Stratégie** : hash composite sur `(buyer_normalized, title_normalized, deadline_date)`.

```typescript
function dedupHash(t: NormalizedTender): string {
  const buyer = removeDiacritics(t.buyer.toLowerCase()).replace(/\s+/g, '');
  const title = removeDiacritics(t.title.toLowerCase()).replace(/\s+/g, '').slice(0, 100);
  const deadline = t.deadline?.toISOString().slice(0, 10) || '';
  return sha256(`${buyer}|${title}|${deadline}`);
}
```

Si l'AO a déjà été vu sur une autre plateforme *(même hash)* → on garde la première occurrence chronologique, on ignore les suivantes *(audit log « dedup_skip »)*.

### 3.5. Filtrage par profil de recherche

**Fichier** : `src/lib/sourcing/filter.ts`

```typescript
function matchesProfile(t: NormalizedTender, p: SearchProfile): MatchResult {
  // Mots-clés positifs : au moins 1 doit matcher dans title OR objet
  const positiveMatch = p.keywords.positive.some(kw => t.title.toLowerCase().includes(kw.toLowerCase()));
  if (!positiveMatch && p.keywords.positive.length > 0) return { matched: false, reason: 'no_positive_keyword' };

  // Mots-clés négatifs : aucun ne doit matcher
  const negativeHit = p.keywords.negative.find(kw => t.title.toLowerCase().includes(kw.toLowerCase()));
  if (negativeHit) return { matched: false, reason: `negative_keyword:${negativeHit}` };

  // CPV
  if (p.cpv_codes.length > 0) {
    const cpvHit = t.cpv.some(c => p.cpv_codes.some(prefix => c.startsWith(prefix)));
    if (!cpvHit) return { matched: false, reason: 'cpv_mismatch' };
  }

  // Géo (département extrait du buyer ou du CCAP — heuristique à coder)
  // Montant
  if (p.amount_min && t.amount && t.amount < p.amount_min) return { matched: false, reason: 'amount_below_min' };
  if (p.amount_max && t.amount && t.amount > p.amount_max) return { matched: false, reason: 'amount_above_max' };

  return { matched: true, reason: 'all_criteria_pass' };
}
```

### 3.6. Scoring V1 (règles, sans IA)

**Fichier** : `src/lib/sourcing/scoring.ts`

```typescript
function scoreV1Rules(t: NormalizedTender, p: SearchProfile): number {
  let score = 50; // base

  // +20 si match exact d'une expression positive
  const exactMatch = p.keywords.exact.some(exp => t.title.toLowerCase().includes(exp.toLowerCase()));
  if (exactMatch) score += 20;

  // +10 par mot-clé positif matché
  const positiveCount = p.keywords.positive.filter(kw => t.title.toLowerCase().includes(kw.toLowerCase())).length;
  score += positiveCount * 10;

  // +15 si CPV exactement dans la liste (pas juste préfixe)
  const cpvExact = t.cpv.some(c => p.cpv_codes.includes(c));
  if (cpvExact) score += 15;

  // +5 si montant proche de la moyenne historique des AO sélectionnés (à calculer Phase 2)

  return Math.min(100, Math.max(0, score));
}
```

**Scoring complémentaire IA (Haiku 4.5)** : si `Tier >= Cotraitance`, on appelle aussi `P4 tender_scoring_complementary` *(cf. `ai_prompts_v1.md`)*. Score final = `(score_rules + score_ai) / 2`.

### 3.7. Insertion en BDD

**Fichier** : `src/lib/sourcing/insert.ts`

```typescript
async function insertTender(t: NormalizedTender, score: number, profileId: UUID, orgId: UUID): Promise<UUID> {
  const { data, error } = await supabase
    .from('tenders')
    .upsert({
      organization_id: orgId,
      external_ref: t.external_ref,
      platform_id: t.platform_id,
      title: t.title,
      buyer: t.buyer,
      cpv: t.cpv,
      amount: t.amount,
      deadline: t.deadline,
      dce_url: t.dce_url,
      source_url: t.source_url,
      raw_data: t.raw_data,
      score: score,
      status: 'sourced',
      matching_profile_id: profileId,
    }, {
      onConflict: 'organization_id,external_ref,platform_id',  // idempotence
      ignoreDuplicates: false,  // on UPDATE le score / raw_data si re-source
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}
```

L'idempotence est garantie par la contrainte UNIQUE `(organization_id, external_ref, platform_id)` du schéma BDD.

### 3.8. Cron Vercel

**Fichier** : `vercel.json` (root)

```json
{
  "crons": [
    {
      "path": "/api/cron/sourcing-run",
      "schedule": "30 6 * * 1-5"
    }
  ]
}
```

→ Tous les jours ouvrés à 6h30 Europe/Paris *(à confirmer en fonction du fuseau Vercel, peut nécessiter ajustement UTC)*.

**Fichier** : `src/app/api/cron/sourcing-run/route.ts`

```typescript
export async function POST(req: Request) {
  // 1. Auth via header Vercel CRON_SECRET
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 });
  }

  // 2. Récupérer tous les profils actifs dont cron_time correspond à maintenant ±15 min
  const profiles = await getActiveProfilesForRun();

  // 3. Pour chaque profil, déclencher l'orchestrateur Edge Function
  for (const profile of profiles) {
    await supabase.functions.invoke('sourcing-orchestrator', { body: { profileId: profile.id } });
  }

  return new Response('triggered', { status: 200 });
}
```

### 3.9. Webhook scraper retour

**Fichier** : `src/app/api/webhooks/scraper-done/route.ts`

Reçoit les résultats du container Fly.io, déclenche normalisation + dedup + scoring + insertion.

---

## 4. Tests E2E à fournir

Référence : `specs/plan_recette_gate7_v1.md` scénario S1 (parcours Solo) — étape S1.1 mentionne *« cron sourcing → 7 AO retenus »*.

**Test E2E à coder** :

1. **Seed** : injecter 50 AO de test dans une réponse mockée API BOAMP (via `playwright` route mock)
2. **Trigger** : POST `/api/cron/sourcing-run` avec CRON_SECRET valide
3. **Wait** : 30 secondes max pour que l'orchestrateur + edge function tournent
4. **Assert** :
   - Table `tenders` contient les AO matching le profil de test
   - Score entre 0 et 100
   - Dédup cross-plateforme respecté *(si 2 AO avec même hash → 1 seule entry)*
   - Audit log présent (`action='ai_run'` si IA invoquée, sinon pas)
   - Push notification envoyée à l'utilisateur via Supabase Realtime

---

## 5. Coûts estimés

| Poste | Coût mensuel HT |
|-------|------------------|
| BOAMP API | 0 € (gratuit) |
| Fly.io scraper container 256 Mo | ~5 € |
| PLACE creds | 0 € (compte gratuit) |
| Anthropic Haiku 4.5 scoring complémentaire | ~5-20 € (1000-3000 AO scannés/mois × 0.005-0.02 €) |
| **Total module sourcing** | **~10-25 € / mois** |

→ Cohérent avec `budget_infra_v1.md`.

---

## 6. Plan de mise en œuvre par Alex (estimation effort)

| Étape | Effort | Dépendances |
|-------|--------|-------------|
| 1. BOAMP connecteur API + normalisation + insertion | 1-2 jours | Spike ORM tranché, schéma BDD opérationnel |
| 2. Filtrage + scoring V1 rules + cron Vercel | 1 jour | Étape 1 |
| 3. Container Fly.io initial (1 plateforme : Francmarchés) | 2-3 jours | Setup Fly.io org |
| 4. Webhook scraper + dedup cross-plateformes | 1 jour | Étape 3 |
| 5. Connecteurs PLACE + MP.info | 2-3 jours | Étape 3 |
| 6. Scoring IA complémentaire Haiku | 0.5 jour | Étape 2 + ai_prompts versionnés en BDD |
| 7. Tests E2E + audit log + métriques | 1-2 jours | Étapes 1-6 |
| **Total** | **~ 9-13 jours** | |

Soit environ **2-2.5 semaines** de Gate 6 sur le module sourcing seul.

---

## 7. Risques

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Rate-limit / ban IP scraping | Plateforme rate inutilisable | UA rotation, jitter, retry exponentiel, fallback API BOAMP |
| Structure HTML scraping change | Connecteur cassé | Tests E2E hebdomadaires sur prod, alerte Sentry |
| PLACE bloque par CAPTCHA | Plateforme exclue tier Sourcing | Documenter dans `tarifs.md`, proposer manual upload comme fallback |
| Coût Anthropic dépasse prévision | Marge Tier Studio compromise | Quota par compte + alerte 80 % budget |
| Volume BOAMP explose (>5k/jour) | Sourcing batch > 10 min cible | Pagination par profil, parallélisation des fetchers |

---

*Spec figée pour démarrage Alex après auth. Réviser après spike ORM tranché (impacte la couche d'insertion BDD).*
