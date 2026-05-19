# Brouillon — PR n°2 module sourcing engine

**Statut** : Brouillon de plan, **non démarré** — attente merge PR #14 + OK Board sur l'ordre proposé.
**Auteur** : Alex (DEV) — orchestrateur direct
**Date** : 2026-05-18
**Référence** : `specs/module_sourcing_engine_v1.md` §3.1, §3.3, §3.7 + `specs/ai_prompts_v1.md` + `specs/audit_log_v1.md` (action A4)

---

## Périmètre

Couvre l'**étape 1 du tableau §6** spec sourcing engine (BOAMP connecteur API + normalisation + insertion BDD), plus **2 dépendances** identifiées dans l'état des lieux Gate 6 :

- **Helper audit log minimal** `src/lib/audit/` — action A4 `tender_select` au minimum, structure réutilisable pour A5/A6/A7 (PR ultérieures)
- **Seed `ai_prompts` table** — les 12 prompts P1-P12 versionnés en BDD (dépendance bloquante pour étape 6 scoring IA)

**Effort estimé** : 1.5-2.5 jours (étape 1 = 1-2 j + audit log helper 0.5 j + ai_prompts seed 0.5 j, factorisable).

**Hors scope** : filtre profil, scoring V1, cron Vercel (PR n°3) ; scraping Fly.io (PR n°4+) ; scoring IA Haiku (PR n°7).

---

## Plan en 7 étapes

### Étape 1/7 — Types partagés sourcing

**Fichiers nouveaux** :
- `src/lib/sourcing/types.ts` — `RawTender`, `NormalizedTender`, `BoampApiRecord` (typage du retour Opendatasoft, basé sur la fixture `src/db/seed/fixtures/boamp-real.json` déjà anonymisée), `PlatformCode = 'boamp' | 'place' | 'francmarches' | 'mp_info'`.

**Tests** : `vitest` snapshot de la fixture parsée → garantit que la structure attendue ne dérive pas silencieusement.

### Étape 2/7 — Connecteur BOAMP

**Fichier** : `src/lib/sourcing/connectors/boamp.ts`

API : `data.boamp.fr/api/2/datasets/boamp/records` (Opendatasoft, ouvert, ~500 req/min sans clé). Interface :

```ts
export interface BoampConnector {
  fetchSinceLastRun(profileId: string, lastRunAt: Date): Promise<RawTender[]>;
}
```

- Pagination via `rows=1000` + `start` (offset) jusqu'à épuisement
- Filtre `where=datepublication >= lastRunAt` (ISO 8601)
- Tri `sort=datepublication desc`
- Mapping vers `RawTender` : `external_ref=idweb`, `platform_code='boamp'`, `record` complet jsonb pour debug

**Tests** : mock `fetch` avec fixture `boamp-real.json`, vérifier que le mapping produit bien la structure `RawTender` attendue (pas d'appel réseau en test).

### Étape 3/7 — Normalisation

**Fichier** : `src/lib/sourcing/normalize.ts`

```ts
export function normalize(raw: RawTender): NormalizedTender { ... }
```

Convertit le `record` Opendatasoft brut en `NormalizedTender` :
- `trimAndCapitalize(title)`, `trimAndCapitalize(buyer)`
- `parseCpvCodes(cpv)` : string → string[] (codes 8 digits)
- `parseAmount(amount)` : "1 234 567,89 €" → 1234567.89 (utiliser `Intl.NumberFormat` reverse)
- `parseDate(deadline)` : FR/ISO → Date
- `normalizeUrl(dce_url)` : trim, ensure https

**Tests** : unitaires sur 10-20 cas réels extraits de la fixture (variations de format dans BOAMP).

### Étape 4/7 — Insertion BDD (idempotent)

**Fichier** : `src/lib/sourcing/insert.ts`

```ts
export async function insertTender(t: NormalizedTender, opts: {
  organizationId: string;
  profileId: string | null;
  score: number;  // 0 pour cette PR — scoring vient PR n°3
}): Promise<{ id: string; isNew: boolean }>
```

Utilise Drizzle :
```ts
db.insert(tenders).values({...}).onConflictDoUpdate({
  target: [tenders.organizationId, tenders.externalRef, tenders.platformId],
  set: { rawData: ..., updatedAt: sql`now()` },  // re-source = update raw + updated_at
}).returning({ id: tenders.id, createdAt: tenders.createdAt })
```

Idempotence via `UNIQUE (organization_id, external_ref, platform_id)` du schema v1. `isNew = (createdAt > now() - 1s)` (heuristique simple, alternative : `xmax = 0` Postgres).

**Tests** : RLS pgTAP — INSERT autorisé pour `current_organization_id()`, refusé sinon. Test idempotence : 2× insert même AO → 1 ligne, `updated_at` bumpé.

### Étape 5/7 — Helper audit log

**Fichier** : `src/lib/audit/index.ts`

Implémente le helper de `specs/audit_log_v1.md` §Implémentation :

```ts
export async function audit<A extends AuditAction>(params: {
  action: A;
  data: AuditLogDataFor<A>;  // discriminé par action
  subjectType?: string;
  subjectId?: string;
  request?: Request;
}): Promise<void>
```

- Validation Zod par action (13 schémas, on en active 1 pour cette PR : A4 `tender_select`)
- Enrichissement automatique : `organization_id`, `actor_id`, `actor_email`, `actor_role` depuis le JWT, `ip_address` + `user_agent` depuis `Request`
- INSERT direct dans `audit_logs` via service_role Supabase (bypass RLS pour écriture — la lecture reste admin-only par RLS)

**Tests** :
- Zod schemas par action (validation positive + négative)
- pgTAP : INSERT autorisé, UPDATE rejeté, DELETE rejeté (déjà couvert par `tests/rls/04_audit_immutable.sql` livré PR #14)

**Justification scope PR n°2** : on n'implémente que **A4 `tender_select`** ici (utilisée à l'étape suivante quand le user sélectionne un AO). Les 12 autres actions arrivent dans les PR qui les déclenchent (A5 dans PR sollicitation archi, A7 dans PR scoring IA, etc.). On pose juste la **structure réutilisable**.

### Étape 6/7 — Seed `ai_prompts` (12 prompts P1-P12)

**Fichier modifié** : `src/db/seed/index.ts`

Ajoute après le seed des organisations :

```ts
const prompts = [
  { name: 'rc_analysis_full', version: 1, model: 'sonnet-4-6', systemPrompt: ..., userPromptTemplate: ..., outputSchemaZod: ..., active: true },
  // ... 11 autres
];
await db.insert(aiPrompts).values(prompts);
```

**Source** : `specs/ai_prompts_v1.md` (P1-P12 avec systemPrompt + userPromptTemplate + schéma Zod sérialisé).

**Tests** : vitest snapshot du seed → garantit que les 12 prompts sont bien insérés. pgTAP : `SELECT COUNT(*) FROM ai_prompts WHERE active = TRUE` = 12.

### Étape 7/7 — Note de suivi + ouverture PR

- `notes-de-suivi/CC_<DATE>_PR2_BOAMP.md` — récap des 6 étapes + mapping (a)(b)(c) → fichiers
- `DECISIONS.md` — entrée datée traçant les choix d'implémentation (mock fetch en tests vs vrai appel réseau, etc.)
- PR titrée `feat(sourcing): connecteur BOAMP API + normalize + insert + audit log helper + seed ai_prompts`

---

## Validation locale obligatoire avant push

D'après la nouvelle memory `feedback_postgres_dry_run_local.md` (qui sort de cette session) :
- `tsc --noEmit` + `next lint` + `vitest run` + `next build`
- **+ dry-run Postgres local** : `scripts/db-dry-run.ps1` (en cours d'écriture dans cette même session) qui applique les migrations + seed étendu sur container `postgres:15`. Vérifier que le seed avec 12 prompts ne pète pas.

---

## Risques identifiés

1. **Rate-limit BOAMP** — pas d'authentification nécessaire mais ~500 req/min. Sur 1100-3300 AO/jour ça passe, mais batch initial (re-sourcing depuis 30 jours pour une nouvelle org) peut dépasser. Mitigation : retry exponentiel + délai entre pages.
2. **Format Opendatasoft variable** — la fixture committée est un snapshot. Si BOAMP change un champ, le mapping casse silencieusement. Mitigation : `zod` schema sur le `record` au moment du parsing + alerte Sentry.
3. **Idempotence sur `re-source`** — si BOAMP met à jour un AO (amende, prolongation deadline), le `onConflictDoUpdate` doit bien mettre à jour `raw_data` mais préserver les colonnes applicatives (`score`, `status`, `matching_profile_id`). Détail à valider en revue CTO.

---

*Brouillon. À démarrer après merge PR #14 + OK Board sur le scope élargi (audit log helper + seed ai_prompts intégrés à la PR n°2). Sinon scope strict étape 1 du tableau §6 = 1-2 jours, et les 2 dépendances arrivent dans PR séparées.*
