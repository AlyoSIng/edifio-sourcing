-- Migration 0049 — Cycle de vie facturation organisations (trial + Stripe manuel)
-- ============================================================================
--
-- Steve 2026-06-05 — suite ADR-014 (ouverture multi-tenant PROTECT) + décision
-- Stripe minimal MVP (Option C, plan hybride). Ajoute le minimum BDD pour :
--
--   1. Décompte d'un trial (J-15, J-3, J+0 → verrou strict)
--   2. Statut de souscription (trial / active / expired / cancelled)
--   3. Pointeur vers le customer Stripe créé manuellement dans le Dashboard
--      (pas de webhook ni de SDK serveur — facturation 100 % manuelle pour
--       PROTECT et les 2-3 premiers clients avant migration vers le monorepo
--       edifio qui a déjà Stripe complet câblé)
--
-- Workflow opérationnel :
--   * Steve / superadmin crée l'org via /sourcing/superadmin/organizations/new
--   * Steve marque le trial : `trial_started_at = now()`,
--     `trial_ends_at = now() + 30 days`, `subscription_status = 'trial'`
--   * L'org utilise l'app normalement (RLS scopée + memberships)
--   * Bannière TrialBanner affichée dans l'AppShell :
--       - J-15 → orange (info)
--       - J-3  → rouge (urgent)
--       - J+0  → app verrouillée, redirige /trial-expired
--   * Quand client paye : Steve crée le customer + subscription dans Stripe
--     Dashboard, renseigne `stripe_customer_id`, marque `subscription_status =
--     'active'`. L'app redevient accessible.
--
-- Plan à plat 99 €/mois (Solo) pour démarrage — pricing arbitré dans le brief
-- global edifio Sourcing v2 du 5 juin 2026.
--
-- Migration idempotente (IF NOT EXISTS partout). Pas de NOT NULL au démarrage —
-- les orgs existantes (AlyoS) doivent rester valides sans backfill obligatoire.
-- Pour AlyoS spécifiquement, on appliquera un UPDATE manuel via SQL Editor pour
-- marquer le statut 'active' (org éditrice, pas en facturation).
-- ============================================================================

-- 1. trial_started_at — date d'activation du trial (NULL = jamais entré en trial)
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "trial_started_at" timestamptz;

-- 2. trial_ends_at — date d'expiration du trial (NULL = pas de trial OU déjà active)
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamptz;

-- 3. subscription_status — statut de l'abonnement :
--    'none'      : pas encore inscrit en trial (org créée mais inactive)
--    'trial'     : période d'essai en cours (cf. trial_ends_at pour la fin)
--    'active'    : abonnement payant actif
--    'expired'   : trial expiré, pas de souscription → app verrouillée
--    'cancelled' : abonnement annulé par le client → app verrouillée
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "subscription_status" text NOT NULL DEFAULT 'none';

-- 4. stripe_customer_id — référence du customer Stripe (créé manuellement
--    dans le Dashboard, format `cus_XXX...`). NULL tant que pas de facturation.
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "stripe_customer_id" text;

-- 5. Index sur trial_ends_at — pour le futur cron de relance J-15/J-3 (post-MVP).
--    Filtré sur status='trial' pour ne pas saturer.
CREATE INDEX IF NOT EXISTS "idx_organizations_trial_ends_at"
  ON "organizations" ("trial_ends_at")
  WHERE "subscription_status" = 'trial';

-- 6. Backfill manuel à appliquer après cette migration (SQL séparé) :
--    UPDATE organizations SET subscription_status = 'active'
--      WHERE name ILIKE 'alyos%';
--    → l'org AlyoS Ingenierie reste accessible sans verrou (org éditrice).
