# Spec — Base architectes (import) + administration in-app

**Auteurs** : [CTO Sophie] + [GRAPHISTE Théo] (écran admin) + [CMO Léa] (copy)
**Date** : 2026-05-21
**Statut** : Pré-spec pour Alex — dépendance directe du module Tandem
**Source de données** : `Contact_complete.xlsx` fourni par le Board (2026-05-21) — export Odoo, 3805 lignes, 23 colonnes
**Référence** : `specs/module_tandem_engine_v1.md` (matching V1 consomme cette table) + `specs/rgpd_registre_v1.md`

---

## 1. Objet

Deux besoins distincts :
1. **Importer** la base réelle des ~3805 cabinets/architectes (export Odoo) dans la table `architects` (Supabase EU).
2. **Amender ces informations dans l'app** (demande Board) : écran d'administration permettant de créer / éditer / désactiver un architecte, corriger ses spécialités, zones, registre tu/vous, etc.

---

## 2. ⚠️ RGPD & sécurité — à traiter AVANT l'import

La base contient des **données personnelles** : emails professionnels (~1900), téléphones (~2250), noms de dirigeants (~1750). Donc :

- **Ne JAMAIS committer `Contact_complete.xlsx` ni un seed en clair dans le repo Git.** Le fichier reste hors dépôt (`.gitignore`), l'import se fait directement en base Supabase (Frankfurt, UE) via un script d'import **non committé** ou via l'écran admin (§5).
- Entrée au **registre RGPD** (`rgpd_registre_v1.md`) : finalité = mise en relation pour cotraitance sur AO publics ; base légale = intérêt légitime (relation B2B) ; catégories = identité pro + coordonnées + données entreprise ; durée de conservation = **à acter par le Board (Gate 8)** ; droit d'opposition = un architecte doit pouvoir être retiré/désactivé (cf. écran admin + flag `active`).
- Hébergement UE strict (déjà le cas).

---

## 3. Mapping export Odoo → table `architects`

| Colonne export | Champ `architects` | Traitement |
|----------------|--------------------|-----------|
| `id` | `odoo_external_id` | clé de rapprochement Odoo (évite les doublons à la ré-import) |
| `name` | `cabinet` | nom du cabinet |
| `dirigeant_sirene` | `contact_name` | nom du contact (la colonne `Contact` est vide à 99 %, on retombe sur le dirigeant SIRENE) |
| `email` | `email` | **clé de solicitabilité** (cf. §4) |
| `phone` | `phone` | — |
| `website` | `website` | — |
| `zip`, `city` | `zip`, `city` | — |
| `departements_intervention` | `geo_zones` (text[]) | split sur `,` → `['75','92','93','94']` |
| `x_studio_typologie_1` | `specialty_codes` (text[]) | split sur `,` + **normalisation vocabulaire** (cf. §4) |
| `categorie` | `company_size` | PME / ETI / GE (enrichissement, pas matching V1) |
| `x_studio_effectif`, `effectif_sirene` | `headcount` | effectif (enrichissement) |
| `ca_moyen_3ans`, `ca_dernier`, `annee_ca_dernier` | `revenue_*` | CA (enrichissement) |
| `siren` | `siren` | — |
| `date_creation` | `company_created_at` | — |
| `Commentaire` | `notes` | rempli à 11 lignes seulement |
| `match_source`, `match_score` | (ignorés à l'import) | métadonnées du sourcing antérieur, non utilisées par le matching Tandem |
| *(absent de l'export)* | `tutoiement` | **défaut `VOUS`** (FALSE) pour tous — amendable en app |
| *(absent)* | `preferred` | défaut FALSE — amendable en app |
| *(calculé)* | `past_collabs_count` | 0 à l'import — incrémenté par l'usage |
| *(dérivé)* | `solicitable` | TRUE si `email` non vide (cf. §4) |
| *(constant)* | `active` | TRUE à l'import |

> Migration de la table `architects` via `drizzle-kit generate` (revue CTO — ADR-013) pour ajouter les colonnes d'enrichissement manquantes. RLS FORCE + `organization_id`.

---

## 4. ⚠️ Constats de qualité de données (transparence)

L'export est une **liste large de prospection enrichie**, pas une liste de partenaires curés. Taux de remplissage des colonnes critiques pour Tandem :

| Donnée | Remplissage | Impact |
|--------|-------------|--------|
| `email` | **1902 / 3805 (~50 %)** | **La moitié des architectes ne sont pas sollicitables** par mail Brevo. |
| `x_studio_typologie_1` (spécialité) | **607 / 3805 (~16 %)** | La dimension « spécialité » du matching V1 (30 pts) est aveugle pour 84 % des fiches. |
| `Contact` (nom personne) | 2 / 3805 | Personnalisation du mail limitée → on retombe sur `dirigeant_sirene` (~46 %). |
| `departements_intervention` | 3782 / 3805 (~99 %) | ✅ La dimension géo (20 pts) est fiable. |

**Conséquences à acter :**

1. **Filtre « solicitable »** : par défaut, le matching Tandem ne propose que les architectes avec `solicitable = TRUE` (email présent). Les autres restent en base, consultables/éditables, mais non proposés tant qu'on n'a pas leur email.
2. **Matching V1 dégradé sur la spécialité** : avec 84 % de typologies vides, le score spécialité sera souvent 0. Deux options à arbitrer (cf. §7) : (a) repondérer le matching tant que la donnée est pauvre (plus de poids géo + historique), ou (b) lancer une campagne d'enrichissement progressive via l'écran admin.
3. **Vocabulaire spécialités à normaliser** : les typologies sont en texte libre multi-valeurs (`Habitat collectif,Réhabilitation`, `Equipement public,Sport,Tertiaire`…). Établir une **liste contrôlée** (≈ 12 codes : `habitat_individuel`, `logements_collectifs`, `tertiaire`, `equipement_public`, `sante`, `scolaire`, `patrimoine`, `rehabilitation`, `commerces`, `industriel`, `sport`, `paysage`, `interieur`) et une table de correspondance texte→code à l'import.

---

## 5. Écran d'administration — « amender dans l'app » (demande Board)

**Route** : `src/app/(app)/sourcing/admin/architects/` *(réservé rôle admin AlyoS, derrière middleware domaine)*

**Maquette** : à produire par Théo (M16 — non encore faite ; réutilise les patterns table + form des maquettes existantes M9).

Fonctions :
- **Liste** paginée + recherche (nom, email, ville, SIREN) + filtres (département, spécialité, `solicitable`, `active`, `preferred`).
- **Fiche éditable** : cabinet, contact, email, téléphone, site, **spécialités** (multi-select sur vocabulaire contrôlé), **départements** (multi-select), **tu/vous**, **préféré** (toggle), notes, **actif** (toggle = droit d'opposition RGPD).
- **Création** manuelle d'un architecte.
- **Désactivation** (`active=false`) plutôt que suppression dure (jamais de delete dur sans validation — principe projet).
- **Import / Ré-import** (réservé admin) : upload d'un fichier Excel/CSV → rapprochement par `odoo_external_id` puis `siren` → **upsert** (met à jour l'existant, crée le nouveau, ne duplique jamais). L'import ne committe rien dans Git.
- **Export** (réservé admin) *(demande Board 2026-05-21)* : export de la base architectes (filtrée ou complète) au format **Excel/CSV**, avec les mêmes colonnes que l'import → l'utilisateur complète/corrige hors-ligne, puis **ré-importe** (round-trip). Les colonnes d'export incluent `odoo_external_id` et `siren` comme clés de rapprochement pour que le ré-import retrouve chaque fiche.
- Audit : chaque édition/création/désactivation/import/export tracée (action `architect_edit` / `architect_import` / `architect_export` — ajouter au registre `audit_log_v1.md` si absentes, sinon handoff REQUEST).
- **RGPD dans l'app** *(demande Board 2026-05-21 — « pousse ça vers l'app »)* :
  - **Mention d'information art. 14** insérée automatiquement dans le **1er mail de sollicitation Brevo** (origine des données, finalité, droit d'opposition + lien). Copy Léa.
  - **Lien d'opposition** dans chaque mail → atterrit sur une page publique tokenisée qui passe l'architecte en `active=false` (retiré du matching et des sollicitations futures) sans login.
  - **Désactivation / suppression** depuis l'écran admin (droit d'opposition / effacement).
  - Ces mécanismes sont **dans le périmètre de la PR Tandem / admin**, pas reportés à Gate 8 (Gate 8 ne fait que valider/auditer ce qui est déjà implémenté).

Copy (Léa) : libellés FR cohérents charte edifio. Statut tu/vous expliqué (« registre du mail de sollicitation »). État vide solicitable : « Pas d'email — cet architecte ne peut pas encore être sollicité. »

---

## 6. Plan de mise en œuvre (estimation)

| Étape | Effort |
|-------|--------|
| Migration colonnes `architects` (Drizzle) + RLS | 0.5 j |
| Script d'import Odoo (upsert, normalisation typologie, dérivation `solicitable`) — hors Git | 1 j |
| Écran admin liste + filtres + fiche éditable + création | 2 j |
| Import via UI (upload + rapprochement) | 1 j |
| Audit `architect_edit` + tests E2E (Camille) | 1 j |
| **Total** | **~ 5.5 jours** |

> Cet écran peut être livré **après** le cœur Tandem (matching + sollicitation), qui peut démarrer sur un sous-ensemble importé. Mais l'**import** lui-même est un pré-requis au test réel de Tandem.

---

## 7. Décisions Board

1. ✅ **Périmètre d'import** *(tranché 2026-05-21)* : **importer les 3805**, ne proposer au matching que les `solicitable`. La base sera **complétée progressivement** par AlyoS (via l'admin + le round-trip export/ré-import).
2. ✅ **Export / ré-import** *(tranché 2026-05-21)* : requis — round-trip Excel/CSV pour compléter les données hors-ligne (cf. §5).
3. ✅ **RGPD dans l'app** *(tranché 2026-05-21)* : mention art. 14 + lien d'opposition implémentés dans l'app (cf. §5), pas reportés.
4. **Spécialités pauvres (16 %)** : (a) repondérer le matching V1 (moins de spécialité, plus de géo+historique) le temps d'enrichir, ou (b) garder la pondération ? *(Reco CTO : (a) au démarrage. À confirmer quand Alex attaque le matching.)*
5. **Durée de conservation RGPD** : proposition 3 ans sans suite (à valider Gate 8).
6. **Vocabulaire spécialités** : valider la liste contrôlée des ~12 codes (§4.4) ou l'amender.

---

*Spec figée pour Alex. L'import est un pré-requis au test réel de Tandem ; l'écran d'administration répond à la demande Board « amender ces informations dans l'app ». Le fichier source PII ne transite jamais par Git.*
