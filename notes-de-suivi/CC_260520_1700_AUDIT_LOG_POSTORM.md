# CC 2026-05-20 17:00 — Audit log post-ORM : branchement helper + 2 routes admin

## Contexte

Suite au merge `feat/sourcing-mvp` → `feat/auth-password-pivot` (commit
`54bf7df`) et au fix flake S3 (`e4a2dca`, CI vert confirmé), la table
`audit_logs` (Drizzle + RLS FORCE insertion-only, 5 ans rétention) est
désormais disponible sur la branche auth.

Deux stubs `console.warn("[audit_log:...]")` traînaient depuis le pré-ORM
avec un TODO explicite, sur les deux routes admin user lifecycle :

- `POST /api/admin/users` → invitation new collaborateur AlyoS
- `POST /api/admin/users/[id]/regenerate-password` → bouton « Renvoyer »

## Livrables

| Fichier                                       | Action  | Description                                    |
|-----------------------------------------------|---------|------------------------------------------------|
| `src/lib/audit/insert.ts`                     | NEW     | Helper `insertAuditLog(...)` — 4 invariants    |
| `tests/unit/lib/audit/insert.test.ts`         | NEW     | 5 tests : happy / IP-null / no-membership / catch-no-throw / subject-optional |
| `src/db/types/jsonb.ts:236`                   | EDIT    | Union `operation` étendue à `regenerate_provisional` |
| `specs/audit_log_v1.md:60`                    | EDIT    | A2 mise à jour + paragraphe amendement daté    |
| `src/app/api/admin/users/route.ts:140-152`    | EDIT    | `console.warn` → `insertAuditLog` (A2 invite)  |
| `src/app/api/admin/users/[id]/.../route.ts`   | EDIT    | Idem (A2 regenerate_provisional) + drop `void req` |
| `handoff/REQUEST_260520_1700_*.md`            | NEW     | Validation CTO Sophie pour option B (A2 ext.)  |

## Architecture du helper

```
insertAuditLog({ req, action, actor, subject, data })
   ├─ select organizationId FROM memberships WHERE user_id = actor.id LIMIT 1
   │     ├─ trouvé → INSERT INTO audit_logs avec snapshot acteur + IP + UA
   │     └─ absent → console.warn (bootstrap edge), skip silencieux
   └─ catch err → console.error, no throw (audit ≠ correctness)
```

**Invariants tenus** (cf. JSDoc helper) :
1. Échec INSERT ne casse JAMAIS la business logic
2. Snapshot acteur (email, role) — résiste à la suppression RGPD
3. Pas de secret en payload (responsabilité du caller, ex. JAMAIS le
   password provisoire — invariant `password-server.ts`)
4. `organizationId` via memberships du caller (MVP 1 org AlyoS)

## Validation locale

| Étape         | Commande                              | Résultat                          |
|---------------|---------------------------------------|-----------------------------------|
| Typecheck     | `.\node_modules\.bin\tsc --noEmit`    | 0 erreur                          |
| Lint          | `.\node_modules\.bin\next lint`       | 0 warning, 0 erreur               |
| Tests unit.   | `.\node_modules\.bin\vitest run`      | **211 PASS / 14 fichiers** (+5/+1) |

Pas de DDL touchée → pas de `pnpm db:dry-run` nécessaire (memory
`feedback-postgres-dry-run-local` non déclenchée). Les RLS pgTAP existantes
ne couvrent pas encore le scénario INSERT applicatif sur `audit_logs` —
à étendre dans une PR suivante (test : admin caller depuis app peut INSERT,
user/viewer peuvent SELECT seulement, UPDATE/DELETE rejetés pour tous).

## Décision en attente

L'option B (extension `operation` A2 → `regenerate_provisional`) est
implémentée et committée mais reste **soumise à validation CTO Sophie**
via le handoff dédié. Si CTO bascule en option A ou C, le revert est
isolé (3 fichiers, pas de dépendance applicative en aval).

## Suite

1. Push de ce commit → CI doit rester verte (tests purs vitest, pas de
   nouvelle migration ni dépendance).
2. Attendre validation CTO Sophie sur le handoff option B.
3. Continuer le branchement des autres `console.warn("[audit_log:...]")`
   au fil des PR (login A1, dossier_diffuse A6, architect_solicit A5, etc.).
4. Étendre les tests pgTAP `tests/rls/` pour couvrir INSERT applicatif
   sur `audit_logs` via rôle `test_authenticated` (cf. fix 2026-05-19).
