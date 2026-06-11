-- Test runtime du trigger anti-elevation etendu a profiles.role
-- (review flash Hugo 11/06 B1-bis : valide la detection service_role 0091
-- + le refus des sessions normales — invisible au dry-run DDL).
-- Tout est en ROLLBACK : le banc reste propre. Usage :
--   docker exec pg-monorepo-dryrun psql -U postgres -d postgres -f /sourcing-scripts/test-trigger-role.sql
--
-- NB : le setup desactive les triggers (session_replication_role = replica)
-- pour contourner handle_new_user (qui exige organization_slug et creerait
-- lui-meme le profile). Ils sont REACTIVES avant les cas de test — sinon le
-- test ne testerait rien.

BEGIN;

SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, email)
VALUES ('99999999-9999-4999-8999-999999999999', 'trigger-test@local');

INSERT INTO public.organizations (id, name, slug)
VALUES ('88888888-8888-4888-8888-888888888888', 'Trigger Test', 'trigger-test')
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (id, organization_id, email, role)
VALUES ('99999999-9999-4999-8999-999999999999', '88888888-8888-4888-8888-888888888888', 'trigger-test@local', 'member');

-- REACTIVATION des triggers : indispensable pour que le test soit reel.
SET LOCAL session_replication_role = DEFAULT;

-- CAS 1 : service_role via claims JWT (chemin 0091) -> doit PASSER
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
UPDATE public.profiles SET role = 'admin'
WHERE id = '99999999-9999-4999-8999-999999999999';
SELECT 'CAS1 OK service_role peut promouvoir, role=' || role AS resultat
FROM public.profiles WHERE id = '99999999-9999-4999-8999-999999999999';

-- CAS 2 : session normale -> doit ECHOUER en 42501 (insufficient_privilege)
SET LOCAL request.jwt.claims = '{"role":"authenticated"}';
DO $$
BEGIN
  UPDATE public.profiles SET role = 'owner'
  WHERE id = '99999999-9999-4999-8999-999999999999';
  RAISE EXCEPTION 'CAS2 KO : la promotion aurait du etre refusee !';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'CAS2 OK : refus 42501 comme attendu';
END $$;

ROLLBACK;
