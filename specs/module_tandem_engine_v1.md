# Spec — Module Tandem (cotraitance architecte)

**Auteurs** : [CTO Sophie] + [DEV Alex en pré-spec]
**Date** : 2026-05-14
**Statut** : Spec préparée pour Alex après finalisation du module Sourcing
**Cible** : Gate 6 étape post-Sourcing engine
**Référence** : `specs/schema_v1.sql` (tables `match_proposals`, `architect_responses`, `architect_tokens`, `brevo_messages`) + `specs/ai_prompts_v1.md` (P5) + `design/copy/templates_brevo_v1.md` (D.1 à D.4)

---

## 1. Vue d'ensemble

Le module Tandem gère le **mode cotraitance** : sélection d'un AO → matching des architectes → sollicitation par mail Brevo → réponse de l'architecte via page tokenisée publique sans login → mise à jour du statut + opportunité Odoo.

**Différence avec Solo** : Solo bascule direct en pipeline. Tandem ajoute la couche architecte avec workflow asynchrone *(le user attend la réponse archi)*.

---

## 2. Flow complet *(parcours utilisateur)*

```
[User AlyoS]               [edifio Sourcing]              [Architecte externe]
     │                            │                              │
     │  Tap "Sélectionner"        │                              │
     │  Mode Tandem               │                              │
     │ ─────────────────────────► │                              │
     │                            │  Matching algorithm V1       │
     │                            │  Score 3 architectes          │
     │                            │                              │
     │  Short-list UI             │                              │
     │ ◄───────────────────────── │                              │
     │  Tap "Choisir Marc"        │                              │
     │ ─────────────────────────► │                              │
     │                            │  Generate JWT token (30 j)   │
     │                            │  Prépare template Brevo TU/  │
     │                            │  VOUS selon archi.tutoiement │
     │                            │  Envoi via Brevo API         │
     │                            │  Status tender =             │
     │                            │   awaiting_architect          │
     │                            │                              │
     │  Push notif "envoyé"       │                              │
     │ ◄───────────────────────── │                              │
     │                            │                              │ Reçoit mail
     │                            │                              │ Clic lien
     │                            │ ◄──────────────────────────  │
     │                            │  Page tokenisée publique     │
     │                            │  (sans login, JWT vérifié)   │
     │                            │ ──────────────────────────►  │
     │                            │                              │ Lit AO
     │                            │                              │ Tap "Oui partant"
     │                            │ ◄──────────────────────────  │
     │                            │  Update architect_responses   │
     │                            │  Status tender =              │
     │                            │   architect_accepted          │
     │                            │  Trigger Odoo opportunity    │
     │                            │  (étape "Réponse cotraitance"│
     │                            │  Push Realtime au user       │
     │  Push "Marc accepte"       │                              │
     │ ◄───────────────────────── │                              │
     │                            │                              │
```

---

## 3. Composants à implémenter

### 3.1. Matching algorithm V1 (règles)

**Fichier** : `src/lib/tandem/matching.ts`

```typescript
interface MatchScore {
  architectId: UUID
  score: number  // 0-100
  rationale: string  // "Pourquoi cet archi" généré par IA Haiku
  breakdown: {
    specialty: number  // 0-30 si match parfait sur spécialité
    geo: number        // 0-20 si zone matchée
    history: number    // 0-25 si collaborations passées
    availability: number // 0-15 si pas trop sollicité ces 30 derniers jours
    preference: number   // 0-10 selon notes manuelles user
  }
}

async function rankArchitects(
  tender: Tender,
  orgId: UUID
): Promise<MatchScore[]> {
  // 1. Filtrer architects actifs de l'organisation
  const architects = await getActiveArchitects(orgId);

  // 2. Pour chaque, calculer le score
  const scored = architects.map(a => {
    let breakdown = { specialty: 0, geo: 0, history: 0, availability: 0, preference: 0 };

    // Specialty match
    const tenderCategory = inferCategoryFromCpvAndTitle(tender);  // ex. 'sante', 'scolaire'
    if (a.specialty_codes.includes(tenderCategory)) breakdown.specialty = 30;
    else if (a.specialty_codes.some(s => relatedSpecialty(s, tenderCategory))) breakdown.specialty = 15;

    // Geo match
    const tenderDept = extractDepartment(tender.buyer);
    if (a.geo_zones.includes(tenderDept)) breakdown.geo = 20;
    else if (a.geo_zones.some(z => adjacentDepartment(z, tenderDept))) breakdown.geo = 10;

    // History
    const pastCollabs = countSuccessfulCollabs(a.id, orgId);
    breakdown.history = Math.min(25, pastCollabs * 5);

    // Availability
    const recentSolicitations = countSolicitationsLast30Days(a.id);
    breakdown.availability = recentSolicitations < 3 ? 15 : Math.max(0, 15 - recentSolicitations * 2);

    // Preference (note user, futur Phase 2)
    breakdown.preference = a.preferred ? 10 : 0;

    const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
    return { architectId: a.id, score, rationale: '', breakdown };
  });

  // 3. Trier par score desc, top 3
  scored.sort((a, b) => b.score - a.score);
  const top3 = scored.slice(0, 3);

  // 4. Générer le rationale IA Haiku pour chaque (P5 ai_prompts)
  for (const m of top3) {
    m.rationale = await generateMatchingRationale(architects.find(a => a.id === m.architectId)!, tender, m.score);
  }

  return top3;
}
```

### 3.2. Short-list UI

**Maquette** : déjà couvert dans M3 (modale Solo/Tandem) + nouvelle vue M16 short-list à produire si besoin.

**Comportement** :
1. User clique « Tandem » dans la modale
2. POST API `/api/tandem/match` avec `{ tenderId }`
3. Backend retourne `MatchScore[]` top 3
4. UI affiche les 3 archis avec : nom, score, spécialités, zone, nombre de collabs passées, **rationale IA** *(« Pourquoi nous t'avons choisi »)*
5. User clique sur un archi → ouvre la modale de prévisualisation Brevo
6. User peut éditer le mail avant envoi *(opt., champ libre additionnel)*
7. Toggle TU/VOUS pré-rempli selon `architects.tutoiement`, modifiable
8. User clique « Envoyer » → API call

### 3.3. Server Action send-solicitation

**Fichier** : `src/app/sourcing/ao/[id]/actions.ts`

```typescript
'use server';

export async function sendArchitectSolicitation(
  tenderId: UUID,
  architectId: UUID,
  register: 'tu' | 'vous',  // override possible côté UI
  customMessage?: string,    // optionnel
): Promise<{ success: boolean; brevoMessageId?: string }> {
  // 1. Vérifs (RLS, user authentifié, archi de l'org, etc.)
  await ensureUserCanAct(tenderId);

  // 2. Générer un JWT token (30 j, signé RS256)
  const token = await generateArchitectToken({ tenderId, architectId, expiresIn: '30d' });
  await supabase.from('architect_tokens').insert({ ... });

  // 3. Choisir le template Brevo (TU vs VOUS)
  const templateName = `architect_solicitation_${register === 'tu' ? 'TU' : 'VOUS'}`;
  const variables = await buildBrevoVariables(tenderId, architectId, token);

  // 4. Envoi Brevo
  const brevoResp = await brevo.transactionalEmails.sendTransacEmail({
    templateId: getBrevoTemplateId(templateName),
    to: [{ email: architect.email, name: `${architect.firstname} ${architect.lastname}` }],
    params: variables,
    headers: { 'X-Mailin-custom': `tender:${tenderId};archi:${architectId}` },
  });

  // 5. Update BDD
  await supabase.from('architect_responses').insert({
    tender_id: tenderId, architect_id: architectId, status: 'pending', token_id: token.jti,
  });
  await supabase.from('brevo_messages').insert({
    tender_id: tenderId, architect_id: architectId, template_name: templateName,
    register, brevo_message_id: brevoResp.messageId,
  });
  await supabase.from('tenders').update({ status: 'awaiting_architect' }).eq('id', tenderId);

  // 6. Audit log
  await audit('architect_solicit', { tenderId, architectId, register, brevoMessageId: brevoResp.messageId });

  // 7. Push Realtime au user
  await supabase.channel('user-notifs').send({
    type: 'broadcast', event: 'solicitation_sent', payload: { tenderId, architectId },
  });

  return { success: true, brevoMessageId: brevoResp.messageId };
}
```

### 3.4. Page tokenisée publique (architecte)

**Route** : `src/app/archi/[token]/page.tsx` *(hors `(app)`, publique, pas de middleware)*

**Maquettes** : M4 (TU) + M4 v1.1 (VOUS) déjà livrées.

```typescript
// page.tsx
export default async function ArchitectPage({ params }: { params: { token: string } }) {
  // 1. Vérifier JWT (signature, expiration, non-révoqué)
  const decoded = await verifyArchitectToken(params.token);
  if (!decoded || decoded.revoked || decoded.expired) {
    return <TokenInvalidPage />;
  }

  // 2. Récupérer tender + architect + match info (sans auth)
  const tender = await getTenderForArchitect(decoded.tenderId);
  const architect = await getArchitect(decoded.architectId);
  const match = await getMatchProposal(decoded.tenderId, decoded.architectId);

  // 3. Déterminer le registre TU/VOUS
  const register = architect.tutoiement ? 'tu' : 'vous';

  // 4. Afficher la page (M4 ou M4 v1.1 selon register)
  return <ArchitectTandemPage tender={tender} architect={architect} match={match} register={register} />;
}
```

**Actions sur la page** (3 boutons) :
- **Oui partant** → POST `/api/archi/[token]/respond` `{ status: 'accepted' }`
- **Plus d'infos** → POST avec `{ status: 'info_requested', message?: string }`
- **Non, pas cette fois** → POST avec `{ status: 'declined' }`

### 3.5. Server route handler architect response

**Fichier** : `src/app/api/archi/[token]/respond/route.ts`

```typescript
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const { status, message } = await req.json();

  // 1. Verify token
  const decoded = await verifyArchitectToken(params.token);
  if (!decoded) return new Response('Invalid token', { status: 401 });

  // 2. Update architect_responses
  await supabase.from('architect_responses')
    .update({ status, responded_at: new Date().toISOString(), info_request_text: message })
    .eq('tender_id', decoded.tenderId).eq('architect_id', decoded.architectId);

  // 3. Update tender status
  const newTenderStatus = {
    accepted: 'architect_accepted',
    declined: 'architect_declined',
    info_requested: 'architect_info_requested',
  }[status];
  await supabase.from('tenders').update({ status: newTenderStatus }).eq('id', decoded.tenderId);

  // 4. Audit log (acteur = architect via token, pas user AlyoS)
  await audit('architect_response', { tenderId: decoded.tenderId, architectId: decoded.architectId, status });

  // 5. Si accepted → trigger Odoo opportunity creation
  //    UNE opportunité PAR architecte partant (précision Board 2026-05-21).
  //    Si plusieurs architectes acceptent le même AO → plusieurs opportunités.
  //    On passe donc architectId au connecteur partagé (cf. module_solo_engine_v1.md §3.2).
  if (status === 'accepted') {
    await createOdooOpportunity(decoded.tenderId, {
      stage: 'Réponse cotraitance', origin: 'tandem', architectId: decoded.architectId,
    });
  }

  // 6. Si declined → envoi du mail acknowledge D.8 (court courtois)
  if (status === 'declined') {
    await sendBrevoTemplate('architect_decline_acknowledgment', architect.email, {});
  }

  // 7. Push Realtime au user AlyoS qui avait sélectionné
  await supabase.channel(`org-${decoded.orgId}`).send({
    type: 'broadcast', event: 'architect_responded',
    payload: { tenderId: decoded.tenderId, architectId: decoded.architectId, status },
  });

  return new Response('OK', { status: 200 });
}
```

### 3.6. Webhook Brevo (tracking ouverture/clic/bounce)

**Fichier** : `src/app/api/webhooks/brevo/route.ts`

Brevo POST sur cette URL à chaque event : `delivered`, `opened`, `clicked`, `bounced`, etc.

```typescript
export async function POST(req: Request) {
  // 1. Vérifier la signature HMAC Brevo (sécurité)
  if (!verifyBrevoHmac(req)) return new Response('Forbidden', { status: 403 });

  const events = await req.json();
  for (const event of events) {
    // event = { event: 'opened', message-id: 'xxx', date: ISO, ... }
    await supabase.rpc('append_brevo_event', {
      message_id: event['message-id'],
      event_type: event.event,
      event_at: event.date,
      event_data: event,
    });
  }
  return new Response('OK', { status: 200 });
}
```

Le RPC Postgres `append_brevo_event` ajoute l'event au JSONB `brevo_messages.events`.

### 3.7. Relance automatique J+3

**Fichier** : `src/lib/tandem/followup-cron.ts`

Job cron Vercel quotidien :
- Cherche les `architect_responses` `status='pending'` créées entre J-4 et J-3
- Pour chaque, envoie le template D.3 (TU) ou D.4 (VOUS) — relance
- Update `architect_responses.followup_sent_at`
- Max 1 relance, après on attend la réponse user pour basculer

---

## 4. Tests E2E à coder

Référence : `specs/plan_recette_gate7_v1.md` scénario S2 (13 tests).

Tests bloquants à coder dans `e2e/tandem.spec.ts` :

1. **Short-list** : sélection Tandem → 3 archis affichés, scorés
2. **Tutoiement** : archi avec `tutoiement=TRUE` → toggle pré-rempli TU
3. **Envoi solicitation** : template TU envoyé, JWT généré, status `awaiting_architect`
4. **Page tokenisée** : ouverture du lien → page affichée sans login
5. **Acceptation** : POST `accepted` → status `architect_accepted`, opportunité Odoo créée
6. **Refus** : POST `declined` → mail D.8 envoyé, status `architect_declined`
7. **Plus d'infos** : POST `info_requested` → status correspondant, message stocké
8. **Token expiré (30 j)** : lien expiré → page d'erreur
9. **Token révoqué admin** : admin révoque → lien inutilisable
10. **Webhook Brevo** : trace l'ouverture, le clic
11. **Push Realtime user** : `architect_responded` reçu dans la fenêtre du user dans les 5 s
12. **Relance J+3** : si pas de réponse, mail D.3 envoyé automatiquement

---

## 5. Coûts estimés

| Poste | Coût mensuel HT |
|-------|------------------|
| Brevo Free tier *(300 mails/j)* | 0 € au MVP |
| Brevo Lite *(20k/mois)* si besoin Phase 2 | ~7 € |
| Haiku 4.5 P5 matching_rationale | ~0.15-1.2 € (30-60 sollicitations × 0.005-0.02 €) |
| **Total module Tandem** | **~ 0-8 € / mois MVP** |

---

## 6. Plan de mise en œuvre Alex (estimation)

| Étape | Effort |
|-------|--------|
| Matching algorithm V1 (rules) + tests | 1 j |
| Short-list UI + modale Brevo prévisualisation | 1 j |
| Server Action sendArchitectSolicitation + JWT generation | 1 j |
| Page tokenisée publique + 3 actions response | 1.5 j |
| Webhook Brevo + RPC append_event | 0.5 j |
| Relance J+3 cron | 0.5 j |
| Tests E2E + audit log | 1.5 j |
| **Total module Tandem** | **~ 7 jours** *(1.5 semaines)* |

---

## 7. Dépendances

- ✅ Tables BDD existantes (`schema_v1.sql`)
- ✅ Templates Brevo D.1-D.4 + D.8 disponibles (`templates_brevo_v1.md`)
- ✅ Prompt IA P5 disponible (`ai_prompts_v1.md`)
- ⚠️ **Bloquant** : doit attendre que module Sourcing soit fait *(les Tandem testent sur des tenders réels en BDD)*
- ⚠️ **Bloquant** : intégration Odoo opérationnelle *(sinon trigger Odoo échoue, mais pas bloquant pour le code Tandem lui-même)*

---

## 8. Risques

| Risque | Mitigation |
|--------|------------|
| Architecte transmet le lien tokenisé à un tiers | Token signé JWT 30 j révocable manuellement. Acceptable risque pour MVP B2B. |
| Matching V1 propose 3 archis non pertinents | Logs détaillés des choix user vs reco IA → recalibrage trimestriel scoring. Bouton « voir tous les archis » fallback. |
| Brevo bounce / rejet d'un archi | Webhook capture le bounce → status `architect_bounced` (nouveau ?), push user pour qu'il choisisse n°2. |
| Architecte ne répond jamais | Relance J+3 + UI alerte user → bouton « proposer le n°2 ». |

---

*Spec figée pour démarrage Alex après module Sourcing. Réviser après spike ORM.*
