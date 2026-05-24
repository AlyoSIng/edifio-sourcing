# Topo livrables — soirée 2026-05-22

**Rédacteur** : [CEO] Marc + [CTO] Sophie (Cowork)
**Application** : edifio Sourcing
**Objet** : Point d'étape sur les livrables de l'équipe Claude Code (Alex `dev`, Nadia `dev_tandem`, Camille `qa`, Hugo `reviewer`, Yann `ps_operator`)
**Méthode** : synthèse à partir des sources **observables depuis Cowork** — état réel de la base Supabase prod (`alyos-sourcing` / `loogmtltwkhvczdiurqs`) + audit sécurité Supabase + plan/tâches en cours. **Le code, les commits et les notes de suivi du repo `C:\Dev\edifio-sourcing` ne sont PAS lisibles depuis Cowork** : la relecture fine du code reste à confirmer via handoff.

---

## 1. Acquis vérifiés (base prod) — solide

- **Schéma complet et propre, 25 tables.** Modèle de données conforme aux specs Gate 5.
- **`architects` reconstruite proprement** (décision « Refaire propre » du 2026-05-22) : 16 colonnes nettes — firstname, lastname, title, email, phone, siret, `specialty_codes[]`, `geo_zones[]`, references, `partnership_status` (actif/inactif/prospect), notes, `tutoiement`, timestamps.
- **`architect_tokens`** = table dédiée avec révocation (jwt_id, expires_at, revoked / revoked_at / revoked_by) → conforme spec page tokenisée (1 token JWT par AO/architecte, 30 j, révocable admin).
- **`architect_responses`** : enum statut `pending / accepted / declined / info_requested` → cohérent avec accept/refus/plus d'infos.
- **`audit_logs`** : 15 actions (login, search_profile_change, tender_select, architect_solicit, dossier_diffuse, ai_run, odoo_opportunity_create, architect_change, rgpd_export, token_revoke, data_delete, access_attempt, tender_defer, tender_reject).
- **Rappel acquis plus tôt dans la journée** : P1 prod résolu (migration 0004 `deferred_until` + empty state propre), cron sourcing opérationnel end-to-end (HTTP 200, 288 AO fetchés, 0 erreur), 2 commits poussés sur `feat/sourcing-mvp`.

## 2. En cours sur la branche (pas encore en prod — normal)

Absents de la base prod, donc sur `feat/sourcing-mvp` / non migrés (zone rouge non franchie sans OK Board) :
- Colonnes **`tokenId` + `followupSentAt`** sur `architect_responses` (décision 2026-05-22).
- Action d'audit **`architect_response` (A16)** dans l'enum `audit_action`.
- Refonte esthétique alignée maquettes v4/v5 (#42), écran admin profil (#40), fix bug `/sourcing/admin/users` (#41), matching V1 + sollicitation Brevo + normalisation accents du matcher (Tandem #36).

## 3. Points de sécurité relevés par l'audit Supabase (état prod)

> À traiter **avant merge en prod** et à intégrer au dossier **Gate 8 (sécu + RGPD)**.

- 🔴 **ERROR — RLS désactivée** sur 4 tables publiques : `users`, `architect_specialties`, `ai_prompts`, `platforms`. Pour `users` c'est critique ; les 3 autres sont peut-être des tables de référence globales (à confirmer), mais la règle projet est **RLS FORCE 100 %**.
- 🟠 **INFO** — `organizations` : RLS activée mais **aucune policy** (accès de fait bloqué sauf service role).
- 🟠 **WARN** — 4 fonctions à `search_path` mutable : `current_organization_id`, `current_user_role`, `reject_audit_mutation`, `touch_updated_at` → figer le `search_path`.
- 🟠 **WARN** — extension `pg_trgm` installée dans le schéma `public` (à déplacer).
- 🟠 **WARN** — protection « mot de passe compromis » (HaveIBeenPwned) **désactivée** dans Supabase Auth → l'activer (gain sécu gratuit, cohérent avec auth email+mot de passe).

*Réserve : ces constats reflètent la base prod, donc l'état **avant** le travail du soir. Une partie est peut-être déjà corrigée sur la branche — à vérifier au merge.*

## 4. En suspens / décisions Board

- **UPDATE SQL calibrage profil** : préparé, **non appliqué** (attente « go » Board). À passer idéalement après la normalisation accents du matcher (Nadia).
- **Merge `feat/sourcing-mvp` → prod** : zone rouge, OK Board requis (après revue Hugo + tests verts Camille).
- **Gate 6** : pipeline technique prouvé ; insertion réelle dépend du calibrage profil.
- **Cleanup branches spike** (Task #5, ~2026-06-17).

## 5. Pour boucler la relecture du code (canaux handoff)

1. Coller dans Cowork la sortie Claude Code : `git log --oneline -15` + liste PR + récap fin de session Alex/Nadia. *(le plus rapide)*
2. Script de sync inverse repo → Cowork pour rapatrier `notes-de-suivi/`.
3. URL preview deploy Vercel de `feat/sourcing-mvp` pour inspection visuelle.

---

**Prochaine étape recommandée** : canal 1 (récap Claude Code) + planifier un mini-lot de durcissement RLS/sécu avant tout merge prod, à verser dans le dossier Gate 8.
