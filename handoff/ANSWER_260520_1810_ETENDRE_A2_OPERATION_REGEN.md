# ANSWER 2026-05-20 18:10 — Validation extension A2 `operation` → `regenerate_provisional`

**De** : [CTO Sophie] (via [Board chair Steve] après sync Cowork 2026-05-20)
**Pour** : [DEV Alex]
**Réf** : `handoff/REQUEST_260520_1700_ETENDRE_A2_OPERATION_REGEN.md`
**Statut** : **VALIDÉ — option B retenue, implémentation acceptée telle quelle**

---

## Verdict

**Option B retenue** (extension `operation` de A2 `membership_change`).

L'argumentation Alex tient : l'action « regen mot de passe provisoire »
est sémantiquement un événement de **lifecycle membership** (l'admin
reprovisionne l'accès d'un user existant, sans changer son rôle ni sa
membership). Elle s'inscrit naturellement dans A2.

Les deux autres options sont rejetées :
- **Option A (`console.warn` seul)** : on perd la trace immutable d'une
  action admin sensible. Le contre-argument « hors scope Gate 5 » est
  juste sur la lettre mais faible sur l'esprit — Gate 5 couvre les
  actions sensibles, et regenerer un password l'est par construction
  (Board Q1/B 2026-05-12 invariant « jamais le password en clair »
  implique qu'on trace **au moins** l'événement). Rejetée.
- **Option C (nouvel enum + ADR-014)** : surdimensionnée. Le pgEnum à
  13 valeurs reflète le découpage Board des actions ; ajouter une 14e
  pour un sous-cas de A2 fragmente la sémantique sans gain. Plus de
  migration, plus d'ADR, plus de doc à maintenir. Rejetée pour YAGNI.

## Confirmations sur l'implémentation actuelle (`6f19c1d` + `a0f1694`)

1. **`AuditLogDataMembershipChange.operation` à 4 valeurs** : OK tel quel.
   Pas de réécriture.

2. **`from_role === to_role` quand `operation === "regenerate_provisional"`** :
   convention acceptée. C'est sémantiquement « aucun changement de rôle,
   juste rotation du credential ». Si tu veux durcir, ajouter une assertion
   Zod côté caller (post-MVP) — pas bloquant.

3. **Le password régénéré reste hors payload** : invariant respecté, cf.
   `src/lib/audit/insert.ts` invariant 3 + commentaire route ligne 145-148.

4. **Pas de migration BDD nécessaire** : confirmé. Le pgEnum `audit_action`
   reste à 13 valeurs. Aucun `drizzle-kit generate` à lancer.

5. **Spec `audit_log_v1.md:60`** : la phrase étendue + le paragraphe
   d'amendement daté 2026-05-20 sont à conserver. Mettre à jour la
   mention « validation CTO Sophie requise » → « validée CTO Sophie
   2026-05-20 ».

## Action ouverte (mineure)

[DEV Alex] : nettoyer les 2 références « validation attendue » dans
`src/db/types/jsonb.ts:240` (JSDoc) et `specs/audit_log_v1.md` (paragraphe
amendement) pour pointer ce ANSWER au lieu de l'attente.

## Pas d'autre arbitrage demandé

Le handoff est clos côté Sophie. Pas de chantier supplémentaire ouvert
par cette validation.

— Sophie (via Steve)
