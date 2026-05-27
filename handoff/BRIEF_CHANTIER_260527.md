# BRIEF DE CHANTIER — edifio Sourcing — 2026-05-27

**Émetteur** : CEO Marc + CTO Sophie (Cowork)
**Destinataires** : Alex (`dev`), Nadia (`dev_tandem`), Camille (`qa`), Hugo (`reviewer`), Yann (`ps_operator`)
**Origine** : décisions Board 2026-05-27.
**Règle** : on traite **dans l'ordre**. Zone 🟢 = avancer (plan court pour info) · 🟠 = arbitrage CTO · 🔴 = Board.

---

## ⭐ PREMIÈRES TÂCHES (priorité absolue, dans cet ordre)

### Tâche 1 — 🟢 AO du jour par département (code postal + tri/filtre)
**Spec** : `handoff/SPEC_ADDENDUM_260527_AO_CP_DEPARTEMENT_TRI.md`
1. Vérifier dans `tenders.raw_data` (échantillon réel BOAMP) les chemins du **code postal du
   lieu d'exécution** et du **CP de l'acheteur/MOA**. Règle d'affichage : CP lieu d'exécution,
   à défaut CP MOA, à défaut « CP non précisé ».
2. Dériver le **département** (2 chiffres ; Corse `2A`/`2B` ; DOM sur 3 chiffres `971`…).
   Réutiliser `NEIGHBORING_DEPARTMENTS` (déjà exporté depuis `matching.ts`, PR #70) — ne pas recréer.
3. Migration `drizzle-kit` : colonne **`tenders.department`** (+ `postal_code`) + **index** sur
   `department`. 🟠 revue CTO avant push. ⚠️ resynchroniser `__drizzle_migrations` d'abord.
4. **Backfill** des lignes existantes (script CLI dry-run puis `--commit`, idempotent).
5. UI : **badge CP + département** sur chaque carte AO, **tri** (département / jours avant clôture)
   et **filtres** (département multi-select / fenêtre J-clôture `≤7/≤15/≤30/tous`). Badge couleur
   J-clôture (vert >15 j, orange 7-15 j, rouge <7 j).
6. Tests : structural WHERE/ORDER (`PgDialect.sqlToQuery()`) + E2E tri/filtre. Camille verte, Hugo relit.

### Tâche 2 — 🟢/🟠 Brief d'opportunité IA + contenu d'onboarding
**Spec** : `handoff/SPEC_ADDENDUM_260524_AO_DU_JOUR_REPORT_ET_BRIEF.md` §Exigence 2.
1. **Brief IA** : génération **Sonnet 4.6** à la demande (bouton « Générer le brief »), 3-4 lignes
   factuelles, prompt versionné (`ai_prompts`), run tracé (`ai_runs`), stockage `tender_briefs`.
   Provenance `raw_data` (+ RC si dispo) — pas d'invention. Maîtrise du coût (pas de génération en masse).
2. **Rationale IA Haiku (matching Tandem)** : aujourd'hui `rationale: ""`. Brancher l'appel
   `ai-rationale.ts` depuis le Server Action de la shortlist (différé jusqu'ici — à activer).
3. **Contenu onboarding** : intégrer la fixture `src/db/seed/content-fixture.ts` (FAQ réelle +
   formations + clés `app_content`) une fois les `TODO_URL` renseignées par le Board (vidéo démo,
   plaquette, roadmap). Script d'insertion prod dédié.

---

## Arbitrages CTO à appliquer (débloquants)

- 🟠→✅ **FORCE RLS / Edge Functions** : Option A pour les 2 tables + helper `withTenantContext()`.
  Réf : `handoff/ANSWER_260527_CTO_RLS_FORCE_EDGE.md`. Débloque **PR #52**.
- 🟠→✅ **audit_action +3 valeurs** (`library_doc_upload`, `library_doc_delete`, `dce_download`).
  Réf : `handoff/ANSWER_260527_CTO_AUDIT_ENUM.md`. Via `drizzle-kit generate`, `ADD VALUE` hors transaction.

---

## Ensuite (backlog priorisé)

1. 🔴/🟠 **Durcissement RLS avant exploitation** : policies sur `cotraitants`, `tender_cotraitants`,
   `cotraitant_documents`, `be_documents` + généraliser FORCE. Tests pgTAP. (Pré-requis multi-tenant.)
2. 🟢 **Resynchroniser `__drizzle_migrations`** proprement (dette 0015/0016 appliquées manuellement)
   AVANT toute nouvelle migration `drizzle-kit migrate`.
3. 🟢 **Moulinette Pappers** : enrichir les ~1 313 architectes sans `headcount`.
4. 🟢 **Clôture traçabilité** (notes + `DECISIONS.md`) pour les exécutions prod non tracées.
5. 🟡 **Scrapers PLACE + Francmarchés** (worker PR #74) — déploiement Fly.io. Phase 2-friendly.
6. 🟡 **Export PDF shortlist**, **multi-cotraitant par AO** — Phase 2.

---

## Vocabulaire (décision Board 2026-05-27)

Les termes **« Solo » et « Tandem » ne sont plus utilisés**. Libellés d'interface **confirmés Board (27/05)** —
employer ces termes exacts partout (UI, copy, specs, contenu) :
- **Mandataire** (réponse en propre, seul ; l'AO bascule en pipeline, opportunité créée dans Odoo)
- **Cotraitance** (mobilisation d'un architecte cotraitant scoré + sollicitation)
- **Conception-Réalisation** (groupement marché global : AlyoS assure la maîtrise d'œuvre et
  coordonne un partenaire réalisateur, via l'annuaire Entreprises / Majors)

Conséquence contenu : dans `content-fixture.ts` / `faq_items`, la catégorie `tandem` est renommée
**`cotraitance`** — aligner la liste de catégories côté superadmin/seed en conséquence.

---

## Console superadmin unifiée (Phase 2, pas maintenant)

Principe acté. Note de faisabilité : `handoff/NOTE_FAISABILITE_260527_CONSOLE_UNIFIEE_MULTITENANT.md`.
Premier jalon **après Gate 6** : audit de l'architecture edifio Suivi. **Aucun** travail multi-tenant
lancé avant validation Gate 6.

---

## Rappels non négociables
- Migrations **uniquement** via `drizzle-kit generate` + revue CTO. Aucun `ALTER TABLE`/`ALTER TYPE` manuel.
- `.env.local` jamais committé ; `git diff --cached` avant chaque commit (anti-fuite secret).
- Jamais `Contact_complete.xlsx` ni donnée perso architecte dans le repo.
- Mention RGPD art.14 + lien d'opposition obligatoires et non supprimables au 1er envoi architecte.
- Action prod / merge `main` / déploiement = 🔴 Board.
