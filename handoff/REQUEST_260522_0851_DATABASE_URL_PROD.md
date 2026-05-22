# REQUEST — Credentials BDD prod pour application migration `0004_tender_deferral`

**Date** : 2026-05-22 08:51
**Auteur** : Yann (`ps_operator`)
**Branche courante** : `feat/sourcing-mvp`
**Urgence** : P1 prod (page AO du jour KO — `column tenders.deferred_until does not exist`)
**Bloque** : étapes 2 à 5 du brief Board reçu 2026-05-22 (application `0004` prod + smoke + trace + commit)

---

## Contexte

OK Board explicite reçu (zone rouge) pour appliquer `src/db/migrations/0004_tender_deferral.sql` sur la prod Supabase. Pré-checks faits :

- Migration lue : 2× `ALTER TYPE ... ADD VALUE IF NOT EXISTS`, 1× `ALTER TABLE ADD COLUMN`, 1× `CREATE INDEX` partiel. Pas de `DROP` / `TRUNCATE` / destructif. 🟠 À noter : le `ADD COLUMN` et le `CREATE INDEX` ne sont pas `IF NOT EXISTS` dans le SQL ; idempotence garantie uniquement si Drizzle se base sur le journal `__drizzle_migrations` pour skip — ce qui est le comportement nominal, mais à connaître si on doit re-jouer manuellement.
- Journal `meta/_journal.json` : séquence propre `0000 → 0001 → 0002 → 0003 → 0004`. Une seule migration en attente (`0004`).
- `git status` propre (sauf untrackés connus : `design/copy/email_sollicitation_architecte_v1.md`, `design/maquettes/maquettes_v5_admin_architectes.html`, `src/db/seed/prod-seed-report.json`, `handoff/PLAN_TANDEM_ALEX_260522.md` — aucun rapport avec cette opération).
- Pattern Phase β 21/05 relu (`notes-de-suivi/CC_260521_2135_FOLLOWUP_SECURITE_PG.md` + `docs/DEPLOY.md` §Étape 2) : forme éclatée `PG*` est désormais la **voie recommandée** depuis le commit `7ea5238` (PR #25), précisément à cause du double leak password du 21/05.

---

## Demande

Je n'ai PAS le `DATABASE_URL` prod ni les `PG*` prod dans ma session PowerShell courante. Conformément à la consigne du brief (« ne devine pas, ne forge pas »), je sollicite les credentials.

**Forme attendue (Option A recommandée du runbook `docs/DEPLOY.md` Étape 2)** — bloc PowerShell à exécuter dans MA session, sans persistance :

```powershell
$env:PGHOST = "aws-0-eu-central-1.pooler.supabase.com"
$env:PGUSER = "postgres.<project-ref>"
$env:PGPASSWORD = "<password URI-safe>"
$env:PGDATABASE = "postgres"
$env:PGPORT = "5432"
```

Merci de me poster ce bloc directement (Board → moi). Je m'engage à :

1. Ne **jamais** committer / persister ces valeurs.
2. Ne **jamais** afficher le `PGPASSWORD` dans un output, log, note ou commit (masquage `***` partout, comme l'incident 21/05 l'a rendu obligatoire).
3. Nettoyer les 5 vars `PG*` (mise à `$null`) immédiatement après l'opération, conformément à `docs/DEPLOY.md` Étape 9.

---

## Alerte annexe (à traiter, pas bloquant pour le hotfix)

🟠 `.env.local` (local, gitignoré) contient une clé `DATABASE_URL` parmi 17 clés. Je n'ai **pas inspecté la valeur** pour éviter tout risque de fuite. Question Board : est-il acquis que ce `DATABASE_URL` local pointe sur dev/staging (Supabase CLI local ou projet staging) et **pas** sur prod ? Si la valeur est résiduelle de l'opération seed prod du 20/05 (cf. note `CC_260520_*` + `src/db/seed/prod-seed-report.json` non staged), il faudrait :

- soit la rotation post-MVP déjà tracée en memory `followup_post_mvp_security_rotations.md`,
- soit nettoyer maintenant si jugé prioritaire (ticket séparé, pas dans le scope du hotfix `0004`).

Je n'agis pas sur ce point sans OK Board.

---

## Plan d'action après réception des credentials

1. Pose `PG*` dans la session courante (in-memory, pas `.env.local`, pas `setx`).
2. `pnpm drizzle-kit migrate` (le script `src/db/migrate.ts` prendra `PG*` en priorité, mode « éclaté »).
3. Capture output (password jamais affiché — `migrate.ts` log déjà `pwd=***`).
4. Smoke prod : `https://edifio-sourcing.vercel.app/sourcing/ao-du-jour` → attendu : empty state, pas d'`ErrorBanner`.
5. Nettoyage `$env:PG* = $null` (5 vars).
6. Trace `DECISIONS.md` + `notes-de-suivi/CC_260522_HHMM_HOTFIX_DEFERRED_UNTIL.md`.
7. Un seul commit local (`chore(ops): apply migration 0004_tender_deferral on prod Supabase`). **Pas de push** sans OK Board explicite (probable bundle avec fix BOAMP Alex).

---

*Rédigé par Yann (`ps_operator`). En attente de la réponse Board pour reprise.*
