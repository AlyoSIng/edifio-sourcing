-- Migration 0032 — Branding organisation (logo, couleur, police)
--
-- Objectif : permettre à chaque organisation de personnaliser les CSS vars
-- brand (`--brand-red`, `--font-display`) depuis l'interface admin
-- `/sourcing/admin/settings`.
--
-- Source de vérité :
--   - Brief Board 2026-05-29 : feature « org branding »
--   - DECISIONS.md 2026-05-29 : colonnes branding ajoutées sur organizations
--
-- Stratégie :
--   - Toutes les colonnes sont nullables : si NULL → comportement par défaut
--     (couleur #ff0033 edifio, police Space Grotesk).
--   - `logo_url` TEXT : URL publique Supabase Storage (bucket `org-assets`).
--   - `primary_color` VARCHAR(7) : hexadécimal 6 chiffres (#RRGGBB).
--   - `font_family` VARCHAR(50) : slug de famille parmi
--     space-grotesk | outfit | playfair-display | inter.
--   - RLS non touchée : même policy tenant que les colonnes voisines.
--
-- Bucket Supabase Storage pour les logos d'organisation :
--   - id = 'org-assets', public = true
--   - file_size_limit = 512 KB (524288 bytes)
--   - MIME types autorisés : PNG, JPEG, WebP, SVG

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS font_family VARCHAR(50);

-- Bucket Supabase Storage pour les logos d'organisation.
-- ON CONFLICT DO NOTHING : idempotent si déjà créé par le seed ou une migration précédente.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org-assets',
  'org-assets',
  true,
  524288,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;
