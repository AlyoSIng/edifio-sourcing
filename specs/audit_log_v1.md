# Spec audit log — edifio Sourcing v1.0

**Auteur** : [CTO Sophie Vasseur]
**Date** : 2026-05-10
**Statut** : Spec figée — à implémenter par [DEV Alex] en Gate 6
**Référence** : table `audit_logs` (schéma SQL `specs/schema_v1.sql`)

---

## Principes

- **Immutable** : INSERT only. UPDATE et DELETE refusés par trigger Postgres.
- **Rétention** : 5 ans (archivage si > 5 ans, jamais supprimé)
- **Visibilité** : RLS strict — visible uniquement aux `admin` de l'organisation
- **Format** : `data` JSON conforme aux schémas ci-dessous, validés par Zod côté app avant INSERT

---

## Champs communs

| Champ | Type | Source |
|-------|------|--------|
| `id` | uuid | auto |
| `organization_id` | uuid | session JWT `app_metadata.organization_id` |
| `actor_id` | uuid \| null | session JWT `sub` |
| `actor_email` | text | snapshot pour cas où user supprimé |
| `actor_role` | enum | session JWT `app_metadata.role` |
| `action` | enum | l'une des 13 actions |
| `subject_type` | text | type d'objet impacté (`tender`, `architect`, etc.) |
| `subject_id` | uuid \| null | id de l'objet impacté |
| `occurred_at` | timestamptz | now() |
| `ip_address` | inet \| null | Vercel header `x-forwarded-for` |
| `user_agent` | text \| null | header HTTP |
| `data` | jsonb | payload spécifique selon action — schémas ci-dessous |

---

## 13 actions × payload détaillé

### A1 — `login`
```json
{
  "method": "magic_link",
  "success": true,
  "session_id": "<supabase-session-id>"
}
```
Déclencheur : callback OAuth/magic-link Supabase Auth.

### A2 — `membership_change`
```json
{
  "target_user_id": "uuid",
  "target_email": "snapshot@alyosingenierie.fr",
  "from_role": "user",
  "to_role": "admin",
  "operation": "update"
}
```
`operation` ∈ `invite | update | revoke`.

### A3 — `search_profile_change`
```json
{
  "profile_id": "uuid",
  "profile_name": "ERP travaux",
  "operation": "create",
  "diff": { "keywords.positive": ["before", "after"] }
}
```
`operation` ∈ `create | update | delete | activate | deactivate`.

### A4 — `tender_select`
```json
{
  "tender_id": "uuid",
  "tender_ref": "25-AO-00142",
  "mode": "solo",
  "score": 87
}
```
`mode` ∈ `solo | tandem`.

### A5 — `architect_solicit`
```json
{
  "tender_id": "uuid",
  "architect_id": "uuid",
  "architect_email": "snapshot@example.com",
  "register": "vous",
  "template_name": "architect_solicitation_VOUS",
  "brevo_message_id": "<brevo-id>"
}
```
`register` ∈ `tu | vous`.

### A6 — `dossier_diffuse`
```json
{
  "tender_id": "uuid",
  "architect_id": "uuid",
  "diffuser_role": "user",
  "admin_notified": true,
  "files_count": 14,
  "brevo_message_id": "<brevo-id>"
}
```
Si `diffuser_role` ∈ `user`, **alerte push admin obligatoire** + bouton « Annuler la diffusion » 5 min.

### A7 — `ai_run`
```json
{
  "prompt_name": "rc_analysis_full",
  "prompt_version": 1,
  "model": "sonnet-4-6",
  "tender_id": "uuid",
  "cost_usd": 0.42,
  "latency_ms": 8421,
  "succeeded": true,
  "tokens_in": 28450,
  "tokens_out": 3120
}
```

### A8 — `odoo_opportunity_create`
```json
{
  "tender_id": "uuid",
  "odoo_id": 12345,
  "odoo_stage": "Réponse cotraitance",
  "trigger": "architect_accepted"
}
```
`trigger` ∈ `selected_solo | architect_accepted | manual`.

### A9 — `architect_change`
```json
{
  "architect_id": "uuid",
  "operation": "update",
  "diff": {
    "tutoiement": [false, true],
    "partnership_status": ["prospect", "actif"]
  }
}
```
`operation` ∈ `create | update | delete | bulk_import`.

### A10 — `rgpd_export`
```json
{
  "scope": "organization",
  "rows_exported": 1247,
  "tables_included": ["tenders","architects","ai_runs","brevo_messages","audit_logs"],
  "format": "json",
  "size_bytes": 4527831
}
```

### A11 — `token_revoke`
```json
{
  "token_jwt_id": "<jti>",
  "tender_id": "uuid",
  "architect_id": "uuid",
  "reason": "manual_admin_revocation"
}
```
`reason` ∈ `manual_admin_revocation | tender_cancelled | architect_request | suspicious_activity`.

### A12 — `data_delete`
```json
{
  "target_table": "tenders",
  "target_id": "uuid",
  "soft_delete": false,
  "reason": "rgpd_request",
  "approval_board_ref": "/handoff/ANSWER_260510_1430_RGPD_DEL.md"
}
```
Toute suppression hors workflow normal exige approbation Board (cf. CLAUDE.md).

### A13 — `access_attempt` (middleware @alyosingenierie.fr)
```json
{
  "pathname": "/sourcing/ao-du-jour",
  "allowed": false,
  "email_domain": "gmail.com",
  "method": "GET",
  "denied_reason": "domain_not_alyosingenierie"
}
```
`denied_reason` ∈ `no_session | domain_not_alyosingenierie | session_expired | token_revoked`.

---

## Implémentation côté app — helper TypeScript

```ts
// packages/db/audit.ts
import { createClient } from '@supabase/supabase-js'

type AuditAction =
  | 'login' | 'membership_change' | 'search_profile_change'
  | 'tender_select' | 'architect_solicit' | 'dossier_diffuse'
  | 'ai_run' | 'odoo_opportunity_create' | 'architect_change'
  | 'rgpd_export' | 'token_revoke' | 'data_delete' | 'access_attempt'

export async function audit(params: {
  action: AuditAction
  subjectType?: string
  subjectId?: string
  data: Record<string, any>  // validé par Zod par action
  request?: Request
}) {
  // 1. valider data avec Zod selon action
  // 2. enrichir avec ip + user_agent depuis request
  // 3. INSERT dans audit_logs avec service_role (bypass RLS pour écriture)
  //    /!\ lecture RLS strict pour les admin uniquement
}
```

---

## Tests bloquants Gate 6

1. Test pgTAP : `INSERT` autorisé, `UPDATE` rejeté, `DELETE` rejeté.
2. Test E2E : chaque action déclenche bien une entrée correspondante.
3. Test cross-tenant : un `admin` org A ne voit pas les `audit_logs` de l'org B.
4. Test rôle : un `user` ne peut PAS lire `audit_logs` (admin only).

---

## Politique de purge / archivage (rétention 5 ans)

- À J+5 ans, les `audit_logs` sont **archivés** vers OVH Object Storage EU (bucket dédié, accès restreint).
- Job mensuel via Edge Function Supabase qui scan `occurred_at < now() - INTERVAL '5 years'`.
- Jamais de DELETE direct côté DB — toujours export + INSERT dans un archive table → puis suppression en bloc en lot trimestriel après vérification de l'export.
- À ce moment seulement, l'archivage peut être considéré comme une exception explicite à la règle d'immutabilité — encadrée par une procédure documentée signée [CTO].

---

*Spec figée. Toute modification (ajout d'action, modification de schéma data) passe par PR validée [CTO Sophie] + bump de version du présent document.*
