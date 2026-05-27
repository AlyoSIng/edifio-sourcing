# NOTE DE FAISABILITÉ — Console superadmin unifiée « edifio Admin » + multi-tenant

**Émetteur** : Sophie (CTO) — Cowork
**Destinataire** : Board (TEISSIER)
**Date** : 2026-05-27
**Décision Board du jour** : principe d'une console superadmin **unifiée Suivi + Sourcing** validé,
**au moment du lancement commercial (Phase 2)** — pas tout de suite. Multi-tenant à bâtir sur
**la même architecture qu'edifio Suivi**.
**Zone** : 🔴 (architecture + périmètre) — note préparatoire, exécution Phase 2.

---

## 1. Objectif

Au lancement commercial, disposer d'**une seule console d'administration** (« edifio Admin »)
pilotant à la fois edifio Suivi et edifio Sourcing, avec :
- une vue **client 360°** (un client peut être abonné à un ou aux deux produits),
- une **base de contacts / prospects partagée** (socle du flywheel cross-app),
- un modèle **multi-tenant** propre, aligné sur celui d'edifio Suivi.

À court terme (MVP interne AlyoS), **rien ne change** : la console Sourcing actuelle reste
autonome et mono-organisation. La convergence est un chantier de **Phase 2**.

---

## 2. Acquis côté edifio Sourcing (déjà prêts pour le multi-tenant)

Le schéma a été conçu multi-tenant dès le départ (cf. `CLAUDE.md`) :
- table `organizations` + colonne `organization_id` sur les tables métier ;
- **RLS** activée, policies `tenant_isolation` (`organization_id = current_organization_id()`) ;
- 1 seule organisation au démarrage (AlyoS), donc l'ouverture = ajout d'organisations, pas une refonte.

**Dette à solder avant ouverture** (déjà identifiée) :
- RLS policies manquantes sur 4 tables récentes (`cotraitants`, `tender_cotraitants`,
  `cotraitant_documents`, `be_documents`) — cf. backlog 26/05.
- `FORCE RLS` à généraliser (cf. arbitrage `ANSWER_260527_CTO_RLS_FORCE_EDGE.md`).
- Politique de rétention documentaire (purge des pièces expirées) avant montée en volume.

---

## 3. Pré-requis bloquant : audit de l'architecture edifio Suivi

Je **ne dispose pas**, dans ce dépôt, des détails de l'architecture d'edifio Suivi (stack exacte,
schéma, modèle d'identité, RLS). **Première étape Phase 2 = audit edifio Suivi** pour répondre à :

1. Stack identique ? (Next.js + Supabase + Drizzle, comme Sourcing, ou divergente ?)
2. Modèle d'identité : un même utilisateur peut-il porter des droits sur les deux produits ?
3. Schéma `organizations` / `users` compatible entre les deux apps (clés, formats) ?
4. RLS : même convention `current_organization_id()` ?

> Principe « pas d'invention » : je ne conçois pas la cible définitive avant cet audit.
> Ce qui suit est donc une **architecture-cible proposée, à confirmer après audit**.

---

## 4. Architecture-cible proposée (à valider après audit)

**Option retenue en intention : identité + organisations partagées, données cloisonnées par produit.**

- **Socle commun** : une table `organizations` et une table `users` partagées entre les deux produits
  (un client = une organisation ; un utilisateur peut accéder à Suivi, Sourcing, ou les deux).
- **Scoping produit** : chaque donnée métier porte `organization_id` **et** un `product ∈ {suivi, sourcing}`.
  RLS combinant isolation tenant **et** périmètre produit (un admin Sourcing ne voit pas les données Suivi
  d'un même client sauf droit explicite).
- **Console « edifio Admin »** : un seul back-office, avec un **sélecteur de produit** ; les modules
  transverses (support, actualités, comptes, facturation) sont mutualisés, les modules spécifiques
  (AO du jour, Tandem… pour Sourcing) restent cloisonnés.
- **Base contacts/prospects partagée** : c'est elle qui rend le flywheel opérationnel (un architecte
  capté par Sourcing devient un prospect Suivi).

**Alternative** si l'audit révèle des schémas trop divergents : garder deux bases séparées et
construire une **couche d'administration fédérée** au-dessus (vue agrégée + SSO), moins idéale mais
moins risquée. Décision après audit.

---

## 5. Risques & points durs

| # | Risque | Mitigation |
|---|--------|------------|
| 1 | Schémas Suivi ↔ Sourcing incompatibles | Audit préalable ; couche fédérée en repli |
| 2 | Fuite cross-produit / cross-org via RLS mal cadré | RLS FORCE + scoping produit testé en pgTAP avant ouverture |
| 3 | Migration des comptes existants (Suivi a déjà des utilisateurs) | Plan de migration identités dédié, réversible |
| 4 | Résidence des données (UE) sur base partagée | Supabase EU, même région ; DPA à jour |
| 5 | Couplage = un incident touche les 2 produits | Isolation des projets Supabase ou schémas ; status pages distinctes |

---

## 6. Séquencement Phase 2 (proposé)

1. **Audit edifio Suivi** (stack, schéma, identité, RLS) → note d'architecture définitive.
2. Solder la dette RLS Sourcing (FORCE + 4 tables + scoping produit).
3. Modèle d'identité + organisations partagées (POC sur dump).
4. Console « edifio Admin » : modules transverses mutualisés + sélecteur produit.
5. Base contacts/prospects partagée → activation flywheel.
6. Migration des comptes Suivi existants.

---

## 7. Décisions Board à venir (Phase 2, pas maintenant)

- ☐ Lancer l'audit edifio Suivi (déclencheur du chantier).
- ☐ Valider l'architecture-cible (identité partagée vs couche fédérée) **après** audit.
- ☐ Arbitrer le modèle de facturation multi-produits (bundle 3 apps -15 % évoqué en étude marché).

> En résumé : **principe acté, exécution Phase 2, première marche = audit edifio Suivi**. Aucun
> travail multi-tenant n'est lancé tant que Gate 6 (MVP interne) n'est pas validée et que l'audit
> n'a pas eu lieu.
