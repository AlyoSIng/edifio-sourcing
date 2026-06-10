-- ============================================================================
-- verify-post-deploy-single-block.sql
-- ============================================================================
-- Variante SQL-Editor-safe de verify-post-deploy.sql : TOUTES les assertions
-- A.1 -> F.2 dans UN SEUL bloc DO $$ (une seule instruction SQL), car le
-- splitter du SQL Editor Supabase mange les scripts multi-blocs de facon
-- non deterministe (erreur opaque « relation c does not exist » observee
-- le 2026-06-10 sur la version multi-blocs).
--
-- Memes assertions que verify-post-deploy.sql (source de verite psql/CI).
-- En cas de succes : la grille affiche 1 ligne « TOUTES LES ASSERTIONS
-- POST-DEPLOY OK ». En cas d echec : ERROR « X.n KO : ... ».
-- ============================================================================

DO $verify$
DECLARE
  c int;
  missing text;
  not_definer text;
  forbidden text;
  v_result uuid;
  expected_hashes text[] := ARRAY[
    'bcddeda60c487ef14a7a4780645690897111d6bca59bdbb82e736c9787a4a90b',  -- 0050
    'e6ed743475c3148e219b82e963b33d71fd3ef2dc5461a2305a3dda07dfa4b26e',  -- 0051
    '8f75f44ce6e83dc4d9d501c2bf3e68767a376f08814ea785b58e2b656e3c6165',  -- 0052
    '0f536f04b855f1b151378e96e908138dc061a3e788bf0338a984f28b904c393e'   -- 0053
  ];
  expected_funcs text[] := ARRAY[
    'current_user_org_id()',
    'get_cotraitant_share_by_token(uuid)',
    'get_cotraitant_share_items_by_token(uuid)',
    'get_cotraitant_item_original_path(uuid,uuid)',
    'mark_cotraitant_share_item_signed(uuid,uuid,text,text,text)'
  ];
BEGIN
  -- ===== A. Migrations Drizzle journal =====
  SELECT COUNT(*) INTO c FROM drizzle.__drizzle_migrations WHERE hash = ANY(expected_hashes);
  IF c <> 4 THEN
    RAISE EXCEPTION 'A.1 KO : 4 hashes 0050-0053 attendus, trouve : %', c;
  END IF;
  RAISE NOTICE 'A.1 OK : 4 hashes 0050-0053 presents';

  SELECT COUNT(*) INTO c FROM drizzle.__drizzle_migrations;
  IF c < 37 THEN
    RAISE EXCEPTION 'A.2 KO : au moins 37 entrees attendues, trouve : %', c;
  END IF;
  RAISE NOTICE 'A.2 OK : % entrees (>= 37)', c;

  -- ===== B. Colonnes learning_events (0050) =====
  FOR missing IN
    SELECT unnest(ARRAY['payload', 'reason_code', 'applied_at', 'dismissed_at'])
    EXCEPT
    SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'learning_events'
  LOOP
    RAISE EXCEPTION 'B KO : colonne manquante learning_events.%', missing;
  END LOOP;

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
  RAISE NOTICE 'B OK : 4 colonnes learning_events presentes avec bons types';

  -- ===== C. FORCE RLS sur 4 tables (0052) =====
  SELECT COUNT(*) INTO c
    FROM pg_class
   WHERE relname IN ('companies', 'bureaux_etudes', 'cotraitant_shares', 'cotraitant_share_items')
     AND relnamespace = 'public'::regnamespace
     AND relforcerowsecurity = true
     AND relrowsecurity = true;
  IF c <> 4 THEN
    RAISE EXCEPTION 'C KO : FORCE RLS + RLS attendus sur 4 tables, trouve sur : %', c;
  END IF;
  RAISE NOTICE 'C OK : FORCE RLS + RLS actifs sur les 4 tables';

  -- ===== D. Functions SECURITY DEFINER (0052 + 0053) =====
  FOR missing IN
    SELECT f FROM unnest(expected_funcs) AS f
    WHERE to_regprocedure('public.' || f) IS NULL
  LOOP
    RAISE EXCEPTION 'D.1 KO : fonction manquante public.%', missing;
  END LOOP;
  RAISE NOTICE 'D.1 OK : 5 fonctions helper presentes';

  FOR not_definer IN
    SELECT p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('current_user_org_id', 'get_cotraitant_share_by_token',
                         'get_cotraitant_share_items_by_token',
                         'get_cotraitant_item_original_path',
                         'mark_cotraitant_share_item_signed')
       AND NOT p.prosecdef
  LOOP
    RAISE EXCEPTION 'D.2 KO : fonction public.% pas SECURITY DEFINER', not_definer;
  END LOOP;
  RAISE NOTICE 'D.2 OK : les 5 fonctions sont SECURITY DEFINER';

  -- ===== E. Policies sur 4 tables =====
  -- E.1 : au moins 13 policies (4+4+4+1) — 0053 FINAL droppe les policies
  -- publiques de cotraitant_share_items, la table garde 1 seule policy.
  SELECT COUNT(*) INTO c
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('companies', 'bureaux_etudes', 'cotraitant_shares', 'cotraitant_share_items');
  IF c < 13 THEN
    RAISE EXCEPTION 'E.1 KO : au moins 13 policies attendues (4+4+4+1), trouve : %', c;
  END IF;
  RAISE NOTICE 'E.1 OK : % policies presentes (>= 13)', c;

  FOR forbidden IN
    SELECT schemaname || '.' || tablename || '.' || policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('cotraitant_shares', 'cotraitant_share_items')
       AND (policyname ILIKE '%select_public%' OR policyname ILIKE 'public_token_%')
  LOOP
    RAISE EXCEPTION 'E.2 KO : policy publique residuelle interdite : %', forbidden;
  END LOOP;
  RAISE NOTICE 'E.2 OK : aucune policy publique residuelle';

  SELECT COUNT(DISTINCT tablename) INTO c
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('companies', 'bureaux_etudes', 'cotraitant_shares', 'cotraitant_share_items');
  IF c <> 4 THEN
    RAISE EXCEPTION 'E.3 KO : les 4 tables doivent avoir au moins 1 policy, couvert : %/4', c;
  END IF;
  RAISE NOTICE 'E.3 OK : les 4 tables ont au moins 1 policy';

  -- ===== F. Helpers fonctionnels (smoke) =====
  BEGIN
    SELECT public.current_user_org_id() INTO v_result;
    RAISE NOTICE 'F.1 OK : current_user_org_id() executable (retour = %)',
      COALESCE(v_result::text, 'NULL (attendu en service_role)');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'F.1 KO : current_user_org_id() leve une exception : %', SQLERRM;
  END;

  BEGIN
    PERFORM public.get_cotraitant_share_by_token('00000000-0000-0000-0000-000000000000'::uuid);
    RAISE NOTICE 'F.2 OK : get_cotraitant_share_by_token(uuid) executable';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'F.2 KO : get_cotraitant_share_by_token leve une exception : %', SQLERRM;
  END;

  RAISE NOTICE '=============================================';
  RAISE NOTICE 'Toutes les assertions post-deploy OK';
  RAISE NOTICE '=============================================';
END
$verify$;
