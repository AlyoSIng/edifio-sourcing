# CR — Bascule prod 10/06/2026 — Migrations 0050-0053 + Fix Vercel + UI Salve U live

**Date** : 10 juin 2026, 06:55 → 08:55 UTC (08:55 → 10:55 Paris)
**Pilote** : Steve TEISSIER (CTO AlyoS)
**Sub-agents** : Alex (dev), Yann (ps_operator)
**Objet** : Application des migrations Salve U + RLS lot1.7 + éradication bombe cotraitant, déblocage build Vercel cassé en cascade, retour à un état prod 100 % opérationnel.

## TL;DR

✅ **Bascule réussie de bout en bout** — schema BDD + build Vercel + UI Salve U + auth multi-tenant tous validés sur `sourcing.edifio.fr` en moins de 2h.

## Chronologie

### Phase 1 — Préparation (avant 06:55)

- Backup PROD `backups/sourcing-prod-2026-06-09-2127.dump` créé via Session Pooler `aws-0-eu-west-1.pooler.supabase.com:5432` (Direct connection 5432 cassée IPv6-only).
- Dry-run Docker postgres:17 sur le backup : 4 migrations appliquées sans erreur, vérifications B/C/D/E toutes vertes (4 colonnes 0050, FORCE RLS sur 4 tables, 5 helpers SECURITY DEFINER, 0 policy publique résiduelle, 13 policies sur les 4 tables).

### Phase 2 — Apply PROD (06:55)

Application directe via `docker run psql -f` Session Pooler avec `ON_ERROR_STOP=1`. Le pipeline `Tee-Object` a échoué (dossier `logs/` absent), mais `docker run` a tourné avant — les 4 migrations sont passées sans qu'on s'en rende compte.

Vérification immédiate post-apply : `has_payload_col=1`, `has_helper=1`, `force_rls_companies=true`. Vérif complète B/C/D/E sur PROD identique au dry-run.

### Phase 3 — Découverte build Vercel cassé en cascade

Smoke test impossible sur `sourcing.alyosingenierie.fr` (DNS non résolu — URL CHEAT_SHEET obsolète, vraie URL = `sourcing.edifio.fr`). Sur Vercel dashboard : **TOUS les builds en Error depuis 1+ jour**. La prod tournait sur un build encore plus ancien, sans la nouvelle UI Salve U.

**Reproduction locale** `next build` env-clean → cascade Next.js 15 strict :

| Fichier | Bug | Fix |
|---|---|---|
| `src/app/auth/callback/page.tsx` | Union `searchParams: Promise<X> \| X` | Resserrer à `Promise<X>` only (commit `9307a4c`) |
| `src/app/sourcing/bureaux-etudes/[id]/page.tsx` | `params: { id: string }` sync | Wrap `Promise<{id: string}>` + await (commit `3794091`) |
| `src/app/sourcing/entreprises/[id]/page.tsx` | idem | idem |
| `src/app/sourcing/bureaux-etudes/page.tsx` | `searchParams: SearchParams` interface sync | Wrap `Promise<SearchParams>` + await |
| `src/app/sourcing/entreprises/page.tsx` | idem | idem |

Build local env-clean vert après le 2e commit → push → Vercel `3794091` **Ready** en 2m04s → badge **Production** activé.

### Phase 4 — Smoke test prod & découverte membership manquant

Login `steissier@alyosingenierie.fr` sur `sourcing.edifio.fr` → atterrit sur `/no-org` (« Compte non rattaché »).

Vérif SQL PROD : Steve **n'a JAMAIS eu de membership** dans la table `memberships`. Ses 2 collègues (`assistante@`, `bim@`) y sont depuis le 29/05 sur org `11111111-1111-1111-1111-111111111111` (AlyoS Ingenierie sans accent — l'org "canonique" en prod). E2E tests d'aujourd'hui matin ont aussi peuplé l'org doublon `00000000-...-a01` (AlyoS Ingénierie avec accent).

INSERT manuel :
```sql
INSERT INTO memberships (user_id, organization_id, role)
VALUES ('5b1a1a7d-dd8c-4ca9-9389-dcb49cf2fedc',
        '11111111-1111-1111-1111-111111111111',
        'admin')
RETURNING *;
```

Re-login OK → `/sourcing/ao-du-jour` → 6 motifs structurés Salve U visibles dans la modale Écarter. **UI live, bout en bout validé.**

## Bugs/dettes à traiter post-bascule

1. **Doublon org AlyoS** : `00000000-...-a01` et `11111111-...-1111` co-existent. Il faut migrer les e2e-test users de `a01` vers `1111...` (ou inverse) et supprimer le doublon. À planifier hors urgence.
2. **Sync journal `__drizzle_migrations` PROD** : 33 entries actuellement, manque 0050/0051/0052/0053. Risque : `drizzle-kit migrate` futur retentera les 4 migrations. À calculer les vrais hashes Drizzle (sha256 du contenu SQL avec normalisation Drizzle) puis INSERT 4 lignes. Task #99 pending.
3. **CHEAT_SHEET_BASCULE.md & ONBOARDING_PROTECT_ADMIN.md** : URLs incohérentes (`sourcing.alyosingenierie.fr` vs `sourcing.edifio.fr` — la 2e est la vraie prod). Aligner.
4. **Post-mortem membership Steve manquant** : pourquoi son user `5b1a1a7d-...` n'a-t-il jamais eu de membership alors que ses 2 collègues l'ont depuis le 29/05 ? Bug de seed initial probable. À investiguer.
5. **Sync logique d'INSERT membership** dans l'admin `/sourcing/admin/users` ou superadmin : la création d'un user superadmin via `/sourcing/superadmin/organizations` doit garantir le membership. À vérifier dans le code.

## Décisions techniques actées (en cours de session)

- **Session Pooler IPv4 standard** pour ops PROD (Direct connection 5432 cassée IPv6 sur Docker Windows).
- **Pattern fix Next.js 15 `params`/`searchParams`** : destructure interne via `paramsPromise`/`searchParamsPromise` + `const x = await xPromise` pour ne pas casser le code utilisateur existant.
- **Wrap-up bascule formel** : note de suivi (ce doc) + DECISIONS.md + communiqué post-deploy avant clôture.

## Communications

- À envoyer après confirmation 7e motif (en cours par Alex) : mail équipe AlyoS + Slack interne.

## Status final

- Migrations BDD : ✅
- Build Vercel : ✅
- UI Salve U : ✅
- Multi-tenant + membership Steve : ✅
- Bombe cotraitant_shares_select_public : ✅ éradiquée
- Helpers SECURITY DEFINER : ✅ 5/5 (`prosecdef=t`)
- FORCE RLS sur les 4 tables sensibles : ✅
- Sync journal Drizzle : 🔜 plus tard, non bloquant pour app
