# REQUEST 2026-05-20 17:00 — Étendre `operation` de A2 `membership_change` à `regenerate_provisional`

**De** : [DEV Alex] (Claude Code)
**Pour** : [CTO Sophie]
**Type** : Validation amendement spec `audit_log_v1.md`

---

## Contexte

Pendant la 1re passe « audit log post-ORM » sur `feat/auth-password-pivot`
(la merge `feat/sourcing-mvp` → branche actuelle a rendu Drizzle disponible),
j'ai identifié 2 stubs `console.warn("[audit_log:...]")` dans les routes admin
qui attendaient le post-ORM pour devenir de vrais INSERT :

- `src/app/api/admin/users/route.ts:146` — création user (`user_invited`)
- `src/app/api/admin/users/[id]/regenerate-password/route.ts:148` — regen
  mot de passe provisoire (`user_provisional_regenerated`)

**Mapping clean trouvé pour le 1er** : `user_invited` → A2 `membership_change`
`operation: "invite"` (déjà spec'é dans `audit_log_v1.md:50-60` + typé dans
`jsonb.ts:231-237`). Aucun amendement nécessaire.

**Gap pour le 2e** : `regenerate_provisional` ne map sur **aucune** des 13
actions Gate 5. Trois options identifiées :

| # | Option                                            | Coût  | Impact spec |
|---|---------------------------------------------------|-------|-------------|
| A | Garder `console.warn` (conservatif Gate 5)        | 0     | Aucun       |
| B | Étendre `operation` de A2 (membership lifecycle)  | Léger | A2 seule    |
| C | Ajouter `user_provisional_regenerated` au pgEnum  | Lourd | Migration + ADR |

## Décision provisoire prise

**Option B retenue** (validée Steve 2026-05-20 dans le chat Cowork) :
extension de `AuditLogDataMembershipChange.operation` de
`invite | update | revoke` à `invite | update | revoke | regenerate_provisional`.

**Rationale** :
- L'action s'inscrit dans le **lifecycle d'un membership** (admin reprovisionne
  l'accès d'un user existant) — sémantiquement cohérent avec A2.
- Pas de migration BDD (le pgEnum `audit_action` reste à 13 valeurs).
- Trace minimale : 1 fichier de types + 1 paragraphe de spec.

## Changements committés en avance (à valider)

1. **`src/db/types/jsonb.ts:236`** — union `operation` étendue à 4 valeurs.
   JSDoc référence ce handoff.

2. **`specs/audit_log_v1.md:60`** — phrase `operation` mise à jour +
   paragraphe d'amendement daté 2026-05-20 référençant ce handoff.

3. **`src/app/api/admin/users/[id]/regenerate-password/route.ts:148`** — l'INSERT
   utilise `operation: "regenerate_provisional"` avec `from_role === to_role`
   (pas de changement de rôle, juste rotation du password provisoire).

## Question à [CTO Sophie]

1. **OK pour l'option B telle qu'implémentée** ? Si oui → fermer ce handoff,
   l'amendement spec/types reste tel quel.
2. **Préfères-tu l'option A** (rétrograder le regen en `console.warn` seul,
   sans INSERT audit) ? Si oui → je reverte les 3 changements ci-dessus
   sur un commit isolé.
3. **Préfères-tu l'option C** (nouvel enum value + ADR-014) ? Si oui →
   je crée la migration `0004_audit_action_extend.sql` + ADR-014, et je
   bascule le 2e INSERT.

## Pas de bloquage immédiat

L'implémentation B est déjà committée et passe CI verte (option à révision
sans pression). Si tu pivotes en option A ou C, le revert est de 3 fichiers
isolés sans dépendance applicative en aval.

— Alex
