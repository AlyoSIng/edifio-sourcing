# CC 2026-05-22 10h22 — Hotfix prod : migration 0004_tender_deferral appliquée

## Contexte (3 lignes)

Page AO du jour KO en prod depuis le merge PR n°5 (`38acbdd`, 21/05) : la
migration `0004_tender_deferral` (ajout colonne `tenders.deferred_until` +
enum `audit_action` étendu A14/A15) n'avait jamais été appliquée sur le
projet Supabase prod après la Phase β. Symptôme runtime :
`column tenders.deferred_until does not exist`. Aucun bug de code, juste
une migration manquante.

## Action prise

- Tentatives initiales `pnpm db:migrate` (forme éclatée `PG*`) → ENOENT
  `host/.s.PGSQL.5432` reproductible (bug postgres-js Windows : options
  object → fallback PipeConnectWrap au lieu de TCP propre).
- Workaround : Steve a posé `DATABASE_URL` (URI complète) depuis `.env.local`
  dans sa session PowerShell + lancé `pnpm drizzle-kit migrate`. URL string
  → TCP propre.
- Résultat : `[✓] migrations applied successfully!` + 2 NOTICES attendues
  `42P06` (schema drizzle déjà existant) et `42P07` (table
  `__drizzle_migrations` déjà existante).

## Résultat

- Smoke prod `Invoke-WebRequest` sur
  `https://edifio-sourcing.vercel.app/sourcing/ao-du-jour` :
  - 307 redirect → `/login?next=/sourcing/ao-du-jour` (middleware domaine OK)
  - HTTP 200 final sur `/login`
  - HTML retourné : aucune occurrence `ErrorBanner`, aucune occurrence
    `deferred_until`
- 🟠 Limitation : sans credentials AlyoS, le Server Component
  `/sourcing/ao-du-jour` lui-même (qui exécute `db.select(...)`) n'a pas été
  rendu — le smoke valide uniquement l'absence d'erreur côté `/login`.
  Validation complète demain matin via Steve authentifié + vérif cron 6h30.

## Follow-ups

- **Task #5** : patch `src/db/migrate.ts:126-135` — construire l'URL en
  interne via `encodeURIComponent` du password pour rendre le mode PG*
  fonctionnel sur Windows (suppression workaround).
- **Vérif demain matin (2026-05-23)** : le cron 6h30 a-t-il tourné ? La
  table `tenders` se remplit-elle ? Smoke authentifié côté Steve.
- **Rotation password BDD prod** : reste en backlog post-MVP (memory
  `followup_post_mvp_security_rotations.md`). Le password vient de
  retransiter via URI dans une env var de session → assumé pour MVP.

## Commits laissés en local (pas de push sans OK Board)

1. `fix(seed): align BOAMP fixture host avec connecteur live (Opendatasoft DILA)`
   — déjà modifié par Alex (`src/db/seed/fetch-boamp-fixture.ts`), follow-up
   (iii) du fix BOAMP du 21/05.
2. `chore(ops): trace hotfix prod migration 0004_tender_deferral` — trace
   docs (DECISIONS.md + cette note), pas de modif code applicatif.

Branche : `feat/sourcing-mvp`. Push différé : Board décide après vérif cron
demain matin.
