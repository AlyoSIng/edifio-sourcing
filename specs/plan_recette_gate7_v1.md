# Plan de recette utilisateur Gate 7 — edifio Sourcing v1.0

**Auteur** : [CEO Marc] + [CMO Léa]
**Date** : 2026-05-10
**Statut** : Préparation Gate 7 — à exécuter dès que Vercel preview est stable et que les 3 parcours-clés sont implémentés par Alex
**Recetteur principal** : [CEO Marc] (sponsor) + 1 utilisateur AlyoS final (Patrick ou Sandrine) en parallèle

---

## 1. Périmètre

| Élément | Recette ? |
|---------|-----------|
| Auth + middleware `@alyosingenierie.fr` | ✅ Bloquant |
| Parcours 1 — Solo | ✅ Bloquant |
| Parcours 2 — Tandem accepté | ✅ Bloquant |
| Parcours 3 — Préparation dossier IA | ✅ Bloquant |
| Performance (LCP, sourcing batch) | ✅ Bloquant |
| Audit log (12 actions) | ✅ Bloquant |
| Accessibilité RGAA AA | ⚠️ Audit Gate 9, partiel ici |
| Sync Odoo bidirectionnelle | ⚠️ Si Odoo connecté, sinon hors scope MVP |
| Templates Brevo (8) | ✅ Bloquant |

---

## 2. Jeux de données

### 2.1. Comptes utilisateurs de test

| Identifiant | Email | Rôle | Usage |
|-------------|-------|------|-------|
| U-ADMIN-1 | `marc.teissier@alyosingenierie.fr` | admin | Recetteur principal |
| U-USER-1 | `sandrine.recette@alyosingenierie.fr` | user | Parcours 2 et 3 |
| U-USER-2 | `patrick.recette@alyosingenierie.fr` | user | Parcours 1 (mobile) |
| U-VIEWER-1 | `viewer.recette@alyosingenierie.fr` | viewer | Tests RBAC |
| U-FRAUD-1 | `attacker@gmail.com` | n/a | Test rejet middleware |
| U-FRAUD-2 | `alice@alyosingenierie.com` | n/a | Test domaine cousin |

### 2.2. Organisation de test

| Champ | Valeur |
|-------|--------|
| organization_id | `00000000-0000-0000-0000-000000000001` |
| name | `AlyoS Ingénierie - Recette` |
| siren | `123456789` (factice) |
| odoo_config | null (Odoo désactivé pour recette) |

### 2.3. Profils de recherche de test

| Profil | Mots-clés positifs | CPV | Géo | Montant |
|--------|---------------------|-----|-----|---------|
| ERP recette | rénovation, école, scolaire, hôpital | 45000, 45200 | 69, 38, 42 | 100k-5M |
| Logement recette | logement social, résidence, EHPAD | 45211 | 69 | 500k-10M |

### 2.4. AO de test

3 AO injectés en BDD pour les tests (script SQL à fournir par [DEV Alex]) :

| Réf | Titre | Acheteur | Montant | Échéance | Score IA |
|-----|-------|----------|---------|----------|----------|
| AO-TEST-001 | Rénovation école Jean-Moulin | Mairie de Saint-Étienne | 850 000 € | T+21 jours | 94 |
| AO-TEST-002 | Construction crèche multi-accueil | CCAS Lyon 7 | 1 200 000 € | T+45 jours | 81 |
| AO-TEST-003 | Centre hospitalier de Vienne | CH Lucien-Hussel | 4 200 000 € | T+45 jours | 87 |

### 2.5. Architectes de test

5 architectes injectés en BDD :

| Nom | Email | Spécialités | Tutoiement | Statut |
|-----|-------|-------------|------------|--------|
| Marc Lefèvre | `marc.lefevre.recette@example.com` | Santé, Tertiaire | TRUE | actif |
| Sophie Martin | `sophie.martin.recette@example.com` | Scolaire, ERP | FALSE | actif |
| Pierre Dubois | `pierre.dubois.recette@example.com` | Logement, Patrimoine | TRUE | actif |
| Hélène Garnier | `helene.garnier.recette@example.com` | Industriel | FALSE | prospect |
| Julien Roux | `julien.roux.recette@example.com` | Santé, EHPAD | TRUE | inactif |

### 2.6. RC de test (pour parcours 3 IA)

Un PDF de RC fictif de 12 pages couvrant :
- 14 pièces demandées (mix obligatoires/optionnelles)
- 3 échéances
- 5 critères de jugement pondérés (Méthode 30 % / Délais 20 % / Prix 30 % / Réf. 10 % / Env. 10 %)
- 2 clauses spécifiques (signature électronique RGS**, visite obligatoire)

→ À fournir par [DEV Alex] en début de recette. Stockage : `test-data/RC_AO-TEST-003.pdf`.

### 2.7. Bibliothèque de test

3 attestations + 2 références + 1 CV :

| Type | Nom | Validité |
|------|-----|----------|
| Attestation | Qualibat 5123 | expire T+7j *(test alerte J-7)* |
| Attestation | Qualibat 2113 | expire T+1 an *(OK)* |
| Attestation | RC pro 2026 | expire T+22j *(test alerte J-30)* |
| Référence | Maison de santé Givors | n/a |
| Référence | Reconstruction gymnase Bron | n/a |
| CV | Patrick Teissier — Dirigeant | n/a |

---

## 3. Scénarios de test

### S0 — Auth (email + password) + Middleware @alyosingenierie.fr *(prérequis)*

*Mis à jour 2026-05-10 suite au pivot Board magic-link → email + password.*

| # | Étape | Résultat attendu |
|---|-------|------------------|
| S0.1 | Aller sur `/sourcing/ao-du-jour` sans session | Redirect `/login?next=/sourcing/ao-du-jour` |
| S0.2 | Admin crée un user `sandrine.recette@alyosingenierie.fr` via `/sourcing/admin/users` → modale Inviter | Compte créé Supabase, email Resend envoyé avec mot de passe provisoire, audit log `membership_change operation=invite` |
| S0.3 | Sandrine clique le bouton de l'email + saisit email + mot de passe provisoire | Force-redirect `/reset-password` (must_change_password=true), pas d'accès direct à `/sourcing` |
| S0.4 | Sandrine choisit un mot de passe trop court ou sans symbole | Erreur UI temps réel sur les règles (**16 car** / 1 maj / 1 min / 1 chiffre / 1 symbole), bouton désactivé |
| S0.5 | Sandrine choisit un mot de passe conforme + confirmation | `must_change_password=false`, redirect `/sourcing/ao-du-jour`, session JWT 30j créée |
| S0.6 | Sandrine se reconnecte plus tard avec son mot de passe définitif | Login direct, accès `/sourcing/ao-du-jour`, audit log `login` |
| S0.7 | Tentative login `attacker@gmail.com` + n'importe quel password | Échec auth Supabase, message générique « Identifiants incorrects » (pas de leak existence email) |
| S0.8 | Tentative login `alice@alyosingenierie.com` (domaine cousin) + password valide | Login Supabase OK, mais redirect `/forbidden` au middleware, session invalidée |
| S0.9 | Tentative login email AlyoS + mauvais password (5 fois) | Rate limit Supabase, message « Trop de tentatives, réessayez dans X minutes » |
| S0.10 | « Mot de passe oublié ? » → saisir email AlyoS → recevoir nouveau mot de passe provisoire par email → login → force-redirect `/reset-password` → choix définitif | ADR-011 : `requestPasswordResetAction` regénère un provisoire via `admin.updateUserById` + envoi Resend (variant `reset`). Plus de lien tokenisé. Session établie après choix définitif, redirect `/sourcing/ao-du-jour`. |
| S0.11 | Mot de passe provisoire utilisé > 24 heures après création | Compte expire, admin doit régénérer un nouveau mot de passe provisoire via bouton « Renvoyer » dans interface admin |
| S0.12 | Tampering JWT (modifier `app_metadata` côté client) | Supabase rejette signature RS256, retour `/login` |
| S0.13 | Session expirée (refresh token > 30j) | Redirect `/login?next=...` au prochain accès |
| S0.14 | Casse email : `SANDRINE.RECETTE@AlyosIngenierie.FR` | Normalisation lowercase OK, login + middleware acceptent |

**Critère d'acceptation** : 14/14 ✅. **Bloquant.**

### S1 — Parcours Solo (mobile)

Testé sur iPhone via PWA. Acteur : `patrick.recette@alyosingenierie.fr`.

| # | Étape | Résultat attendu |
|---|-------|------------------|
| S1.1 | À 6h30, cron sourcing déclenché | Push reçu sur iPhone + email digest dans la boîte AlyoS |
| S1.2 | Ouvrir la PWA depuis le push | App ouverte sur la vue `/sourcing/ao-du-jour` |
| S1.3 | Vue affiche les 3 AO de test triés par score | AO-TEST-001 (94) en tête, AO-TEST-003 (87), AO-TEST-002 (81) |
| S1.4 | Tap sur AO-TEST-001 → tap **Sélectionner** | Modale Solo/Tandem ouverte |
| S1.5 | Tap **Solo** → tap **Confirmer** | Modale fermée, toast « Sélectionné en Solo » |
| S1.6 | Backend : statut AO-TEST-001 → `selected_solo` | Vérifier en BDD `SELECT status FROM tenders WHERE external_ref='AO-TEST-001'` |
| S1.7 | Email récap Resend envoyé à Sandrine en CC | Vérifier réception |
| S1.8 | Audit log enregistré | `action='tender_select'`, `data.mode='solo'` |
| S1.9 | Si Odoo connecté : opportunité créée à l'étape « Réponse mandataire seul » | Vérifier en Odoo via API XML-RPC |
| S1.10 | Tap **Annuler la sélection** (dans les 24h) | Statut rebascule en `sourced`, opportunité Odoo supprimée |

**Critère d'acceptation** : 10/10 ✅. **Bloquant.**

### S2 — Parcours Tandem accepté (desktop + architecte externe)

Acteur app : `sandrine.recette@alyosingenierie.fr`. Acteur externe : email test Marc Lefèvre.

| # | Étape | Résultat attendu |
|---|-------|------------------|
| S2.1 | Sandrine sur desktop → vue « AO du jour » | 3 AO affichés |
| S2.2 | Tap **Sélectionner** sur AO-TEST-003 → Modale | Mode Tandem visible avec tag « Recommandé · score MOE 0.91 » |
| S2.3 | Toggle dans la modale : par défaut « Vouvoyer » | car Marc Lefèvre a `tutoiement=TRUE` → toggle pré-réglé sur Tutoyer |
| S2.4 | Tap **Tandem** → écran de short-list architectes | 3 archis affichés, ordonnés par score |
| S2.5 | Sélectionner Marc Lefèvre → écran de prévisualisation Brevo | Template `architect_solicitation_TU` affiché avec données substituées |
| S2.6 | Tap **Envoyer** | Mail Brevo envoyé, statut AO → `awaiting_architect`, audit log `architect_solicit` |
| S2.7 | Statut Brevo mis à jour via webhook | Après ~2 min : `delivered` puis `opened` quand Marc ouvre le mail |
| S2.8 | Marc clique sur le lien tokenisé | Page tokenisée affichée, sans login |
| S2.9 | Marc tap **Oui, je suis partant** | Page de confirmation, statut AO → `architect_accepted`, audit log |
| S2.10 | Push Realtime à Sandrine côté desktop | Notification « Marc Lefèvre accepte le Tandem » apparaît en moins de 5 s |
| S2.11 | Si Odoo connecté : opportunité créée à l'étape « Réponse cotraitance » | Vérifier en Odoo |
| S2.12 | Variante : Marc tap **Non** | Statut AO → `architect_declined`, push « Marc Lefèvre indisponible » à Sandrine, mail accusé `architect_decline_acknowledgment` envoyé |
| S2.13 | Variante : Marc tap **Plus d'infos** | Statut → `architect_info_requested`, Sandrine prévenue par push |

**Critère d'acceptation** : 13/13 ✅. **Bloquant.**

### S3 — Parcours Tandem avec architecte non-connu (test VOUS)

| # | Étape | Résultat attendu |
|---|-------|------------------|
| S3.1 | Sélectionner Hélène Garnier (prospect, vouvoiement) | Toggle pré-rempli sur « Vouvoyer » |
| S3.2 | Prévisualisation Brevo | Template `architect_solicitation_VOUS` affiché |
| S3.3 | Hélène clique sur lien | Page tokenisée en variante VOUS (cf. M4 v1.1) |
| S3.4 | Si Sandrine force le toggle « Tutoyer » alors qu'Hélène est `tutoiement=FALSE` | Préférence sauvegardée pour la prochaine fois, mais ce mail-ci envoyé en TU |

**Critère d'acceptation** : 4/4 ✅.

### S4 — Parcours Préparation dossier IA

Acteur : `sandrine.recette@alyosingenierie.fr`. AO-TEST-003 en `architect_accepted`.

| # | Étape | Résultat attendu |
|---|-------|------------------|
| S4.1 | Upload du RC test (12 pages PDF) | Fichier stocké dans bucket `response_files/AO-TEST-003/RC.pdf`, audit log |
| S4.2 | Tap **Préparer le dossier automatiquement** | Job Edge Function lancé, statut → `dossier_review_required` (en cours) |
| S4.3 | Après ~30s : analyse RC terminée | JSON structuré présent en BDD avec 14 pièces, 3 échéances, 5 critères, 2 clauses |
| S4.4 | Vérifier provenance | Chaque champ a sa référence page + citation courte |
| S4.5 | Checklist générée + mapping bibliothèque | 11 pièces vert, 2 orange (>6 mois), 1 rouge (Qualibat manquant) |
| S4.6 | CERFA DC1, DC2, DC4 pré-remplis | PDF stockés, audit log `ai_run` avec coût |
| S4.7 | Mémoire technique généré ~14 pages | Markdown puis PDF, structuré selon les 5 critères pondérés |
| S4.8 | Statut `dossier_review_required` | Interface side-by-side ouverte par Sandrine |
| S4.9 | Sandrine valide pièce par pièce | Bouton « ✓ Validé » par pièce, statut individuel mis à jour |
| S4.10 | Sandrine retouche 2 paragraphes du mémoire | Diff committé, version 2 enregistrée |
| S4.11 | Tap **Compiler le dossier** | ZIP généré, statut AO → `dossier_ready` |
| S4.12 | Tap **Diffuser à l'architecte** | Mail Brevo `dossier_diffusion_TU` envoyé, push admin si Sandrine est `user` (non admin) |
| S4.13 | Statut AO → `dossier_diffused` | Audit log `dossier_diffuse` |

**Critère d'acceptation** : 13/13 ✅. **Bloquant.**

### S5 — Audit log

| # | Étape | Résultat attendu |
|---|-------|------------------|
| S5.1 | Exécuter les 13 actions sensibles (cf. liste OWASP A09) | Chacune génère bien une entrée dans `audit_logs` |
| S5.2 | Tenter `UPDATE` sur `audit_logs` | Erreur Postgres « audit_logs is immutable » |
| S5.3 | Tenter `DELETE` sur `audit_logs` | Erreur Postgres idem |
| S5.4 | User non-admin lit `audit_logs` | RLS deny, 0 ligne retournée |
| S5.5 | Admin lit `audit_logs` de son org | Toutes les lignes de son org visibles |

**Critère d'acceptation** : 5/5 ✅.

### S6 — Performance & charge

| # | Étape | Cible |
|---|-------|-------|
| S6.1 | LCP vue « AO du jour » mobile 3G simulée | < 2,5 s |
| S6.2 | LCP Kanban desktop 4G | < 3,5 s |
| S6.3 | Sourcing batch complet (4 plateformes, ~1000 AO simulés) | < 10 min |
| S6.4 | Analyse RC Claude Sonnet 4.6 (12 pages) | < 60 s |
| S6.5 | Génération mémoire technique (5 critères) | < 90 s |
| S6.6 | Login → page « AO du jour » bien chargée | < 5 s end-to-end |

**Critère d'acceptation** : 6/6 ✅.

### S7 — Sécurité minimale

| # | Étape | Résultat attendu |
|---|-------|------------------|
| S7.1 | Test cross-tenant (créer une 2ᵉ org factice + tester accès) | Aucune fuite |
| S7.2 | securityheaders.com sur URL preview | Note A minimum |
| S7.3 | `pnpm audit --audit-level=high` | 0 vulnérabilité |
| S7.4 | Test `curl` sur endpoint API sans auth | 401 |
| S7.5 | Test rate limiting (100 requêtes en 1 min) | Réponse 429 après seuil |

**Critère d'acceptation** : 5/5 ✅.

### S8 — Templates Brevo (8)

Envoyer chaque template à un email de test (Mailtrap recommandé) et vérifier visuellement :

| # | Template | Vérif |
|---|----------|-------|
| S8.1 | D.1 `architect_solicitation_TU` | Rendu OK, CTA opérationnels, variables substituées |
| S8.2 | D.2 `architect_solicitation_VOUS` | idem |
| S8.3 | D.3 `architect_followup_TU` | idem |
| S8.4 | D.4 `architect_followup_VOUS` | idem |
| S8.5 | D.5 `dossier_diffusion_TU` | idem |
| S8.6 | D.6 `dossier_diffusion_VOUS` | idem |
| S8.7 | D.7 `tender_summary_to_user` | idem |
| S8.8 | D.8 `architect_decline_acknowledgment` | idem |

**Critère d'acceptation** : 8/8 ✅.

---

## 4. Décompte global

| Catégorie | Tests | Critère d'acceptation |
|-----------|-------|----------------------|
| S0 Auth + Middleware | 8 | 8/8 ✅ bloquant |
| S1 Solo | 10 | 10/10 ✅ bloquant |
| S2 Tandem accepté | 13 | 13/13 ✅ bloquant |
| S3 Tandem VOUS | 4 | 4/4 ✅ |
| S4 Préparation IA | 13 | 13/13 ✅ bloquant |
| S5 Audit log | 5 | 5/5 ✅ |
| S6 Performance | 6 | 6/6 ✅ |
| S7 Sécurité | 5 | 5/5 ✅ |
| S8 Templates Brevo | 8 | 8/8 ✅ |
| **TOTAL** | **72** | **72/72** |

---

## 5. Procédure d'exécution

### Préparation J-1

1. [DEV Alex] applique le script SQL d'injection des 3 AO + 5 architectes + 6 pièces bibliothèque sur le projet Supabase **preview**
2. [DEV Alex] fournit le PDF du RC test
3. [DEV Alex] créé les 6 comptes utilisateurs de test
4. [CEO Marc] vérifie l'URL Vercel preview et confirme la dispo des comptes

### J0 — Exécution

1. [CEO Marc] lance les scénarios dans l'ordre S0 → S8
2. Cocher chaque test au fur et à mesure dans un Google Sheet ou ce document
3. Si un test échoue → ticket bug GitHub Issue, statut Gate 7 = NO-GO tant que non résolu

### J+1 — Bilan

- Si tous les bloquants ✅ → **Gate 7 validable** (note de suivi + document de gate à produire par [CEO Marc])
- Si bloquant ❌ → fix par [DEV Alex] sous 48h, nouvelle passe de recette

---

## 6. Outils

- **Recette manuelle** : ce document + Google Sheet de suivi
- **Recette automatisée** : tests Playwright qui couvrent S0, S1, S2, S4 en parallèle (cf. `middleware_domain_gate.md` § tests)
- **Mailtrap** ou inbox temporaire pour tester les mails Brevo sans polluer la prod

---

*Plan figé. À actualiser si la spec change. Tests automatisés Playwright à maintenir en miroir des scénarios manuels.*
