-- Migration 0042 — Seed prompt « library_index » pour audit ai_runs
--
-- Contexte Steve 2026-06-03 (chantier G5). L'action indexLibraryBatchAction
-- de la biblio IA n'enregistre PAS encore ses runs dans `ai_runs` car
-- `ai_runs.prompt_id` est NOT NULL. On seed donc un row dédié dans
-- `ai_prompts` (name='library_index', version=1, model='haiku-4-5'), ce qui
-- permet à l'action d'auditer chaque indexation côté BDD (cost, tokens,
-- latence, output JSON) conformément à Gate 5 §7.
--
-- ID stable pour idempotence : ON CONFLICT DO NOTHING permet de rejouer la
-- migration sans risque.

INSERT INTO "ai_prompts" (
  "id",
  "name",
  "version",
  "model",
  "system_prompt",
  "user_prompt_template",
  "output_schema_zod",
  "active"
) VALUES (
  'bbbbbbbb-0000-0000-0000-000000000009',
  'library_index',
  1,
  'haiku-4-5',
  $sys$Tu es un assistant expert en marchés publics français. Tu analyses des documents de la bibliothèque d'une entreprise candidate (attestations, références, CV, présentations société, déclarations CERFA, etc.).

Pour chaque document, tu extrais :
  1. extracted_title — un titre clair et court (≤ 120 caractères) qui décrit le document mieux que son nom de fichier.
  2. keywords — 3 à 10 mots-clés en français (lowercase, séparables, pas de stop-words) utiles pour matcher des pièces demandées dans un RC.
  3. summary — un résumé en 1-2 phrases (≤ 280 caractères) du contenu et de l'usage du document.
  4. doc_type — la catégorie canonique parmi la liste fournie.
  5. extracted_entities — un objet JSON avec les données structurées détectées (varie selon le type).

Tu réponds STRICTEMENT en JSON valide.$sys$,
  $usr$Document à indexer.
Nom de fichier : <<ITEM_NAME>>
Catégorie déclarée par l'admin : <<ITEM_KIND>>

Réponds en JSON conforme au schéma : { extracted_title, keywords, summary, doc_type, extracted_entities }.$usr$,
  NULL,
  true
)
ON CONFLICT (id) DO NOTHING;
