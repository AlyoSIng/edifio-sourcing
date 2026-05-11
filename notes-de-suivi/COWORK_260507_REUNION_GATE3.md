# Note de suivi — Réunion Gate 3 « Design & maquettes »

**Date** : 2026-05-07
**Application** : edifio Sourcing *(naming corrigé — voir décision n°1)*
**Présents** : [GRAPHISTE Théo Renard] (pilote), [CMO Léa] (consultation), [CTO Sophie] (consultation), [CEO Marc], [BOARD TEISSIER]
**Rédacteur** : [CEO Marc]
**Statut** : Gate 3 validée par le Board

---

## 1. Décisions prises

| # | Décision | Pris par | Motif |
|---|----------|----------|-------|
| 1 | **Naming produit corrigé : `edifio Sourcing`** (en remplacement de « Sourcing-Edifio »). Tous supports, code, URLs, copy à aligner. | [GRAPHISTE] + [CEO] + [BOARD] | Le DS Edifio impose `edifio` en minuscules + composition « edifio + nom produit » (cf. edifio Suivi, edifio AO, edifio ACT). « Sourcing-Edifio » est explicitement proscrit. |
| 2 | **Signature éditeur corrigée : `AlyoS Ingénierie`** (S majuscule final). | [GRAPHISTE] + [CEO] + [BOARD] | Convention de marque historique imposée par le DS Edifio. |
| 3 | **PDF Gate 1 et Gate 2 à ré-éditer en v1.1** avec la palette correcte (alyos-red + ink + paper) en remplacement de la palette inventée (bleu profond + orange) utilisée par erreur. | [CEO] | Cohérence visuelle et auditabilité des livrables. |
| 4 | **Design tokens consolidés livrés** dans `design/tokens.json` au format Design Tokens Community Group (DTCG) v1.0. Couvre couleurs, typographies, espacements, rayons, ombres, naming, accessibilité. | [GRAPHISTE] + [CTO] + [BOARD] | Source unique consommée par le package monorepo `@edifio/ui` (partagé avec edifio Suivi et edifio AO). |
| 5 | **6 maquettes haute-fidélité validées** : (1) Vue mobile « AO du jour » Patrick, (2) Kanban groupé desktop Sandrine, (3) Modale Solo / Tandem, (4) Page tokenisée architecte, (5) Side-by-side de revue dossier IA, (6) Fiche AO consolidée. Livrées dans `design/maquettes/maquettes_v1.html`. | [GRAPHISTE] + [BOARD] | Couvrent les 6 écrans critiques du MVP issus des parcours validés en Gate 2. |
| 6 | **Mode Kanban groupé (3 super-colonnes)** retenu en **vue par défaut** : *En cours / Diffusé / Clôturé*. Toggle vers le mode détaillé 10 colonnes disponible. | [GRAPHISTE] + [CEO] + [BOARD] | Réponse à l'alerte densité signalée en Gate 2. Lisibilité préservée sur écran 1280, drilldown disponible. |
| 7 | **Accessibilité RGAA AA dès la conception** : tous les contrastes texte/fond ≥ 4,5:1, cibles tactiles ≥ 44×44 px, focus ring alyos-red 2 px offset 2 px. | [GRAPHISTE] + [BOARD] | Bloquant Gate 9. À auditer formellement en Gate 9. |
| 8 | **Logo edifio inchangé** : pin rouge circulaire (alyos-red) + wordmark Space Grotesk 700 letter-spacing -1 px. Étiquette de produit « Sourcing » en Inter 500 muted. | [GRAPHISTE] + [BOARD] | Cohérence stricte avec le DS officiel. |

---

## 2. Désaccords / arbitrages remontés au Board

| # | Sujet | Position A | Position B | Arbitrage Board |
|---|-------|------------|------------|-----------------|
| 1 | Naming produit | `edifio Sourcing` (DS officiel) | `Sourcing-Edifio` (brief Board v1.0) | **A retenue** |
| 2 | Signature éditeur | `AlyoS Ingénierie` (DS) | `Alyos Ingénierie` (brief) | **A retenue** |

---

## 3. Actions à mener

| # | Action | Responsable | Échéance |
|---|--------|-------------|----------|
| 1 | Production document Gate 3 (PDF) avec palette corrigée | [CEO] | 2026-05-07 |
| 2 | Mise à jour `DECISIONS.md` (8 décisions Gate 3) | [CEO] | 2026-05-07 |
| 3 | Ré-édition PDF Gate 1 v1.1 et Gate 2 v1.1 avec palette Edifio correcte | [CEO] | Avant Gate 5 |
| 4 | Consommation des tokens dans `@edifio/ui` (Tailwind theme + CSS vars) | [DEV Alex] côté Claude Code | Gate 5 / Gate 6 |
| 5 | Renommage global « Sourcing-Edifio » → « edifio Sourcing » dans tous fichiers existants (specs, parcours, maquettes, package.json, .env, URLs `sourcing.edifio.fr`) | [DEV Alex] + [PS_OPERATOR Yann] | Gate 5 |
| 6 | Templates Brevo alignés naming + ton (tutoiement, signature AlyoS Ingénierie) | [CMO Léa] | Avant Gate 4 |
| 7 | Convocation Gate 4 (Revue marketing & copy) | [CEO] | Sur OK Board |
| 8 | Audit accessibilité RGAA AA détaillé | [GRAPHISTE] + audit externe en option | Gate 9 |

---

## 4. Risques identifiés

- **Effort de renommage non négligeable** : « Sourcing-Edifio » apparaît dans le brief, la note Onboarding, les notes Gate 1/2, les PDF Gate 1/2 et le `DECISIONS.md`. Mitigation : passe globale planifiée Gate 5 avant tout commit. Acceptation pragmatique d'une cohabitation transitoire dans les archives historiques (ne pas réécrire le passé, écrire correctement à partir d'aujourd'hui).
- **Dépendance Google Fonts** (Inter, Space Grotesk, JetBrains Mono) : self-host obligatoire pour la PWA offline et le RGPD. Mitigation : [DEV Alex] doit servir les fonts depuis Vercel/Supabase, pas via fonts.googleapis.com. À acter formellement en Gate 5.
- **Charte couleur très contrastée (alyos-red)** : le rouge vif peut paraître agressif sur les écrans status (`error`, `warn`). Mitigation : le DS distingue clairement `alyos-red` (marque, CTA) de `error` (#B91C1C, plus profond) — règle à respecter dans les composants.

---

## 5. Prochaine étape

- **Gate suivante** : Gate 4 — Revue marketing & copy (naming exposé, microcopy, accroches, ton de voix)
- **Pilote** : [CMO Léa Charpentier]
- **Consultations** : [GRAPHISTE Théo] (in-screen copy), [CEO Marc]
- **Date prévue** : à convoquer dès OK Board sur la suite

---

*Note de suivi clôturée le 2026-05-07 par [CEO Marc].*
