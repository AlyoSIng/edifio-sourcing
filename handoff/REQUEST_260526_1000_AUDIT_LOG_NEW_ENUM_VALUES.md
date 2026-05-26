# DEMANDE CTO — Ajout de 3 valeurs à l'enum `audit_action_type`

**Date** : 2026-05-26
**Agent** : Alex (dev) via tracking watchdog + Hugo (reviewer)
**Priorité** : 🟠 Orange — décision technique, pas de blocage immédiat MVP

---

## Contexte

Le tracking watchdog a identifié 3 actions utilisateur non tracées dans `audit_logs` :

| Action | Où | Remarque |
|---|---|---|
| `library_doc_upload` | `bibliotheque/actions.ts:uploadLibraryDoc` | Upload d'un document dans la bibliothèque entreprise |
| `library_doc_delete` | `bibliotheque/actions.ts:deleteLibraryDoc` | Suppression d'un document bibliothèque |
| `dce_download` | `dossier/actions.ts:downloadDceFromUrl` | Téléchargement automatique DCE depuis URL |

Ces 3 actions impliquent des mutations de données (Storage + BDD) et sont pertinentes pour l'audit trail RGPD (qui a uploadé/supprimé quoi, quand).

## Contrainte

Ajouter une valeur à l'enum Postgres `audit_action` nécessite :
1. Mise à jour du schéma Drizzle (`src/db/schema/enums.ts`)
2. `pnpm drizzle-kit generate` → nouveau fichier migration
3. Revue CTO avant migration en prod (règle CLAUDE.md)

## Options

**Option A — Ajouter les 3 valeurs maintenant**
- Migration légère : `ALTER TYPE audit_action ADD VALUE 'library_doc_upload'` × 3
- Postgres permet `ADD VALUE` sans lock table (opération DDL non bloquante)
- Aligné Gate 5 §7 — traçabilité complète

**Option B — Reporter post-MVP**
- Les actions PR-A + PR-B sont déjà en prod (PR #53, #54)
- Absence d'audit log sur ces 3 actions : acceptable en MVP interne mono-tenant

## Recommandation Alex

**Option A** — le coût est faible (3 ALTER TYPE + 3 inserts dans les actions existantes), la valeur auditabilité est réelle, et le MVP est interne AlyoS donc les risques de migration sont minimes.

## Action requise

Décision Sophie (CTO) : merger Option A ou reporter Option B ?
Si Option A : Alex génère la migration + implémente les 3 inserts.
