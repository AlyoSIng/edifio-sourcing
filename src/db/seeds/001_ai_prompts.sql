-- =============================================================================
-- Seed IA — prompt P1 rc_analysis_full (Sonnet 4.6)
--
-- Exécuter manuellement en prod (même workflow que les migrations Drizzle).
-- NE PAS committer les secrets — ce fichier ne contient aucune donnée sensible.
--
-- Source de vérité : specs/ai_prompts_v1.md §P1
-- Constraint : ON CONFLICT (name, version) DO NOTHING — idempotent.
-- =============================================================================

INSERT INTO ai_prompts (id, name, version, model, system_prompt, user_prompt_template, active)
VALUES (
  uuid_generate_v4(),
  'rc_analysis_full',
  1,
  'sonnet-4-6',
  'Tu es un assistant expert en marchés publics français du BTP. Tu lis le Règlement de Consultation (RC) d''un appel d''offres et tu en extrais une structure JSON normalisée. Chaque champ extrait doit comporter sa provenance (page + citation courte). Tu ne hallucines jamais : si une information est absente, tu marques "non_trouve".',
  E'Voici le RC complet d''un AO. Extrais la structure JSON conformément au schéma fourni. Cite la page et un extrait littéral pour chaque champ.\n\nRC :\n<<RC_TEXT>>\n\nRéponds UNIQUEMENT avec un objet JSON valide, sans markdown ni explications. Schéma attendu :\n{\n  "pieces_demandees": [{ "nom": string, "format": string|null, "signature_requise": boolean, "obligatoire": boolean, "provenance": { "page": number, "citation": string } }],\n  "echeances": [{ "type": "questions"|"visite"|"remise_plis"|"autre", "date": string, "heure": string|null, "provenance": { "page": number, "citation": string } }],\n  "criteres_jugement": [{ "critere": string, "ponderation_pct": number, "sous_criteres": string[]|null, "provenance": { "page": number, "citation": string } }],\n  "modalites_remise": { "plateforme": string|null, "format_pli": string|null, "signature": string|null, "provenance": { "page": number, "citation": string }|null },\n  "clauses_specifiques": [{ "description": string, "provenance": { "page": number, "citation": string } }],\n  "alertes": string[]\n}',
  true
)
ON CONFLICT (name, version) DO NOTHING;
