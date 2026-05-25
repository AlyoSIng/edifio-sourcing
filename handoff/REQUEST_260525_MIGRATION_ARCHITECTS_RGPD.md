# REQUEST — Migration architects RGPD + audit_action

**Date** : 2026-05-25  
**Agent** : Alex (dev)  
**Destinataire** : CTO Sophie  
**Priorité** : 🟠 Zone orange — validation CTO avant drizzle-kit generate

---

## Contexte

Lot B du Board (2026-05-25) : page admin `/sourcing/architectes` avec opposition RGPD art. 21 et audit log.  
Deux modifications de schéma sont requises avant de pouvoir lancer `drizzle-kit generate`.

---

## Question 1 — Deux champs `active` + `rgpd_opposition` ou fusion ?

**Situation actuelle** : `architects.active boolean NOT NULL DEFAULT true` existe (désactivation admin générale).  
**Besoin Board** : `architects.rgpd_opposition boolean NOT NULL DEFAULT false` + `architects.rgpd_opposition_date timestamp`.

**Recommandation Alex** : garder les deux champs séparés.
- `active = false` = désactivation admin (ex. doublon détecté, compte obsolète) — pas forcément lié au RGPD
- `rgpd_opposition = true` = opposition art. 21 RGPD explicite — tracée avec date, visible dans l'interface, exportable pour audit RGPD

Fusionner les deux créerait une ambiguïté dans les logs d'audit et dans les exports RGPD.

**Décision CTO attendue** : ☐ Garder les deux champs séparés (recommandé)  ☐ Fusionner dans `active`

---

## Question 2 — 3 `ALTER TYPE ADD VALUE` hors transaction pour `audit_action`

**Situation actuelle** : l'enum `auditAction` dans `src/db/schema/enums.ts` documente les valeurs `architect_edit`, `architect_import`, `architect_export` en commentaire, mais elles sont absentes du pgEnum Drizzle.

**Ce que générera `drizzle-kit generate`** : 3 instructions `ALTER TYPE audit_action ADD VALUE '...'` dans la migration SQL — ces instructions ne peuvent pas s'exécuter dans une transaction (comportement PostgreSQL natif, même pattern que la migration 0004).

**Pas de risque de perte de données** — c'est un ajout de valeurs enum, pas une modification de colonne.

**Décision CTO attendue** : ☐ Valider le pattern ALTER TYPE hors transaction (recommandé — déjà utilisé en 0004)  ☐ Autre approche

---

## Question 3 — Visibilité de la page `/sourcing/architectes`

**Recommandation Alex** :
- **Lecture (liste + fiche)** : tous les rôles (`admin`, `user`, `viewer`)
- **Édition / Création / Toggle RGPD** : `admin` uniquement

**Justification** : les commerciaux (`user`) ont besoin de consulter la liste des architectes pour piloter leurs AO Tandem, mais ne doivent pas pouvoir modifier les données ou lever une opposition RGPD.

**Décision CTO attendue** : ☐ Lecture tous rôles / Écriture admin (recommandé)  ☐ Tout admin  ☐ Autre

---

## Prochaine étape

Une fois les 3 réponses obtenues, Alex lance `drizzle-kit generate` (migration locale uniquement) puis soumet la migration à relecture CTO avant tout push.
