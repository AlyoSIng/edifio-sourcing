-- ============================================================================
-- 0026_platform_prive_seed — edifio Sourcing (2026-05-27)
-- ----------------------------------------------------------------------------
-- Objectif : inserer l'entree plateforme "prive" maintenant que la valeur
-- 'prive' est disponible dans l'enum platform_code (ajoutee en 0024).
--
-- Separation obligatoire : `ALTER TYPE ... ADD VALUE` et l'INSERT qui utilise
-- la nouvelle valeur doivent etre dans des transactions DISTINCTES.
-- Postgres 12+ accepte ADD VALUE dans une TX, mais la valeur n'est pas visible
-- pour les DML de la meme TX => "unsafe use of new value of enum type".
-- Ref : fix/enum-platform-code-ci — migration 0024 contient uniquement le
-- ADD VALUE, ce fichier contient uniquement le seed.
--
-- auth_type = 'none' : pas de connecteur automatise — saisie manuelle.
-- base_url = '' : pas d'URL source applicable.
-- ON CONFLICT : idempotent si deja insere (re-jouable).
-- ============================================================================

INSERT INTO "platforms" ("code", "display_name", "auth_type", "base_url", "enabled")
VALUES ('prive', 'Consultation privée', 'none', '', true)
ON CONFLICT ("code") DO NOTHING;
