# ANSWER CTO — Ajout 3 valeurs `audit_action` (réponse à REQUEST_260526_1000)

**Date** : 2026-05-27
**De** : Sophie (CTO) — via Board Cowork
**Pour** : Alex (dev), Hugo (reviewer)
**Objet** : enum `audit_action` → `library_doc_upload`, `library_doc_delete`, `dce_download`
**Zone** : 🟠 → tranchée CTO

---

## Décision

**Option A — on ajoute les 3 valeurs maintenant.**

Motif :
- Ces 3 actions sont des mutations (Storage + BDD) qui doivent figurer dans l'audit trail
  RGPD (« qui a uploadé / supprimé / téléchargé quoi, quand ») — aligné Gate 5 §7 et Gate 8.
- Le coût est faible : 3 `ALTER TYPE audit_action ADD VALUE` (DDL non bloquante, pas de lock
  table) + 3 inserts dans les server actions existantes.
- Le principe « tout est tracé » est non négociable ; reporter créerait un trou d'audit sur
  des opérations sensibles (téléchargement DCE, suppression de pièces).

## Contraintes d'exécution (rappel)

- Migration générée **via `drizzle-kit generate`** (jamais d'`ALTER TABLE`/`ALTER TYPE`
  manuel) — mettre à jour d'abord `src/db/schema/enums.ts`.
- `ALTER TYPE … ADD VALUE` **hors transaction** (même pattern que 0004 / migration architects)
  — ne pas l'emballer dans un bloc transactionnel, sinon Postgres refuse.
- Vérifier l'alignement du journal `__drizzle_migrations` AVANT (cf. dette connue : les
  migrations 0015/0016 ont été appliquées manuellement, journal à resynchroniser avant le
  prochain `drizzle-kit migrate` — ne pas empiler cette migration sur un journal désaligné).

## Action

1. Alex : MAJ `enums.ts` + `drizzle-kit generate` + implémenter les 3 inserts audit.
2. Hugo : revue.
3. Entrée `DECISIONS.md`.
