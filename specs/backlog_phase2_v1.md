# Backlog Phase 2 priorisé — edifio Sourcing v1.0

**Auteurs** : [CEO Marc] + [CTO Sophie]
**Date** : 2026-05-10
**Statut** : Vision long terme post-MVP
**Méthode** : MoSCoW (Must / Should / Could / Won't)

---

## Contexte

Le MVP (Phases 0-1, Gates 1-9) cible un **usage 100 % interne AlyoS Ingénierie**, monolocataire de fait. La Phase 2 ouvrira la commercialisation à des clients externes — TPE/PME BTP visant les marchés publics — avec les ajustements techniques et fonctionnels qui s'imposent.

**Trigger de démarrage Phase 2** :
- MVP stabilisé en prod chez AlyoS depuis ≥ 3 mois
- Au moins 1 client externe identifié (lettre d'intention)
- KPIs MVP atteints (taux sélection ≥ 8 %, taux Tandem ≥ 35 %, NPS ≥ 40)
- Budget Phase 2 acté par le Board

**Hypothèse de cadrage Phase 2** : 4 à 6 mois de développement, viser 3-5 clients pilotes en fin Phase 2.

---

## MUST — Indispensable pour ouvrir aux clients

### M1. Multi-tenancy stricte effective

**Pourquoi** : 1 tenant en MVP n'a jamais testé les politiques RLS en conditions réelles cross-tenant.

**Quoi** :
- Tests pgTAP renforcés avec ≥ 3 organisations distinctes en parallèle
- Audit sécurité externe (pen-test ciblé sur la multi-tenancy)
- Onboarding workflow d'une nouvelle organisation (création + invitations)
- Isolation au niveau Storage (buckets par-organization, pas un seul bucket commun)

**Effort estimé** : 2-3 sem.

### M2. Système de facturation et abonnements

**Pourquoi** : sans facturation automatisée, pas de SaaS scalable.

**Quoi** :
- Intégration Stripe (paiement carte) + SEPA (prélèvement)
- 3 plans actés en Gate 1 : Sourcing 190 € / Cotraitance 390 € / Studio IA 790 €
- Gestion des quotas (20 AO Studio inclus + 1,50 €/AO sup en métering)
- Factures PDF automatiques mensuelles
- Portail self-service utilisateur (changer plan, télécharger factures)

**Effort estimé** : 4-5 sem.

**Risque** : Stripe France a des spécificités (TVA, SEPA, mandats). Prévoir consultation comptable AlyoS.

### M3. SSO Edifio + SSO entreprise client

**Pourquoi** : entreprises clients voudront se connecter via leur IdP (Microsoft 365, Google Workspace, Okta).

**Quoi** :
- Intégration Supabase Auth + IdP tiers OIDC
- Domain claiming (un client revendique `@client.fr` → tous ses users y vont)
- SSO Edifio reportable (l'écosystème Edifio devient cohérent)

**Effort estimé** : 2-3 sem.

### M4. Onboarding nouveau client (self-service)

**Pourquoi** : aujourd'hui chaque création passe par AlyoS. Pas scalable.

**Quoi** :
- Landing page d'inscription
- Workflow : nom entreprise → SIREN → email admin → vérif domaine → création de l'organization → premier login
- Tutoriel guidé au premier login
- Mini-CMS pour customiser certaines strings par client (nom commercial du dirigeant dans les signatures)

**Effort estimé** : 2-3 sem.

### M5. Support client externalisable

**Pourquoi** : Léa ne peut plus être le SPOC quand on a 10 clients.

**Quoi** :
- Système de tickets (Intercom, Crisp, ou Front)
- FAQ enrichie + base de connaissances publique
- Chat in-app pour les questions
- Procédure d'escalade documentée

**Effort estimé** : 1-2 sem.

---

## SHOULD — Important pour décollage commercial

### S1. Intégration Odoo bidirectionnelle multi-versions

**Pourquoi** : MVP a un adaptateur Odoo prêt mais non testé en réel sur 17/18/19.

**Quoi** :
- Tests réels sur les 3 versions Odoo (instances clients ou sandboxes)
- Bidirectional sync robuste (statut bidi toutes les 15 min, conflict resolution)
- UI de mapping personnalisable (le client choisit ses étapes Odoo)

**Effort estimé** : 2 sem.

### S2. Apprentissage des sélections / rejets (ML Phase 2)

**Pourquoi** : la table `learning_events` collecte la donnée depuis le MVP. Phase 2 l'exploite.

**Quoi** :
- Modèle de scoring ML supervisé entraîné sur les `learning_events`
- Auto-validation des AO au-dessus d'un seuil de confiance configurable (par exemple > 90)
- Boucle de feedback continue

**Effort estimé** : 3-4 sem.

**Dépendance** : ≥ 6 mois de données utilisateur en MVP pour avoir un dataset utile.

### S3. Module signature électronique

**Pourquoi** : marchés publics passent en signature électronique RGS** systématique. Aujourd'hui l'utilisateur signe en dehors d'edifio Sourcing.

**Quoi** :
- Intégration DocuSign / Yousign / Universign
- Workflow de signature dans l'app
- Stockage du pli signé dans l'audit

**Effort estimé** : 2-3 sem.

### S4. Vues collaboratives (multi-users sur un AO)

**Pourquoi** : aujourd'hui un seul user prépare un dossier. En réalité 2-3 personnes interviennent (dirigeant, chargé d'affaires, technicien).

**Quoi** :
- Présence active (qui regarde quoi en temps réel via Supabase Realtime)
- Commentaires sur les pièces
- Workflow de revue (assigner une pièce à une personne)

**Effort estimé** : 2-3 sem.

### S5. API publique pour intégrations

**Pourquoi** : certains clients voudront extraire les données vers leur BI ou un ERP non-Odoo.

**Quoi** :
- API REST documentée (OpenAPI)
- Auth par API key par organization
- Rate limiting et quotas
- Webhooks sortants sur événements clés

**Effort estimé** : 2 sem.

---

## COULD — Différenciant mais pas critique

### C1. Mobile native (iOS + Android)

**Pourquoi** : la PWA est bonne mais une vraie app native serait plus intégrée (notifications richer, widgets, raccourcis Siri).

**Quoi** : React Native ou Flutter. Cible : iOS 17+ / Android 12+.

**Effort estimé** : 6-8 sem.

**ROI** : modéré. PWA suffit pour la plupart des cas.

### C2. Plateforme de plus (BOAMP régional, AWS-Achat, PROD'C)

**Pourquoi** : élargir la couverture sourcing.

**Quoi** : ajouter 1-2 plateformes au scraper. Chaque plateforme = ~3-5 jours de R&D + parsing + tests.

**Effort estimé** : 1-2 sem par plateforme.

### C3. Veille acheteurs (mode renseignement commercial)

**Pourquoi** : voir Explore-marketing — fonctionnalité demandée par les commerciaux.

**Quoi** :
- Fiches acheteurs publics (nom, budget, projets prévisionnels, interlocuteurs)
- Alertes sur les acheteurs cibles
- Croisement avec les AO sourcés

**Effort estimé** : 4-6 sem.

### C4. Marketplace architectes

**Pourquoi** : aujourd'hui chaque client maintient sa propre base. Une marketplace partagée donnerait des architectes cross-clients.

**Quoi** :
- Base nationale d'architectes opt-in
- Notation par les clients (anonymisée)
- Découverte par spécialité et zone

**Effort estimé** : 6-8 sem.

**Risque RGPD** : architectes doivent opter-in explicitement. Modèle juridique à valider avant.

### C5. Mémoires techniques mémorisés (mémoires « réussis » qui réinformeraient le prochain mémoire)

**Pourquoi** : si on a gagné un AO école, le mémoire de ce gain doit nourrir les prochains mémoires école.

**Quoi** :
- Tag « gagné » sur les mémoires soumis
- RAG (retrieval-augmented generation) sur le corpus AlyoS de mémoires gagnés

**Effort estimé** : 3-4 sem.

---

## WON'T (Phase 2 minimum, peut-être Phase 3+)

### W1. Édition multi-langue
- Pas pertinent à court terme — marchés publics français.

### W2. Module devis / facturation client final
- Hors scope. C'est Odoo / Sage qui s'en occupent.

### W3. App ouverte aux particuliers
- Hors scope. Marchés publics = entreprises.

### W4. Cryptomonnaies / NFT
- Non pertinent.

### W5. IA générative d'images (visuels mémoires)
- Marginal. Les visuels sont des photos de chantiers réels — pas de l'IA.

---

## Estimation globale Phase 2

| Sous-total | Effort |
|------------|--------|
| MUST (M1 à M5) | 11-16 sem |
| SHOULD (S1 à S5) | 10-12 sem |
| COULD (C1 à C5) | 19-29 sem |
| **MUST + SHOULD** | **21-28 sem** (~ 5-7 mois) |

→ Cible Phase 2 : MUST + SHOULD prioritaires en 4-6 mois (avec optimisation parallélisation), COULD étalés en backlog continu.

---

## Décisions à acter avant démarrage Phase 2

1. **Cible commerciale** : combien de clients pilotes, à quel prix, quel SLA
2. **Modèle de pricing** : confirmer les 3 tiers actés Gate 1 ou ajuster selon retours MVP
3. **Équipe** : reste-t-on sur Alex + Yann en Claude Code ou recrutement humain ?
4. **Budget** : ouvre-t-on un budget prestations externes (design, audit, légal) ?
5. **Roadmap publique** : communique-t-on les évolutions aux clients ou on garde la main ?

---

*Backlog à actualiser tous les 3 mois en revue stratégique. À présenter au Board en Gate 9 + 3 mois pour décision de poursuite Phase 2.*
