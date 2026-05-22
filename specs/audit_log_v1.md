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

## 16 actions × payload détaillé

> **Amendement 2026-05-21 (PR n°5 `feat/tender-actions`)** : ajout de deux actions
> **A14 `tender_defer`** et **A15 `tender_reject`** séparées, validation Board
> Steve TEISSIER 2026-05-21. Compteur passé de 13 → 15 actions. Justification du
> split (vs un seul code `tender_decision` polymorphe) : signaux d'apprentissage
> IA scoring distincts (différé = signal faible, rejet = signal fort), filtrage
> analytics simple par `action`, et payload schemas Zod dédiés sans `discriminator`.
>
> **Amendement 2026-05-25 (PR `feat/tandem-engine` étape 1)** : ajout de
> **A16 `architect_response`** (validation Board Steve TEISSIER 2026-05-22, décision
> (b) du batch Tandem 22/05). Compteur passé de 15 → 16 actions. Tracé chaque
> réponse architecte (accepted/declined/info_requested) reçue via la page
> tokenisée publique `/archi/[token]`, qu'elle soit déclenchée par clic
> architecte ou saisie manuelle admin (fallback hors-canal). Payload distinct
> de A5 `architect_solicit` (envoi) pour faciliter l'analyse du funnel Tandem
> (taux de réponse, délai médian, taux d'acceptation par registre TU/VOUS).


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
`operation` ∈ `invite | update | revoke | regenerate_provisional`.

> **Amendement 2026-05-20** : `regenerate_provisional` ajouté pour tracer le bouton « Renvoyer un mot de passe provisoire » (route `POST /api/admin/users/[id]/regenerate-password`, cf. Board Q1/A.3 2026-05-12). Aucun changement de rôle — convention `from_role === to_role`. Le password régénéré n'est **JAMAIS** loggué (cf. invariant `password-server.ts`). **Validé CTO Sophie 2026-05-20** — cf. `handoff/ANSWER_260520_1810_ETENDRE_A2_OPERATION_REGEN.md`.

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

### A14 — `tender_defer`
```json
{
  "tender_id": "uuid",
  "tender_ref": "25-AO-00142",
  "deferred_until": "2026-05-22T06:30:00.000Z",
  "hours_offset": 24
}
```
Déclencheur : bouton « Différer » sur `TenderCard` (page `/sourcing/ao-du-jour`).
`hours_offset` indique la durée de différé demandée (V1 = **24h par défaut, fixe** ;
extensible Phase 2 pour « différer jusqu'à demain matin », « 1 semaine », etc.).
`deferred_until` est la résultante calculée `now() + hours_offset` côté Server
Action. L'AO reste `status='sourced'` mais est **exclu de la vue « AO du jour »**
jusqu'à expiration via le filtre `(deferred_until IS NULL OR deferred_until < now())`
de `getTendersOfTheDay`. *Validation Board 2026-05-21 (Steve TEISSIER), code A14 alloué.*

### A15 — `tender_reject`
```json
{
  "tender_id": "uuid",
  "tender_ref": "25-AO-00142",
  "reason": "Hors zone géo (Île-de-France, hors périmètre AlyoS)",
  "score_at_reject": 87
}
```
Déclencheur : bouton « Rejeter » sur `TenderCard` + confirmation modale avec
textarea optionnelle (max 280 chars). `reason` peut être `null` si l'utilisateur
n'a pas saisi de motif. `score_at_reject` snapshot du score au moment du rejet
(également `null` si l'AO n'avait pas encore été scoré) pour analyse a posteriori
du delta scoring/jugement humain. L'AO bascule `status='dropped'`. **Bloc
apprentissage IA scoring débloqué** (signal négatif explicite + motif libre,
exploité côté `learning_events.event_type='rejected'` PR ultérieure).
*Validation Board 2026-05-21 (Steve TEISSIER), code A15 alloué.*

### A16 — `architect_response`
```json
{
  "tender_id": "uuid",
  "tender_ref": "25-AO-00142",
  "architect_id": "uuid",
  "architect_email": "marc.dupont@example.test",
  "response_status": "accepted",
  "via_token": true,
  "token_jti": "uuid-jti-du-jwt",
  "info_request_text": null,
  "responded_at": "2026-05-25T10:42:00.000Z"
}
```
`response_status` ∈ `accepted | declined | info_requested`.
`via_token` est `true` quand la réponse provient de la page tokenisée
publique `/archi/[token]` (cas standard), `false` quand elle est saisie
manuellement par un admin côté app (fallback hors-canal, ex. l'architecte
a répondu par téléphone). `token_jti` est `null` si `via_token = false`.
`info_request_text` est rempli uniquement si `response_status =
'info_requested'` (texte libre architecte, max 1000 chars).
Déclencheur : `POST /api/archi/[token]/respond` (Server Action de la page
tokenisée) OU action admin sur la fiche AO Tandem. *Validation Board
2026-05-22 (Steve TEISSIER), code A16 alloué — décision (b) batch Tandem
22/05.* Signaux analytics : taux de réponse Tandem (delivered → A16) +
délai médian (sentAt → respondedAt) + taux acceptation par registre.

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
  | 'tender_defer' | 'tender_reject' | 'architect_response'

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
