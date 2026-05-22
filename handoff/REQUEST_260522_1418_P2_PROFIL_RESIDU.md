# REQUEST CTO — P2 admin profil : 3 questions résiduelles

**Émetteur** : Alex (`dev`) via Claude Code
**Destinataire** : CTO Sophie (relais Board)
**Date** : 2026-05-22
**PR associée** : `feat/admin-profil-search` (P2 admin profil de recherche)
**Urgence** : 🟠 moyenne — la PR P2 est fonctionnelle telle quelle ; ces 3 Q affinent / cadrent la suite (notamment `exact_keywords` en `filter.ts`).

---

## Q-A — `exact_keywords` : sémantique exacte attendue

**Contexte** : le champ `exact_keywords` est édité dans la nouvelle UI admin profil (ChipInput 3e section). MAIS le code actuel `src/lib/sourcing/filter.ts` (PR #26 normalize mergée) **n'utilise PAS** `exact_keywords` du tout — il lit seulement `positive` et `negative` du JSONB `keywords`.

Le profil prod actuel (`exact: ["AlyoS", "edifio"]`) suggère un usage **« mots à matcher exactement »**, mais la sémantique précise est ambiguë :

**Option A — Match exact strict casse-sensible** : `exact_keywords = ["AlyoS"]` matche `'AlyoS'` mais pas `'alyos'` ni `'ALYOS'`. Usage : marques propres, noms de produits.

**Option B — Match exact insensible casse + accents** (cohérent avec PR #26) : `exact_keywords = ["AlyoS"]` matche `'alyos'`, `'ALYOS'`, `'Älyös'` après normalisation des deux côtés. Usage : keywords génériques mais à matcher en mot complet (pas substring).

**Option C — Keyword d'exclusion de marque/concurrent** : `exact_keywords` est en réalité un filtre de blacklist marque pour éviter de fetcher les AOs émis par des concurrents qui s'appellent comme nous. Si l'AO contient `'AlyoS'` ou `'edifio'` dans le titre/buyer → on filtre.

**Reco perso (Alex)** : Option B, cohérent avec décision 22/05 (d) — normalisation des deux côtés. La sémantique « mot complet » se code via `\b` regex après normalisation, ou via split mot par mot.

**Demande** : confirmer A / B / C, et alors on câble dans `filter.ts` dans une PR dédiée `fix/sourcing-matcher-exact-keywords`.

---

## Q-B — CPV wildcard : préfixe 2-digits OK ?

**Contexte** : `src/lib/sourcing/filter.ts` actuel fait `tender.cpvCodes.some(code => profile.cpvCodes.some(prefix => code.startsWith(prefix)))`. Donc `cpv_codes = ["45"]` matche tout code commençant par `45` (= tous les travaux BTP).

**Question** : on garde ce comportement implicite préfixe ? Ou on veut un wildcard explicite (`"45*"`) avec validation distincte pour différencier d'un code exact ?

**Reco perso (Alex)** : garde `startsWith()` implicite (cohérent spec §3.5), pas de wildcard littéral. La regex CPV admin V1 reste `/^\d{2,8}$/` (digits seuls).

**Demande** : OK ou on bascule sur syntaxe wildcard explicite ?

---

## Q-C — `active` toggle de profil : pas exposé V1, OK ?

**Contexte** : le champ `active` (bool) de `search_profiles` n'est PAS dans le formulaire admin V1 — cohérent avec décision Q2 (« 1 profil unique éditable AlyoS MVP »). Désactiver le profil unique reviendrait à désactiver le sourcing entier — pas pertinent.

**Question** : confirmer que `active` reste hardcodé `true` en V1 ? À exposer en Phase 2 quand le multi-profils sera ouvert ?

**Reco perso (Alex)** : pas exposer en V1, ajouter dans la spec V2 multi-tenant. Si désactivation du sourcing devient un besoin métier ponctuel (ex. vacances équipe), on ajoute un toggle « pause sourcing » au niveau **organisation** (`organizations.sourcing_paused`), pas au niveau profil.

**Demande** : OK ?

---

## Synthèse

| Q | Reco Alex | Bloque |
|---|---|---|
| Q-A `exact_keywords` | Option B (insensible casse+accents, mot complet) | PR séparée filter (non bloquant P2) |
| Q-B CPV wildcard | `startsWith()` implicite, regex `/^\d{2,8}$/` | rien (déjà en place) |
| Q-C `active` toggle | Pas exposé V1, V2 multi-tenant | rien (cohérent Q2) |

PR P2 livrable telle quelle. Ces 3 réponses cadrent la suite (PR séparée filter, doc V2, validation Q2).
