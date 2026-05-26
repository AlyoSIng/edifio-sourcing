-- Sync journal drizzle.__drizzle_migrations -- prod
-- Genere le 2026-05-26
-- A executer dans Supabase SQL Editor (service_role) apres que toutes les
-- migrations 0000-0017 ont ete appliquees manuellement.
-- Idempotent : ON CONFLICT (hash) DO NOTHING.

-- Etape 0 : DDL migration 0017 (idempotente)
ALTER TABLE "architects" ADD COLUMN IF NOT EXISTS "annual_revenue" integer;

-- Etape 1 : schema drizzle
CREATE SCHEMA IF NOT EXISTS drizzle;

-- Etape 2 : table __drizzle_migrations (schema exact drizzle-orm postgres dialect)
CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
  id         SERIAL PRIMARY KEY,
  hash       text   NOT NULL,
  created_at bigint
);

-- Etape 3 : contrainte UNIQUE sur hash (idempotente)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'drizzle.__drizzle_migrations'::regclass
      AND contype = 'u'
  ) THEN
    ALTER TABLE drizzle."__drizzle_migrations" ADD CONSTRAINT unique_hash UNIQUE (hash);
  END IF;
END $$;

-- Etape 4 : insertion des 18 entrees (timestamps = when du _journal.json)
INSERT INTO drizzle."__drizzle_migrations" (hash, created_at) VALUES
  ('f66602db762515132da543bf0d6e927cc3576f9a28e328e67c7c98a78be3df96', 1779106224037),
  ('b7774bd0554f981189d19144fdb5c8ebeb614862f466d3b3367c05b9d9fb2447', 1779109575814),
  ('20b832e28bf330748384c746548d164d702813fadfd20594154d5d5b3063384b', 1779624000000),
  ('d1f0cce74b62ab1506ce3c11ce896796477eae468b7e2c4e549022d878f0fd56', 1779624060000),
  ('0bbad0ec79d2d632b75c5d050c6000e0c18a5a8b5beadd05d3491762d6113959', 1779381444916),
  ('9543415f5501dc136455dd3b15c2b6c7cbce3355c7a387f5a0b73cf6709d60f3', 1779455607260),
  ('c1eb3a2faab686ffb47bedcf349cea4abb733b814d3af39b1a0b6d6baacc353d', 1779455667260),
  ('7e1dce0a56a7f67c528b0e220d8b91de7edf7047dee67ab0c99cfc00e97f23b5', 1779702070179),
  ('9eafeaf558b35f1f927043b38395198e660cfc758fdc96563a989194a0821810', 1779705354892),
  ('dd7029f273d3e6d47220f5bc684fa82d579974da459f0c2ee9e0edc15c8cabfe', 1779730999354),
  ('04fca77e8f5bb39720c1512223b0d2e1a600d773e7f1a776acf08a42733a4d02', 1748908800000),
  ('fc543b91767cb48016f8b92334f60e1c9858aa1c0966e46a17696ba5a766b19d', 1748995200000),
  ('11bec201cdd6120aa21fb741e60236aaf7d674908a182a4960fde05bf04f0be2', 1748995260000),
  ('52f11bea09b8849d49bd69bd8788b140c0cd09c9d9fa6a626037f2aa0582c02a', 1748995320000),
  ('a8fbb2ad7a971ee7283c3b8651e813f38e72d8a3972beebc58db84e98bf5704f', 1748995380000),
  ('08746d69b501c7f1d4f88c3b2e63615a7792fa99acc109fc55cc2b5ef3d4fe23', 1748995500000),
  ('36541fca21255d951c1756dc6446da6560a383dca13eb8f00b769a43150e2f2b', 1748995560000),
  ('819dd0d787213b7b8da7d9f122ef1a63d98ee2208cb682367cb88d40bd52d850', 1748995620000)
ON CONFLICT (hash) DO NOTHING;
