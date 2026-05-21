# CC 2026-05-21 18h45 — PR n°5 actions métier TenderCard

**Branche** : `feat/tender-actions` (depuis main SHA `08be830`)
**Agent** : DEV Alex
**Statut** : Implémentation terminée, en attente revue Steve avant commit/push

---

## Contexte

PR n°5 du module sourcing. Sur la page `/sourcing/ao-du-jour` (livrée V1
read-only PR n°4), la `TenderCard` était purement informative. La PR n°5 ajoute
les **3 actions métier** validées Gate 4 :

- **Sélectionner** (Solo / Tandem via modale)
- **Différer** (V1 fixe 24h, extensible Phase 2)
- **Rejeter** (motif libre optionnel max 280 chars)

---

## 3 arbitrages Board (2026-05-21 — Steve TEISSIER)

### Arbitrage A — Codes audit séparés
- **Décision** : A14 `tender_defer` + A15 `tender_reject` (codes distincts)
- **Justification** : signaux d'apprentissage IA scoring distincts (différé =
  signal faible, rejet = signal fort), filtrage analytics simple par `action`,
  payload schemas Zod dédiés sans `discriminator`.
- **Alternative rejetée** : code unique `tender_decision` polymorphe.

### Arbitrage B — Mécanique différé
- **Décision** : colonne `tenders.deferred_until timestamptz NULL` + index
  partiel `idx_tenders_deferred_until WHERE deferred_until IS NOT NULL`. Statut
  tender reste `sourced`. `getTendersOfTheDay` filtre
  `(deferred_until IS NULL OR deferred_until < now())`.
- **Justification** : éviter d'ajouter un nouveau statut tender (« deferred »)
  qui polluerait le cycle de vie 14 statuts validé Gate 4. À expiration,
  l'AO réapparait automatiquement sans batch dédié.

### Arbitrage C — Motif rejet optionnel
- **Décision** : textarea optionnelle (max 280 chars), stockée dans
  `tender_events.data.reason` + `audit_logs.data.reason`.
- **Justification** : motif libre = signal d'or pour le moteur scoring V2 (P12
  prompts), tout en restant non bloquant côté UX.

---

## Livrables

### Phase 1 — Spec audit + schémas + migration

- `specs/audit_log_v1.md` : compteur 13 → 15 actions ; sections A14 + A15 ajoutées
  ; signature TS skeleton mise à jour.
- `src/db/schema/enums.ts` : enum `auditAction` étendu de 13 à 15 valeurs
  (ordre : ajout en fin de tableau pour ALTER TYPE ADD VALUE).
- `src/db/schema/tenders.ts` : nouvelle colonne `deferredUntil` (timestamptz
  nullable) + index partiel `idx_tenders_deferred_until WHERE deferred_until
  IS NOT NULL`.
- `src/lib/audit/schemas.ts` :
  - `AUDIT_ACTIONS` étendu (15 valeurs)
  - A4 `tender_select` déjà strict — conservé
  - A14 `tender_defer` strict (UUID + ref + ISO datetime + hours_offset > 0)
  - A15 `tender_reject` strict (UUID + ref + reason nullable max 280 + score nullable)
  - Re-export des nouveaux schemas
- `src/db/types/jsonb.ts` : interfaces `AuditLogDataTenderDefer` et
  `AuditLogDataTenderReject` + ajout à l'union discriminée.
- `src/db/migrations/0004_tender_deferral.sql` (généré via `drizzle-kit
  generate` puis enrichi commentaires + `IF NOT EXISTS` sur ALTER TYPE).
- `src/db/migrations/meta/0004_snapshot.json` + journal mis à jour (drizzle-kit).

### Phase 2 — Server Actions

- `src/app/sourcing/ao-du-jour/actions.ts` (NOUVEAU, 380 lignes) :
  - 3 server actions `selectTenderAction`, `deferTenderAction`, `rejectTenderAction`
  - Auth check + domaine `@alyosingenierie.fr` (defense in depth vs middleware)
  - Transaction Drizzle (`SELECT FOR UPDATE` → `UPDATE tenders` → `INSERT tender_events`)
  - Audit log non-bloquant POST-commit (best-effort, ne bloque pas l'action)
  - `revalidatePath("/sourcing/ao-du-jour")` après chaque mutation
  - Discriminated union `ActionResult` avec 6 codes erreur
- `src/app/sourcing/ao-du-jour/actions.test.ts` (NOUVEAU, ~430 lignes) :
  ~25 cas couvrant happy paths + auth fail + input HS + état métier +
  payload audit validé Zod.

### Phase 3 — UI

- `src/app/sourcing/ao-du-jour/TenderCard.tsx` : embarque
  `<TenderCardActions />` en bas de la card (rendu Server, sous-composant Client).
- `src/app/sourcing/ao-du-jour/TenderCardActions.tsx` (NOUVEAU) :
  - 3 boutons primary/ghost/danger conformes au design tokens
  - Copy verbatim cf. `design/copy/onboarding_and_push_v1.md` lignes 68-70
  - Tooltips natifs `title` alignés sur le même fichier
  - `useTransition` (V1 — pendant pending : opacity 50 + pointer-events-none
    + `aria-busy`)
  - Map erreur → message FR + `CustomEvent("tender-action-error")` →
    capté par toast
- `src/app/sourcing/ao-du-jour/SoloTandemModal.tsx` (NOUVEAU) :
  - Verbatim Maquette 3 lignes 294-323 (copy + structure)
  - ARIA dialog complet (`role="dialog"`, `aria-modal`, `aria-labelledby`,
    `autoFocus`, Escape, click outside backdrop)
  - Tag « Recommandé · score MOE 0.91 » présentationnel V1
    (TODO V2 scoring réel)
- `src/app/sourcing/ao-du-jour/RejectReasonModal.tsx` (NOUVEAU) :
  - Textarea autoFocus maxLength=280
  - Compteur live `{n}/280`, rouge à 250+ (alerte visuelle)
  - ARIA dialog complet
- `src/app/sourcing/ao-du-jour/TenderActionsErrorToast.tsx` (NOUVEAU) :
  - Écoute `tender-action-error` → `role="alert"` + `aria-live="assertive"`
  - Auto-hide 5s
- `src/app/sourcing/ao-du-jour/page.tsx` : intégration du toast.

### Phase 4 — Query

- `src/lib/sourcing/queries.ts` :
  - `getTendersOfTheDay` étendu :
    - WHERE ajout `(deferred_until IS NULL OR deferred_until < now())`
    - SELECT ajout `deferredUntil`
  - Interface `TenderOfTheDay` ajout `deferredUntil: Date | null`
- `src/lib/sourcing/queries.test.ts` : fixtures ajout `deferredUntil`,
  2 nouveaux tests (projection deferredUntil + AO précédemment différé).

### Phase 5 — Tests E2E + pgTAP

- `e2e/tender-actions.spec.ts` (NOUVEAU) : 3 scénarios (Sélectionner Solo /
  Différer / Rejeter avec motif). `test.skip(!DATABASE_URL, "...")` documenté
  pour CI sans BDD.
- `tests/rls/08_tender_actions_cross_tenant.sql` (NOUVEAU) : 8 assertions
  pgTAP (UPDATE cross-tenant filtré RLS / INSERT tender_events cross-tenant
  refusé / UPDATE et INSERT in-tenant OK / UPDATE deferred_until cross-tenant
  filtré).

### Phase 6 — Doc

- Présente note `CC_260521_1845_TENDER_ACTIONS.md`
- Entrée DECISIONS.md (voir section dédiée plus bas)

---

## Validations passées (avant rendu Steve)

- `pnpm vitest run` → tous les tests verts (cf. récap chat).
- `pnpm exec tsc --noEmit` → 0 erreur.
- `next build` env-clean : non lancé (Steve s'en occupe — sécurité contrôle
  avant push).
- `pnpm db:migrate` : non lancé (la migration sera appliquée prod via
  workflow runbook init prod ou par opérateur).

---

## Frictions rencontrées

### 1. `ALTER TYPE ... ADD VALUE` transactionnel
- Postgres 15 (Supabase) interdit de **réutiliser** une nouvelle valeur d'enum
  dans la même transaction qui l'ajoute, mais autorise l'ADD VALUE lui-même.
- La migration `0004_tender_deferral.sql` n'utilise PAS `tender_defer` /
  `tender_reject` dans la même TX (uniquement extension enum + colonne +
  index) → le wrap transaction par défaut de Drizzle migrate fonctionne.
- Ajout `IF NOT EXISTS` aux ALTER TYPE pour idempotence (re-jouabilité).
- À surveiller si une future PR voulait INSERT audit_logs avec ces valeurs
  dans la même migration → il faudrait splitter en 2 fichiers.

### 2. Snapshot Drizzle écrasé par `drizzle-kit generate`
- J'avais écrit manuellement la migration au début. Drizzle-kit a regénéré le
  SQL en plus minimaliste mais correct, et a créé le snapshot meta. J'ai
  réintroduit les commentaires d'arbitrage + `IF NOT EXISTS` post-generate.
  Le snapshot meta (`0004_snapshot.json`) est intact et conforme.

### 3. DATABASE_URL pointe sur prod en local
- `.env.local` a `DATABASE_URL` sur le pooler Supabase prod (port 5432).
- J'ai exécuté `drizzle-kit generate` qui ne touche pas la BDD (juste lit le
  schema + écrit le SQL), mais pas `drizzle-kit migrate`. Confirme ce comportement
  conforme à la consigne « pas d'exécution de migration sur prod ».

### 4. Pas de `useOptimistic` au sens strict
- L'optimistic UI est portée par `revalidatePath` après server action +
  pendant le pending un `aria-busy` + opacité réduite sur la card. Pas de
  `useOptimistic` du tableau côté Client.
- Justification : la liste est rendue Server Component avec `dynamic =
  "force-dynamic"` ; le state optimiste vivrait côté page parent (Client
  wrapper), ce qui complique l'arbre. Pour V1, `revalidatePath` est rapide
  (<200ms) — UX correcte sur la suite typique d'actions « tap-tap-tap mobile ».
- Phase 2 envisagée : wrapper la grille en Client avec `useOptimistic` qui
  retire la card optimiste dès le clic, et qui la remet en cas d'erreur. Pas
  bloquant V1.

---

## Prochaine PR identifiée

**PR n°6 — Workflow Tandem : sollicitation cotraitance**

Quand un utilisateur a sélectionné un AO en mode **Tandem** (PR n°5 dépose
`status='selected_tandem'`), il doit pouvoir :
- voir la liste des architectes de la base AlyoS
- sélectionner les 1-3 architectes à solliciter
- envoyer l'email Brevo (template `D.1` ou `D.2` selon `tutoiement`)
- audit log A5 `architect_solicit` (à passer de placeholder à strict)

Cf. spec `module_cotraitance_v1.md` (à rédiger CTO Sophie début Phase 2).

---

## Demande à Yann (ps_operator)

- `git add -A` sur les fichiers listés + commit avec message :
  - `feat(sourcing): actions Sélectionner / Différer / Rejeter sur TenderCard`
  - Co-author Claude Opus 4.7
  - Conventional Commits
- Push sur `feat/tender-actions`
- Ouvrir PR vers `main`
