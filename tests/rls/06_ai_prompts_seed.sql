-- ============================================================================
-- pgTAP 06_ai_prompts_seed -- edifio Sourcing
-- ----------------------------------------------------------------------------
-- Verifie l'integrite du seed `ai_prompts` apres `pnpm db:seed` :
--
--   1. Cardinalite : 13 prompts active=true (P1-P13)
--   2. Aucun doublon de (name, version)
--   3. Chaque nom de prompt attendu est present
--   4. Toutes les versions = 1 (livraison initiale)
--   5. Modeles : 4 sonnet-4-6 (P1-P3 + P13) + 9 haiku-4-5 (P4-P12)
--   6. system_prompt, user_prompt_template non null/non vide
--   7. output_schema_zod : null uniquement pour ao_brief (P13)
--   8. Presence et champs corrects du prompt ao_brief (P13)
--
-- Reference : specs/ai_prompts_v1.md + src/db/seed/data/ai-prompts.ts
--             + handoff/SPEC_ADDENDUM_260524_AO_DU_JOUR_REPORT_ET_BRIEF.md
-- Etape 6/7 PR #2 module sourcing engine + P13 ajout PR #82.
--
-- IMPORTANT : ce test est append-only -- il ne FLUSH pas la table. Il s'execute
-- apres le seed dans le pipeline `pnpm db:dry-run` (cf. scripts/db-dry-run.ps1)
-- ou en CI dans le workflow db-rls.yml qui pose seed puis pg_prove.
-- ============================================================================

BEGIN;
SELECT plan(12);

-- ---- 1. Cardinalite -------------------------------------------------------
SELECT is(
  (SELECT COUNT(*)::int FROM ai_prompts WHERE active = TRUE),
  13,
  'seed ai_prompts : 13 prompts actifs (P1-P13)'
);

-- ---- 2. Aucun doublon (name, version) -- la contrainte UNIQUE devrait deja
--       l'empecher cote DDL, mais on verrouille au cas ou.
SELECT is(
  (SELECT COUNT(*)::int FROM (
    SELECT name, version, COUNT(*) AS n
      FROM ai_prompts
     GROUP BY name, version
    HAVING COUNT(*) > 1
  ) dup),
  0,
  'aucun doublon (name, version)'
);

-- ---- 3. Chaque nom attendu est present -----------------------------------
-- On verifie les 13 noms en une assertion en utilisant ARRAY_AGG.
SELECT bag_eq(
  $$SELECT name FROM ai_prompts WHERE active = TRUE$$,
  $$VALUES
    ('rc_analysis_full'),
    ('memo_technique_generation'),
    ('cerfa_field_inference'),
    ('tender_scoring_complementary'),
    ('architect_matching_rationale'),
    ('email_subject_solicitation'),
    ('email_subject_followup'),
    ('tender_summary_short'),
    ('decline_motif_categorize'),
    ('library_piece_match'),
    ('attestation_expiry_alert_text'),
    ('accroche_memo_intro'),
    ('ao_brief')$$,
  'les 13 noms de prompts (P1-P13) sont presents'
);

-- ---- 4. Toutes les versions = 1 ------------------------------------------
SELECT is(
  (SELECT COUNT(DISTINCT version)::int FROM ai_prompts WHERE active = TRUE),
  1,
  'toutes les versions actives sont egales (1, livraison initiale)'
);

SELECT is(
  (SELECT MAX(version)::int FROM ai_prompts WHERE active = TRUE),
  1,
  'version max = 1'
);

-- ---- 5. Repartition des modeles (Gate 2 strategie 4/A) -------------------
SELECT is(
  (SELECT COUNT(*)::int FROM ai_prompts WHERE active = TRUE AND model = 'sonnet-4-6'),
  4,
  '4 prompts sonnet-4-6 (P1-P3 + P13 ao_brief, taches longues / structurees)'
);

SELECT is(
  (SELECT COUNT(*)::int FROM ai_prompts WHERE active = TRUE AND model = 'haiku-4-5'),
  9,
  '9 prompts haiku-4-5 (P4-P12, taches courtes / pre-classification)'
);

-- ---- 6. Contenu non null / non vide (system_prompt + user_prompt_template) ----
SELECT is(
  (SELECT COUNT(*)::int FROM ai_prompts
    WHERE active = TRUE
      AND (system_prompt IS NULL OR length(system_prompt) = 0)),
  0,
  'tous les system_prompt sont non null et non vides'
);

SELECT is(
  (SELECT COUNT(*)::int FROM ai_prompts
    WHERE active = TRUE
      AND (user_prompt_template IS NULL OR length(user_prompt_template) = 0)),
  0,
  'tous les user_prompt_template sont non null et non vides'
);

-- ---- 7. output_schema_zod : seul ao_brief (P13) peut etre null ----------
-- ao_brief retourne du texte libre (pas de structure JSON) — pas de schema Zod.
-- Tous les autres prompts (P1-P12) doivent avoir un output_schema_zod non vide.
SELECT is(
  (SELECT COUNT(*)::int FROM ai_prompts
    WHERE active = TRUE
      AND name <> 'ao_brief'
      AND (output_schema_zod IS NULL OR length(output_schema_zod) = 0)),
  0,
  'tous les output_schema_zod sont non null et non vides (hors ao_brief)'
);

SELECT is(
  (SELECT COUNT(*)::int FROM ai_prompts
    WHERE active = TRUE
      AND output_schema_zod IS NULL),
  1,
  'exactement 1 prompt sans output_schema_zod (ao_brief, texte libre)'
);

-- ---- 8. Presence et champs corrects du prompt ao_brief (P13) ------------
SELECT is(
  (SELECT COUNT(*)::int FROM ai_prompts
    WHERE name = 'ao_brief'
      AND version = 1
      AND active = TRUE
      AND model = 'sonnet-4-6'
      AND output_schema_zod IS NULL
      AND system_prompt IS NOT NULL
      AND user_prompt_template IS NOT NULL),
  1,
  'prompt ao_brief (P13) present avec model=sonnet-4-6, output_schema_zod=null, version=1'
);

SELECT * FROM finish();
ROLLBACK;
