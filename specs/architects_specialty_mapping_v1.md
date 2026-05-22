# Vocabulaire contrôlé des spécialités architectes + table de correspondance

**Auteur** : [CTO Sophie]
**Date** : 2026-05-21
**Source** : valeurs réelles de `x_studio_typologie_1` dans `Contact_complete.xlsx` (55 tokens distincts, après split sur `,`)
**Usage** : le script d'import (`specs/architects_data_and_admin_v1.md` §3) applique cette table pour normaliser `specialty_codes`. **Aucune donnée personnelle ici** — uniquement du vocabulaire.

> Autorisation Board 2026-05-21 d'utiliser le fichier `Contact_complete.xlsx` et ses colonnes pour structurer la base. Le fichier source (PII) reste hors Git ; seule cette table de vocabulaire est versionnée.

---

## 1. Codes contrôlés (cible)

`habitat_individuel`, `logements_collectifs`, `tertiaire`, `commerces`, `equipement_public`,
`sante`, `petite_enfance`, `enseignement`, `culture`, `sport`, `patrimoine`, `rehabilitation`,
`industriel`, `amenagement_paysage`, `urbanisme`, `interieur`.

Plus une valeur technique `non_classe` pour le bruit (`NOT_FOUND`, `PENDING_RESEARCH`, etc.) — **exclue du matching**.

## 2. Table de correspondance (token réel → code)

| Code | Tokens sources (casse/variantes incluses) |
|------|-------------------------------------------|
| `habitat_individuel` | Habitat ind, Villa, Habitat, Architecture bois |
| `logements_collectifs` | Logements collectifs, Habitat collectif, Logements |
| `tertiaire` | Tertiaire, tertiaire, Bureaux, Espace bureau |
| `commerces` | Commerces, COMMERCIAL, Hôtellerie, Hôtels |
| `equipement_public` | Equipement public, Équipement public |
| `sante` | Santé, Hôpitaux, Médico Social |
| `petite_enfance` | Créches *(décision Board 2026-05-21 — code dédié)* |
| `enseignement` | Enseignement, fac |
| `culture` | Culture, Culturel, Culturelle, Architecture culturelle, Musées |
| `sport` | Sport |
| `patrimoine` | Patrimoine |
| `rehabilitation` | Réhabilitation, Restructuration, Extension, Rénovation, Thermorénnovation, Eco-construction |
| `industriel` | Industriel, Industrie, Infrastrcture |
| `amenagement_paysage` | Aménagement extérieur, Paysagiste, Paysage, Environnement |
| `urbanisme` | Urbaniste, Urbanisme |
| `interieur` | Architecture interieur, Architecture intérieur, Décoration, Design |
| `non_classe` *(exclu matching)* | Architecture, Architecture contemporaine, MOE, AMO, Gestion immobilière, NOT_FOUND, PENDING_RESEARCH |

## 3. Règles de normalisation à l'import

1. Split `x_studio_typologie_1` sur `,`, trim, **casse-insensible + accents-insensibles** pour le rapprochement.
2. Mapper chaque token via la table ; un cabinet peut avoir plusieurs codes.
3. Tokens inconnus → `non_classe` + **log** pour enrichir la table au fil de l'eau (la donnée évoluera, cf. complétion progressive Board).
4. `Créches` → code dédié `petite_enfance` *(tranché Board 2026-05-21)*.

## 4. Décision Board

- ✅ `Créches` = `petite_enfance` *(tranché 2026-05-21)* — 16 codes au total.
- Reste à valider/amender (non bloquant) : la liste des 16 codes + la table de correspondance.
