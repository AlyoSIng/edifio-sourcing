# Plan de comm interne Gate 9 — Lancement edifio Sourcing chez AlyoS

**Auteur** : [CMO Léa Charpentier]
**Date** : 2026-05-10
**Statut** : Préparation Gate 9 — à exécuter en J-7 / J0 / J+30 du go-live
**Audience** : collaborateurs AlyoS Ingénierie (dirigeants, chargé(e)s d'affaires, équipe technique, support)
**Posture** : c'est un **outil interne**, pas un produit grand public. Pas de fanfare. Posture pragmatique, terrain.

---

## 1. Objectifs de la comm

1. **Faire connaître** l'existence et l'utilité d'edifio Sourcing
2. **Convaincre** les bons profils de l'essayer (Patrick, Sandrine)
3. **Former** sans hémorragie de temps
4. **Collecter** les retours pour la roadmap Phase 2
5. **Faire confiance** : pas d'hype, des résultats mesurés

---

## 2. Calendrier de communication

### J-7 — Annonce préalable

**Canal** : email AlyoS interne (Resend) + canal habituel (Slack / Teams / WhatsApp pro, selon convention AlyoS)

**Objet** : *« Bientôt : on automatise notre sourcing AO »*

**Corps** :

> *Bonjour à toutes et tous,*
>
> *Dans 7 jours, on déploie en interne un nouvel outil construit par l'équipe pour l'équipe : **edifio Sourcing**.*
>
> *Concrètement : chaque matin, vous recevrez un digest des AO publics qui matchent nos critères. Plus besoin de tourner manuellement sur BOAMP et compagnie. Vous sélectionnez en un clic, et pour les AO en cotraitance, l'app mobilise un architecte automatiquement par mail.*
>
> *Pour celles et ceux qui prépareront le dossier de réponse : un copilote IA lit le RC, génère la checklist, pré-remplit les CERFA et rédige le mémoire technique. Vous validez, vous signez, vous remettez.*
>
> *Le mardi 17 juin à 10h, je vous fais une démo d'1h dans la salle de réunion. Invitation calendrier à suivre.*
>
> *Patrick — Dirigeant*

→ Sous-entend : c'est porté par la direction, c'est sérieux, on prendra le temps de le présenter.

---

### J-3 — Rappel + calendar invite

**Canal** : invitation calendrier (Outlook / Google Calendar AlyoS) + reminder Slack

**Objet** : *« Démo edifio Sourcing — mardi 17 juin 10h, salle de réunion »*

**Corps** :

> *Petit rappel : démo edifio Sourcing mardi 10h en salle de réu.*
>
> *Au programme (1h max) :*
> *— 10 min : ce que ça change concrètement pour vous (avant / après)*
> *— 20 min : démo des 3 parcours-clés (sourcing du jour, sélection Solo / Tandem, préparation IA)*
> *— 15 min : questions et discussion*
> *— 15 min : ceux qui veulent on lance les comptes et on fait un tour ensemble*
>
> *Pas besoin de prépa de votre côté. Venez avec vos questions.*

---

### J0 — Go-live

**Canal** : email (Resend) + Slack / Teams + démo en présentiel

**Email** — objet : *« edifio Sourcing est ouvert — votre lien »*

**Corps** :

> *Ça y est, c'est ouvert.*
>
> *Votre lien : https://edifio-sourcing.vercel.app (ou custom domain selon Gate 7)*
>
> *À votre première connexion :*
> *1. Cliquez sur le lien*
> *2. Saisissez votre email AlyoS — vous recevrez un magic-link*
> *3. Cliquez sur le lien dans le mail — vous êtes connecté*
>
> *À partir de demain matin 6h30, vous recevrez le premier digest sourcing dans votre boîte mail et en push si vous avez installé la PWA sur votre téléphone.*
>
> *Une question ? Une bizarrerie ? → Léa (moi) sur Slack ou direct par mail.*

**Lien vers** : guide utilisateur 1 page (cf. § 4).

---

### J+1 (lendemain) — Premier digest réel

C'est le test grandeur nature. Le système envoie le premier digest à 6h30. **Léa** vérifie discrètement dans la matinée que les emails sont bien arrivés, pas en spam, pas de bug visible.

→ Si bug : un mot dans Slack en milieu de matinée, transparence totale.

---

### J+7 — Premier retour

**Canal** : Slack / Teams, message court de Léa

> *Hello l'équipe — première semaine d'edifio Sourcing.*
>
> *Quelques chiffres pour vous :*
> *— N AO sourcés cette semaine*
> *— N sélectionnés (Solo : N · Tandem : N)*
> *— N architectes sollicités · N réponses positives*
>
> *Si vous avez 5 minutes : qu'est-ce qui vous a plu, qu'est-ce qui vous a manqué, qu'est-ce qui vous a énervé ? J'ouvre un canal Slack dédié `#edifio-sourcing-retours`.*

---

### J+30 — Bilan formel

**Canal** : réunion d'équipe 30 min + suivi écrit

Léa et Patrick présentent :
- Les 4 KPIs MVP réels vs les cibles Gate 1 (taux sélection, taux Tandem, délai sourcing-diffusion, NPS J+30)
- 3 témoignages utilisateurs (qualitatif)
- Les 3 prochaines évolutions priorisées avec l'équipe

À ce moment, Marc (CEO) déclenche la **revue Gate 9** formelle.

---

## 3. Documentation utilisateur

À produire avant Gate 9 :

### 3.1. Guide utilisateur 1 page (à imprimer si nécessaire)

Format A4 recto-verso. Contenu :

**Recto** :
- Bandeau « edifio Sourcing — Aide-mémoire »
- Comment se connecter (en 3 étapes illustrées)
- Les 3 vues principales : AO du jour, Pipeline, Fiche AO
- Les 3 actions : Sélectionner, Différer, Rejeter

**Verso** :
- Mode Solo vs Mode Tandem (quand utiliser quoi)
- Préparation dossier IA en 4 étapes
- À qui poser une question (`leacharpentier@alyosingenierie.fr`)

→ Réutilise les maquettes M1, M2, M6 en miniatures avec annotations.

### 3.2. Vidéo tuto 5 minutes (optionnel mais recommandé)

À tourner avec Patrick et Sandrine sur un cas réel. Hébergement YouTube en non répertorié, lien partagé en interne. Format informel.

### 3.3. FAQ (3-5 questions)

À publier sur la page `/help` de l'app :
1. *Comment changer les critères de sourcing ?* → Paramètres → Profil de recherche
2. *Pourquoi cet AO n'est pas remonté ?* → Vérifier la config du profil, ou utiliser le bouton « Sourcing manuel »
3. *Comment un architecte se désinscrit ?* → Lien tokenisé dans chaque mail, page « Mes données »
4. *Quand est-ce que je dois passer en Tier Studio ?* → Dès le 1ᵉʳ AO avec un RC ≥ 30 pages, le mémoire généré paye sa licence
5. *Que faire si l'IA hallucine ?* → Toujours valider pièce par pièce. La revue manuelle est obligatoire.

---

## 4. Formation utilisateurs

### Format J0 — Démo collective 1h

Animée par : [CMO Léa] + [CEO Marc] (selon dispo)

**Plan** :
1. **10 min — Le pourquoi** : combien de temps on perd aujourd'hui, combien on espère gagner
2. **30 min — Démo live des 3 parcours** : Solo, Tandem accepté, Préparation IA
3. **15 min — Lancement** : on crée les comptes, on fait un premier tour ensemble
4. **5 min — Modalités support** : à qui demander, comment remonter un bug

### Format J+1 à J+7 — Accompagnement individuel

Léa passe 30 min avec chacun des 2-3 utilisateurs principaux (Patrick, Sandrine, chargé(e) d'affaires) pour s'assurer que :
- Le compte fonctionne
- La PWA est installée sur leur téléphone
- Le profil de recherche est correctement configuré
- La base architectes initiale est importée (via CSV ou saisie manuelle)

### Format permanent — Office hours

Léa réserve **30 min tous les vendredis matin** comme créneau ouvert pour les questions edifio Sourcing. Pas besoin de RDV — on passe à son bureau.

---

## 5. Plan de support

### Niveau 1 — Question utilisateur banale

**Premier point de contact** : Léa (Slack `#edifio-sourcing` + email + bureau)
**SLA** : réponse dans la journée

### Niveau 2 — Bug fonctionnel ou question technique

**Escalade** : Léa → Alex (Claude Code) via un ticket GitHub Issue
**SLA** : prise en compte 24h, résolution selon criticité

### Niveau 3 — Incident bloquant (app down, fuite de données)

**Escalade** : alerte directe Patrick (CEO) + Sophie (CTO Cowork)
**Procédure** : incident response (à formaliser en Gate 8)
**SLA** : prise en compte < 1h, résolution selon nature

---

## 6. KPIs de la comm

À mesurer en J+30 pour la rétrospective Gate 9 :

| Indicateur | Cible | Source |
|------------|-------|--------|
| Taux d'utilisation hebdomadaire | ≥ 80 % des utilisateurs cibles connectés | Logs auth |
| Taux d'AO sélectionnés via app vs voie ancienne | ≥ 60 % | Comparaison Odoo |
| Nombre de retours qualitatifs | ≥ 5 | Canal Slack `#edifio-sourcing-retours` |
| NPS interne à J+30 | ≥ 40 | Sondage 1 question post-démo |

---

## 7. Risques de la phase de lancement

| Risque | Mitigation |
|--------|------------|
| Aucun architecte ne répond la première semaine | Sandrine pré-mobilise 2 archi connus pour test grandeur nature |
| L'IA produit un mémoire de qualité moyenne sur le premier RC | On garde une attente raisonnable : « copilote » pas « remplaçant ». Validation pièce par pièce obligatoire. |
| Sourcing rate des AO connus que Patrick suivait à la main | Comparer pendant 2 semaines : si l'IA rate, calibrer les profils en réunion équipe |
| Bug bloquant au go-live | Alex et Yann en astreinte J0 + J+1, plan de rollback documenté Gate 8 |
| Désintérêt après l'effet nouveauté | Le bilan J+30 doit prouver les KPIs. Si raté, retour au tableau de bord en revue. |

---

*Plan de comm à activer à T-7 du go-live Gate 9. Léa pilote, Patrick endosse, Marc cadre.*
