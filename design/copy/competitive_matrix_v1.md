# Matrice concurrentielle — edifio Sourcing v1.0

**Auteur** : [CMO Léa Charpentier]
**Date** : 2026-05-10
**Statut** : Livrable Gate 4 (action ouverte) — complète l'analyse résumée dans `01_CADRAGE_260507.pdf`
**Usage** : référentiel interne AlyoS pour positionnement et préparation Gate 9 (lancement)

---

## 1. Vue d'ensemble du marché français du sourcing AO public BTP

Le marché se segmente en trois familles :

1. **Pure-players sourcing AO** — alertes + plateforme de consultation. Mature, oligopole.
2. **Plateformes publiques officielles** — gratuit, brut, sans valeur ajoutée.
3. **CRM / outils complets BTP** — couvrent un bout du cycle mais pas le sourcing.

Aucun acteur ne propose le **continuum** sourcing → cotraitance architecte → préparation dossier IA → CRM. C'est notre angle.

---

## 2. Acteurs analysés

### 2.1. Vecteur Plus *(leader historique)*

- **Site** : vecteurplus.com
- **Modèle** : abonnement annuel ~3 000 à 8 000 €/an selon options
- **Périmètre** : sourcing AO + alertes mail + plateforme web de consultation
- **Forces** :
  - Couverture large (BOAMP, JOUE, presse régionale, sources privées)
  - Filtrage fin par CPV + zones
  - Outils complémentaires : analyse de marché, fichiers entreprises
  - Marque connue, longue expérience
- **Faiblesses** :
  - UX vieillissante (interface 2010s)
  - Pas d'IA en V1 (vraisemblablement en cours d'intégration mais lent)
  - Aucune aide à la décision (sélection, mobilisation, préparation dossier)
  - Pas de PWA mobile fluide
  - Coût élevé pour TPE/PME
- **Positionnement face à edifio Sourcing** : Vecteur Plus s'arrête à l'alerte. Nous prenons le relais à partir du moment où l'AO est identifié.

### 2.2. AWS-Achat / Achatpublic.com *(gratuit basique)*

- **Site** : achatpublic.com
- **Modèle** : gratuit côté soumissionnaire
- **Périmètre** : portail public de consultation d'avis + dépôt de réponses sur certains AO
- **Forces** :
  - Gratuit
  - Officiellement adossé à des acheteurs publics
- **Faiblesses** :
  - Brut, aucune intelligence
  - Pas d'alerte avancée, pas de scoring
  - Pas d'aide à la mobilisation cotraitance ni à la préparation
- **Positionnement face à edifio Sourcing** : c'est une source de données — pas un concurrent direct. À considérer comme un canal d'aspiration potentiel.

### 2.3. Explore-marketing *(milieu de gamme + intelligence acheteurs)*

- **Site** : explore.fr
- **Modèle** : abonnement (tarification opaque, ~150-400 €/mois selon ressentis terrain)
- **Périmètre** : sourcing AO + base données acheteurs publics + projets en cours de programmation
- **Forces** :
  - Données acheteurs riches (interlocuteurs, budgets, projets prévisionnels)
  - UX plus moderne que Vecteur Plus
  - Bon positionnement « renseignement commercial »
- **Faiblesses** :
  - Toujours pas de cotraitance / dossier
  - IA encore légère (résumés automatiques, pas plus)
  - Cible plutôt commerciaux que dirigeants opérationnels
- **Positionnement face à edifio Sourcing** : Explore est complémentaire (qualification amont). edifio Sourcing prend la suite : sélection → réponse.

### 2.4. Doublet *(notification AO classique)*

- **Site** : doublet.fr
- **Modèle** : abonnement annuel, plus ancien et économique que Vecteur Plus
- **Périmètre** : notifications mail d'AO + accès consultation
- **Forces** :
  - Tarif compétitif TPE
  - Simplicité d'utilisation
- **Faiblesses** :
  - Strictement notification — pas de scoring, pas d'aide
  - Interface obsolète
  - Pas de mobile, pas d'IA
- **Positionnement face à edifio Sourcing** : concurrence directe sur le bas de gamme TPE. edifio Sourcing surclasse sur tout sauf le prix de l'abonnement de base.

---

## 3. Matrice d'évaluation (1 = absent · 5 = excellent)

| Fonctionnalité | Vecteur Plus | AWS-Achat | Explore | Doublet | **edifio Sourcing** |
|----------------|:------------:|:---------:|:-------:|:-------:|:-------------------:|
| Sourcing multi-plateformes | 5 | 2 | 4 | 3 | **5** |
| Scoring IA des AO | 1 | 1 | 2 | 1 | **5** |
| Vue mobile-first PWA | 1 | 2 | 3 | 1 | **5** |
| Mode propre (Solo) avec CRM | 2 | 1 | 2 | 1 | **5** |
| Matching architecte (Tandem) | 1 | 1 | 1 | 1 | **5** |
| Sollicitation auto via Brevo + tracking | 1 | 1 | 1 | 1 | **5** |
| Page tokenisée sans login architecte | 1 | 1 | 1 | 1 | **5** |
| Analyse RC par IA | 1 | 1 | 2 | 1 | **5** |
| Pré-remplissage CERFA | 1 | 1 | 1 | 1 | **5** |
| Génération mémoire technique IA | 1 | 1 | 1 | 1 | **5** |
| Bibliothèque pièces + alertes expiration | 1 | 1 | 2 | 1 | **5** |
| Sync CRM Odoo | 1 | 1 | 2 | 1 | **5** |
| Kanban / Calendrier / Synthèse pipeline | 1 | 1 | 2 | 1 | **5** |
| **Score moyen** | **1,8** | **1,2** | **2,2** | **1,2** | **5,0** |

> **Lecture** : edifio Sourcing maximise toutes les axes parce qu'aucun concurrent ne couvre l'aval (cotraitance + dossier IA). Le score brut surestime l'écart en faveur de edifio Sourcing — il faut considérer aussi : maturité produit, image, support client. C'est sur ces axes qu'edifio Sourcing devra encore faire ses preuves (Gate 9+).

---

## 4. Battlecards rapides *(à mobiliser en interne AlyoS lorsque la question concurrence est posée)*

### Face à Vecteur Plus
> *« Vecteur Plus est une excellente machine à détecter les AO. Le problème, c'est ce qui se passe après. Une fois que tu as 5 AO pertinents sur ton écran, il faut encore trier, qualifier, mobiliser un architecte, lire 60 pages de RC, remplir 4 CERFA, écrire un mémoire technique pondéré sur les critères de jugement. edifio Sourcing le fait. Vecteur Plus s'arrête à l'alerte. »*

### Face à Doublet
> *« Doublet, c'est l'alerte mail pas chère. Si tu en es là, ça fait le job. Mais si tu veux gagner ne serait-ce qu'1 AO de plus par mois, il faut industrialiser la réponse — pas juste détecter. C'est ce que fait edifio Sourcing. »*

### Face à Explore
> *« Explore est très bon en renseignement commercial : qui est l'acheteur, quels sont ses projets prévisionnels. edifio Sourcing intervient APRÈS — quand l'AO est publié, comment je le traite vite et bien. Les deux sont compatibles ; Explore en amont, edifio Sourcing en exécution. »*

### Face à « pourquoi ne pas le faire à la main ? »
> *« Pour 5 AO par mois traités en cotraitance, on parle de 50 à 80 heures de travail économisées par mois — selon nos mesures Gate 1, à confirmer par recette Gate 9. C'est un mi-temps libéré. Le ROI est rentable dès le premier AO gagné qui n'aurait pas été tenté sinon. »*

---

## 5. Gaps de positionnement à anticiper *(risques)*

- **Vecteur Plus intègre du LLM dans les 12 mois** : c'est très probable. Notre avantage défendable n'est pas l'IA seule (commodité) mais le **continuum** sourcing → cotraitance → dossier → CRM. Mettre l'accent là-dessus dans tout le copy.
- **Acheteur public propose son propre outil** : peu probable à court terme, l'État pousse plutôt PLACE qui est neutre. Pas un risque MVP.
- **Concurrence intra-Edifio** : aucun module edifio (Suivi, AO, ACT) ne marche en concurrence avec Sourcing. La fratrie est complémentaire.

---

## 6. Tableau pour la fiche commerciale interne *(à utiliser en lancement Gate 9)*

| Question fréquente | Réponse courte |
|--------------------|----------------|
| « Pourquoi pas Vecteur Plus + tableur ? » | edifio Sourcing fait le tableur, la cotraitance et le dossier en plus. |
| « C'est cher ? » | À partir de 190 €/mois pour le sourcing pur, en interne AlyoS aujourd'hui (pas commercialisé). |
| « C'est lourd à prendre en main ? » | Onboarding en 1h. PWA mobile-first. Sandrine s'en sort en 3 jours, Patrick en 1 semaine. |
| « C'est sécurisé ? » | RLS Postgres + audit log + RGAA AA + DPA tous prestataires UE. Audit complet Gate 8. |
| « Si Vecteur Plus améliore son IA ? » | Notre avantage est le continuum, pas la commodité IA. Difficile à répliquer en < 12 mois. |

---

*Matrice à actualiser semestriellement (veille concurrentielle Phase 2). Prochaine revue : 2026-11.*
