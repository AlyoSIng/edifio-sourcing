# DEMANDE BOARD — Pitfall architecture `BYPASSRLS` sur le rôle `postgres`

**Date** : 2026-06-09
**Agent** : Hugo (reviewer)
**Destinataires** : Marc (CEO), Sophie (CTO), Léa (CMO), Théo (Graphiste)
**Priorité** : 🟠 Orange — décision attendue avant 1er juillet (kickoff portage monorepo Sébastien)
**Statut** : Recommandation Hugo = Option C (différer au Lot 5 portage)
**Lecture estimée** : 5 min

---

## TL;DR (pour Marc et Léa)

Notre base de données a 20 verrous de sécurité (les "RLS policies") qui empêchent
en théorie qu'un utilisateur d'une organisation voie les données d'une autre.
Sauf que ces verrous sont **désactivés automatiquement** parce que notre
application se connecte avec un compte qui a un privilège spécial (`BYPASSRLS`).

En clair : c'est aujourd'hui le **code applicatif** qui fait la séparation entre
organisations (via des filtres `WHERE organization_id = X`), pas la base de données.

**Conséquence** : si un développeur oublie un filtre dans une requête, il n'y a
**aucun garde-fou** côté BDD pour rattraper l'erreur.

**Aujourd'hui ce n'est pas critique** (une seule organisation AlyoS en prod).
**Ça le deviendra le 18 juillet** (bascule multi-tenant PROTECT du monorepo
Suivi+ACT+Sourcing avec des clients tiers).

Hugo recommande de **différer la correction à Sébastien** dans son périmètre de
portage monorepo (Lot 5), pour éviter un double travail à 10 j-h.

---

## 1. Le problème en 3 phrases

Le rôle Supabase `postgres` (celui qu'utilise actuellement le code via
`DATABASE_URL`) a l'attribut `BYPASSRLS` qui désactive **toutes les Row Level
Security** automatiquement. Donc même si on a 20 policies RLS bien définies sur
les tables, **elles ne s'appliquent jamais** quand le code applicatif tourne.
La protection multi-tenant repose en réalité **uniquement** sur les filtres SQL
explicites `WHERE organization_id = X` que le code applicatif ajoute manuellement.

---

## 2. Conséquences immédiates

- **Risque d'oubli silencieux** : si un développeur oublie un `WHERE organization_id`
  dans une requête (ex. `db.select().from(opportunities)` sans where), il y a fuite
  cross-tenant **sans aucune alerte** — ni au build, ni au runtime, ni dans les logs.
- **Tests pgTAP non représentatifs** : les tests `tests/rls/*.sql` qu'on a écrits
  testent les policies sous les rôles `authenticated` / `anon` mais **ne reflètent
  pas la réalité production** où le code tourne en `postgres` BYPASSRLS. Verdict
  pgTAP vert ≠ protection effective en prod.
- **FORCE RLS partiellement neutralisé** : on a ajouté `ALTER TABLE ... FORCE RLS`
  sur 4 tables sensibles (Lot 1.7-bis). `FORCE` est censé empêcher même le
  propriétaire d'une table de bypasser RLS, **mais** `BYPASSRLS` au niveau du
  rôle écrase FORCE. Donc : protection illusoire.
- **Defense-in-depth inexistante** : actuellement il n'y a **qu'une seule** couche
  de protection (les filtres applicatifs). Pas de filet de sécurité BDD.

---

## 3. Conséquences pour la migration du 18 juillet

À la bascule multi-tenant PROTECT du monorepo, le risque change de nature :

- **Plusieurs organisations clients** vont cohabiter dans la même BDD Supabase
  (cf. Q1 du brief migration : projet Supabase unique, partagé Suivi + ACT + Sourcing).
- **Un seul oubli de filtre = fuite cross-client** : c'est-à-dire un client X qui
  voit les AO ou la facturation d'un client Y. Impact RGPD + commercial + image.
- **Le pattern monorepo Suivi+ACT** utilise déjà `authenticated` au lieu de
  `postgres` pour les call sites où la RLS doit s'appliquer, via un helper
  `withTenantContext` qui pose `SET LOCAL app.bypass_rls = false` en début de
  transaction.
- **Sébastien (lead migration)** devra refactorer **tous les call sites** Server
  Actions de Sourcing pour passer en `authenticated` + sentinelle `bypass_rls = false`,
  sinon le périmètre Sourcing reste en mode "filtres applicatifs uniquement"
  pendant que Suivi+ACT bénéficient de la RLS effective. Asymétrie inacceptable
  pour un produit groupé.
- **Effort estimé** : ~5 à 10 jours de portage dans le Lot 5 du brief migration.

---

## 4. Options pour le Board

### Option A — Status quo, on documente le trade-off

- On accepte que la RLS soit une defense-in-depth théorique mais inactive.
- La garde primaire reste les filtres `WHERE organization_id` dans le code.
- On documente clairement dans `DECISIONS.md` que la RLS est non-effective.
- On exige une **revue Hugo systématique** de chaque PR touchant des Server
  Actions, pour vérifier la présence des filtres tenant.
- **Risque** : un dev junior (ou un futur prestataire) oublie un filtre → fuite
  cross-tenant en prod. Détection a posteriori uniquement (logs Sentry).
- **Coût immédiat** : 0 j-h.

### Option B — Refactor immédiat avant juillet

- Avant la bascule du 18 juillet, refactorer toutes les Server Actions Sourcing
  en mode `authenticated`.
- Implémenter le pattern `withTenantContext` qui pose `SET LOCAL app.bypass_rls = false`
  en début de chaque Server Action.
- **Effort** : ~10 j-h sur le périmètre Sourcing (Alex + Camille tests).
- **Bénéfice** : RLS vraiment effective en defense-in-depth dès la bascule.
- **Inconvénient** : Sébastien devra de toute façon réadapter le pattern au
  monorepo (helpers partagés Suivi+ACT). Double travail.

### Option C — Différer au Lot 5 portage Sébastien (recommandé Hugo)

- On laisse en l'état côté Sourcing actuel (équivaut à l'Option A en attendant).
- Sébastien fait le refactor une seule fois, dans son périmètre Lot 5 monorepo,
  avec les helpers `withTenantContext` partagés Suivi+ACT+Sourcing.
- **Bénéfice** : pas de double travail, focalisation sur la bascule, cohérence
  architecturale dans le monorepo final.
- **Inconvénient** : pendant ~6 semaines (9 juin → 18 juillet), Sourcing reste
  sur "filtres applicatifs uniquement". Acceptable car 1 seule org en prod.

---

## 5. Recommandation Hugo

**Option C — Différer au Lot 5 portage**.

Justification :

1. **Pas de breach connu en prod actuelle** : 1 seule organisation AlyoS, donc
   aucune surface d'attaque cross-tenant aujourd'hui.
2. **PROTECT arrive seulement à la bascule juillet** : le risque réel n'existe
   qu'à partir du 18 juillet, et c'est précisément ce que Sébastien refactore
   dans le Lot 5.
3. **Sébastien fait le refactor une seule fois**, dans son périmètre, avec ses
   conventions monorepo et ses helpers partagés. Pas de retravail à prévoir.
4. **L'Option A est temporairement acceptable** parce qu'on a audité (Lot 1.7)
   et qu'on dispose de tous les filtres SQL explicites `WHERE organization_id`
   dans le code Sourcing actuel. La defense-in-depth est absente, mais la garde
   primaire est en place.
5. **Coût opportunité Option B** : 10 j-h immédiat + ~3 j-h de réharmonisation
   au moment du portage = ~13 j-h total. Contre 5 à 10 j-h en Option C, faits
   une seule fois.

---

## 6. Action immédiate Sourcing (déjà engagée)

- ✅ **Audit Hugo nuit du 8 au 9 juin** : 5 Server Actions critiques inspectées
  (matching, facturation, profil orga, écartement, partage cotraitant). Les 5
  ont bien leurs filtres `organization_id` explicites.
- ✅ **Lot 1.6-bis mergé** : `getRequiredOrgId()` hardfail garantit qu'aucune
  Server Action ne peut fallback silencieusement sur `ALYOS_ORG_ID` en cas de
  session ambiguë.
- ✅ **Lot 1.7-bis mergé** : `FORCE RLS` activé sur 4 tables sensibles
  (`opportunities`, `subscriptions`, `audit_log`, `organization_profiles`).
  Inactif via `BYPASSRLS` mais en place pour quand Sébastien fera bascule
  `authenticated`.
- 📌 **À ajouter immédiatement** : checklist obligatoire dans le template PR du
  repo, section « Sécurité » → cocher « Toute requête sur table tenant a son
  filtre `organization_id` explicite ». Revue Hugo bloquante sur ce point.

---

## 7. Action Lot 5 portage (Sébastien, à partir du 1er juillet)

Sébastien aura à charge dans le Lot 5 :

1. **Implémenter `withTenantContext`** : helper qui pose
   `SET LOCAL app.bypass_rls = false` + `SET LOCAL app.current_organization_id = ...`
   en début de chaque transaction Server Action.
2. **Refactorer tous les call sites Server Actions** Sourcing pour passer en
   `authenticated` au lieu de `postgres`.
3. **Adapter les tests pgTAP** pour tester ce mode réel (rôle `authenticated`
   + sentinelle `bypass_rls = false`), et non plus le mode pgTAP "synthétique".
4. **Documenter dans `DECISIONS.md`** la levée du pitfall avec date de bascule
   effective.
5. **Vérifier que les Edge Functions** Supabase (cron 6h30, envoi Brevo) sont
   également alignées sur le pattern, ou explicitement marquées
   "service_role privilégié" avec justification.

---

## Décision attendue

Le Board valide-t-il **l'Option C** ?

- ✅ **Oui** → Hugo ferme le sujet côté Sourcing, ajoute la checklist PR, et
  Sébastien embarque le refactor dans son Lot 5 monorepo.
- ⚠️ **Option A ferme** → on documente le trade-off comme acquis permanent
  (risqué à terme).
- 🔴 **Option B** → on dégage 10 j-h Alex+Camille immédiatement, on décale
  d'autant les autres salves Sourcing en cours.

Steve doit présenter cette note au Board Cowork **avant le 1er juillet**
(kickoff Sébastien). Idéalement à la prochaine visio de cadrage migration
(8-14 juin).

---

*Hugo — reviewer DEV TEAM AlyoS Ingénierie*
