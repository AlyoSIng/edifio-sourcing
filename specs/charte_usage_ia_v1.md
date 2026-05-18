# Charte d'usage interne de l'IA — edifio Sourcing v1.0

**Auteurs** : [CTO Sophie] + [CEO Marc]
**Date** : 2026-05-10
**Statut** : Document de référence pour tous les collaborateurs AlyoS utilisant edifio Sourcing
**À publier** : sur la page `/help` de l'app + intranet AlyoS + Annexe contrat de travail (recommandé)

---

## 1. Principe directeur

> **L'IA est un copilote, pas un pilote.**
> Tout document généré par l'IA dans edifio Sourcing — résumé, mémoire technique, pré-remplissage CERFA, scoring — **est une proposition**. Le collaborateur AlyoS qui valide et signe le pli est **responsable** de la qualité, de la véracité et de la conformité de chaque pièce remise.

L'IA accélère. Elle n'engage pas.

---

## 2. Ce que l'IA fait dans edifio Sourcing

| Tâche | Modèle | Décision | Validation humaine |
|-------|--------|----------|---------------------|
| Scoring complémentaire d'un AO | Haiku 4.5 | Pertinence relative à votre profil | Optionnelle (vous gardez la main sur la sélection) |
| Analyse du Règlement de Consultation | Sonnet 4.6 | Extraction structurée (pièces, échéances, critères) | **Obligatoire** — chaque champ doit être confirmé avant utilisation |
| Génération du mémoire technique | Sonnet 4.6 | Rédaction structurée selon les critères pondérés | **Obligatoire** — lecture complète et corrections |
| Pré-remplissage des CERFA (DC1, DC2, DC4, ATTRI1) | Sonnet 4.6 | Mapping de vos données entreprise vers les champs | **Obligatoire** — relecture champ par champ |
| Mapping pièces RC ↔ bibliothèque | Haiku 4.5 | Association d'une pièce demandée à une pièce de la biblio | **Obligatoire** — vérifier que la version proposée est à jour |
| Génération de copy court (sujets emails, accroches) | Haiku 4.5 | Suggestions à choisir parmi 3 variantes | Optionnelle (vous validez le choix final) |
| Catégorisation du motif de rejet | Haiku 4.5 | Classement d'un motif libre en catégorie | Aucune (alimente le machine learning Phase 2) |

---

## 3. Ce que l'IA NE fait JAMAIS

- **Envoyer un mail à un architecte sans votre clic explicite**
- **Diffuser un dossier sans votre validation pièce par pièce**
- **Modifier ou supprimer une donnée**
- **Engager AlyoS contractuellement**
- **Prendre une décision irréversible sans validation humaine**

Toutes les actions à effet réel passent par un humain.

---

## 4. Procédure de validation obligatoire

### 4.1. Analyse RC

À chaque analyse, l'IA affiche en mode side-by-side :
- À gauche : le texte source du RC (avec page + citation)
- À droite : l'extraction structurée proposée

Vous devez **valider, corriger ou rejeter chaque champ** :
- **✓ Valider** : l'extraction est correcte, on l'enregistre tel quel
- **✎ Corriger** : vous éditez manuellement avant validation
- **✕ Rejeter** : l'extraction est erronée, vous saisissez la bonne valeur à la main

Tant qu'un champ critique n'a pas été validé, la préparation du dossier ne peut pas avancer.

### 4.2. Mémoire technique

Le mémoire est généré en markdown puis en PDF. Vous devez :
1. **Lire intégralement** le mémoire (15-30 minutes en moyenne).
2. **Vérifier les références citées** : pas de référence inventée. Si une référence ne vous parle pas, supprimez-la.
3. **Vérifier les chiffres** : montants, surfaces, délais, références juridiques.
4. **Adapter le ton** si nécessaire (l'IA reste générique, vous savez parler à cet acheteur précis).
5. **Cliquer « Validé »** explicitement avant compilation finale.

### 4.3. CERFA

Chaque champ pré-rempli est marqué de sa source (`biblio` / `company_data` / `tender_data` / `a_completer`).
- Les champs `a_completer` apparaissent en orange : vous DEVEZ les compléter.
- Les autres champs sont en vert mais doivent quand même être relus.

---

## 5. Comment remonter une hallucination

**Définition** : une hallucination est une information **inventée par l'IA** qui n'apparaît pas dans les données sources.

Exemples :
- L'IA cite « page 14 » alors que cette page n'existe pas dans le RC
- L'IA évoque une référence « Hôpital de Tarbes 2022 » alors que vous n'avez jamais travaillé là
- L'IA invente un montant ou une date

### Procédure

1. **Marquer la pièce concernée** comme « ❌ Rejetée » dans le side-by-side
2. **Cliquer « Signaler une hallucination »** dans le menu de la pièce
3. **Décrire en 1-2 phrases** ce qui était inventé
4. **Soumettre**

Le système enregistre :
- Le prompt qui a généré l'hallucination
- L'output exact
- Votre rapport
- Le contexte (RC concerné, modèle utilisé, version du prompt)

Les hallucinations sont analysées chaque semaine par la CTO (Sophie). Si un pattern émerge, le prompt est ajusté et versionné dans `ai_prompts`.

→ **Vous ne devez jamais utiliser une pièce contenant une hallucination** sans la corriger manuellement.

---

## 6. Protection des données dans les prompts

### Données que l'IA voit

L'IA Anthropic reçoit, pour chaque appel :
- Le texte du RC (donnée publique)
- Les données entreprise AlyoS (extraits de votre profil, bibliothèque)
- Vos paramètres (mots-clés, critères)

L'IA **ne voit pas** :
- Les emails des architectes
- Les logs d'audit
- Les données d'autres organisations (un seul tenant en MVP, AlyoS)

### Engagements Anthropic

- DPA signé (Phase 2 Gate 8) avec **rétention zéro** : Anthropic ne stocke pas les inputs/outputs au-delà du traitement immédiat
- Pas d'entraînement de modèles sur vos inputs (politique par défaut de l'API)
- Hébergement UE confirmé

### Ce que vous ne devez jamais soumettre via l'IA

- **Données personnelles** non métier (numéros de sécurité sociale, IBAN, etc.)
- **Secrets** (mots de passe, clés API)
- **Conversations internes** sensibles (négociations commerciales, dossiers RH)

Si l'IA vous propose un texte qui mentionne ce type de données → c'est un bug, **signalez-le immédiatement** à la CTO.

---

## 7. Quotas et coûts

### Le Tier Studio IA (790 € HT/mois)

- **20 AO Studio inclus** par mois
- Au-delà : **1,50 € par AO supplémentaire** (validé par l'admin AlyoS au cas par cas)
- Alerte automatique à **80 % du quota** mensuel

### Anti-abus

Le système surveille votre usage IA. Une anomalie (par exemple 50 analyses RC sur la même journée) déclenche une alerte automatique à l'admin AlyoS. Cela ne vous bloque pas — c'est un garde-fou.

### Si vous travaillez sur un AO particulièrement complexe

- Vous pouvez relancer une analyse RC (mise à jour si nouvelle version du RC)
- Vous pouvez régénérer le mémoire en partant d'un brouillon corrigé
- Chaque relance compte dans le quota — utilisez-les à bon escient

---

## 8. Responsabilité et signature

**Tout pli remis à un acheteur public engage AlyoS Ingénierie.**

La personne qui :
1. Valide le dossier dans edifio Sourcing
2. Compile le dossier final
3. Signe le pli

est **juridiquement responsable** de la conformité de chaque pièce. Cette responsabilité ne peut pas être transférée à l'IA.

→ Si vous avez un doute sur une pièce, **demandez** : à un collègue, à la CTO, à votre dirigeant. Ne signez pas par défaut.

---

## 9. Évolutions de cette charte

Cette charte est un document vivant. Elle évolue avec :
- Les améliorations du système IA (versions de modèles, nouveaux prompts)
- Les retours utilisateurs (procédures à clarifier, nouvelles bonnes pratiques)
- Les évolutions réglementaires (RGPD, AI Act européen)

**Revue obligatoire annuelle** par la CTO et le CEO. Notification de toute modification substantielle aux collaborateurs.

---

## 10. Contact

| Question | Référent |
|----------|----------|
| Comprendre une suggestion IA | [CMO Léa] |
| Signaler une hallucination | [CTO Sophie] (via le système de signalement intégré) |
| Quota dépassé / coût | [CEO Marc] |
| Bug technique | [DEV Alex] (via GitHub Issue) |
| Question RGPD | DPO AlyoS |

---

*Lue et acceptée par chaque collaborateur AlyoS lors de sa première connexion à edifio Sourcing (coche obligatoire en onboarding).*
