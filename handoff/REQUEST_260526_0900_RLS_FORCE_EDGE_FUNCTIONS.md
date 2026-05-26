# DEMANDE CTO — Décision architecture FORCE RLS / Edge Functions

**Date** : 2026-05-26  
**Agent** : Hugo (reviewer) via Alex (dev)  
**Priorité** : 🟠 Orange — bloquant pour merge PR #52

---

## Contexte

Migration `0009_rls_messaging.sql` (PR #52) active `FORCE ROW LEVEL SECURITY` sur
les tables `message_templates` et `organization_profiles`.

## Problème identifié

`FORCE RLS` bloque les lectures faites via `service_role` (Edge Functions Supabase)
car le JWT service_role ne transporte pas de claim `organization_id` valide.

**Impact concret** :
- Les Edge Functions qui lisent `message_templates` (ex. envoi email via Brevo)
  tomberont silencieusement sur un résultat vide au lieu de remonter une erreur claire.
- Le cron de matching (6h30) qui lit `organization_profiles` pourrait être affecté.

## Options proposées

**Option A — Conserver FORCE RLS + patcher les Edge Functions**  
Chaque Edge Function doit appeler `set_config('app.current_organization_id', ...)` 
avant de lire ces tables. Propre, aligné Gate 5 §7 (traçabilité tenant strict).
Effort : ~2h par Edge Function concernée.

**Option B — Retirer FORCE sur ces 2 tables uniquement**  
Garder `ENABLE RLS` (pas FORCE). Les policies PERMISSIVE `tenant_isolation` restent actives
pour les sessions utilisateur. Les lectures service_role passent sans JWT tenant.
Moins strict, mais acceptable si les Edge Functions sont elles-mêmes contraintes par
`organizationId = ALYOS_ORG_ID` en Drizzle.

**Option C — Bypass FORCE RLS par table via `SECURITY DEFINER` function**  
Wrapper SQL qui contourne RLS pour service_role uniquement.
Complexe, déconseillé par Hugo.

## Recommandation Alex + Hugo

**Option A** pour `organization_profiles` (lecture rare, cron uniquement).  
**Option B** pour `message_templates` (lecture fréquente, Edge Functions multiples).

## Action requise

Décision Sophie (CTO) + mise à jour migration 0009 selon choix retenu.
PR #52 peut merger ensuite.
