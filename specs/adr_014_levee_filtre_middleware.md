# ADR-014 — Levée du filtre `@alyosingenierie.fr` du middleware racine (ouverture multi-tenant)

**Statut** : Acté
**Date** : 2026-06-05
**Décideur** : Steve TEISSIER (CTO de fait, Board AlyoS / éditeur edifio)
**Contexte session** : Plan hybride salve T (multi-tenant)

---

## Contexte

Depuis Gate 1, le middleware racine `src/middleware.ts` rejetait toute session dont l'email ne se terminait pas par `@alyosingenierie.fr` (élargi à `@edifio.fr` en 2026-05-27 pour le superadmin éditeur). Cette garde protégeait l'app pendant la phase MVP où elle était utilisée exclusivement par AlyoS Ingénierie.

Le 2026-06-05, la décision Board acte l'ouverture à une deuxième organisation cliente :
- **PROTECT** (Marseille) — admin `contact@protect-marseille.com`
- Maintenance du superadmin `contact@edifio.fr`

Maintenir le filtre `@alyosingenierie.fr` empêcherait :
- `contact@protect-marseille.com` de se connecter
- Les futurs collaborateurs de PROTECT invités par leur admin de se connecter
- Toute org cliente future de l'app

---

## Décision

**Supprimer la garde de domaine `isAuthorizedEmail` du middleware racine** et des routes admin/users.

**Architecture de remplacement (defense in depth)** :

1. **Désactivation des signups publics Supabase Auth** (côté config Supabase Studio → Authentication > Email > "Enable signups" → OFF).
   → Aucun email random sur internet ne peut créer un compte. Seul l'admin de chaque org peut provisionner un user via le flow `/sourcing/admin/users` (mot de passe provisoire 16 car. envoyé via Resend, expiration 24h).

2. **RLS BDD FORCE scopée par `organization_id` via `memberships`** (12 policies SQL natif, testées par pgTAP).
   → Un user qui n'a aucune ligne dans `memberships` ne voit aucune donnée applicative (zéro AO, zéro architecte, zéro biblio, etc.).

3. **Gardes du middleware conservées** :
   - Auth (`supabase.auth.getUser()` obligatoire)
   - `must_change_password` (force /reset-password si flag actif)
   - Rôle `admin` sur `/sourcing/admin/*` et `/api/admin/*`
   - Rôle `superadmin` sur `/sourcing/superadmin/*`

4. **Audit log conservé** : la fonction `logAccessAttempt` continue de tracer chaque accès via `console.warn` structuré (capté par Vercel logs / Datadog).

---

## Conséquences

### Code

- `src/middleware.ts` : suppression de l'import `isAuthorizedEmail` et du bloc 5 « Garde domaine ». La variable `allowed` du log est toujours `true` à ce stade.
- `src/app/forgot-password/actions.ts` : la garde domaine retirée. Anti-énumération préservée par le retour `status: "sent"` quelle que soit l'entrée.
- `src/app/api/admin/users/route.ts` : les 2 gardes domaine (caller + email cible) supprimées. Seule la garde de rôle `isAdmin` reste.
- `src/app/api/admin/users/[id]/regenerate-password/route.ts` : idem, 2 gardes domaine supprimées.
- `src/lib/auth/domain.ts` : la fonction `isAuthorizedEmail` est marquée `@deprecated` mais conservée pour la batterie de tests `domain.test.ts` (12 cas C1-C12) et pour des callers externes éventuels.
- `src/app/forbidden/page.tsx` : message updated. Plus de mention « réservé aux membres AlyoS » ni `it@alyosingenierie.fr`. Contact `contact@edifio.fr`.
- `CLAUDE.md` : section « Limites strictes » mise à jour. Désactiver le middleware reste interdit, mais la garde domaine spécifique est explicitement listée comme retirée par ADR-014.

### Tests

- Les tests `src/lib/auth/domain.test.ts` (12 cas) restent verts — la fonction n'a pas changé de comportement, juste de statut.
- Aucun test middleware ne testait directement le rejet par domaine (à confirmer en relançant la suite complète).
- Test E2E à ajouter (lot R5 de la salve T) : un user d'org PROTECT ne peut pas voir les données AlyoS et vice versa.

### Sécurité

- **Risque d'orphan accounts** (user sans memberships qui se connecte) : neutralisé par la RLS BDD — il voit l'app vide, aucune donnée sensible.
- **Risque de signup public** : neutralisé par la désactivation côté Supabase Auth.
- **Risque d'admin malveillant qui invite massivement** : limité par le quota implicite du flow admin-create (un admin = un seul mot de passe provisoire à la fois côté UI).
- **Risque d'admin AlyoS qui voit les données PROTECT** : neutralisé par la RLS — un membership AlyoS ne donne accès qu'aux données AlyoS.

### Ops

- Côté Supabase Studio : **action humaine requise** par Steve (CTO) — Authentication > Email > « Enable signups » → OFF en prod ET en dev. À tracer dans une note de suivi avec timestamp.
- Côté Vercel : aucun changement.
- Côté DNS edifio.fr : aucun changement (le custom domain `sourcing.edifio.fr` est traité en parallèle).

---

## Alternatives écartées

### Alternative A — Whitelist d'emails configurable

Liste en dur dans le code : `steissier@alyosingenierie.fr` + `contact@protect-marseille.com` + `contact@edifio.fr`. Ajouter un nouvel utilisateur passe par un commit.

**Écartée** : ne scale pas, oblige un déploiement à chaque invitation, peu compatible avec le rythme d'onboarding cible (5-10 nouveaux users par org par mois en V2 SaaS).

### Alternative B — Whitelist de domaines par organisation

Chaque org définit ses domaines autorisés dans une table `organizations.allowed_email_domains[]`. Le middleware compare l'email entrant à la liste des domaines de toutes les orgs.

**Écartée** : complexité, demande une refonte BDD (migration + UI admin), risque de fuite si un user crée un compte sur un domaine partagé par 2 orgs. Reportée à V2 si le besoin se confirme.

### Alternative C — Flow d'invitation pur (RETENUE)

Le filtre domaine est supprimé. Seul l'admin de chaque org peut provisionner un user via le flow `/sourcing/admin/users`. Les signups publics Supabase Auth sont désactivés côté config. La RLS BDD scope automatiquement les accès du user invité à sa seule org.

**Retenue** parce que :
- Zéro nouvelle complexité côté code applicatif
- Compatible avec le flow admin-create déjà éprouvé (mot de passe provisoire + Resend + first-login force change)
- Defense in depth via Supabase Auth + RLS BDD
- Permet d'onboarder PROTECT immédiatement, puis n'importe quelle org future sans aucune modif de code

---

## Migration / Mise en service

1. **Code** : commits poussés dans la PR salve T (multi-tenant).
2. **Config Supabase prod** : Steve désactive les signups publics (case à cocher dans Supabase Studio).
3. **Création org PROTECT** : SQL natif via Supabase SQL Editor (cf. bloc à part).
4. **Invitation de `contact@protect-marseille.com`** : Steve / superadmin via UI `/sourcing/admin/users`.
5. **Tests E2E** :
   - PROTECT user voit ses AOs, pas ceux d'AlyoS
   - AlyoS user voit ses AOs, pas ceux de PROTECT
   - `contact@edifio.fr` superadmin voit les 2 orgs
   - Un email aléatoire (`random@gmail.com`) ne peut pas se connecter (signup OFF)

---

## Pour aller plus loin

- ADR-015 (planifié T3 2026) — Migration éventuelle du repo `edifio-sourcing` vers le monorepo `alyos-suivi-chantier` (1 plateforme edifio unifiée). À débattre après retour d'expérience de l'usage AlyoS + PROTECT sur le repo séparé.
- Spec `multi_tenant_onboarding_v1.md` (à créer post-MVP) : page signup publique edifio, paywall Stripe, trial 14 jours.
- Veto possible : si la fuite de session se confirmait via un user sans memberships, revenir à une garde stricte de membership active dans le middleware (helper `hasActiveMembership(userId)` à implémenter en Edge-compatible).
