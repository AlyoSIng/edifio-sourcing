-- Migration 0030 — colonnes slug + content_md sur formations
--
-- Pivot 2026-05-29 : formations en contenu intégré (guides markdown BDD).
-- Plus de vidéo ni d'URL externe pour les 4 guides initiaux.
--
-- slug     : identifiant URL stable pour les guides type='doc'.
--            UNIQUE, nullable (safe : table vide en prod avant le seed).
-- content_md : corps du guide en markdown.
--              Rendu inline côté serveur (pas de lib externe).
--
-- La colonne url reste (nullable) pour un éventuel futur type='external'.
-- Le champ type='doc' est la valeur pivot pour les guides intégrés.

ALTER TABLE "formations" ADD COLUMN IF NOT EXISTS "slug" text;
ALTER TABLE "formations" ADD COLUMN IF NOT EXISTS "content_md" text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'formations_slug_unique'
  ) THEN
    ALTER TABLE "formations" ADD CONSTRAINT "formations_slug_unique" UNIQUE("slug");
  END IF;
END $$;
