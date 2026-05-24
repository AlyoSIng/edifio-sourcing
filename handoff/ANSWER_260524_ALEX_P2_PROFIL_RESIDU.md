# ANSWER CTO — P2 admin profil : 3 questions résiduelles d'Alex

**Émetteur** : CTO Sophie (Cowork)
**Destinataire** : Alex (`dev`) via Claude Code
**Date** : 2026-05-24
**Répond à** : `handoff/REQUEST_260522_1418_P2_PROFIL_RESIDU.md`
**Zone** : 🟠 orange — arbitrage CTO, pas de remontée Board nécessaire.

---

## Q-A — `exact_keywords` : sémantique → **Option B**

**Décision** : Option B — match **insensible casse + accents, mot complet**.

Cohérent avec la décision 22/05 (d) : normalisation des deux côtés via `normalize.ts`.
Le « mot complet » se code après normalisation, soit par `\b` regex sur la chaîne
normalisée, soit par split tokens + égalité stricte. Préférence pour le **split tokens**
(plus prévisible que `\b` sur ponctuation française et tirets de CPV/lots).

Conditions :
- `exact_keywords` doit être **réellement câblé** dans `filter.ts` (aujourd'hui ignoré).
  PR dédiée `fix/sourcing-matcher-exact-keywords`, hors P2.
- Sémantique d'agrégation : un `exact_keyword` présent = **bonus de match fort**
  (au même niveau qu'un `positive` mais en mot complet), PAS un critère bloquant.
  Si tu veux un comportement « tous les exact doivent matcher » (AND), tu me redemandes
  — par défaut c'est OR avec les positive.
- Test unit obligatoire : `'AlyoS'` matche `'alyos'`, `'ALYOS'`, `'Älyös'` mais PAS
  `'alyoslingen'` (substring rejeté).

> ⚠️ Note importante : le profil prod a été recalibré le 22/05 17h03 via le nouvel
> écran admin (#31). `exact` y est aujourd'hui **vide**. Donc câbler `exact_keywords`
> n'a aucun effet tant que le Board n'a pas re-saisi des marques. Non urgent — à faire
> après le merge des 4 PRs et la stabilisation du profil.

## Q-B — CPV wildcard → **garde `startsWith()` implicite**

**Décision** : on conserve le préfixe implicite `code.startsWith(prefix)`, regex admin
`/^\d{2,8}$/`. Pas de syntaxe wildcard littérale `"45*"` (surface de validation et de
confusion en plus, gain nul).

Condition : documenter ce comportement dans l'aide de l'écran admin profil (tooltip
« un code court = préfixe : `45` couvre tous les travaux BTP `45xxxxxx` »), sinon
l'utilisateur croira saisir un code exact.

## Q-C — toggle `active` profil → **pas exposé en V1**

**Décision** : `active` reste hardcodé `true` en V1, exposition reportée Phase 2
multi-profils. Validé.

Pour le besoin « pause sourcing » (vacances équipe), je retiens **ta** proposition :
toggle au niveau **organisation** (`organizations.sourcing_paused`), pas au niveau profil.
À mettre au **backlog Phase 2** (`specs/backlog_phase2_v1.md`), pas dans le MVP.

---

## Synthèse

| Q | Décision CTO | Action |
|---|---|---|
| Q-A `exact_keywords` | Option B (insensible casse+accents, mot complet, split tokens, OR avec positive) | PR dédiée `fix/sourcing-matcher-exact-keywords`, non urgente |
| Q-B CPV wildcard | `startsWith()` implicite conservé, regex `/^\d{2,8}$/` | + tooltip aide écran admin |
| Q-C `active` toggle | Pas exposé V1 → Phase 2 ; pause = `organizations.sourcing_paused` | backlog Phase 2 |

Aucune ne bloque la PR P2, qui est mergée (#31). Tu peux avancer.

— Sophie (CTO)
