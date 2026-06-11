-- =============================================================================
-- 03-identity-and-billing.sql - Transposition identity + billing (bascule 14/06)
-- =============================================================================
-- Execute sur la BDD MONOREPO, APRES 0129-0131, AVANT le chargement des donnees.
-- Lance par 04-load-data.ps1 (psql --single-transaction --set=ON_ERROR_STOP=1,
-- repertoire courant = backups/ pour la resolution des \copy relatifs).
-- NE PAS coller dans le SQL Editor Supabase : \copy est une meta-commande psql.
--
-- Contenu :
--   1. Bypass du trigger anti-escalade profiles (0063/0091) via claims
--      service_role simules (le trigger lit request.jwt.claims ->> 'role').
--   2. Staging temp depuis les CSV produits par 01-export-source.ps1.
--   3. Garde-fous : allowlist orgs, collisions email, doubles memberships.
--   4. public.organizations : INSERT id preserves, ON CONFLICT (id) -> merge
--      modules_actifs (+ "sourcing"), is_active = true.
--   5. auth.users : INSERT hashes preserves, ON CONFLICT (id) DO NOTHING.
--      Colonnes GoTrue absentes du CSV synthetisees (instance_id, aud, role,
--      tokens '' - GoTrue plante sur NULL). Construction DYNAMIQUE limitee aux
--      colonnes existantes -> compatible banc local (stub auth.users minimal).
--   6. auth.identities : genere depuis le staging (provider email) si la table
--      existe (absente du stub banc).
--   7. public.profiles : mapping memberships -> profiles.
--      DECISION trigger handle_new_user (0001, AFTER INSERT ON auth.users) :
--      il est LAISSE ACTIF. On ne peut pas le desactiver proprement
--      (ALTER TABLE auth.users exige d'etre owner de la table = supabase_auth_admin,
--      pas le role postgres). Il cree donc des profiles provisoires (org fallback
--      slug 'alyos', role 'member') que l'upsert ci-dessous CORRIGE dans la meme
--      transaction (organization_id, role, flags, must_change_password).
--   8. Billing PROTECT : trial 0049 (trial_ends_at) -> modele 0115
--      (trial_until + trial_status = 'actif').
--
-- IDEMPOTENT : rejouable, memes assertions (critere GO/NO-GO P1).
-- ASCII only.
-- =============================================================================

\set ON_ERROR_STOP on

-- (1) Claims service_role simules, portee SESSION (le run psql se termine apres).
--     Necessaire car l'upsert profiles modifie organization_id / is_superadmin,
--     bloques par trg_profiles_prevent_priv_escal pour tout autre appelant.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);

-- (2) Staging -------------------------------------------------------------------
CREATE TEMP TABLE stg_orgs (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  siren text,
  siret text,
  odoo_config jsonb,
  subscription_tier text,
  logo_url text,
  primary_color text,
  font_family text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  subscription_status text,
  stripe_customer_id text,
  created_at timestamptz,
  updated_at timestamptz
);
\copy stg_orgs FROM 'identity-organizations.csv' WITH (FORMAT csv, HEADER true)

CREATE TEMP TABLE stg_users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  firstname text,
  lastname text,
  created_at timestamptz,
  architect_notifications_seen_at timestamptz
);
\copy stg_users FROM 'identity-users.csv' WITH (FORMAT csv, HEADER true)

CREATE TEMP TABLE stg_memberships (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  created_at timestamptz
);
\copy stg_memberships FROM 'identity-memberships.csv' WITH (FORMAT csv, HEADER true)

CREATE TEMP TABLE stg_auth_users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb,
  created_at timestamptz
);
\copy stg_auth_users FROM 'identity-auth-users.csv' WITH (FORMAT csv, HEADER true)

-- (3) a (8) : logique principale -------------------------------------------------
DO $mig$
DECLARE
  -- ===== PARAMETRES (a verifier / completer vendredi 12/06) =====
  -- Allowlist des organisations transposees (etat prod 10/06 : 2 orgs reelles).
  org_allowlist uuid[] := ARRAY[
    '11111111-1111-1111-1111-111111111111',  -- AlyoS Ingenierie
    '08e73ef3-6458-4564-aab2-5a9aeaa9daed'   -- PROTECT (trial actif a preserver)
  ]::uuid[];
  alyos_org_id   uuid := '11111111-1111-1111-1111-111111111111';
  protect_org_id uuid := '08e73ef3-6458-4564-aab2-5a9aeaa9daed';
  -- Promotion superadmin : AUCUN membership 'superadmin' en prod source
  -- (steissier@ est 'admin') alors que le smoke 7.9 du runbook attend
  -- profiles.is_superadmin = true pour Steve. Allowlist explicite, alignee
  -- sur le precedent 0039 du monorepo. ARBITRAGE documente dans le README.
  superadmin_emails text[] := ARRAY['steissier@alyosingenierie.fr'];
  -- Override de la date de trial PROTECT.
  -- CONSTAT export prod 11/06 (arbitrage C4 tranche de fait) : la prod 0049
  -- n'a JAMAIS pose le trial en BDD (trial_started_at/trial_ends_at NULL,
  -- subscription_status = none) - le trial 30 jours etait commercial, pas
  -- une donnee. Valeur posee : onboarding PROTECT 07/06 + 30 jours = 07/07.
  -- A CONFIRMER par Steve x Sebastien avant dimanche (sinon ajuster ici).
  protect_trial_until_override timestamptz := '2026-07-07 09:28:33+00';

  r record;
  n int;
  n2 int;
  auth_cols text := '';
  auth_vals text := '';
  protect_trial timestamptz;
BEGIN
  -- ===== (3) Garde-fous =====

  -- 3a. Orgs hors allowlist : non transposees (fixtures residuelles, etc.)
  FOR r IN SELECT id, name FROM stg_orgs WHERE NOT (id = ANY(org_allowlist)) LOOP
    RAISE WARNING 'org hors allowlist NON transposee : % (%)', r.name, r.id;
  END LOOP;
  DELETE FROM stg_orgs WHERE NOT (id = ANY(org_allowlist));

  SELECT count(*) INTO n FROM stg_orgs;
  IF n <> array_length(org_allowlist, 1) THEN
    RAISE EXCEPTION 'GARDE KO: % org(s) en staging, % attendue(s) (allowlist) - CSV incomplet ?',
      n, array_length(org_allowlist, 1);
  END IF;

  -- 3b. Users / auth users sans membership dans une org transposee : ecartes.
  FOR r IN
    SELECT u.id, u.email FROM stg_users u
    WHERE NOT EXISTS (
      SELECT 1 FROM stg_memberships m
      WHERE m.user_id = u.id AND m.organization_id = ANY(org_allowlist))
  LOOP
    RAISE WARNING 'user sans membership transposable, ecarte : % (%)', r.email, r.id;
  END LOOP;
  DELETE FROM stg_users u WHERE NOT EXISTS (
    SELECT 1 FROM stg_memberships m
    WHERE m.user_id = u.id AND m.organization_id = ANY(org_allowlist));
  DELETE FROM stg_auth_users a WHERE NOT EXISTS (SELECT 1 FROM stg_users u WHERE u.id = a.id);
  DELETE FROM stg_memberships m WHERE NOT EXISTS (SELECT 1 FROM stg_users u WHERE u.id = m.user_id);

  -- 3c. Multi-membership : le modele cible (1 user = 1 org via profiles) ne le
  --     supporte pas -> arbitrage manuel obligatoire.
  FOR r IN
    SELECT user_id, count(*) AS nb FROM stg_memberships GROUP BY user_id HAVING count(*) > 1
  LOOP
    RAISE EXCEPTION 'GARDE KO: user % a % memberships - le mapping profiles exige 1 org/user. Arbitrage manuel (README, point C2).',
      r.user_id, r.nb;
  END LOOP;

  -- 3d. COLLISION EMAIL : email deja present cote monorepo avec un AUTRE id.
  --     On n'ecrase RIEN : abort + arbitrage manuel (remap user_id, README C2).
  FOR r IN
    SELECT s.email, s.id AS source_id, u.id AS monorepo_id
    FROM stg_auth_users s
    JOIN auth.users u ON lower(u.email) = lower(s.email) AND u.id <> s.id
  LOOP
    RAISE EXCEPTION 'GARDE KO: COLLISION EMAIL % (id source %, id monorepo %) - arbitrage manuel requis, voir README section "Conflits identite". Rien n''a ete ecrase (transaction annulee).',
      r.email, r.source_id, r.monorepo_id;
  END LOOP;

  -- 3e. Ombre AlyoS : une org monorepo distincte porte un nom/slug proche
  --     (seed 0001 'alyos'). Pas bloquant (deux orgs coexistent : Suivi d'un
  --     cote, Sourcing de l'autre) mais a arbitrer si on veut UNE seule org
  --     AlyoS (remap org_id complet, README point C1).
  FOR r IN
    SELECT o.id, o.name, o.slug FROM public.organizations o
    WHERE o.id <> ALL(org_allowlist)
      AND (o.slug = 'alyos' OR o.name ILIKE '%alyos%')
  LOOP
    RAISE WARNING 'ARBITRAGE C1: org monorepo existante % (slug %, id %) distincte de l''org AlyoS Sourcing % - deux orgs AlyoS vont coexister.',
      r.name, r.slug, r.id, alyos_org_id;
  END LOOP;

  -- ===== (4) public.organizations =====
  -- Slug genere conforme au check ^[a-z0-9-]+$ ; suffixe -src si le slug est
  -- deja pris par une autre org (ex: 'alyos' du seed 0001).
  INSERT INTO public.organizations (id, name, slug, is_active, modules_actifs, created_at)
  SELECT s.id, s.name, final.slug, true, '["sourcing"]'::jsonb, coalesce(s.created_at, now())
  FROM stg_orgs s
  CROSS JOIN LATERAL (
    SELECT CASE WHEN base.slug = '' THEN 'org-' || left(s.id::text, 8) ELSE base.slug END AS slug
    FROM (
      -- translate : accents usuels -> ascii (a a a e e e e i i o o u u u c),
      -- ecrits en echappements U& pour garder ce fichier 100 pour cent ASCII.
      SELECT trim(both '-' FROM regexp_replace(
               translate(lower(s.name),
                         U&'\00E0\00E2\00E4\00E9\00E8\00EA\00EB\00EE\00EF\00F4\00F6\00F9\00FB\00FC\00E7',
                         'aaaeeeeiioouuuc'),
               '[^a-z0-9]+', '-', 'g')) AS slug
    ) base
  ) raw_slug
  CROSS JOIN LATERAL (
    SELECT CASE WHEN EXISTS (
             SELECT 1 FROM public.organizations o
             WHERE o.slug = raw_slug.slug AND o.id <> s.id)
           THEN raw_slug.slug || '-src' ELSE raw_slug.slug END AS slug
  ) final
  ON CONFLICT (id) DO UPDATE
    SET modules_actifs = CASE
          WHEN public.organizations.modules_actifs ? 'sourcing'
            THEN public.organizations.modules_actifs
          ELSE public.organizations.modules_actifs || '["sourcing"]'::jsonb
        END,
        is_active = true;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '(4) organizations upsertees : %', n;

  -- ===== (5) auth.users (dynamique : colonnes existantes uniquement) =====
  -- DESACTIVATION TRIGGERS pour (5)-(7) — constat banc 11/06 : handle_new_user
  -- (0001, AFTER INSERT ON auth.users) RAISE « organization_slug requis » pour
  -- tout user sans ce champ dans raw_user_meta_data (il ne cree PAS de profile
  -- provisoire, il BLOQUE). On importe les profiles nous-memes en (7), donc on
  -- coupe les triggers le temps des inserts identity. set_config(..., true) =
  -- portee transaction ; la phase donnees (02-transform) repose son propre
  -- session_replication_role = replica de toute facon. Le trigger anti-
  -- elevation profiles est egalement bypasse — import legitime service-level.
  PERFORM set_config('session_replication_role', 'replica', true);

  FOR r IN
    SELECT * FROM (VALUES
      ('id',                     $q$s.id$q$),
      ('email',                  $q$s.email$q$),
      ('encrypted_password',     $q$s.encrypted_password$q$),
      ('email_confirmed_at',     $q$s.email_confirmed_at$q$),
      ('raw_user_meta_data',     $q$coalesce(s.raw_user_meta_data, '{}'::jsonb)$q$),
      ('created_at',             $q$coalesce(s.created_at, now())$q$),
      ('updated_at',             $q$now()$q$),
      ('instance_id',            $q$'00000000-0000-0000-0000-000000000000'::uuid$q$),
      ('aud',                    $q$'authenticated'$q$),
      ('role',                   $q$'authenticated'$q$),
      ('raw_app_meta_data',      $q$'{"provider": "email", "providers": ["email"]}'::jsonb$q$),
      -- GoTrue plante au login si ces tokens sont NULL ('' attendu) :
      ('confirmation_token',     $q$''$q$),
      ('recovery_token',         $q$''$q$),
      ('email_change',           $q$''$q$),
      ('email_change_token_new', $q$''$q$),
      ('is_sso_user',            $q$false$q$),
      ('is_anonymous',           $q$false$q$)
    ) AS t(colname, expr)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'auth' AND table_name = 'users'
                 AND column_name = r.colname) THEN
      auth_cols := auth_cols || CASE WHEN auth_cols = '' THEN '' ELSE ', ' END || quote_ident(r.colname);
      auth_vals := auth_vals || CASE WHEN auth_vals = '' THEN '' ELSE ', ' END || r.expr;
    END IF;
  END LOOP;
  EXECUTE format(
    'INSERT INTO auth.users (%s) SELECT %s FROM stg_auth_users s ON CONFLICT (id) DO NOTHING',
    auth_cols, auth_vals);
  GET DIAGNOSTICS n = ROW_COUNT;
  SELECT count(*) INTO n2 FROM stg_auth_users;
  RAISE NOTICE '(5) auth.users inseres : % / % (deja presents avec le meme id : %)', n, n2, n2 - n;

  -- ===== (6) auth.identities (provider email) - absent du stub banc =====
  IF to_regclass('auth.identities') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO auth.identities
        (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      SELECT gen_random_uuid(), s.id,
             jsonb_build_object('sub', s.id::text, 'email', s.email,
                                'email_verified', true, 'phone_verified', false),
             'email', s.id::text, now(), coalesce(s.created_at, now()), now()
      FROM stg_auth_users s
      ON CONFLICT (provider_id, provider) DO NOTHING
    $q$;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '(6) auth.identities inserees : %', n;
  ELSE
    RAISE NOTICE '(6) auth.identities absente (banc local) : etape sautee';
  END IF;

  -- ===== (7) public.profiles =====
  -- Mapping roles (arbitrage Sebastien 10/06) :
  --   admin -> admin | user -> member | viewer -> viewer (porte tel quel)
  --   superadmin -> role admin + is_superadmin = true
  -- is_admin (flag Suivi "admin du cabinet") aligne sur role admin - choix
  -- documente README (le monorepo lit les deux selon les ecrans).
  -- must_change_password / provisional_password_expires_at : repris du
  -- user_metadata source (flow admin-create + Resend, porte par 0129).
  INSERT INTO public.profiles
    (id, organization_id, email, full_name, role, is_admin, is_superadmin,
     must_change_password, provisional_password_expires_at, created_at)
  SELECT
    u.id,
    m.organization_id,
    u.email,
    coalesce(nullif(btrim(concat_ws(' ', u.firstname, u.lastname)), ''),
             split_part(u.email, '@', 1)),
    CASE m.role
      WHEN 'admin'      THEN 'admin'
      WHEN 'superadmin' THEN 'admin'
      WHEN 'viewer'     THEN 'viewer'
      ELSE 'member'
    END,
    (m.role IN ('admin', 'superadmin')),
    (m.role = 'superadmin' OR u.email = ANY(superadmin_emails)),
    coalesce((au.raw_user_meta_data ->> 'must_change_password')::boolean, false),
    CASE
      WHEN coalesce((au.raw_user_meta_data ->> 'must_change_password')::boolean, false)
        THEN (au.raw_user_meta_data ->> 'provisional_password_expires_at')::timestamptz
      ELSE NULL
    END,
    coalesce(u.created_at, now())
  FROM stg_users u
  JOIN stg_memberships m ON m.user_id = u.id
  LEFT JOIN stg_auth_users au ON au.id = u.id
  ON CONFLICT (id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id,
        email           = EXCLUDED.email,
        full_name       = EXCLUDED.full_name,
        role            = EXCLUDED.role,
        is_admin        = EXCLUDED.is_admin,
        is_superadmin   = EXCLUDED.is_superadmin OR public.profiles.is_superadmin,
        must_change_password            = EXCLUDED.must_change_password,
        provisional_password_expires_at = EXCLUDED.provisional_password_expires_at;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '(7) profiles upsertes : %', n;

  -- Reactivation des triggers (fin de la fenetre identity (5)-(7)).
  PERFORM set_config('session_replication_role', 'origin', true);

  -- ===== (8) Billing PROTECT : 0049 -> 0115 =====
  SELECT coalesce(protect_trial_until_override, s.trial_ends_at) INTO protect_trial
  FROM stg_orgs s WHERE s.id = protect_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BILLING KO: org PROTECT % absente du staging', protect_org_id;
  END IF;
  IF protect_trial IS NULL THEN
    RAISE EXCEPTION 'BILLING KO: trial_ends_at NULL pour PROTECT et pas d''override - le trial a preserver est introuvable';
  END IF;

  UPDATE public.organizations
     SET trial_until = protect_trial,
         trial_status = 'actif'
   WHERE id = protect_org_id;
  RAISE NOTICE '(8) PROTECT trial preserve : trial_until = %, trial_status = actif', protect_trial;

  FOR r IN
    SELECT s.subscription_status FROM stg_orgs s
    WHERE s.id = protect_org_id AND s.subscription_status IS DISTINCT FROM 'trial'
  LOOP
    RAISE WARNING 'PROTECT subscription_status source = % (attendu ''trial'') - verifier l''etat 0049 avant GO', r.subscription_status;
  END LOOP;

  -- ===== Synthese =====
  SELECT count(*) INTO n FROM public.organizations WHERE id = ANY(org_allowlist);
  SELECT count(*) INTO n2 FROM public.profiles p
   WHERE p.organization_id = ANY(org_allowlist);
  RAISE NOTICE '=== 03 OK : % orgs cibles, % profiles rattaches. Donnees non transposees (perte assumee, cf. README) : odoo_config, logo_url, primary_color, font_family, siren/siret org, architect_notifications_seen_at ===', n, n2;
END
$mig$;
