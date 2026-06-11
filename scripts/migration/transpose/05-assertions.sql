-- =============================================================================
-- 05-assertions.sql - Assertions post-import monorepo (runbook 14/06, etape 5)
-- =============================================================================
-- MONO-BLOC DO unique (pattern verify-post-deploy-single-block.sql) : collable
-- tel quel dans le SQL Editor Supabase du monorepo, ou via psql :
--   psql ... --set=ON_ERROR_STOP=1 -f 05-assertions.sql
--
-- Succes = derniere ligne 'ASSERTIONS POST-IMPORT OK'. Tout echec = ERROR
-- 'Axx KO: ...' -> runbook Annexe A, cas R2.
--
-- PREREQUIS : 04-load-data.ps1 termine (il remplit sourcing.migration_source_counts,
-- reference de l'assertion A1).
--
-- DIVERGENCES ASSUMEES vs le pseudo-code du runbook v1 (a valider par Camille) :
--   - A4 : le role 'viewer' est VALIDE (arbitrage Sebastien 10/06 - viewer
--     ajoute au check constraint par 0129). Le runbook v1 datait d'avant.
--   - A9 : 0129 reproduit la prod Sourcing -> 3 tables referentiels SANS RLS
--     (ai_prompts, architect_specialties, platforms) et 2 tables ENABLE sans
--     FORCE (tender_be_cotraitants, tender_lots). L'assertion encode ces
--     exceptions EXPLICITES au lieu du "100%" du runbook.
--     migration_source_counts (table technique de ce tooling) est exclue.
--   - S13/S14 (bonus "RLS smoke") : cloisonnement reel via claims simules.
--
-- PARAMETRES A EDITER VENDREDI 12/06 (bloc DECLARE) :
--   - protect_trial_until_expected : valeur stricte relevee samedi ('' = pas
--     de comparaison stricte, seulement NOT NULL)
--   - rls_smoke_strict : false UNIQUEMENT sur le banc local si le stub
--     auth.uid() ne lit pas les claims (cf. README)
-- ASCII only.
-- =============================================================================

DO $verify$
DECLARE
  -- ===== PARAMETRES =====
  alyos_org_id   uuid := '11111111-1111-1111-1111-111111111111';
  protect_org_id uuid := '08e73ef3-6458-4564-aab2-5a9aeaa9daed';
  protect_trial_until_expected text := '';   -- ex: '2026-07-09 12:00:00+00' (releve samedi)
  rls_smoke_strict boolean := true;
  expected_profiles jsonb := '[
    {"email": "steissier@alyosingenierie.fr",  "role": "admin",  "org": "11111111-1111-1111-1111-111111111111", "superadmin": true},
    {"email": "assistante@alyosingenierie.fr", "role": "admin",  "org": "11111111-1111-1111-1111-111111111111", "superadmin": false},
    {"email": "bim@alyosingenierie.fr",        "role": "member", "org": "11111111-1111-1111-1111-111111111111", "superadmin": false},
    {"email": "contact@protect-marseille.com", "role": "admin",  "org": "08e73ef3-6458-4564-aab2-5a9aeaa9daed", "superadmin": false}
  ]'::jsonb;
  no_rls_ok      text[] := ARRAY['ai_prompts', 'architect_specialties', 'platforms', 'migration_source_counts'];
  enable_only_ok text[] := ARRAY['tender_be_cotraitants', 'tender_lots'];

  r record;
  p record;
  exp record;
  n bigint;
  m bigint;
  nb_tables int := 0;
  msg text := '';
  steve_id uuid;
  protect_admin_id uuid;
  alyos_tenders bigint;
BEGIN
  -- ===== A1. Counts par table : source (CSV releve au dump) = cible =====
  IF to_regclass('sourcing.migration_source_counts') IS NULL THEN
    RAISE EXCEPTION 'A1 KO: sourcing.migration_source_counts absente - lancer 04-load-data.ps1 d''abord';
  END IF;
  SELECT count(*) INTO n FROM sourcing.migration_source_counts;
  IF n < 49 THEN
    RAISE EXCEPTION 'A1 KO: % ligne(s) dans migration_source_counts (49 attendues) - counts-source.csv incomplet', n;
  END IF;
  msg := '';
  FOR r IN SELECT table_name, source_count FROM sourcing.migration_source_counts ORDER BY table_name LOOP
    IF to_regclass('sourcing.' || quote_ident(r.table_name)) IS NULL THEN
      msg := msg || format(' %s: table cible absente;', r.table_name);
      CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM sourcing.%I', r.table_name) INTO m;
    IF m <> r.source_count THEN
      msg := msg || format(' %s: source=%s cible=%s;', r.table_name, r.source_count, m);
    END IF;
    nb_tables := nb_tables + 1;
  END LOOP;
  IF msg <> '' THEN
    RAISE EXCEPTION 'A1 KO: ecarts de counts ->%', msg;
  END IF;
  RAISE NOTICE 'A1 OK: % tables, counts source = cible', nb_tables;

  -- ===== A2. profiles : aucun organization_id NULL =====
  SELECT count(*) INTO n FROM public.profiles WHERE organization_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'A2 KO: % profiles sans org', n; END IF;
  RAISE NOTICE 'A2 OK: aucun profile sans organisation';

  -- ===== A3. Chaque user transpose a EXACTEMENT 1 profile, role/org/flag OK =====
  -- (lecon du 10/06 : membership manquant silencieux pour Steve)
  FOR exp IN
    SELECT e ->> 'email' AS email, e ->> 'role' AS role,
           (e ->> 'org')::uuid AS org, (e ->> 'superadmin')::boolean AS superadmin
    FROM jsonb_array_elements(expected_profiles) e
  LOOP
    SELECT count(*) INTO n FROM public.profiles WHERE lower(email) = lower(exp.email);
    IF n <> 1 THEN
      RAISE EXCEPTION 'A3 KO: % profile(s) pour % (attendu 1)', n, exp.email;
    END IF;
    SELECT * INTO p FROM public.profiles WHERE lower(email) = lower(exp.email);
    IF p.role <> exp.role THEN
      RAISE EXCEPTION 'A3 KO: role de % = % (attendu %)', exp.email, p.role, exp.role;
    END IF;
    IF p.organization_id <> exp.org THEN
      RAISE EXCEPTION 'A3 KO: org de % = % (attendu %)', exp.email, p.organization_id, exp.org;
    END IF;
    IF coalesce(p.is_superadmin, false) <> exp.superadmin THEN
      RAISE EXCEPTION 'A3 KO: is_superadmin de % = % (attendu %)', exp.email, p.is_superadmin, exp.superadmin;
    END IF;
    PERFORM 1 FROM auth.users u WHERE u.id = p.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A3 KO: profile % sans auth.users correspondant (id %)', exp.email, p.id;
    END IF;
  END LOOP;
  RAISE NOTICE 'A3 OK: 4 profiles transposes avec bons roles/orgs/flags';

  -- ===== A4. Roles valides (viewer INCLUS - arbitrage Sebastien 10/06) =====
  SELECT count(*) INTO n FROM public.profiles
   WHERE role NOT IN ('owner', 'admin', 'member', 'viewer');
  IF n > 0 THEN RAISE EXCEPTION 'A4 KO: % role(s) hors check constraint', n; END IF;
  RAISE NOTICE 'A4 OK: tous les roles dans owner/admin/member/viewer';

  -- ===== A5. Au moins un superadmin transpose =====
  SELECT count(*) INTO n FROM public.profiles WHERE is_superadmin = true;
  IF n < 1 THEN RAISE EXCEPTION 'A5 KO: aucun superadmin'; END IF;
  RAISE NOTICE 'A5 OK: % superadmin(s)', n;

  -- ===== A6. PROTECT : trial preserve (A5 visio 10/06) =====
  PERFORM 1 FROM public.organizations
   WHERE id = protect_org_id AND trial_status = 'actif' AND trial_until IS NOT NULL
     AND modules_actifs ? 'sourcing' AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A6 KO: trial PROTECT non preserve (org %, attendu trial_status=actif + trial_until non null + module sourcing + active)', protect_org_id;
  END IF;
  IF protect_trial_until_expected <> '' THEN
    PERFORM 1 FROM public.organizations
     WHERE id = protect_org_id AND trial_until = protect_trial_until_expected::timestamptz;
    IF NOT FOUND THEN
      SELECT trial_until::text INTO msg FROM public.organizations WHERE id = protect_org_id;
      RAISE EXCEPTION 'A6 KO: trial_until PROTECT = % (attendu strict %)', msg, protect_trial_until_expected;
    END IF;
    RAISE NOTICE 'A6 OK: trial PROTECT intact (egalite stricte %)', protect_trial_until_expected;
  ELSE
    RAISE NOTICE 'A6 OK: trial PROTECT intact (egalite stricte NON verifiee - parametre vide)';
  END IF;

  -- ===== A7. AlyoS : module sourcing actif =====
  PERFORM 1 FROM public.organizations
   WHERE id = alyos_org_id AND modules_actifs ? 'sourcing' AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A7 KO: module sourcing non actif pour l''org AlyoS %', alyos_org_id;
  END IF;
  RAISE NOTICE 'A7 OK: AlyoS a le module sourcing';

  -- ===== A8. ZERO FK orpheline - OBLIGATOIRE (COPY en replica = FK non
  --           verifiees au chargement). Boucle sur TOUTES les FK du schema
  --           sourcing (y compris celles vers public.organizations/profiles). =====
  msg := '';
  m := 0;
  FOR r IN
    SELECT con.conname,
           ns_s.nspname AS s_schema, cs.relname AS s_table, att_s.attname AS s_col,
           ns_t.nspname AS t_schema, ct.relname AS t_table, att_t.attname AS t_col,
           cardinality(con.conkey) AS ncols
    FROM pg_constraint con
    JOIN pg_class cs       ON cs.oid = con.conrelid
    JOIN pg_namespace ns_s ON ns_s.oid = cs.relnamespace
    JOIN pg_class ct       ON ct.oid = con.confrelid
    JOIN pg_namespace ns_t ON ns_t.oid = ct.relnamespace
    LEFT JOIN pg_attribute att_s ON att_s.attrelid = cs.oid AND att_s.attnum = con.conkey[1]
    LEFT JOIN pg_attribute att_t ON att_t.attrelid = ct.oid AND att_t.attnum = con.confkey[1]
    WHERE con.contype = 'f' AND ns_s.nspname = 'sourcing'
    ORDER BY cs.relname, con.conname
  LOOP
    IF r.ncols > 1 THEN
      RAISE NOTICE 'A8: FK multi-colonnes % ignoree (aucune attendue dans 0129)', r.conname;
      CONTINUE;
    END IF;
    EXECUTE format(
      'SELECT count(*) FROM %I.%I s WHERE s.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %I.%I t WHERE t.%I = s.%I)',
      r.s_schema, r.s_table, r.s_col, r.t_schema, r.t_table, r.t_col, r.s_col) INTO n;
    m := m + 1;
    IF n > 0 THEN
      msg := msg || format(' %s.%s->%s.%s: %s orpheline(s);', r.s_table, r.s_col, r.t_table, r.t_col, n);
    END IF;
  END LOOP;
  IF m = 0 THEN
    RAISE EXCEPTION 'A8 KO: aucune FK trouvee dans le schema sourcing (0129 applique ?)';
  END IF;
  IF msg <> '' THEN
    RAISE EXCEPTION 'A8 KO: FK orphelines ->%', msg;
  END IF;
  RAISE NOTICE 'A8 OK: % FK verifiees, zero orpheline', m;

  -- ===== A9. RLS : ENABLE + FORCE partout sauf exceptions explicites 0129 =====
  msg := '';
  FOR r IN
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'sourcing' AND c.relkind = 'r'
    ORDER BY c.relname
  LOOP
    IF r.relname = ANY(no_rls_ok) THEN
      CONTINUE;  -- referentiels globaux sans RLS en prod Sourcing + table technique counts
    ELSIF r.relname = ANY(enable_only_ok) THEN
      IF NOT r.relrowsecurity THEN
        msg := msg || format(' %s: RLS non activee;', r.relname);
      END IF;
    ELSE
      IF NOT r.relrowsecurity OR NOT r.relforcerowsecurity THEN
        msg := msg || format(' %s: enable=%s force=%s;', r.relname, r.relrowsecurity, r.relforcerowsecurity);
      END IF;
    END IF;
  END LOOP;
  IF msg <> '' THEN
    RAISE EXCEPTION 'A9 KO: RLS manquante ->%', msg;
  END IF;
  RAISE NOTICE 'A9 OK: RLS ENABLE+FORCE conformes (exceptions 0129 documentees)';

  -- ===== A10. Aucune fixture e2e (post-incident 10/06) =====
  SELECT count(*) INTO n FROM auth.users WHERE email LIKE 'e2e-test+%';
  IF n > 0 THEN RAISE EXCEPTION 'A10 KO: % user(s) e2e presents', n; END IF;
  RAISE NOTICE 'A10 OK: zero fixture e2e';

  -- ===== A11. Fonctions cotraitant SECURITY DEFINER (0130) =====
  SELECT count(*) INTO n FROM pg_proc p
   WHERE p.proname IN ('get_cotraitant_share_by_token',
                       'get_cotraitant_share_items_by_token',
                       'mark_cotraitant_share_item_signed')
     AND p.prosecdef;
  IF n < 3 THEN
    RAISE EXCEPTION 'A11 KO: %/3 fonctions cotraitant SECURITY DEFINER presentes (0130 applique ?)', n;
  END IF;
  RAISE NOTICE 'A11 OK: 3 fonctions cotraitant SECURITY DEFINER';

  -- ===== A12. learning_events : reason_code transposes (salve U) =====
  SELECT count(DISTINCT reason_code) INTO n FROM sourcing.learning_events
   WHERE reason_code IS NOT NULL;
  IF n = 0 THEN RAISE EXCEPTION 'A12 KO: aucun reason_code dans learning_events'; END IF;
  RAISE NOTICE 'A12 OK: % reason_code distincts dans learning_events', n;

  -- ===== S13/S14 (bonus). RLS smoke : cloisonnement reel via claims simules =====
  SELECT id INTO steve_id FROM public.profiles WHERE lower(email) = 'steissier@alyosingenierie.fr';
  SELECT id INTO protect_admin_id FROM public.profiles WHERE lower(email) = 'contact@protect-marseille.com';
  SELECT count(*) INTO alyos_tenders FROM sourcing.tenders WHERE organization_id = alyos_org_id;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', steve_id::text, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    IF auth.uid() IS DISTINCT FROM steve_id THEN
      EXECUTE 'RESET ROLE';
      IF rls_smoke_strict THEN
        RAISE EXCEPTION 'S13 KO: auth.uid() ne lit pas request.jwt.claims (stub banc local ?) - cf. README (stub auth.uid) ou rls_smoke_strict := false';
      END IF;
      RAISE WARNING 'S13/S14 SAUTES: auth.uid() stub (banc local) - smoke RLS a rejouer sur la vraie cible';
    ELSE
      EXECUTE 'SELECT count(*) FROM sourcing.tenders' INTO n;
      IF n <> alyos_tenders THEN
        RAISE EXCEPTION 'S13 KO: Steve (AlyoS) voit % tenders via RLS, attendu % (policies 0130 ?)', n, alyos_tenders;
      END IF;
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', protect_admin_id::text, 'role', 'authenticated')::text, true);
      EXECUTE format('SELECT count(*) FROM sourcing.tenders WHERE organization_id = %L', alyos_org_id) INTO n;
      IF n <> 0 THEN
        RAISE EXCEPTION 'S14 KO: LEAK CROSS-TENANT - l''admin PROTECT voit % tenders AlyoS', n;
      END IF;
      EXECUTE 'RESET ROLE';
      RAISE NOTICE 'S13/S14 OK: cloisonnement RLS verifie (Steve voit % tenders AlyoS, PROTECT en voit 0)', alyos_tenders;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege OR undefined_function OR undefined_object THEN
      IF rls_smoke_strict THEN RAISE; END IF;
      RAISE WARNING 'S13/S14 non concluants sur ce banc (%) - a rejouer sur la cible reelle', SQLERRM;
  END;

  RAISE NOTICE '=== ASSERTIONS POST-IMPORT OK (A1-A12 + smoke RLS) ===';
END
$verify$;
