# Cartographie monorepo `alyos-suivi-chantier` — base de travail Lot 2

> Produit le 10/06/2026 au soir (sprint bascule 14/06). Source : exploration read-only du
> clone `C:\Dev\alyos-suivi-chantier` (code sous `app/`). Public : Alex, dev_tandem, Hugo,
> Camille + revue `suivi_act_reviewer` avant toute PR.

## Divergences structurantes vs Sourcing

| Sujet | Monorepo (cible) | Sourcing (source) | Conséquence Lot 2 |
|---|---|---|---|
| Users | `profiles(id→auth.users, organization_id NOT NULL, email, full_name, role)` | `users(id, email, firstname, lastname)` + `memberships` | **DROP users+memberships** ; firstname+lastname → `full_name` |
| Multi-org | ❌ 1 user = 1 org (`profiles.organization_id`) | ✅ memberships N-N | Nos données : 1 membership/user en pratique → mapping direct |
| Rôles | `profiles.role` check `owner/admin/member` + flag `is_superadmin` | enum `admin/user/viewer/superadmin` en user_metadata + memberships | admin→`admin`, user→`member`, **viewer→à arbitrer**, superadmin→`is_superadmin=true` |
| Lecture rôles | TABLE profiles (jamais user_metadata) | user_metadata JWT | Réécrire isAdmin/isSuperAdmin + middleware |
| Org "tier" | ❌ pas de tier ; `modules_actifs jsonb`, `trial_until`, `trial_status`, `contract_summary` | `organizations.tier` + 0049 | Transposition : PROTECT → `trial_until`+`trial_status='actif'`+`modules_actifs+=["sourcing"]` |
| Namespace | Schéma Postgres dédié par module (`act`, pattern 0104) | tout dans `public` | **CREATE SCHEMA sourcing** + PostgREST exposed schemas + `current_user_has_sourcing()` |
| RLS | sous-requêtes profiles via `current_user_org_id()` (même nom que notre helper 0052 !) | idem + FORCE | Réécrire nos 12 policies : `organization_id = current_user_org_id() AND current_user_has_sourcing()` |
| must_change_password | ❌ n'existe pas | garde middleware obligatoire | **À arbitrer avec Sébastien** (porter ou abandonner) |
| Migrations | SQL manuel `NNNN_desc.sql`, prochain numéro **0129**, idempotent, appliqué par Sébastien | Drizzle | Réécriture manuelle du schéma (le dump prod sert de référence, pas de livrable) |
| Package manager CI | **npm** (malgré pnpm-lock présent) | pnpm | Ne pas casser leur CI |
| Prettier | `singleQuote, printWidth 100, trailingComma "none"` | défauts + tailwind plugin | **Reformater tout le code porté** sinon rejet lint |
| ESLint | 9 flat config + `import/no-restricted-paths` (cloisonnement act/suivi/common) | 8 | Ajouter zones sourcing au cloisonnement |
| Vitest | ❌ absent (Q7 : à introduire) | 1281 tests | Lot 7 : on APPORTE vitest au monorepo |
| E2E CI | Playwright local only (désactivé CI) | suite S1-S14 + chantier supabase-local | A3 : on apporte le pattern |

## Pattern d'accès données à reproduire (génération ACT)

`app/src/modules/act/db/*.ts` — 1 fichier/entité + `*-types.ts` co-localisé, types TS manuels :

```ts
export async function listProjectsForOrg(): Promise<ActProject[]> {
  try {
    const supabase = await createClient();           // @/common/supabase/server
    const { data, error } = await supabase.schema('act').from('projects').select('...');
    if (error) { console.warn('[act.projects] failed:', error.message); return []; } // fail-soft
    return (data ?? []) as ActProject[];
  } catch { ... }
}
```

- Helper org : `modules/common/auth/get-org.ts` → `getCurrentUserOrgId(supabase)` retourne
  `{ok,userId,organizationId}|{ok:false,error}` — défense en profondeur `.eq('organization_id',…)`
  EN PLUS du RLS (équivalent de notre `getRequiredOrgId`).
- Cible : `src/modules/sourcing/db/*.ts` + alias tsconfig `@/sourcing/*` + routes `src/app/sourcing/`.

## Billing 0115 (cible transposition 0049)

- `organizations.trial_until timestamptz` (0111) + `trial_status` check
  (`actif|expire_bientot|trial_expired|a_supprimer|client_payant`) + `contract_summary jsonb` (0115)
- Table audit `organization_trial_events` (RLS select superadmin, write service_role)
- Consommateurs : `src/lib/trial/get-trial-info.ts` (fail-soft null = actif, calcule readOnly/banner)
  + cron `api/cron/relance-trial` (Brevo, anti-doublon via events)
- **Script transposition** : PROTECT trial actif → copier sa date d'expiration 0049 vers
  `trial_until`, `trial_status='actif'`, `modules_actifs = modules_actifs || '["sourcing"]'`.

## Middleware / hosts

- `app/src/middleware.ts` : `ACT_HOSTS` + regex vercel + rewrite préfixe `/act` (passthrough
  /api /admin /superadmin). Cookies SSO `Domain=.edifio.fr`.
- **À faire** : `SOURCING_HOSTS = {'sourcing.edifio.fr', ...}` + rewrite `/sourcing` en miroir
  (middleware.ts:43-77) + gate `modules_actifs` contient `"sourcing"` (déjà géré par updateSession
  → `/module-non-active`).

## Crons

`app/vercel.json` : 4 crons existants, pattern `Authorization: Bearer ${CRON_SECRET}` +
`createAdminClient()`. Ajouter nos 5 (`sourcing-run`, `sourcing-monitoring`, `tandem-followup`,
`library-expiry-digest`, `dossier-zip-cleanup`) en routes `src/app/api/cron/sourcing-*`.
Q4/A1 : le worker Fly.io reste (bench skippé → Fly.io conservé), seul le déclencheur HTTP vit ici.

## CI monorepo

1 workflow `ci.yml` « CI (Suivi) » : npm ci → type-check → lint → build (env Supabase factice).
Branches : PR→main, push→main+`prod-suivi` (branche prod). E2E désactivés en CI.
A3 : porter notre pattern supabase-local + `assertNotProdUrl` (avec le project ref du monorepo).

## ⚖️ Arbitrages Sébastien — RÉPONSES REÇUES (10/06 soir, via Steve)

1. **Rôle `viewer` : AJOUTÉ chez eux** (≠ hypothèse H1 viewer→member, OBSOLÈTE). Sébastien :
   « viewer est un profil en plus avec des droits de visualisation, commentaire mais pas
   modification ». Conséquences :
   - `0129` doit étendre le check constraint `public.profiles.role` : `('owner','admin','member','viewer')`
   - Transposition (Lot 2e) : memberships.role viewer → profiles.role 'viewer' (mapping direct)
   - Sourcing : gating écriture viewer reste app-level (nos RLS sont tenant-scopées) ; à terme
     policies write-aware si Sébastien le souhaite (post-bascule)
2. **`must_change_password` : option (a) — PORTER la garde** dans le monorepo. Conséquences :
   - `0129` : colonne `public.profiles.must_change_password boolean NOT NULL DEFAULT false`
     (+ `provisional_expires_at timestamptz` si le flow expiry 24h est porté tel quel)
   - Lot 2d : check dans `updateSession` (~20 lignes) + portage du flow admin-create/Resend
3. **Schéma dédié `sourcing` : CONFIRMÉ** — et c'est NOUS qui gérons l'étape PostgREST
   « Exposed schemas » dans le dashboard Supabase du monorepo (ajouté au runbook, étape Sébastien→Steve)
4. **Numéros 0129-0131 : LIBRES, confirmé.**

### Amendements à appliquer au Lot 2a (post-livraison Alex)

- [ ] `0129` : ALTER check constraint profiles.role (+viewer) + ADD COLUMN must_change_password
- [ ] Retirer les mentions « H1 viewer→member » des en-têtes
- [ ] Runbook : étape « Exposed schemas » assignée à l'équipe (pas Sébastien)

## Découpage Lot 2 proposé (demain matin)

| Sous-lot | Contenu | Qui |
|---|---|---|
| 2a | Schéma SQL 0129-0131 (réécriture, schéma sourcing, FK profiles/organizations) | Alex |
| 2b | `modules/sourcing/db/*.ts` (~15 entités, pattern ACT fail-soft) | dev_tandem en parallèle |
| 2c | Auth : adapter isAdmin/isSuperAdmin/getRequiredOrgId → profiles + getCurrentUserOrgId | Alex après 2a |
| 2d | Middleware SOURCING_HOSTS + modules_actifs | Alex |
| 2e | Script transposition données (orgs/users/memberships→profiles + billing + 22 tables) | après 2a, testé sur dump |
| Review | suivi_act_reviewer sur CHAQUE PR avant Sébastien | Hugo en complément |
