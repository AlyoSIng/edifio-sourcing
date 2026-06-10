-- Sync journal drizzle.__drizzle_migrations -- prod
-- Genere le 2026-06-10 (post-bascule 0050-0053)
-- A executer sur la prod (Session Pooler ou Supabase SQL Editor) APRES que les
-- migrations 0050-0053 ont ete appliquees manuellement (fait le 10/06 ~07h).
-- Idempotent : ON CONFLICT (hash) DO NOTHING (contrainte unique_hash posee par
-- scripts/prod_migration_0017_drizzle_journal.sql).
--
-- Pourquoi : les 4 migrations ont ete appliquees via psql -f direct (bascule
-- co-pilotee Steve), donc le journal Drizzle n'a pas recu les hashes. Sans ce
-- sync, un futur `pnpm db:migrate` sur prod RETENTERAIT 0051-0053 (leurs
-- folderMillis > dernier created_at du journal) et planterait sur les CREATE
-- FUNCTION non-idempotents de 0053.
--
-- Hashes = SHA-256 du contenu brut des fichiers SQL, identiques a ceux que
-- readMigrationFiles (drizzle-orm/migrator) calcule. Verifies le 2026-06-10 :
--   node scripts/tmp-print-hashes.mjs == sha256sum src/db/migrations/<f>.sql
--
-- NB : 0050 a aussi ete AJOUTE au _journal.json (idx 50, when 1779731007500,
-- intercale entre 0032 et 0051) -- il en etait absent (oubli PR #113), donc
-- un environnement neuf n'appliquait jamais 0050. Cf. DECISIONS.md 2026-06-10.

-- Garde-fou : la contrainte unique_hash doit exister (posee par le script 0017).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'drizzle.__drizzle_migrations'::regclass
      AND contype = 'u'
  ) THEN
    ALTER TABLE drizzle."__drizzle_migrations" ADD CONSTRAINT unique_hash UNIQUE (hash);
  END IF;
END $$;

-- Insertion des 4 entrees (created_at = when du _journal.json)
INSERT INTO drizzle."__drizzle_migrations" (hash, created_at) VALUES
  ('bcddeda60c487ef14a7a4780645690897111d6bca59bdbb82e736c9787a4a90b', 1779731007500),  -- 0050_learning_payload
  ('e6ed743475c3148e219b82e963b33d71fd3ef2dc5461a2305a3dda07dfa4b26e', 1779731008000),  -- 0051_rls_fix_companies_cotraitant_shares_be
  ('8f75f44ce6e83dc4d9d501c2bf3e68767a376f08814ea785b58e2b656e3c6165', 1779731009000),  -- 0052_rls_lot17_bis_force_helper_naming
  ('0f536f04b855f1b151378e96e908138dc061a3e788bf0338a984f28b904c393e', 1779731010000)   -- 0053_eradicate_cotraitant_public_policy
ON CONFLICT (hash) DO NOTHING;

-- Verification : doit retourner 37 (33 avant bascule + 4)
SELECT count(*) AS total_entries FROM drizzle."__drizzle_migrations";
