# Spec — Module Solo (réponse AlyoS seul → opportunité Odoo)

**Auteurs** : [CTO Sophie] + [CMO Léa] (copy) — pré-spec pour Alex
**Date** : 2026-05-21
**Statut** : Spec préparée pour Alex après finalisation du module Sourcing + PR #24 (actions tender)
**Cible** : Gate 6 — étape post-Sourcing engine, en parallèle / amont du module Tandem
**Référence** : `specs/schema_v1.sql` (tables `tenders`, `tender_events`, `odoo_opportunities`, `audit_logs`) + `specs/module_tandem_engine_v1.md` (le Solo est le chemin court dont Tandem est la variante asynchrone) + `design/maquettes/maquettes_v4_sourcing_modules.html` (M-B, M-C)

---

## 1. Vue d'ensemble

Le module Solo gère le **mode réponse directe** : quand l'utilisateur AlyoS sélectionne un AO en **Solo**, edifio Sourcing crée immédiatement une **opportunité dans Odoo** (CRM AlyoS) et bascule le tender en `selected_solo`. Pas d'attente, pas de tiers — c'est le chemin court.

**Relation avec Tandem** : Solo et Tandem partent du même geste (clic « Sélectionner » → modale M-B). Solo ferme la boucle en une étape (`selected_solo` → opportunité Odoo). Tandem insère d'abord la couche architecte (sollicitation Brevo, réponse asynchrone) **puis** crée l'opportunité Odoo au moment de l'acceptation. Le code de création d'opportunité Odoo est donc **partagé** : il est écrit ici (Solo) et réutilisé par Tandem (`triggerOdooOpportunity`).

**Pré-requis déjà livrés (PR #24)** : l'état `selected_solo` existe, l'action « Sélectionner » + la modale Solo/Tandem sont en place, l'audit A4 (`tender_select`) est tracé. **Ce module ajoute la conséquence de `selected_solo` : la synchronisation Odoo.**

> ### ⚠️ RÈGLE MÉTIER — Quand une opportunité Odoo est-elle créée ? *(précision Board 2026-05-21)*
> Une opportunité Odoo n'est créée **qu'au moment d'un engagement réel** :
> - **Solo** → 1 opportunité dès la confirmation Solo (AlyoS s'engage seul).
> - **Tandem** → **aucune** opportunité à la sélection Tandem ni à l'envoi de la sollicitation. Une opportunité est créée **uniquement quand un architecte répond « partant »**, et **une opportunité par architecte partant** (si AlyoS sollicite plusieurs architectes pour le même AO et que plusieurs acceptent → plusieurs opportunités Odoo pour ce même AO).
>
> Conséquence sur le schéma : ce n'est **pas** « 1 opportunité par AO ». C'est « 1 opportunité par AO en Solo » **et** « 1 opportunité par couple (AO, architecte partant) en Tandem ». Le connecteur `createOdooOpportunity` porte donc un `architectId` optionnel (null en Solo).

---

## 2. Flow complet (parcours utilisateur)

```
[User AlyoS]                 [edifio Sourcing]                      [Odoo CRM]
     │                              │                                   │
     │  Tap "Sélectionner"          │                                   │
     │ ───────────────────────────► │                                   │
     │  Modale M-B : Solo / Tandem  │                                   │
     │  Tap "Confirmer en Solo"     │                                   │
     │ ───────────────────────────► │                                   │
     │                              │  status tender = selected_solo    │
     │                              │  tender_events('selected')        │
     │                              │  audit A4 tender_select(solo)     │
     │                              │                                   │
     │                              │  Server Action createSoloOpp      │
     │                              │  Mapping tender → crm.lead         │
     │                              │  XML-RPC create()                 │
     │                              │ ────────────────────────────────► │ crée crm.lead
     │                              │ ◄──────────────────────────────── │ retourne odoo_id
     │                              │  Insert odoo_opportunities        │
     │                              │  tender_events('odoo_synced')     │
     │                              │  audit A?? odoo_opportunity_create │
     │                              │  Push Realtime au user            │
     │  Toast "Opportunité créée"   │                                   │
     │  + lien Ouvrir dans Odoo     │                                   │
     │ ◄─────────────────────────── │                                   │
```

> **Note RGPD** : le module Solo ne traite **aucune donnée personnelle de tiers** (contrairement à Tandem qui manipule des architectes). Il n'écrit que des données d'AO public + une référence d'opportunité interne. Impact registre RGPD : faible.

---

## 3. Composants à implémenter

### 3.1. Server Action `confirmSoloSelection`

**Fichier** : `src/app/sourcing/ao/[id]/actions.ts` (à côté de l'action Tandem)

Enchaîne, dans une transaction logique idempotente :

1. `ensureUserCanAct(tenderId)` — RLS, user authentifié `@alyosingenierie.fr`, tender de l'org `ALYOS_ORG_ID`.
2. `UPDATE tenders SET status='selected_solo', selected_mode='solo', selected_by=<uid>, selected_at=now()`.
3. `INSERT tender_events (tender_id, event_type='selected', payload={mode:'solo'})`.
4. `audit('tender_select', { tenderId, mode:'solo' })` — action A4 (existante).
5. Appel `createOdooOpportunity(tenderId, { stage:'Sourcing', origin:'solo' })` (cf. 3.2).
6. Push Realtime `solo_selected` au canal `org-<orgId>`.

**Idempotence** : si `tenders.status` est déjà `selected_solo` **et** une ligne `odoo_opportunities` existe pour ce tender, l'action ne recrée rien (anti double-clic / re-run). Elle renvoie l'`odoo_id` existant.

### 3.2. Connecteur Odoo XML-RPC partagé

**Fichier** : `src/lib/odoo/client.ts` + `src/lib/odoo/opportunities.ts`

> Stack actée Gate 5 : Odoo XML-RPC. Auth via `common.authenticate` puis appels `object.execute_kw`.
> Secrets dans `.env.local` : `ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_API_KEY` (jamais committés).

```typescript
// opportunities.ts
interface OdooOppInput {
  stage: 'Sourcing' | 'Réponse cotraitance';
  origin: 'solo' | 'tandem';
  architectId?: UUID;   // null/undefined en Solo ; renseigné en Tandem (1 opp par archi partant)
}

export async function createOdooOpportunity(
  tenderId: UUID,
  input: OdooOppInput,
): Promise<{ odooId: number }> {
  const tender = await getTender(tenderId);
  const architect = input.architectId ? await getArchitect(input.architectId) : null;

  // Mapping tender (+ architecte cotraitant si Tandem) → crm.lead (cf. 3.3)
  const lead = mapTenderToOdooLead(tender, input, architect);

  // Idempotence par couple (tender, architecte) — null = Solo
  const existing = await db.query.odooOpportunities.findFirst({
    where: and(
      eq(odooOpportunities.tenderId, tenderId),
      input.architectId
        ? eq(odooOpportunities.architectId, input.architectId)
        : isNull(odooOpportunities.architectId),
    ),
  });
  if (existing) return { odooId: existing.odooId };

  // XML-RPC create
  const odooId = await odoo.execute_kw('crm.lead', 'create', [lead]);

  // Persistance du lien
  await db.insert(odooOpportunities).values({
    tenderId, architectId: input.architectId ?? null, odooId,
    stage: input.stage, origin: input.origin, syncedAt: new Date(),
  });
  await db.insert(tenderEvents).values({ tenderId, eventType: 'odoo_synced', payload: { odooId, architectId: input.architectId ?? null } });
  await audit('odoo_opportunity_create', { tenderId, odooId, origin: input.origin, architectId: input.architectId ?? null });

  return { odooId };
}
```

> **Solo** appelle `createOdooOpportunity(tenderId, { stage:'Sourcing', origin:'solo' })` (sans `architectId`) **à la confirmation Solo**.
> **Tandem** appelle `createOdooOpportunity(tenderId, { stage:'Réponse cotraitance', origin:'tandem', architectId })` **à la réception de la réponse `accepted`** d'un architecte (cf. `module_tandem_engine_v1.md` §3.5) — donc autant d'appels que d'architectes partants.

### 3.3. Mapping tender → `crm.lead`

**Fichier** : `src/lib/odoo/mapping.ts`

| Champ Odoo (`crm.lead`) | Source edifio | Exemple |
|--------------------------|---------------|---------|
| `name` | Objet de l'AO (tronqué 120 car.) | « Réhab. thermique groupe scolaire Jean-Moulin » |
| `partner_name` | Acheteur public | « Ville de Vienne » |
| `expected_revenue` | Montant estimé (si présent) | 145 000 |
| `date_deadline` | Date de clôture de l'AO | 2026-06-02 |
| `description` | Lien BOAMP + réf + CPV + score edifio (note structurée) | (HTML court) |
| `stage_id` | Mappé sur l'étape « Sourcing » du pipeline « AO publics » | via `getOdooStageId()` |
| `tag_ids` | Tags edifio (CPV catégorie : scolaire, tertiaire…) | mappés sur tags Odoo |
| `medium_id` / `source_id` | « edifio Sourcing » (UTM-like, traçabilité origine) | constant |

> **À confirmer Board / AlyoS** : le **nom exact du pipeline Odoo** (« AO publics » ?) et l'**étape de départ** (« Sourcing » ?). Si l'étape n'existe pas dans l'Odoo d'AlyoS, on la crée côté Odoo (action admin AlyoS, pas edifio) ou on retombe sur l'étape par défaut. → handoff REQUEST si flou.

### 3.4. UI — retour utilisateur

**Maquettes** : M-B (modale choix) + M-C (page « Sélectionnés » + toast) dans `maquettes_v4_sourcing_modules.html`.

- À la confirmation Solo : `optimistic update` → la carte quitte « AO du jour », apparaît dans « Sélectionnés » avec le chip `SÉLECTIONNÉ — SOLO`.
- Toast Realtime « Opportunité Odoo créée » + lien profond `↗ Ouvrir dans Odoo` (`<ODOO_URL>/web#id=<odooId>&model=crm.lead&view_type=form`).
- Sur la ligne : chips `OPPORTUNITÉ ODOO CRÉÉE` + `ODOO #OPP-...`, bouton `↺ Repasser en Tandem` (réversible tant que pertinent — voir 3.5).
- Si l'appel Odoo échoue : la sélection **reste** (`selected_solo` est acquis), mais un état dégradé s'affiche (chip `SYNCHRONISATION ODOO EN ÉCHEC` + bouton `Réessayer la synchro`). On ne perd jamais le geste métier de l'utilisateur à cause d'Odoo.

### 3.5. Réversibilité (repasser en Tandem / annuler)

- Tant qu'aucune action irréversible n'a eu lieu côté Odoo (opportunité encore en étape « Sourcing », non éditée par un commercial), l'utilisateur peut **repasser en Tandem** : on archive/annule proprement le `crm.lead` (ou on le laisse et on le ré-affecte — **décision Board/AlyoS sur la politique Odoo**), et le statut redevient `selected_tandem`.
- **Jamais de suppression dure** d'opportunité Odoo par edifio sans confirmation (principe « pas d'action irréversible sans validation »). Par défaut : on **archive** (`active=false`) côté Odoo, on ne supprime pas.

---

## 4. Schéma BDD — table `odoo_opportunities`

À vérifier dans `schema_v1.sql` ; si absente, migration Drizzle `drizzle-kit generate` (revue CTO obligatoire — décision ADR-013) :

```sql
CREATE TABLE odoo_opportunities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  tender_id       uuid NOT NULL REFERENCES tenders(id),
  architect_id    uuid REFERENCES architects(id),  -- NULL en Solo ; renseigné en Tandem
  odoo_id         integer NOT NULL,           -- crm.lead id côté Odoo
  stage           text NOT NULL,
  origin          text NOT NULL CHECK (origin IN ('solo','tandem')),
  synced_at       timestamptz NOT NULL DEFAULT now(),
  last_error      text                         -- null si OK ; message si échec synchro
);
-- Idempotence (précision Board 2026-05-21) :
--   Solo   = 1 opportunité par AO            → unique partiel sur tender_id quand architect_id IS NULL
--   Tandem = 1 opportunité par (AO,archi)    → unique partiel sur (tender_id, architect_id)
CREATE UNIQUE INDEX uniq_opp_solo   ON odoo_opportunities (tender_id)                WHERE architect_id IS NULL;
CREATE UNIQUE INDEX uniq_opp_tandem ON odoo_opportunities (tender_id, architect_id)  WHERE architect_id IS NOT NULL;
-- RLS FORCE + policy organization_id = current_org() (parité avec les autres tables)
```

> **Audit** : ajouter l'action `odoo_opportunity_create` au registre `audit_log_v1.md` si elle n'existe pas encore (actions A1–A13). **Ne pas inventer un code A** — si le registre est plein/figé, handoff REQUEST au Board pour arbitrage de la numérotation.

---

## 5. Tests E2E à coder

Référence : `specs/plan_recette_gate7_v1.md` scénario S1 (réponse Solo).

Tests bloquants dans `e2e/solo.spec.ts` :

1. **Sélection Solo** : Sélectionner → modale → Confirmer Solo → `status=selected_solo`, carte hors « AO du jour ».
2. **Opportunité Odoo** : appel XML-RPC mocké → ligne `odoo_opportunities` créée, chip `OPPORTUNITÉ ODOO CRÉÉE` affiché, toast présent.
3. **Audit** : `audit_logs` contient `tender_select(solo)` **et** `odoo_opportunity_create`.
4. **Idempotence** : double confirmation / re-run → une seule opportunité Odoo, pas de doublon.
5. **Échec Odoo** : Odoo indisponible (mock erreur) → `selected_solo` conservé, état dégradé + bouton « Réessayer la synchro », `last_error` renseigné.
6. **RLS** : un write `odoo_opportunities` hors org est rejeté (pgTAP).
7. **Réversibilité** : repasser en Tandem → opportunité archivée (mock), `status=selected_tandem`.

> Ne **jamais** désactiver un test E2E pour faire passer la CI (règle CLAUDE.md).

---

## 6. Copy validée (CMO Léa)

| Élément | Libellé FR (charte éditoriale edifio) |
|---------|----------------------------------------|
| Modale titre | « Comment répondez-vous à cet AO ? » |
| Carte Solo | « AlyoS Ingénierie répond seul. L'AO bascule directement en opportunité dans Odoo. » |
| Bouton confirm | « Confirmer en Solo → » |
| Statut | « sélectionné — solo » (cohérent registre Gate 4) |
| Toast succès | « Opportunité Odoo créée » |
| État échec | « Synchronisation Odoo en échec » + « Réessayer la synchro » |
| Lien profond | « ↗ Ouvrir dans Odoo » |

---

## 7. Coûts estimés

| Poste | Coût mensuel HT |
|-------|------------------|
| Odoo (instance AlyoS existante) | 0 € (déjà en place) |
| Appels XML-RPC | 0 € (self-hosted / inclus licence Odoo AlyoS) |
| **Total module Solo** | **0 € / mois** |

---

## 8. Plan de mise en œuvre Alex (estimation)

| Étape | Effort |
|-------|--------|
| Connecteur Odoo XML-RPC (`client.ts`, auth) + secrets `.env.example` | 1 j |
| Mapping `tender → crm.lead` + `createOdooOpportunity` (partagé Tandem) | 1 j |
| Server Action `confirmSoloSelection` + idempotence + Realtime | 0.5 j |
| Migration Drizzle `odoo_opportunities` + RLS + audit code | 0.5 j |
| UI « Sélectionnés » + toast + état dégradé échec Odoo | 1 j |
| Tests E2E + pgTAP RLS | 1 j |
| **Total module Solo** | **~ 5 jours (1 semaine)** |

---

## 9. Dépendances

- ✅ État `selected_solo` + action Sélectionner + modale Solo/Tandem (livrés PR #24)
- ✅ Module Sourcing (les tenders réels en BDD) — opérationnel après fix BOAMP
- ⚠️ **Accès Odoo AlyoS** : URL, base, compte de service + clé API à fournir par le Board (secrets `.env.local`). **Bloquant pour le test réel**, pas pour le code (mock).
- ⚠️ **Confirmer le pipeline + l'étape Odoo** (« AO publics » / « Sourcing ») — handoff si flou.

---

## 10. Risques

| Risque | Mitigation |
|--------|------------|
| Odoo indisponible au moment de la sélection | `selected_solo` conservé, synchro rejouable (`last_error` + bouton Réessayer). On ne bloque jamais le geste métier sur Odoo. |
| Doublons d'opportunités (double-clic, re-run cron) | Contrainte `UNIQUE(tender_id)` + idempotence côté Server Action. |
| Mapping de champ incorrect (montant, étape) | Étape « Sourcing » par défaut + revue d'un premier lot réel par le Board avant généralisation. |
| Suppression accidentelle d'opportunité Odoo | Politique « archive, jamais delete dur » + pas d'action irréversible sans validation. |
| Clé API Odoo en clair | `.env.local` jamais committé, `.env.example` template, `pnpm audit` à chaque ajout. |

---

*Spec figée pour démarrage Alex. Le connecteur Odoo écrit ici est réutilisé par le module Tandem (`triggerOdooOpportunity`). À réviser si la politique Odoo d'AlyoS (pipeline, étapes, archivage) diffère des hypothèses ci-dessus.*
