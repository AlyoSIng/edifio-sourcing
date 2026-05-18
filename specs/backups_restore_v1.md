# Stratégie de backups et procédure de restauration — edifio Sourcing v1.0

**Auteurs** : [CTO Sophie] + [PS_OPERATOR Yann]
**Date** : 2026-05-10
**Statut** : Préparation Gate 8 — complète le plan_bascule_gate9 et le threat_model_runbook
**Cible RPO** (Recovery Point Objective) : ≤ 24 heures (perte maximale de 24h de données acceptée)
**Cible RTO** (Recovery Time Objective) : ≤ 4 heures (temps maximal de remise en service)

---

## 1. Inventaire des données à sauvegarder

| Type de donnée | Localisation | Volume estimé MVP | Criticité |
|----------------|--------------|--------------------|-----------|
| Base PostgreSQL (22+ tables) | Supabase Frankfurt | ~ 100 Mo à 1 Go | **Élevée** |
| Storage fichiers (DCE, dossiers, bibliothèque) | Supabase Storage | ~ 1-10 Go | **Élevée** |
| Audit logs | Supabase Postgres (table `audit_logs`) | Faible | **Élevée** (juridique) |
| Configuration Supabase (RLS, fonctions, triggers) | Supabase (migrations) | Faible | **Élevée** (reproductible via Git) |
| Configuration Vercel (env vars, build settings) | Vercel Dashboard | Faible | Moyenne (reproductible via doc) |
| Configuration Vault (secrets API) | Supabase Vault | Faible | **Élevée** (mais regénérables via console des fournisseurs) |
| Code source | GitHub `AlyoSIng/edifio-sourcing` | ~ 50-200 Mo | Moyenne (distribution Git) |

---

## 2. Mécanismes de sauvegarde

### 2.1. Supabase PITR (Point In Time Recovery)

**Activé par défaut** sur le plan Supabase Pro (prod). Sur Free (preview), PITR limité.

| Plan | Rétention PITR | Granularité |
|------|----------------|-------------|
| Free | 7 jours | quotidienne |
| Pro | 7 jours | minute |

→ **Pour la prod, Pro obligatoire** dès Gate 9 (déjà acté dans le budget).

**Test de PITR** : à effectuer **avant Gate 9**, simuler une perte de données et restaurer à un point antérieur. Vérifier RTO.

### 2.2. Export quotidien chiffré vers OVH Object Storage EU

En complément du PITR Supabase, un export quotidien indépendant garantit qu'AlyoS contrôle ses données même si Supabase est inaccessible.

**Mécanisme** :
- Job cron Supabase Edge Function (déclenché chaque nuit à 02:00 Europe/Paris)
- Étape 1 : `pg_dump` de la base prod
- Étape 2 : chiffrement AES-256 avec clé contrôlée par AlyoS
- Étape 3 : push vers bucket S3-compatible OVH (region GRA — Gravelines, EU)
- Étape 4 : audit log de l'opération

**Rétention OVH** : 30 jours quotidiens + 12 mois mensuels + 5 ans annuels.

**Coût estimé** : ~ 5 €/mois pour 100 Go (largement suffisant en MVP).

### 2.3. Storage fichiers — réplication Supabase

Les fichiers de `tender_documents`, `response_files`, `presentation_library` sont stockés dans Supabase Storage qui réplique automatiquement (multi-AZ Frankfurt).

**Risque résiduel** : panne régionale Frankfurt complète. Mitigation :
- Snapshot mensuel des buckets vers OVH Object Storage (en complément de Supabase)
- Pour les pièces critiques (DCE finalisés, mémoires signés), copie automatique vers le bucket OVH dès création

### 2.4. Audit logs — archivage long terme

Au-delà de la rétention 5 ans documentée dans `audit_log_v1.md` :
- Archivage trimestriel des `audit_logs` > 5 ans vers OVH Object Storage (bucket dédié froid)
- Compression + chiffrement
- Conservation cumulative (jamais supprimé tant qu'AlyoS existe)

### 2.5. Configuration / Infrastructure-as-Code

- **Migrations BDD** : versionnées dans Git (`supabase/migrations/`). Reproductibles intégralement.
- **Configuration Vercel** : documentée dans `specs/vercel_config_v1.md` (à créer par Alex Gate 6). À reproduire manuellement si reset complet du projet.
- **Configuration Fly.io** : fichier `fly.toml` dans le repo.
- **Secrets** : régénérables via les consoles des fournisseurs (Supabase, Anthropic, etc.). Documentés dans `setup_api_keys_v1.md`.

---

## 3. Tests de restauration

### 3.1. Test mensuel — PITR Supabase

**Procédure** *(à exécuter le 1er lundi de chaque mois)* :

1. Sur le projet Supabase **preview** (jamais sur la prod) :
   - Identifier un timestamp T (par exemple 7 jours en arrière)
   - Dashboard → Database → Backups → Point in Time Recovery
   - Sélectionner T → **Restore**
2. Une fois restauré, vérifier :
   - Présence des tables principales
   - Aucune perte de données entre T et la version live (sur les données injectées en jeu de test)
   - RTO mesuré : objectif ≤ 30 minutes
3. Logger le résultat dans `notes-de-suivi/CC_AAMMJJ_TEST_PITR.md`

### 3.2. Test trimestriel — Restauration depuis export OVH

**Procédure** *(à exécuter au début de chaque trimestre)* :

1. Télécharger un export `pg_dump` chiffré depuis OVH Object Storage
2. Décrypter avec la clé AlyoS
3. Restaurer dans un projet Supabase de test :
   ```bash
   psql -h <test-host> -U postgres -d edifio_sourcing_test < dump.sql
   ```
4. Vérifier intégrité (compte de lignes, contraintes FK, RLS)
5. Mesurer RTO et logger

### 3.3. Test annuel — Disaster recovery complet

**Scénario** : Supabase Frankfurt complètement inaccessible pendant 24h+.

**Procédure** :
1. Provisionner un nouveau projet Supabase (région secondaire si besoin)
2. Restaurer la BDD depuis l'export OVH du jour
3. Restaurer le Storage depuis le bucket OVH (snapshot mensuel + delta)
4. Reconfigurer Vercel pour pointer vers la nouvelle instance Supabase
5. Re-déployer
6. Mesurer RTO total

**Cible RTO disaster recovery** : ≤ 4 heures (acceptable pour un outil interne sans SLA contractuel).

---

## 4. Procédure de récupération en cas d'incident

### 4.1. Incident BDD localisé (corruption d'une table, suppression accidentelle)

**Étapes** :

1. **Diagnostiquer** : quelle table, quel moment, quel impact
2. **Identifier T** : timestamp juste avant l'incident
3. **PITR** : Dashboard Supabase → Restore to T
4. **Vérifier** : données restaurées, fonctions et triggers OK
5. **Reprise** : redémarrer l'app, communication interne aux users
6. **Audit log** : entrée dans `DECISIONS.md` avec détail
7. **Postmortem** sous 7 jours (cf. `threat_model_runbook_v1.md`)

**RTO attendu** : 30 minutes à 1 heure.

### 4.2. Incident infra Supabase complet (panne région)

**Étapes** :

1. **Confirmer** : Supabase Status indique panne en cours
2. **Communication aux users** : « service temporairement indisponible » via Slack/Teams AlyoS
3. **Attendre la résolution Supabase** (typiquement < 2 h sur leur SLA Pro)
4. **OU si > 4 heures** : déclencher disaster recovery (cf. 3.3) — décision Board obligatoire

**RTO attendu** : selon SLA Supabase, généralement 1-4 heures.

### 4.3. Compromission de la base (attaque, suppression malveillante)

**Étapes** :

1. **Isoler** immédiatement : suspendre tous les comptes, couper les accès API
2. **Diagnostiquer** : audit log → identifier l'acteur, l'horodatage, le périmètre
3. **PITR** vers un T antérieur à l'attaque
4. **Réinitialiser les secrets** : toutes les clés API (Supabase, Anthropic, Brevo, etc.)
5. **Réinitialiser les sessions Supabase** : invalider tous les JWT actifs
6. **Communication Board + RGPD** si fuite de données
7. **Reprise progressive** : ouvrir l'accès aux comptes vérifiés un par un

**RTO attendu** : 4 à 24 heures selon la complexité de l'attaque.

### 4.4. Perte du compte GitHub `AlyoSIng`

**Étapes** :

1. **Récupération immédiate** via GitHub Support (procédure d'identité, ~24-48h)
2. En parallèle, créer un compte GitHub temporaire pour AlyoS
3. **Récupérer le code** via :
   - Clones existants sur les machines de l'équipe (Patrick, Sandrine, etc.)
   - Vercel garde une copie du dernier build (récupérable via support)
4. **Reconfigurer le déploiement** Vercel sur le nouveau repo
5. **Communication** : Slack interne AlyoS

**RTO attendu** : 24-48 heures (GitHub Support).

### 4.5. Compromission d'un secret API

**Étapes** (déjà documentées dans `setup_api_keys_v1.md` § fuite) :

1. **Révoquer** la clé dans la console du service
2. **Générer** une nouvelle clé
3. **Mettre à jour** Vercel env vars + redéploiement
4. **Audit log** + entrée dans `DECISIONS.md`

**RTO attendu** : < 30 minutes.

---

## 5. Responsabilités

| Rôle | Responsabilité |
|------|---------------|
| **[CTO Sophie]** | Définir et auditer la stratégie. Pilote les tests de restauration. Valide les RPO/RTO. |
| **[PS_OPERATOR Yann]** | Exécute les sauvegardes, les tests, les restaurations. Maintient les scripts cron. |
| **[DEV Alex]** | Code et maintient les jobs Edge Functions de backup. |
| **[CEO Marc]** | Décide d'un disaster recovery majeur (en lien avec le Board). |
| **[Board TEISSIER]** | Valide les budgets de stockage cible. Tranche les arbitrages exceptionnels. |

---

## 6. Coûts mensuels

| Poste | Montant HT/mois |
|-------|------------------|
| Supabase Pro (PITR + base) | 24 € |
| OVH Object Storage (~ 100 Go, croissance) | ~ 5-15 € |
| **Total backups** | **~ 30-40 € / mois** |

Inclus dans le plafond Phase 1 de 150 €/mois.

---

## 7. Calendrier des tests

| Test | Fréquence | Pilote | Premier passage |
|------|-----------|--------|----------------|
| PITR Supabase preview | Mensuel (1er lundi) | [PS_OPERATOR Yann] | Avant Gate 9 |
| Restauration depuis OVH | Trimestriel | [PS_OPERATOR Yann] + [CTO Sophie] | Q3 2026 |
| Disaster recovery complet | Annuel | Toute l'équipe DEV TEAM | Q1 2027 |

Résultats archivés dans `notes-de-suivi/`. Anomalies remontées au Board.

---

## 8. Checklist Gate 8 (audit sécurité)

- [ ] PITR Supabase Pro testé sur la preview
- [ ] Export quotidien OVH opérationnel
- [ ] Clé de chiffrement AlyoS sauvegardée dans password manager + coffre physique
- [ ] Snapshot mensuel Storage vers OVH configuré
- [ ] Documentation à jour
- [ ] Tests de restauration documentés (au moins un exemple réussi)

---

*Stratégie figée. Revue annuelle obligatoire en Gate 8 update + à chaque incident SEV1/SEV2.*
