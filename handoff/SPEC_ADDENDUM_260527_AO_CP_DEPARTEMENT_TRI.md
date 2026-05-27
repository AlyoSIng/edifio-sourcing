# ADDENDUM SPEC — AO du jour : code postal, département, tri & filtres

**Émetteur** : CEO Marc + CTO Sophie (Cowork)
**Destinataires** : Alex (`dev`), Camille (`qa`), Hugo (`reviewer`)
**Date** : 2026-05-27
**Origine** : demande Board 2026-05-27.
**Rattachement** : complète `SPEC_ADDENDUM_260524_AO_DU_JOUR_REPORT_ET_BRIEF.md`.
**Zone** : 🟢 verte (périmètre validé Board) — sauf la migration BDD qui passe en revue CTO (🟠) avant push.

---

## Besoin Board

Sur l'écran « AO du jour », l'utilisateur veut :
1. **Voir le code postal** du lieu d'exécution du marché. À défaut (absent de l'annonce),
   afficher le **code postal du MOA** (maître d'ouvrage / acheteur).
2. **Trier** les AO par **département** et par **jours avant clôture**.
3. **Filtrer** par **département** et par **fenêtre de jours avant clôture**.

---

## Exigence 1 — Donnée code postal / département

**À vérifier d'abord (Alex)** : cartographier dans `tenders.raw_data` (échantillon réel BOAMP)
les chemins du code postal du lieu d'exécution **et** du code postal de l'acheteur/MOA.
Le BOAMP expose en général le lieu d'exécution (NUTS / CP) et l'identité de l'acheteur.

**Règle de résolution du CP affiché** :
```
cp_affiché = cp_lieu_execution  (si présent et valide)
           sinon cp_moa          (code postal de l'acheteur)
           sinon null            (afficher « CP non précisé »)
```

**Dérivation du département** (à partir du CP retenu) :
- 2 premiers chiffres du CP, SAUF :
  - **Corse** : CP `20xxx` → `2A` (Corse-du-Sud) / `2B` (Haute-Corse). Si la distinction
    n'est pas dérivable du seul CP, conserver `20` + flag à clarifier (ne pas inventer).
  - **DOM/TOM** : CP `97x` / `98x` → département sur **3 chiffres** (`971`…`976`, `984`, `987`, `988`).
- Source de la table de correspondance : réutiliser **`NEIGHBORING_DEPARTMENTS`** déjà exporté
  depuis `matching.ts` (carte des 101 départements, PR #70) — **ne pas recréer** la liste.

---

## Exigence 2 — Persistance (migration Drizzle)

Pour filtrer/trier proprement sans parser le JSON à chaque requête :

- Ajouter une colonne **`tenders.department text`** (nullable ; 2 à 3 caractères : `75`, `2A`, `971`).
- (Optionnel mais recommandé) **`tenders.postal_code text`** pour l'affichage direct.
- **Index** sur `department` (filtre fréquent) ; `deadline` est déjà exploitable pour le tri J-clôture.
- Population : (a) au **scraping/ingest** (dérivation à l'insert), (b) **backfill** des lignes
  existantes via un script CLI dédié (dry-run puis `--commit`, idempotent).
- Migration **via `drizzle-kit generate`** + revue CTO avant push (🟠). Pas d'`ALTER TABLE` manuel.
- ⚠️ Vérifier l'alignement du journal `__drizzle_migrations` avant (dette 0015/0016 connue).

---

## Exigence 3 — Tri & filtres (UI + query)

**Tris disponibles** (en plus du tri par score existant) :
- `département` ascendant (puis score DESC en tie-break).
- `jours avant clôture` ascendant (`deadline - now()` croissant — les plus urgents en tête).

**Filtres** :
- **Département** : multi-sélection (liste des départements présents dans le backlog courant).
- **Jours avant clôture** : fenêtres prédéfinies (`≤ 7 j`, `≤ 15 j`, `≤ 30 j`, `tous`) + option date.

**Garde-fous query** :
- Conserver les conditions existantes (org-scoped, `status='sourced'`, `deadline >= now()`,
  `deferred_until` null/échu) — les tris/filtres s'ajoutent, ne remplacent pas.
- Test structural (sérialisation du WHERE/ORDER via `PgDialect.sqlToQuery()`) comme pour le
  quick win report (cf. `queries.test.ts`).

---

## Affichage carte AO (rappel)

Chaque carte AO affiche désormais : **CP + département** (badge), J-avant-clôture (badge couleur :
vert > 15 j, orange 7-15 j, rouge < 7 j), score, + actions Reporter/Écarter existantes.

---

## Séquencement

1. Vérif `raw_data` + dérivation département (Alex).
2. Migration `department` (+ `postal_code`) + backfill (revue CTO).
3. UI tris/filtres + badges + tests (Vitest structural + E2E).

→ Board : cet addendum reflète-t-il ta demande ? (notamment le fallback CP MOA quand le lieu
d'exécution est absent, et le département sur 3 chiffres pour les DOM).
