# Note de suivi — Arbitrages Board du 2026-05-21

**Application** : edifio Sourcing
**Rédacteur** : [CEO Marc]
**Présents** : [CEO], [CTO], [CMO], [GRAPHISTE] + Board (TEISSIER)

## 1. Décisions prises

| # | Décision | Détail |
|---|----------|--------|
| 1 | **Prochaine grosse PR = Tandem** (prioritaire), Solo juste après | Connecteur Odoo mutualisé Solo/Tandem |
| 2 | **Sub-agents QA (Camille) + reviewer (Hugo)** intégrés | Fiches `claude-agents/qa.md`, `reviewer.md` |
| 3 | **Modèle opportunité Odoo corrigé** | Opp créée seulement à l'engagement réel : 1/AO en Solo, 1 par (AO, architecte partant) en Tandem |
| 4 | **CRON sourcing = Option A `30 4 * * 1-5`** (UTC) | 6h30 Paris l'été / 5h30 l'hiver ; dérive saisonnière assumée |
| 5 | **Niveau d'autonomie = (b) Équilibré** | Matrice 🟢/🟠/🔴 inscrite dans `CLAUDE.md` + `dev.md` |
| 6 | **RGPD poussé dans l'app** | Mention art.14 dans 1er mail Brevo + lien d'opposition + désactivation admin — pas reporté à Gate 8 |
| 7 | **Architectes : import des 3805 + complétion progressive + export/ré-import** | Round-trip Excel/CSV dans l'écran admin |

## 2. Livrables produits ce jour (Cowork)

- `design/maquettes/maquettes_v4_sourcing_modules.html` — habillage charte edifio + parcours Solo/Tandem
- `specs/module_solo_engine_v1.md` — spec Solo (corrigée, modèle multi-opportunités)
- `specs/architects_data_and_admin_v1.md` — mapping base réelle + admin CRUD + export/import + RGPD in-app
- `handoff/BRIEF_TANDEM_260521.md` — brief de lancement Alex
- `handoff/COLLECTE_ODOO_260521.md` — questionnaire params Odoo (à remplir Board)
- `specs/rgpd_registre_architectes_DRAFT.md` — brouillon registre RGPD
- `claude-agents/qa.md`, `claude-agents/reviewer.md` — fiches sub-agents
- `CLAUDE.md` + `claude-agents/dev.md` — matrice de délégation (autonomie Équilibré)

## 3. Actions Board en attente

- Remplir `handoff/COLLECTE_ODOO_260521.md` (params Odoo ; clé API → `.env.local`, jamais dans le chat)
- Compléter la base architectes via export/ré-import au fil de l'eau
- Demain matin : valider Gate 6 (cron réel + E2E prod)
- Décisions Gate 8 : durée conservation RGPD, vocabulaire spécialités, pondération matching

## 4. Prochaine étape

Diffuser la commande de lancement Tandem à Alex (Claude Code). Alex démarre en zone verte
(spec validée) sur seed architectes fictif ; branchement Odoo + base réelle quand le Board
a fourni les accès.
