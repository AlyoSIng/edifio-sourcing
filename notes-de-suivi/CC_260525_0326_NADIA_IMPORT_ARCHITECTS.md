# CC 2026-05-25 03:26 — Nadia — Analyse import architectes (3805 cabinets)

**Auteur** : Nadia (dev — module Tandem)
**Statut** : ANALYSE TERMINÉE — en attente arbitrage Steve (pas d'exécution)
**Branche** : feat/sidebar-mobile-hamburger (lecture seule, aucun commit)
**Source** : `src/db/seed/Contact_complete.xlsx` (déjà déposé localement, gitignored
via `Contact_complete*.xlsx` + `src/db/seed/*.xlsx`)
**Garde-fous respectés** : aucune écriture DB, aucun commit/push, aucune modif
schema, fichier PII jamais sorti du repo local, exemples anonymisés.

---

## 1. Analyse du fichier Excel

### Méthode
Fichier ouvert par décompression ZIP (XLSX = ZIP+XML) via `Expand-Archive` PowerShell
puis parse Node minimal du `xl/worksheets/sheet1.xml` (2.6 MB). Aucune dépendance
ajoutée au projet. Scripts d'analyse jetables dans `tmp/` (gitignoré).

### Macro
- **1 seul sheet** : `Sheet1` (range défini A1:W3806 — 23 colonnes × 3806 lignes).
- **3805 lignes data** (header en ligne 1), correspond exactement à la spec.
- **Aucun doublon** sur la colonne `id` (Odoo external) — clé de rapprochement OK.
- 2 origines d'enregistrement détectées sur `id` :
  - `__export__.res_partner_*` — **2305 lignes** (export CRM Odoo)
  - `sirene_*` — **1500 lignes** (enrichissement SIRENE post-Odoo)

### Taux de remplissage par colonne (3805 lignes data)

| # | Colonne Excel | Filled | % | Champ schema cible |
|---|--------------|--------|---|---------------------|
| 0 | `id` | 3805 | 100.0% | `odoo_external_id` (UNIQUE) |
| 1 | `name` | 3801 | 99.9% | `cabinet` (NOT NULL) — **4 lignes vides** |
| 2 | `website` | 611 | 16.1% | `website` |
| 3 | `email` | 1902 | 50.0% | `email` (clé `solicitable`) |
| 4 | `phone` | 2248 | 59.1% | `phone` |
| 5 | `zip` | 3782 | 99.4% | `zip` |
| 6 | `city` | 3782 | 99.4% | `city` |
| 7 | `x_studio_effectif` | 2160 | 56.8% | `headcount` (fallback) |
| 8 | `x_studio_typologie_1` | 607 | 16.0% | `specialty_codes` (normalisé) |
| 9 | `ca_moyen_3ans` | 1098 | 28.9% | (ignoré V1 — hors schema actuel) |
| 10 | `departements_intervention` | 3782 | 99.4% | `geo_zones` (split `,`) |
| 11 | `Contact` | 2 | 0.1% | `contact_name` (quasi vide → fallback dirigeant) |
| 12 | `Commentaire` | 11 | 0.3% | `notes` |
| 13 | `siren` | 1815 | 47.7% | `siren` (à fusionner avec `id` sirene_*) |
| 14 | `effectif_sirene_code` | 1815 | 47.7% | (ignoré) |
| 15 | `effectif_sirene` | 1815 | 47.7% | `headcount` (parse range `3-5` → 4) |
| 16 | `date_creation` | 1815 | 47.7% | `company_created_at` |
| 17 | `dirigeant_sirene` | 1748 | 45.9% | `contact_name` (fallback principal) |
| 18 | `ca_dernier` | 1274 | 33.5% | (ignoré V1) |
| 19 | `annee_ca_dernier` | 1274 | 33.5% | (ignoré V1) |
| 20 | `categorie` | 1814 | 47.7% | `company_size` (PME/ETI/GE) |
| 21 | `match_source` | 1815 | 47.7% | (ignoré — métadonnée sourcing antérieur) |
| 22 | `match_score` | 315 | 8.3% | (ignoré) |

### Typologies (55 tokens uniques)
La spec `architects_specialty_mapping_v1.md` §2 couvre 52/55 ; les 3 résiduels
sont des variantes accentuées (`Hôpitaux`, `Hôtellerie`, `Hôtels`) ; la règle
**casse + accents-insensible** de §3 les absorbe (mapping vers `sante` /
`commerces`). RAS — table cible inchangée.

### Départements (78 valeurs uniques)
100% au format numérique 2-3 chars. Pas de Corse `2A/2B` détectée. Top 5 :
92, 94, 93, 75, 95 (Île-de-France massivement).

### 3 lignes échantillon (anonymisées)
Voir `tmp/fill-stats.json` (gitignoré). Patterns confirmés : (a) ligne CRM
complète avec email + dirigeant SIRENE, (b) ligne Odoo brute sans enrichissement
(juste zip/dpts), (c) ligne SIRENE pure sans email/dirigeant CRM.

---

## 2. Mapping Excel → `architects` (Drizzle, 24 colonnes)

Légende transformation : `D` = direct, `P` = parse, `F` = fallback chaîné,
`N` = normalisation vocabulaire, `S` = split, `K` = constant.

| Schema (24) | Excel | Transfo | Trous bloquants |
|-------------|-------|---------|------------------|
| `id` | — | UUID v4 auto-généré (`uuid_generate_v4()`) | — |
| `organizationId` | — | K = `ALYOS_ORG_ID` (`11111111-...`) | — |
| `cabinet` (NOT NULL) | `name` | D + trim | **4 lignes sans name** — fallback : `dirigeant_sirene` sinon `Cabinet sans nom (${odoo_id})` |
| `contactName` | `Contact` puis `dirigeant_sirene` | F (1er non vide) | — (nullable) |
| `email` | `email` | D + trim + lowercase | 1903 lignes vides → NULL OK (dérive `solicitable=false`) |
| `phone` | `phone` | D + trim | — |
| `website` | `website` | D + trim + normalize `https?://` préfixe | — |
| `siren` | `siren` puis `id` parsed (`sirene_(\d+)`) | F : prendre col `siren` ; si vide et id commence par `sirene_` → extraire les chiffres | — |
| `zip` | `zip` | D + trim (pad zero si int) | — |
| `city` | `city` | D + trim + collapse `&#160;` (NBSP vu en data) | — |
| `headcount` | `x_studio_effectif` puis `effectif_sirene` (range `3-5` → moyenne 4) | F + P | — |
| `companySize` | `categorie` | D (valeurs : PME/ETI/GE — à confirmer en parsant unique) | — |
| `companyCreatedAt` | `date_creation` | P `YYYY-MM-DD` → timestamptz | — |
| `odooExternalId` (UNIQUE) | `id` | D | — |
| `specialtyCodes[]` | `x_studio_typologie_1` | S sur `,` + N (accent+case insensitive via table spec §2) → codes contrôlés | inconnu → `non_classe` (exclu matching) |
| `geoZones[]` | `departements_intervention` | S sur `,` + trim + pad 2 chars | — |
| `tutoiement` | — | K = `false` (vouvoiement par défaut, directive Board Gate 4) | — |
| `preferred` | — | K = `false` | — |
| `active` | — | K = `true` | — |
| `solicitable` | (GENERATED) | DB dérive `email IS NOT NULL` | — |
| `pastCollabsCount` | — | K = `0` | — |
| `notes` | `Commentaire` | D + trim + unescape HTML entities (vu `&#233;`) | — |
| `createdAt` / `updatedAt` | — | `now()` | — |

**Trous critiques** : 4 lignes sans `name` → fallback `dirigeant_sirene` ou
`Cabinet sans nom (${odoo_id})` pour ne JAMAIS violer `cabinet NOT NULL`. Le
script doit logger ces 4 cas dans un rapport d'import.

**Note encoding** : le sheet1.xml contient des entités HTML (`&#233;` = é). Tout
parser à passer dans `unescape()` Sinon `Réhabilitation` arrivera mal en base.

---

## 3. État du code existant

| Composant | État | Verdict |
|-----------|------|---------|
| UI admin `/sourcing/admin/architects` | **ABSENT** (Glob = 0 fichier — M16 jamais codé) | À créer (sortie périmètre Nadia) |
| Script CLI XLSX | **ABSENT** (`scripts/` n'a que `bug-cabinet/` + `bootstrap-admin.ts`) | À créer |
| `db:seed:architects` (`architects-fixture.ts`) | EXISTE mais ne sert qu'au seed **fictif Tandem** (6 cabinets `@example.test`, gated `NODE_ENV !== production`) | Pas réutilisable pour import réel |
| `db:seed:prod` (`prod.ts`) | EXISTE et seede `architect_specialties` (7 codes ref) + orgs/platforms/ai_prompts/search_profiles — **mais ne touche pas `architects`** | Conforme spec (à laisser hors périmètre import data réelle) |
| Connecteur Odoo (`src/lib/odoo/`) | EXISTE (`createOdooOpportunity` + XML-RPC client, gated `ODOO_SYNC_ENABLED`) | **HORS sujet ici** — Steve fournit un XLSX direct, pas un pull XML-RPC live |

**Conclusion** : pas de pipeline d'import. Tout est à créer.

**Note suivi non bloquante** : journal `__drizzle_migrations` prod = 4 lignes,
DDL des 3 dernières migrations (0004/0005/0006) apply sans entrée journal. Un
`drizzle-kit migrate` futur réessaierait → crash. À fixer avant la 8e migration.
(Hors périmètre cette analyse — déjà acté par Steve.)

---

## 4. Scénarios proposés

### Scénario A — UI admin (`/sourcing/admin/architects/import`)
- **Effort** : ~2 j (page list + form upload + parse XLSX serveur + preview-diff + commit).
- **Pro** : DX bonne, audit `architect_import` natif, ré-import facile, conforme
  spec §5.
- **Con** : long, exige aussi l'écran liste/édition (M16 non maquetté Théo). Sort
  du périmètre Tandem ; doublon avec ce qu'Alex pourrait porter.
- **Verdict** : pas adapté à l'urgence import data réelle (prod vide).

### Scénario B — Script CLI `scripts/architects-import-260525.ts` ⭐ PRÉFÉRÉ
- **Effort** : ~0.5 j (j'ai déjà 90% des briques en local — parser XLSX, mapping
  spec §3, table spécialités spec §2 ; reste : intégration Drizzle + upsert +
  rapport JSON + double garde anti-prod-accident).
- **Flow** :
  1. Lecture `Contact_complete.xlsx` (path en argv, défaut `src/db/seed/`).
  2. Build des `NewArchitect[]` avec mapping complet + log lignes problématiques
     (sans name, typologies inconnues).
  3. **Dry-run par défaut** : print rapport `{ insertes, mises_a_jour, ignorees,
     erreurs }`, AUCUN INSERT.
  4. Flag `--commit` requis pour exécuter l'upsert.
  5. `onConflictDoUpdate` sur `odooExternalId` (UNIQUE) : ré-import idempotent.
  6. Garde double `assertProdContext()` (réutilise pattern `prod.ts`).
  7. Écrit rapport JSON `tmp/architects-import-report-260525.json`.
- **Pro** : rapide, traçable, ré-jouable, scriptable cron si jamais. Steve garde
  la main (memory `feedback_ops_prod_user_runs_migration` : il pose
  `DATABASE_URL`, lance, colle output). Strictement conforme contrainte « pas
  d'INSERT sans validation ».
- **Con** : pas d'UI. Mais l'UI est prévue pour la complétion progressive
  (round-trip export/ré-import — spec §5), pas l'import initial.
- **Recommandation** : **scénario B**. Permet de débloquer Tandem (matching a
  besoin d'architectes en base) en 1/2 journée, sans toucher au backlog Alex.

### Scénario C — SQL pur INSERT généré
- **Effort** : ~0.3 j (script ts qui pisse 3805 lignes `INSERT … ON CONFLICT`
  dans un .sql, Steve copy-paste).
- **Pro** : maximum d'inspection avant exécution.
- **Con** : pas d'audit log côté app, pas d'idempotence propre Drizzle, parse
  manuel des erreurs Postgres pénible à 3805 lignes. Mauvais ROI vs B.

---

## 5. Questions à Steve (4 max, basées sur l'analyse)

1. **Cible** : prod direct (table vide aujourd'hui, idempotent par construction)
   ou dev d'abord pour valider le rapport sec, puis prod ? Reco Nadia : **dev
   d'abord** (dry-run → commit) pour valider les 4 lignes sans `name`, puis
   prod (memory `feedback_postgres_dry_run_local` : DDL/data ops, dry-run local
   obligatoire avant prod).

2. **Lignes sans email (1903 / 50%)** : import malgré tout avec `solicitable=false`
   dérivé ? Conforme spec §7 décision 1 — je le confirme avant code. (Reco oui :
   permet complétion progressive via UI plus tard.)

3. **Tutoiement** : tout `false` par défaut OK ? Ou as-tu une liste de SIREN /
   `odoo_external_id` à passer à `true` dès l'import (collaborations historiques
   AlyoS) ? Si oui, fournir une liste courte ; sinon `false` partout et
   amendement via UI plus tard.

4. **4 cabinets sans `name`** : fallback `dirigeant_sirene` (4 sont des
   `sirene_*` donc probablement enrichis SIRENE pur sans nom CRM) — si même
   `dirigeant_sirene` est vide, je pose `"Cabinet sans nom (sirene_XXX)"`. OK
   ou tu préfères les **ignorer purement** (skip + log) ?

---

## 6. Garde-fous tenus

- ✅ Aucune écriture DB.
- ✅ Aucun commit / push.
- ✅ Aucune modif schema.
- ✅ Aucune dépendance ajoutée (parsing XLSX maison, jetable).
- ✅ Fichier PII reste dans `src/db/seed/Contact_complete.xlsx` (gitignored
  via `.gitignore` ligne 13 — pattern `Contact_complete*.xlsx`). Copie de
  travail dézippée dans `tmp/xlsx_unzip/` (à supprimer ou laisser local,
  gitignored si on ajoute `tmp/` à `.gitignore` — actuellement absent, donc je
  recommande l'ajout en zone verte sur la prochaine PR).
- ✅ Exemples anonymisés (emails → `archi_NNN@example.test`, noms/phones/
  websites → `[REDACTED]`).
- ✅ Données NON exportées vers service externe (parsing 100% local Node).

**Action recommandée Steve** : ajouter `tmp/` au `.gitignore` (zone verte Alex
ou prochain commit doc) pour éviter le risque de leak via les scripts d'analyse
de ce type. Actuellement les `.xlsx` ne peuvent pas leak (pattern
`Contact_complete*.xlsx` global), mais les `fill-stats.json` (sans PII directe
mais avec emails dans samples si on désactivait l'anonymisation) pourraient.

---

## 7. Prochaine étape (en attente arbitrage)

Sur OK Steve sur le scénario B + réponses Q1-Q4 :
1. Je crée `scripts/architects-import-260525.ts` (en local, non commit).
2. Run dry-run local → poste rapport au Board.
3. Si OK, Steve lance `--commit` sur dev d'abord, puis prod.
4. Note de suivi finale + entrée `DECISIONS.md`.

Effort estimé total : **0.5 j de mon côté** + arbitrage Steve.

— Nadia
