-- =============================================================================
-- Seed IA — prompt P1 rc_analysis_full (Sonnet 4.6)
--
-- Exécuter manuellement en prod (même workflow que les migrations Drizzle).
-- NE PAS committer les secrets — ce fichier ne contient aucune donnée sensible.
--
-- Source de vérité : specs/ai_prompts_v1.md §P1
-- Constraint : ON CONFLICT (name, version) DO NOTHING — idempotent.
-- =============================================================================

-- v1 désactivée (conservée pour traçabilité — politique versioning Gate 5)
UPDATE ai_prompts SET active = false
WHERE name = 'rc_analysis_full' AND version = 1;

-- v2 — ajout champ competences_demandees
INSERT INTO ai_prompts (id, name, version, model, system_prompt, user_prompt_template, active)
VALUES (
  uuid_generate_v4(),
  'rc_analysis_full',
  2,
  'sonnet-4-6',
  'Tu es un assistant expert en marchés publics français du BTP. Tu lis le Règlement de Consultation (RC) d''un appel d''offres et tu en extrais une structure JSON normalisée. Chaque champ extrait doit comporter sa provenance (page + citation courte). Tu ne hallucines jamais : si une information est absente, tu marques "non_trouve". Pour le champ "competences_demandees" : liste toutes les compétences et qualifications exigées dans le RC (tableau d''objets {competence, niveau, provenance}). Le niveau peut être : "exigée", "souhaitée", "appréciée" ou null si non précisé. Si aucune compétence n''est mentionnée dans le RC, retourne un tableau vide [].',
  E'Voici le RC complet d''un AO. Extrais la structure JSON conformément au schéma fourni. Cite la page et un extrait littéral pour chaque champ.\n\nRC :\n<<RC_TEXT>>\n\nRéponds UNIQUEMENT avec un objet JSON valide, sans markdown ni explications. Schéma attendu :\n{\n  "pieces_demandees": [{ "nom": string, "format": string|null, "signature_requise": boolean, "obligatoire": boolean, "provenance": { "page": number, "citation": string } }],\n  "echeances": [{ "type": "questions"|"visite"|"remise_plis"|"autre", "date": string, "heure": string|null, "provenance": { "page": number, "citation": string } }],\n  "criteres_jugement": [{ "critere": string, "ponderation_pct": number, "sous_criteres": string[]|null, "provenance": { "page": number, "citation": string } }],\n  "modalites_remise": { "plateforme": string|null, "format_pli": string|null, "signature": string|null, "provenance": { "page": number, "citation": string }|null },\n  "clauses_specifiques": [{ "description": string, "provenance": { "page": number, "citation": string } }],\n  "competences_demandees": [{ "competence": string, "niveau": string|null, "provenance": { "page": number, "citation": string } }],\n  "alertes": string[]\n}',
  true
)
ON CONFLICT (name, version) DO NOTHING;
