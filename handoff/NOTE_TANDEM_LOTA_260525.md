# NOTE — Lot A tutoiement persistant (2026-05-25)

## État

La logique `tutoiement → template Brevo` est opérationnelle depuis la PR Tandem engine.
Le lot A ne nécessite aucune migration BDD ni nouveau fichier de logique métier.

## Ce qui a été livré dans le lot A

- JSDoc enrichi sur `SolicitOptions.register` (`src/app/sourcing/ao/[id]/tandem/actions.ts`) :
  règle de priorité Override > tutoiement > défaut vouvoiement, et note lot C.
- 3 nouveaux cas de test dans `src/app/sourcing/ao/[id]/tandem/actions.test.ts` :
  tutoiement=true → TU, tutoiement=false → VOUS, override register='tu' sur archi VOUS.
- Test smoke `src/lib/brevo/tutoiement-integration.test.ts` :
  chaîne complète `tutoiement bool → defaultRegisterFromTutoiement → pickBrevoTemplateId
  → templateNameFor`, 2 polarités × 2 kinds + invariants decline_ack + override.

## Points de coordination pour Alex (lot B) et lot C

- `defaultRegisterFromTutoiement(tutoiement: boolean)` est dans
  `src/lib/brevo/template-picker.ts` — à réutiliser directement, ne pas recréer.
- `pickBrevoTemplateId(kind, register)` est l'API principale pour choisir le
  template_id Brevo.
- La page tokenisée architecte (lot C) ne doit PAS passer de `register` en override
  dans `SolicitOptions` — le registre est fixé lors de l'envoi initial (stocké dans
  `brevo_messages.register`), pas de la réponse.
- Le template `decline_ack` (D.8) est neutre (pas de registre TU/VOUS) —
  `templateNameFor('decline_ack', ...)` ignore le registre.

## Alerte schema

Si Alex modifie `src/db/schema/architects.ts` (migration lot B), synchroniser les
migrations avant merge pour éviter conflit.
