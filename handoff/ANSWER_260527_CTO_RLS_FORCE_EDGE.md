# ANSWER CTO — FORCE RLS / Edge Functions (réponse à REQUEST_260526_0900)

**Date** : 2026-05-27
**De** : Sophie (CTO) — via Board Cowork
**Pour** : Hugo (reviewer), Alex (dev)
**Objet** : décision FORCE RLS sur `message_templates` + `organization_profiles` (PR #52 / migration 0009)
**Zone** : 🟠 → tranchée CTO

---

## Décision

**Option A pour les DEUX tables.** On conserve `FORCE ROW LEVEL SECURITY` partout.

Motif : l'ouverture multi-tenant est prévue en Phase 2. Je refuse de laisser une table
en posture RLS dégradée (ENABLE sans FORCE) à ce moment-là — c'est exactement le type
de table (`message_templates`, `organization_profiles`) où une fuite cross-org serait
critique. La sécurité prime sur la vélocité (principe non négociable CLAUDE.md).

## Comment neutraliser le coût (« ~2h par Edge Function »)

Le coût annoncé suppose de patcher chaque Edge Function indépendamment. On ne fait pas ça.

**Écrire un helper partagé unique** — ex. `withTenantContext(orgId, fn)` — qui :
1. exécute `select set_config('app.current_organization_id', $orgId, true)` dans la
   transaction / connexion en cours,
2. puis lance la lecture/écriture,
3. est réutilisé par TOUTES les Edge Functions concernées (envoi Brevo, cron matching 6h30…).

Le surcoût retombe à **l'écriture d'un seul helper + 1 ligne par fonction**.

## Repli toléré (et seulement celui-là)

Si, à l'implémentation, le helper s'avère réellement plus lourd que prévu (incompatibilité
runtime Deno / postgres-js sur `set_config`), alors **Option B sur `message_templates`
uniquement** est tolérée — MAIS :
- `organization_profiles` reste en FORCE (Option A, non négociable — lecture rare, cron only) ;
- la dérogation est **tracée comme dette** dans `DECISIONS.md` ;
- elle est **revertée vers FORCE + helper avant la Gate 8 (audit sécu/RGPD)**.

## Action

1. Alex : implémenter `withTenantContext()` + l'appliquer aux Edge Functions lisant ces 2 tables.
2. Garder la migration 0009 telle quelle (FORCE conservé).
3. Hugo : revue ciblée sur l'absence de lecture service_role hors `withTenantContext`.
4. Entrée `DECISIONS.md` (décision + repli conditionnel documenté).
5. PR #52 peut merger une fois le helper en place et les tests verts.
