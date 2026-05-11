# Note de suivi — Réunion Gate 1 « Cadrage usage & business case »

**Date** : 2026-05-07
**Application** : Sourcing-Edifio
**Présents** : [CEO Marc], [CMO Léa], [CTO Sophie] (consultation), [BOARD TEISSIER]
**Rédacteur** : [CEO Marc]
**Statut** : Gate 1 validée par le Board

---

## 1. Décisions prises

| # | Décision | Pris par | Motif |
|---|----------|----------|-------|
| 1 | UVP retenue : « La seule plateforme qui orchestre, pour les PME du BTP, l'intégralité du cycle d'un marché public — de l'avis publié à la remise du pli — avec un copilote IA qui prépare les dossiers à votre place. » | [CMO] + [CEO] + [BOARD] | Aucun concurrent ne couvre l'enchaînement sourcing → cotraitance → dossier IA → CRM. Différenciation forte. |
| 2 | Trois personas formalisés : Patrick (dirigeant TPE BTP), Sandrine (chargée d'affaires), Marc (architecte sollicité externe). Priorité UX = Sandrine sur desktop ; Patrick maintenu en confort mobile. | [CMO] + [CEO] | Sandrine est l'utilisateur quotidien, Patrick le décideur. Architecte = friction zéro via lien tokenisé. |
| 3 | Tarification — Tiering 3 paliers retenu (Sourcing 190 € / Cotraitance 390 € / Studio IA 790 €). | [CMO] + [CEO] + [BOARD] | Lever la barrière à l'entrée TPE + capter la valeur sur Studio IA. Détail à finaliser en Gate 4. |
| 4 | Tarification — Quotas mensuels d'AO Studio IA (20 inclus / 1,50 € l'AO supplémentaire). | [CTO] + [CEO] + [BOARD] | Coûts API Anthropic variables (≈ 1-2 €/AO en analyse RC + mémoire). Sans quota, marge non maîtrisée. |
| 5 | Naming des modes de réponse : **Solo** (réponse en propre) / **Tandem** (réponse en cotraitance avec architecte). Adoption immédiate dans toute documentation et code. | [CMO] + [CEO] + [BOARD] | Court, mémorable, raconte une histoire. Remplace définitivement « Mode 1 / Mode 2 ». |
| 6 | KPIs MVP retenus : (1) taux de sélection, (2) taux de transformation Tandem, (3) délai sourcing → diffusion, (4) NPS J+90. | [CMO] + [CEO] + [BOARD] | Mesurables dès Gate 6. Activation en Gate 9. Cibles : 8 % / 35 % / ≤ 5 jours / NPS ≥ 40. |
| 7 | Hypothèse de gain utilisateur validée : 50-80 h économisées/mois pour une PME de 10-15 AO Tandem/mois. | [CMO] + [CEO] | Argument central de vente, à confirmer par mesure terrain en Gate 9. |

---

## 2. Désaccords / arbitrages remontés au Board

| # | Sujet | Position A | Position B | Arbitrage Board |
|---|-------|------------|------------|-----------------|
| 1 | Tarification Studio IA — quotas vs illimité | Quotas (CEO + CTO) | Illimité (hypothèse initiale brief) | **A retenue** |
| 2 | Naming modes | Solo / Tandem (CMO + CEO) | Mode 1 / Mode 2 (statu quo) | **A retenue** |

---

## 3. Actions à mener

| # | Action | Responsable | Échéance |
|---|--------|-------------|----------|
| 1 | Production document Gate 1 (PDF) | [CEO] | 2026-05-07 |
| 2 | Convocation Gate 2 (spec fonctionnelle + parcours) avec [CTO] pilote | [CEO] | Sur OK Board |
| 3 | Mise à jour `DECISIONS.md` avec les 7 décisions ci-dessus + naming Solo/Tandem | [CEO] | 2026-05-07 |
| 4 | Diffusion du naming Solo/Tandem à toute future spec | [CEO] | Permanente |
| 5 | Préparation matrice concurrentielle détaillée (Vecteur Plus, AWS-Achat, Explore, Doublet) pour Gate 4 | [CMO] | Avant Gate 4 |
| 6 | Cadrage initial du modèle de tarification détaillé (limites par tier, sur-quotas, période d'essai) | [CMO] + [CEO] | Gate 4 |

---

## 4. Risques identifiés

- **Coûts API Anthropic non maîtrisés** sur Tier Studio si quotas mal calibrés. Mitigation : monitoring des coûts par compte dès Gate 6, alerte automatique au-delà de 80 % du quota mensuel.
- **Hypothèses de gain utilisateur (50-80 h/mois) non validées par mesure terrain.** Mitigation : instrumentation dès Gate 6 + recette utilisateur réelle en Gate 9.
- **Concurrence Vecteur Plus** susceptible d'intégrer du LLM dans les 12 mois. Mitigation : avantage du continuum complet (cotraitance + Odoo) difficilement réplicable rapidement.
- **Adoption architectes externes** : si le taux de réponse via lien tokenisé est < 30 %, l'UVP Tandem s'effondre. Mitigation : A/B test des templates Brevo dès Gate 7 staging.

---

## 5. Prochaine étape

- **Gate suivante** : Gate 2 — Spec fonctionnelle & parcours détaillés
- **Pilotes** : [CTO Sophie] + [CEO Marc] + spec passées à [DEV Alex] côté Claude Code
- **Date prévue** : à convoquer dès OK Board sur la suite

---

*Note de suivi clôturée le 2026-05-07 par [CEO Marc].*
