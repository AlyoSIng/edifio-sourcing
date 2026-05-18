# Template de postmortem — edifio Sourcing v1.0

**Auteur** : [CTO Sophie] + [CEO Marc]
**Date** : 2026-05-10
**Statut** : Référence — à dupliquer pour chaque incident SEV1/SEV2
**Référence** : `specs/threat_model_runbook_v1.md` § Partie 2 § 6 Postmortem

---

## Quand utiliser ce template

**Obligatoire** pour les incidents **SEV1** (critique : app down, fuite de données, dépense > 500 €/h) et **SEV2** (majeur : fonctionnalité-clé indisponible, faille de sécurité non-exploitée).

**Optionnel** pour SEV3 si l'incident contient des enseignements utiles.

**Délai de production** : 7 jours après résolution de l'incident.

**Posture** : *blameless*. On documente le SYSTÈME (gaps de monitoring, procédure manquante, hypothèses fausses), jamais les PERSONNES.

---

## Procédure

1. Copier ce template
2. Renommer en `notes-de-suivi/POSTMORTEM_INC-<YYYY-MM-DD>-<N>.md`
3. Remplir au fil de la résolution (chronologie en direct)
4. Finaliser dans les 7 jours
5. Commit + push
6. Présenter aux parties prenantes lors du prochain point hebdo
7. Tracer dans `DECISIONS.md` les actions correctives prises

---

# === DÉBUT DU TEMPLATE — copier ce qui suit ===

# Postmortem — INC-YYYY-MM-DD-N

**Date de l'incident** : YYYY-MM-DD
**Heure de détection** : HH:MM (TZ Europe/Paris)
**Heure de résolution** : HH:MM
**Durée totale** : ~ X heures
**Sévérité** : SEV1 / SEV2 / SEV3
**Statut** : Résolu / En cours / Récurrent
**Rédacteur principal** : [Nom + rôle]
**Validateurs** : [CTO] + [CEO]

---

## 1. Résumé exécutif *(3 à 5 lignes)*

> Quoi · Quand · Qui impacté · Comment résolu.
>
> Exemple : *Le 2026-05-10 entre 14:30 et 15:00, la CI GitHub Actions a échoué sur 5/6 jobs de PR #5. Aucun utilisateur impacté car le service n'était pas encore en production. Cause : pnpm 11 requiert Node 22, runner CI configuré sur Node 20. Résolu par alignement des versions Node (CI + package.json + .nvmrc + README) par [DEV Alex].*

---

## 2. Impact

| Dimension | Valeur |
|-----------|--------|
| **Utilisateurs impactés** | ex. 0 / 3 / Tous |
| **Données impactées** | ex. Aucune / Périmètre X |
| **Fonctionnalités indisponibles** | ex. login / sourcing / paiement / aucun |
| **Durée d'indisponibilité** | ex. 35 min |
| **Coût financier estimé** | ex. 0 € / 47 € (overage API) / N/A |
| **Notification CNIL nécessaire ?** | OUI / NON (cf. registre RGPD) |
| **Communication utilisateurs faite ?** | OUI / NON / Partielle |

---

## 3. Chronologie horodatée

*Format : `[HH:MM]` Description action / observation. T-0 = détection initiale.*

| Heure | Acteur | Événement |
|-------|--------|-----------|
| `14:25` | Système | Sentry capture première erreur 500 sur `/api/login` |
| `14:27` | [PS_OPERATOR Yann] | Reçoit alerte Slack `#edifio-sourcing-alerts` |
| `14:28` | [PS_OPERATOR] | Acknowledge dans le canal, ouvre l'incident INC-2026-05-10-01 |
| `14:30` | [PS_OPERATOR] | Triage : SEV2 (fonction clé impactée mais pas de fuite) |
| `14:32` | [DEV Alex] | Investigation logs Vercel, identifie cause potentielle |
| `14:45` | [DEV Alex] | Fix poussé sur `hotfix/INC-2026-05-10-01` |
| `14:48` | CI | Build vert, déploiement preview OK |
| `14:55` | [PS_OPERATOR] | Merge hotfix sur main, déploiement production |
| `15:00` | [PS_OPERATOR] | Vérification fonctionnement nominal, clôture incident |
| `15:05` | [CEO Marc] | Communication interne sur Slack AlyoS |

---

## 4. Root cause *(analyse technique)*

### Cause immédiate
*Ce qui a directement déclenché l'incident. Niveau syntaxique / configuration / commit.*

> Exemple : *Le runner GitHub Actions configuré sur `node-version: 20` est incompatible avec pnpm 11 qui requiert `node:sqlite` (builtin module Node 22+).*

### Cause profonde
*Pourquoi ce qui a déclenché a pu se produire. Niveau process / culture / outillage.*

> Exemple : *Pas de vérification systématique de l'alignement des versions Node entre CI / package.json engines / .nvmrc lors de l'ajout de dépendances. Le pin de pnpm 11 a été fait sans vérifier les prérequis runtime côté CI.*

### 5 pourquoi *(facultatif mais utile pour les cas complexes)*

1. **Pourquoi la CI a échoué ?** Parce que Node 20 ne supporte pas `node:sqlite`.
2. **Pourquoi pnpm utilise `node:sqlite` ?** Parce que pnpm 11 l'a intégré comme builtin pour optimiser le cache.
3. **Pourquoi avons-nous pnpm 11 ?** Parce qu'on l'a installé via Corepack sans pinner la version.
4. **Pourquoi pas de check pre-merge sur l'alignement ?** Parce que ce n'était pas dans notre review checklist.
5. **Pourquoi pas de review checklist exhaustive ?** Parce qu'on a démarré sans formaliser les checks récurrents.

→ **Action corrective racine** : créer une review checklist obligatoire à chaque PR qui touche les dépendances de build.

---

## 5. Détection

| Question | Réponse |
|----------|---------|
| **Comment a-t-on détecté ?** | Sentry / Vercel logs / utilisateur / monitoring auto |
| **Délai entre cause et détection** | ex. 2 min |
| **Aurait-on pu détecter plus tôt ?** | OUI/NON + comment |
| **L'alerte est-elle parvenue à la bonne personne ?** | OUI/NON |

---

## 6. Réponse

| Question | Réponse |
|----------|---------|
| **Le triage a-t-il classé la bonne sévérité ?** | OUI/NON |
| **Le bon playbook a-t-il été suivi ?** | OUI/NON (cf. `threat_model_runbook_v1.md`) |
| **Les escalades ont-elles fonctionné ?** | OUI/NON |
| **Le rollback était-il nécessaire ?** | OUI/NON |
| **A-t-il fonctionné ?** | OUI/NON |
| **Communication utilisateurs : ton/timing OK ?** | Évaluation honnête |

---

## 7. Ce qui a bien fonctionné

*Liste non exhaustive. Important de capter le positif — c'est ce qu'on veut systématiser.*

- ✅ Sentry a capturé l'erreur immédiatement
- ✅ Yann a acknowledgé en < 5 min
- ✅ Alex a diagnostiqué la cause en < 20 min
- ✅ Hotfix déployé en < 30 min
- ✅ Communication transparente à l'équipe AlyoS sans excès d'alarme

---

## 8. Ce qui a mal fonctionné

*Liste non exhaustive. Important sans blâmer les personnes.*

- ❌ Le check d'alignement Node n'existait pas dans la review checklist
- ❌ Aucun test pre-commit qui aurait détecté le mismatch
- ❌ Le message d'erreur Vercel initial n'était pas clair (digest masqué en prod)
- ❌ Nous n'avions pas de procédure formalisée pour le hotfix d'urgence

---

## 9. Actions correctives

| # | Action | Pilote | Échéance | Statut |
|---|--------|--------|----------|--------|
| 1 | Ajouter check pre-merge alignement Node CI/package.json/.nvmrc/README | [CTO Sophie] | J+14 | À faire |
| 2 | Test automatisé `pnpm install --frozen-lockfile` dans la CI matrix | [DEV Alex] | J+7 | À faire |
| 3 | Documenter procédure hotfix d'urgence dans `runbook` | [CTO Sophie] | J+14 | À faire |
| 4 | Exposer le digest serveur en prod via Sentry pour faciliter le diagnostic | [DEV Alex] | J+7 | À faire |
| 5 | Revue de la matrice runner Node × dépendances tous les 6 mois | [CTO Sophie] | Tous les 6 mois | Permanent |

Chaque action sera trackée dans `DECISIONS.md` avec son statut et son responsable. Revue lors du prochain point hebdo.

---

## 10. Apprentissages

*Synthèse en 3-5 points. Ce qu'on retient au-delà du fix lui-même.*

1. *Les versions runtime (Node, pnpm, etc.) doivent être alignées sur 4 endroits : CI, package.json engines, .nvmrc, README. Le moindre désalignement plante en cascade.*
2. *Les upgrades de gestionnaires de paquets (`pnpm`, `npm`) peuvent introduire des prérequis runtime cachés. À vérifier systématiquement avant d'updater.*
3. *Un fail rapide (échec en < 10 s) est souvent un échec setup, pas un échec de test. Cette heuristique de diagnostic gagne du temps.*
4. *L'option `--no-cache` au redeploy Vercel après changement d'env vars est obligatoire — ce n'est pas auto-magique.*

---

## 11. Diffusion

| Audience | Canal | Auteur |
|----------|-------|--------|
| Équipe DEV TEAM (Cowork) | `DECISIONS.md` + ce postmortem | [CTO Sophie] |
| Board (TEISSIER) | Synthèse 5 lignes dans Slack | [CEO Marc] |
| Utilisateurs AlyoS impactés | Communication interne déjà faite (cf. § 3) | [CEO Marc] |
| Public / clients externes | N/A pour MVP interne | — |

---

## 12. Suivi

- [ ] Action 1 close le YYYY-MM-DD
- [ ] Action 2 close le YYYY-MM-DD
- [ ] Action 3 close le YYYY-MM-DD
- [ ] Action 4 close le YYYY-MM-DD
- [ ] Revue de ce postmortem 30 jours après pour confirmer que les actions n'ont pas régressé

---

*Postmortem clôturé le YYYY-MM-DD par [Auteur]. À archiver dans `notes-de-suivi/`. Ce postmortem est blameless.*

# === FIN DU TEMPLATE ===
