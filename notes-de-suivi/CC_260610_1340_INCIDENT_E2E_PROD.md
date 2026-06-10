# INCIDENT SÉCURITÉ — Fixtures E2E seedées en PROD avec compte superadmin au password public

**Date de détection** : 10 juin 2026, ~12h30 (investigation Camille/qa post-bascule)
**Date de remédiation** : 10 juin 2026, ~13h40 (vecteur fermé + credentials purgés)
**Sévérité** : P0 (compte superadmin fonctionnel en prod, password lisible dans le repo)
**Impact constaté** : aucun accès malveillant identifié (repo privé, fenêtre d'exposition limitée aux lecteurs du repo)

## Résumé

Le job `ci-e2e` de `.github/workflows/ci.yml` utilisait les secrets GitHub **non préfixés**
(`NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`) qui pointent la **PROD**, avec
`E2E_TEST_ROUTES_ENABLED=1`. À chaque push sur `main`, le seed `e2e/fixtures/multi-org-seed.ts`
créait/recréait en prod :

- 3 organisations fixtures (`...a01` AlyoS Ingénierie, `...b01` PROTECT Marseille, `...c01` Cabinet Dupont)
- 7 users `e2e-test+multiorg-*` dont **`e2e-test+multiorg-superadmin@edifio.fr` avec
  `user_metadata.role = "superadmin"`** et le password hardcodé `MULTI_ORG_PASSWORD`
  (multi-org-seed.ts:63) — compte capable d'ouvrir `/sourcing/superadmin/*` en prod
  (filtre domaine retiré par ADR-014, email confirmé, pas de must_change_password)

Cause racine : il n'existe **pas de projet Supabase preview** — au câblage de la CI, les
secrets ont été pointés sur la prod faute d'environnement cible. La seule garde du seed
était le flag `E2E_TEST_ROUTES_ENABLED`, qui ne vérifie pas la cible.

## Chronologie (10/06)

| Heure (UTC) | Événement |
|---|---|
| 06:52 | Push hotfix bascule → run CI → re-seed prod (constaté plus tard via created_at des memberships) |
| ~08:00 | Bascule : doublon org AlyoS repéré, attribué à un « seed e2e » sans approfondir |
| ~12:30 | Investigation Camille : compte superadmin + password public + cause racine ci.yml |
| ~13:10 | Fix Alex `3be50bb` : job ci-e2e → secrets PREVIEW_*, check anti-prod shell dans le workflow, garde `assertNotProdUrl()` dans multi-org-seed.ts + password.ts (réserve review Hugo levée) |
| ~13:40 | Steve : suppression des 7 users e2e (Supabase Auth) + DELETE des 3 orgs fixtures (cascade FK) |

## Remédiation

1. ✅ **Vecteur fermé** (`3be50bb`) — 3 couches : secrets PREVIEW_* (qui n'existent pas → fail-closed),
   check anti-prod shell au niveau workflow, garde `assertNotProdUrl()` côté code (throw si l'URL
   contient le project ref prod `loogmtltwkhvczdiurqs`) dans le seed ET le helper password.
2. ✅ **Credentials purgés** — 7 users supprimés via Supabase Auth, 3 orgs supprimées (cascade
   architects/BE/companies/tenders/search_profiles/memberships, validée par Camille).
3. 🔜 **GitHub secrets** — `SUPABASE_SERVICE_ROLE_KEY` (prod) et `SUPABASE_PROJECT_REF` à
   SUPPRIMER des secrets Actions (plus consommés par aucun workflow après `3be50bb`).
   `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` conservés (job `build`, anon public).
4. 🟡 **CI e2e durable** — décision Steve : stack **Supabase locale éphémère dans le runner**
   (supabase CLI start + migrations Drizzle au boot + clés locales). Chantier Alex en cours.
   En attendant : job `ci-e2e` rouge fail-closed (voulu).

## Leçons / follow-ups

- **Une garde par flag n'est pas une garde par cible** : tout code qui écrit via service_role doit
  vérifier l'identité de la BDD cible (pattern `assertNotProdUrl`, à étendre à
  `e2e/helpers/shared/api-helpers.ts` — suggestion Hugo, follow-up).
- Le job `build` lit encore l'URL + anon key prod via secrets non préfixés — risque faible
  (lecture publique, artefact CI jeté) mais à basculer sur les valeurs locales/factices au
  passage du chantier Supabase-local.
- Vérification Auth → Logs Supabase (connexions des comptes e2e depuis des IP inconnues) :
  recommandée par Hugo, à la discrétion de Steve.
- La rotation de la **service_role key prod** (exposée à des runs CI qui n'auraient jamais dû la
  voir) rejoint le backlog rotations sécurité post-MVP (incident password 21/05).

## Références

- Investigation : Camille (qa), rapport complet dans le transcript session 10/06
- Review fix : Hugo (reviewer) — APPROUVÉ SOUS RÉSERVE, réserve levée
- Commits : `3be50bb` (fix CI + gardes), précédés de `9df5f3e`/`80e6dae` (hardening memberships, même thème post-mortem)
- DECISIONS.md section 2026-06-10 (incident CI e2e)
