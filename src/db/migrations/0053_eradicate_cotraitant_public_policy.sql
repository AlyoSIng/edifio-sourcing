-- ============================================================================
-- 0053_eradicate_cotraitant_public_policy.sql -- Steve 2026-06-09
-- ----------------------------------------------------------------------------
-- Objectif : eradiquer les policies anon publiques sur `cotraitant_shares` et
-- `cotraitant_share_items` qui etaient une bombe a retardement cross-tenant
-- (audit Hugo MEGA-FINAL + recommandation Sebastien suivi_act_reviewer).
--
-- Contexte historique :
--   - 0051 (Lot 1.7) : ENABLE RLS + policy `public_token_*` USING (TRUE).
--     Toleree car role postgres BYPASSRLS en prod = pas d'impact runtime.
--   - 0052 (Lot 1.7-bis) : FORCE RLS + naming `<table>_<action>` + restriction
--     anon `revoked_at IS NULL AND expires_at > now()`. Defense en profondeur.
--   - 0053 (CE FICHIER) : eradication finale. Pattern monorepo Suivi+ACT :
--     AUCUNE policy FOR SELECT TO anon -> remplacee par functions
--     SECURITY DEFINER appelees via Server Action role postgres (BYPASSRLS).
--
-- Pattern de remplacement (aligne monorepo Suivi+ACT, position Q2) :
--   - Aucune policy `TO anon` sur les tables
--   - 4 functions SECURITY DEFINER :
--       * get_cotraitant_share_by_token(token)         -> share core (PAS organization_id)
--       * get_cotraitant_share_items_by_token(token)   -> items du share
--       * get_cotraitant_item_original_path(token, id) -> path Storage pour download
--       * mark_cotraitant_share_item_signed(...)       -> UPDATE signed atomique
--   - La route Next.js `/cotraitant/[token]` appelle ces functions via `db`
--     (role postgres BYPASSRLS en sourcing, idem service_role en monorepo
--     post-18-juillet). En BYPASSRLS, les functions s'executent meme sans
--     policy de table. Les contraintes de validite (revoked_at + expires_at)
--     sont posees DANS la function -> defense en profondeur preservee.
--
-- Securite :
--   - Functions SET search_path = public, pg_temp (anti shadowing CVE-pattern PG)
--   - SECURITY DEFINER : executent avec les droits du proprietaire (postgres),
--     bypass FORCE RLS sur cotraitant_shares + cotraitant_share_items.
--   - Aucune function ne retourne `organization_id` (anti-leak).
--   - Validite share (revoked_at IS NULL AND expires_at > now()) verifiee
--     dans le SQL de chaque function -> meme un token leak post-revocation
--     ne ramene rien.
--   - GRANT EXECUTE TO anon, authenticated avec DO/EXCEPTION guard pour
--     compat CI vanilla Postgres (sans roles Supabase).
--
-- Risque rollback :
--   Si une regression apparait sur /cotraitant/[token], le rollback consiste
--   a recreer les policies de 0052 (cotraitant_shares_select_public, etc.)
--   et a revert le code applicatif. Mais le pattern function est plus robuste
--   car il ne depend pas du role qui appelle.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DROP des policies anon publiques (la bombe a retardement)
-- ----------------------------------------------------------------------------
-- DROP IF EXISTS = idempotent. Re-runnable en dev/CI.

DROP POLICY IF EXISTS "cotraitant_shares_select_public"       ON "cotraitant_shares";--> statement-breakpoint
DROP POLICY IF EXISTS "cotraitant_share_items_select_public"  ON "cotraitant_share_items";--> statement-breakpoint
DROP POLICY IF EXISTS "cotraitant_share_items_update_signed"  ON "cotraitant_share_items";--> statement-breakpoint

-- Vestiges du Lot 1.7 (drop deja fait par 0052 mais garde par securite si replay
-- depuis un etat intermediaire entre 0051 et 0052).
DROP POLICY IF EXISTS "public_token_read"          ON "cotraitant_shares";--> statement-breakpoint
DROP POLICY IF EXISTS "public_token_read"          ON "cotraitant_share_items";--> statement-breakpoint
DROP POLICY IF EXISTS "public_token_update_signed" ON "cotraitant_share_items";--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2. FUNCTION get_cotraitant_share_by_token(token uuid)
-- ----------------------------------------------------------------------------
-- Retourne les colonnes du share necessaires a la page publique, UNIQUEMENT
-- si le share est actif (non revoque + non expire).
--
-- ATTENTION : ne retourne PAS `organization_id` ni `tender_id`. Le contact_name
-- est expose pour le greeting "Bonjour {contact_name}", le contact_email pour
-- affichage facultatif. created_by / created_at non exposes.
--
-- Si le share n'existe pas, est revoque ou expire -> retourne 0 row (la page
-- affichera "Lien invalide" / "Lien expire" / "Lien revoque").
--
-- NB : la page applicative distingue toujours "revoque" vs "expire" vs
-- "introuvable" pour des messages clairs. Pour conserver cette distinction
-- on retourne aussi `revoked_at` et `expires_at` brut, MAIS uniquement si
-- le share existe (on ne masque pas l'etat aux utilisateurs legitimes).
-- Alternative consideree : 3 functions distinctes -> trop verbeux. Retenu :
-- 1 function qui retourne TOUJOURS la ligne si elle existe, le code Next.js
-- decide du message d'erreur. La defense vient des autres functions (items,
-- download, sign) qui elles refusent si share inactif.

CREATE OR REPLACE FUNCTION public.get_cotraitant_share_by_token(token_input uuid)
RETURNS TABLE (
  id            uuid,
  contact_name  text,
  contact_email text,
  expires_at    timestamptz,
  revoked_at    timestamptz
  -- PAS organization_id, PAS tender_id, PAS created_by (anti-leak)
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT
    cs.id,
    cs.contact_name,
    cs.contact_email,
    cs.expires_at,
    cs.revoked_at
  FROM cotraitant_shares cs
  WHERE cs.token = token_input
  LIMIT 1;
$$;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 3. FUNCTION get_cotraitant_share_items_by_token(token uuid)
-- ----------------------------------------------------------------------------
-- Retourne les items du share APRES verification que le share est actif.
-- Si share inactif (revoque ou expire) -> 0 row (defense en profondeur).
-- Note : la route Next.js verifie deja l'etat du share via la function 1, mais
-- on double-check ici pour empecher tout bypass par appel direct RPC.

CREATE OR REPLACE FUNCTION public.get_cotraitant_share_items_by_token(token_input uuid)
RETURNS TABLE (
  id                    uuid,
  name                  text,
  kind                  text,
  original_storage_path text,
  signed_at             timestamptz,
  signer_name           text,
  signed_filename       text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT
    csi.id,
    csi.name,
    csi.kind,
    csi.original_storage_path,
    csi.signed_at,
    csi.signer_name,
    csi.signed_filename
  FROM cotraitant_share_items csi
  JOIN cotraitant_shares cs ON cs.id = csi.share_id
  WHERE cs.token = token_input
    AND cs.revoked_at IS NULL
    AND cs.expires_at > now();
$$;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 4. FUNCTION get_cotraitant_item_original_path(token, item_id)
-- ----------------------------------------------------------------------------
-- Retourne le `original_storage_path` d'un item si :
--   1. Le token correspond a un share actif
--   2. L'item appartient bien a ce share (anti-IDOR : empeche un visiteur
--      muni d'un token actif de telecharger un item d'un AUTRE share)
-- Sinon -> NULL.
--
-- Utilise par getCotraitantDownloadUrl pour generer l'URL signee Supabase.

CREATE OR REPLACE FUNCTION public.get_cotraitant_item_original_path(
  token_input uuid,
  item_id_input uuid
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT csi.original_storage_path
  FROM cotraitant_share_items csi
  JOIN cotraitant_shares cs ON cs.id = csi.share_id
  WHERE cs.token = token_input
    AND csi.id = item_id_input
    AND cs.revoked_at IS NULL
    AND cs.expires_at > now()
  LIMIT 1;
$$;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 5. FUNCTION mark_cotraitant_share_item_signed(...)
-- ----------------------------------------------------------------------------
-- UPDATE atomique de l'item signe (post-upload Storage). Conditionne sur :
--   1. Token correspond a un share actif (revoked_at IS NULL AND expires_at > now())
--   2. L'item appartient bien au share (anti cross-item)
--   3. L'item n'est PAS deja signe (anti re-signature -- choix produit : un
--      depot signe est definitif, le BE doit redemander un nouveau partage
--      pour corriger).
--
-- Retourne TRUE si 1 row affectee, FALSE sinon (token invalide / item invalide
-- / deja signe). La route Next.js mappe FALSE -> "share_invalid" / "item_not_found".

CREATE OR REPLACE FUNCTION public.mark_cotraitant_share_item_signed(
  token_input              uuid,
  item_id_input            uuid,
  signed_storage_path_in   text,
  signer_name_in           text,
  signed_filename_in       text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected_count int;
BEGIN
  UPDATE cotraitant_share_items csi
     SET signed_storage_path = signed_storage_path_in,
         signed_at           = now(),
         signer_name         = signer_name_in,
         signed_filename     = signed_filename_in
   FROM cotraitant_shares cs
   WHERE csi.share_id = cs.id
     AND cs.token = token_input
     AND csi.id = item_id_input
     AND cs.revoked_at IS NULL
     AND cs.expires_at > now()
     AND csi.signed_at IS NULL;  -- anti re-signature

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count > 0;
END;
$$;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 6. GRANT EXECUTE -- compat CI Postgres vanilla (sans roles Supabase)
-- ----------------------------------------------------------------------------
-- En prod Supabase, anon + authenticated existent nativement. En CI local
-- Postgres vanilla (workflow db-rls.yml pg_prove), ces roles n'existent pas
-- -> on guard avec DO block + EXCEPTION undefined_object (no-op).
-- Pattern deja eprouve dans 0052.

DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_cotraitant_share_by_token(uuid) TO authenticated';
  EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'Role authenticated absent (CI local), skip GRANT get_cotraitant_share_by_token().';
  END;
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_cotraitant_share_by_token(uuid) TO anon';
  EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'Role anon absent (CI local), skip GRANT get_cotraitant_share_by_token().';
  END;

  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_cotraitant_share_items_by_token(uuid) TO authenticated';
  EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'Role authenticated absent, skip GRANT get_cotraitant_share_items_by_token().';
  END;
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_cotraitant_share_items_by_token(uuid) TO anon';
  EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'Role anon absent, skip GRANT get_cotraitant_share_items_by_token().';
  END;

  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_cotraitant_item_original_path(uuid, uuid) TO authenticated';
  EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'Role authenticated absent, skip GRANT get_cotraitant_item_original_path().';
  END;
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_cotraitant_item_original_path(uuid, uuid) TO anon';
  EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'Role anon absent, skip GRANT get_cotraitant_item_original_path().';
  END;

  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.mark_cotraitant_share_item_signed(uuid, uuid, text, text, text) TO authenticated';
  EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'Role authenticated absent, skip GRANT mark_cotraitant_share_item_signed().';
  END;
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.mark_cotraitant_share_item_signed(uuid, uuid, text, text, text) TO anon';
  EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'Role anon absent, skip GRANT mark_cotraitant_share_item_signed().';
  END;
END $$;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- FIN 0053 -- bombe a retardement eradiquee
-- ----------------------------------------------------------------------------
-- Resume :
--   - 3 policies anon supprimees (cotraitant_shares_select_public +
--     cotraitant_share_items_select_public + cotraitant_share_items_update_signed)
--   - 4 functions SECURITY DEFINER creees (get_share, get_items, get_path, mark_signed)
--   - GRANT EXECUTE compat CI
--   - Aucune function ne retourne organization_id (anti-leak)
--   - Validite share (revoked_at + expires_at) verifiee dans toutes les
--     functions sauf get_cotraitant_share_by_token (qui retourne l'etat brut
--     pour permettre au code Next.js d'afficher un message clair)
--
-- Code applicatif a adapter :
--   - src/app/cotraitant/[token]/page.tsx -> db.execute(sql`SELECT * FROM get_...`)
--   - src/app/cotraitant/[token]/actions.ts -> db.execute(sql`SELECT * FROM get_..._path`)
--                                              et db.execute(sql`SELECT mark_...`)
--
-- Tests pgTAP a adapter (14_cotraitant_shares_isolation.sql) :
--   - DROP des assertions sur cotraitant_shares_select_public + variants
--   - ADD assertions : functions existent, retournent les bonnes valeurs,
--     bloquent les shares revoques/expires, refusent IDOR cross-item.
-- ============================================================================
