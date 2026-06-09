-- ============================================================================
-- verify-post-deploy.sql
-- ============================================================================
-- Verifie automatiquement que les migrations 0050, 0051, 0052, 0053 sont
-- bien en place ET que les invariants critiques (FORCE RLS, helpers
-- SECURITY DEFINER, policies, suppressions post-0053) sont respectes.
--
-- Usage :
--   psql "$PG_URL" -v ON_ERROR_STOP=1 -f scripts/migration/verify-post-deploy.sql
--
-- Convention :
--   - Chaque bloc DO $$ ... RAISE EXCEPTION en cas d'invariant viole.
--   - En cas de succes, l'execution se termine avec NOTICE final
--     "Toutes les assertions post-deploy OK".
--   - Le code retour psql est 0 si tout OK, non-zero si au moins une
--     assertion echoue (ON_ERROR_STOP=1 + RAISE EXCEPTION).
--
-- Auteur : Yann (ps_operator) -- prepare pour bascule 10 juin 2026.
-- Cf. CLAUDE.md > section "Premières actions Gate 6" + ROLLBACK_PLAN.
-- ============================================================================

\echo '== Post-deploy assertions 0050-0053 =='
\echo ''

-- ----------------------------------------------------------------------------
-- A. Migrations Drizzle journal (presence des 4 hashes attendus)
-- ----------------------------------------------------------------------------
-- Note : drizzle.__drizzle_migrations n'a PAS de colonne 'tag' (convention
-- journal v7 : uniquement id / hash / created_at). On verifie donc la presence
-- des 4 hashes SHA256 calcules sur le contenu UTF-8 des fichiers SQL.
-- Hashes generes par apply-migrations-0050-0053.ps1 (meme algorithme).
-- ----------------------------------------------------------------------------
\echo '-- A. Migrations Drizzle journal --'
DO $$
DECLARE
  c int;
  expected_hashes text[] := ARRAY[
    'e509aed6197320c9b07648ae70de6c82905771d4a2c4a01978df02c3d83d7c5a',  -- 0050
    '5f694bc709b863dcc0fb1a62663836783b57581b13a1186d2683aff6995261b1',  -- 0051
    '911b76f754b295ffd8b3dfd06a3ea337007409fa6adbb78434699f72ad2122f4',  -- 0052
    '0f536f04b855f1b151378e96e908138dc061a3e788bf0338a984f28b904c393e'   -- 0053
  ];
BEGIN
  SELECT COUNT(*) INTO c
    FROM drizzle.__drizzle_migrations
   WHERE hash = ANY(expected_hashes);
  IF c <> 4 THEN
    RAISE EXCEPTION 'A.1 KO : 4 hashes 0050-0053 attendus dans drizzle.__drizzle_migrations, trouve : %', c;
  END IF;
  RAISE NOTICE 'A.1 OK : 4 hashes 0050-0053 presents dans drizzle.__drizzle_migrations';

  -- Compteur global : 54 fichiers (0000 -> 0053)
  SELECT COUNT(*) INTO c FROM drizzle.__drizzle_migrations;
  IF c < 54 THEN
    RAISE EXCEPTION 'A.2 KO : drizzle.__drizzle_migrations doit contenir au moins 54 entrees, trouve : %', c;
  END IF;
  RAISE NOTICE 'A.2 OK : drizzle.__drizzle_migrations contient % entrees (>= 54)', c;
END $$;

-- ----------------------------------------------------------------------------
-- B. Colonnes learning_events (0050)
-- ----------------------------------------------------------------------------
\echo '-- B. Colonnes learning_events (0050) --'
DO $$
DECLARE
  missing text;
BEGIN
  FOR missing IN
    SELECT unnest(ARRAY['payload', 'reason_code', 'applied_at', 'dismissed_at'])
    EXCEPT
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'learning_events'
  LOOP
    RAISE EXCEPTION 'B KO : colonne manquante learning_events.%', missing;
  END LOOP;

  -- Verification des types attendus
  PERFORM 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'learning_events'
      AND column_name = 'payload' AND data_type = 'jsonb';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'B KO : learning_events.payload doit etre jsonb';
  END IF;

  PERFORM 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'learning_events'
      AND column_name = 'reason_code' AND data_type = 'text';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'B KO : learning_events.reason_code doit etre text';
  END IF;

  PERFORM 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'learning_events'
      AND column_name IN ('applied_at', 'dismissed_at')
      AND data_type = 'timestamp with time zone';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'B KO : learning_events.applied_at / dismissed_at doivent etre timestamptz';
  END IF;

  RAISE NOTICE 'B OK : 4 colonnes learning_events (payload/reason_code/applied_at/dismissed_at) presentes avec bons types';
END $$;

-- ----------------------------------------------------------------------------
-- C. FORCE RLS sur 4 tables (0052)
-- ----------------------------------------------------------------------------
\echo '-- C. FORCE RLS sur 4 tables (0052) --'
DO $$
DECLARE
  c int;
  missing text;
BEGIN
  SELECT COUNT(*) INTO c
    FROM pg_class
   WHERE relname IN ('companies', 'bureaux_etudes', 'cotraitant_shares', 'cotraitant_share_items')
     AND relnamespace = 'public'::regnamespace
     AND relforcerowsecurity = true
     AND relrowsecurity = true;
  IF c <> 4 THEN
    -- Diagnostic : lister les manquantes
    FOR missing IN
      SELECT unnest(ARRAY['companies', 'bureaux_etudes', 'cotraitant_shares', 'cotraitant_share_items'])
      EXCEPT
      SELECT relname FROM pg_class
       WHERE relnamespace = 'public'::regnamespace
         AND relforcerowsecurity = true
         AND relrowsecurity = true
    LOOP
      RAISE WARNING 'C : FORCE RLS absent sur table %', missing;
    END LOOP;
    RAISE EXCEPTION 'C KO : FORCE RLS + RLS attendus sur 4 tables, trouve sur : %', c;
  END IF;
  RAISE NOTICE 'C OK : FORCE RLS + RLS actifs sur 4 tables (companies, bureaux_etudes, cotraitant_shares, cotraitant_share_items)';
END $$;

-- ----------------------------------------------------------------------------
-- D. Functions SECURITY DEFINER (0052 + 0053)
-- ----------------------------------------------------------------------------
\echo '-- D. Functions SECURITY DEFINER (0052 + 0053) --'
DO $$
DECLARE
  expected_funcs text[] := ARRAY[
    'current_user_org_id()',
    'get_cotraitant_share_by_token(uuid)',
    'get_cotraitant_share_items_by_token(uuid)',
    'get_cotraitant_item_original_path(uuid,uuid)',
    'mark_cotraitant_share_item_signed(uuid,text)'
  ];
  missing text;
  not_definer text;
BEGIN
  -- Verifier presence
  FOR missing IN
    SELECT unnest(expected_funcs)
    EXCEPT
    SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('current_user_org_id', 'get_cotraitant_share_by_token',
                         'get_cotraitant_share_items_by_token',
                         'get_cotraitant_item_original_path',
                         'mark_cotraitant_share_item_signed')
  LOOP
    RAISE EXCEPTION 'D.1 KO : fonction manquante public.%', missing;
  END LOOP;
  RAISE NOTICE 'D.1 OK : 5 fonctions helper presentes dans schema public';

  -- Verifier SECURITY DEFINER (prosecdef = true)
  FOR not_definer IN
    SELECT p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('current_user_org_id', 'get_cotraitant_share_by_token',
                         'get_cotraitant_share_items_by_token',
                         'get_cotraitant_item_original_path',
                         'mark_cotraitant_share_item_signed')
       AND p.prosecdef = false
  LOOP
    RAISE EXCEPTION 'D.2 KO : fonction public.% N''EST PAS SECURITY DEFINER', not_definer;
  END LOOP;
  RAISE NOTICE 'D.2 OK : les 5 fonctions sont SECURITY DEFINER';
END $$;

-- ----------------------------------------------------------------------------
-- E. Policies (0051 + 0052 + 0053)
-- ----------------------------------------------------------------------------
\echo '-- E. Policies sur 4 tables --'
DO $$
DECLARE
  c int;
  forbidden text;
BEGIN
  -- E.1 : au moins 16 policies sur les 4 tables
  SELECT COUNT(*) INTO c
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('companies', 'bureaux_etudes', 'cotraitant_shares', 'cotraitant_share_items');
  IF c < 16 THEN
    RAISE EXCEPTION 'E.1 KO : au moins 16 policies attendues sur 4 tables, trouve : %', c;
  END IF;
  RAISE NOTICE 'E.1 OK : % policies presentes sur les 4 tables (>= 16)', c;

  -- E.2 : aucune policy publique "select_public" ou "public_token_*"
  --       (eradiquees par 0053 — toute relecture cotraitant passe par helpers
  --       SECURITY DEFINER, plus aucune policy ne doit autoriser anon direct)
  FOR forbidden IN
    SELECT schemaname || '.' || tablename || '.' || policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('cotraitant_shares', 'cotraitant_share_items')
       AND (
         policyname ILIKE '%select_public%'
         OR policyname ILIKE 'public_token_%'
       )
  LOOP
    RAISE EXCEPTION 'E.2 KO : policy publique residuelle interdite : % (doit etre droppee par 0053)', forbidden;
  END LOOP;
  RAISE NOTICE 'E.2 OK : aucune policy publique residuelle (select_public, public_token_*)';

  -- E.3 : chaque table doit avoir au moins 1 policy
  SELECT COUNT(DISTINCT tablename) INTO c
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('companies', 'bureaux_etudes', 'cotraitant_shares', 'cotraitant_share_items');
  IF c <> 4 THEN
    RAISE EXCEPTION 'E.3 KO : les 4 tables doivent avoir au moins 1 policy chacune, couvert : %/4', c;
  END IF;
  RAISE NOTICE 'E.3 OK : les 4 tables ont au moins 1 policy chacune';
END $$;

-- ----------------------------------------------------------------------------
-- F. Helper function fonctionne (smoke logique)
-- ----------------------------------------------------------------------------
-- En contexte service_role (psql admin), current_user_org_id() doit retourner
-- NULL (pas d'auth.uid()). C'est attendu : on verifie juste que la fonction
-- s'execute sans erreur (signature + corps coherent).
-- ----------------------------------------------------------------------------
\echo '-- F. Helpers fonctionnels (smoke) --'
DO $$
DECLARE
  v_result uuid;
BEGIN
  BEGIN
    SELECT public.current_user_org_id() INTO v_result;
    -- v_result NULL attendu en contexte service_role (pas d'auth.uid())
    RAISE NOTICE 'F.1 OK : current_user_org_id() executable (retour = %)',
      COALESCE(v_result::text, 'NULL (attendu en service_role)');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'F.1 KO : current_user_org_id() leve une exception : %', SQLERRM;
  END;

  -- F.2 : get_cotraitant_share_by_token avec token bidon doit retourner 0 ligne
  --       (pas erreur). Le helper accepte un uuid arbitraire.
  BEGIN
    PERFORM public.get_cotraitant_share_by_token(
      '00000000-0000-0000-0000-000000000000'::uuid
    );
    RAISE NOTICE 'F.2 OK : get_cotraitant_share_by_token(uuid) executable';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'F.2 KO : get_cotraitant_share_by_token leve une exception : %', SQLERRM;
  END;
END $$;

-- ----------------------------------------------------------------------------
-- Final
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================================';
  RAISE NOTICE 'Toutes les assertions post-deploy OK';
  RAISE NOTICE '==========================================================';
END $$;
