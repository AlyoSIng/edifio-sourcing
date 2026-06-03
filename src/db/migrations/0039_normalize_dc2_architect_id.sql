-- Migration 0039 — Normalisation DC2 archi-agnostique (Tandem)
--
-- Contexte Steve 2026-06-03 : décision de réutilisation cross-archi.
-- DC2 (cotraitant AlyoS en Tandem) est désormais archi-agnostique : les
-- données société d'AlyoS sont identiques pour tous les archis du même AO,
-- donc le DC2 doit persister quand on switch d'archi A à archi B.
--
-- Avant : Phase 3 Tandem multi-archi stockait DC2 avec `architect_id = X`.
-- Après : DC2 (kind='dc2') a `architect_id IS NULL` (sauf si be_id posé,
-- auquel cas c'est un DC2 spécifique BE en Cotraitance BE).
--
-- Cette migration backfill les DC2 historiques. Les DC1 ne sont PAS touchés.
--
-- Idempotente : UPDATE … WHERE … posé sur la condition exacte → re-jouer
-- l'instruction est un no-op.

UPDATE "response_files"
   SET "architect_id" = NULL
 WHERE "kind"         = 'dc2'
   AND "architect_id" IS NOT NULL
   AND "be_id"        IS NULL;
