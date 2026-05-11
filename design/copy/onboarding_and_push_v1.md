# Copy onboarding + push notifications — edifio Sourcing v1.0

**Auteur** : [CMO Léa Charpentier]
**Date** : 2026-05-10
**Statut** : Strings figées MVP — à intégrer par [DEV Alex] dans `apps/sourcing/src/lib/copy/onboarding.ts` et `push.ts`
**Ton** : direct, chaleureux, vouvoiement par défaut en interne (le tutoiement est réservé à la sollicitation architecte, cf. Gate 4)

---

## 1. Séquence onboarding first-time user (5 étapes)

Affichée au premier login d'un utilisateur AlyoS dans edifio Sourcing. Skipable à tout moment.

### Étape 1 — Bienvenue

- **Titre** : « Bienvenue dans edifio Sourcing »
- **Sous-titre** : « Votre copilote pour les appels d'offres publics. On vous montre rapidement comment ça marche. »
- **CTA primaire** : « Commencer le tour »
- **CTA secondaire (skip)** : « Plus tard »

### Étape 2 — Le profil de recherche

- **Titre** : « D'abord, dites-nous ce que vous cherchez »
- **Texte** : « Créez un profil avec vos mots-clés, codes CPV, zones géographiques. edifio Sourcing scanne BOAMP, PLACE, Francmarchés et MP.info chaque matin selon vos critères. »
- **CTA** : « Créer mon premier profil »

### Étape 3 — La vue « AO du jour »

- **Titre** : « Chaque matin, votre digest »
- **Texte** : « À 6h30, on vous envoie les AO qui matchent. Vous les retrouvez ici, triés par score de pertinence. Trois actions : sélectionner, différer, rejeter. »
- **CTA** : « Compris »

### Étape 4 — Solo / Tandem

- **Titre** : « Deux façons de répondre »
- **Texte** : « **Solo**, vous répondez en propre, on crée l'opportunité dans Odoo. **Tandem**, on vous propose 3 architectes scorés et on les sollicite par mail avec un lien d'un clic. »
- **CTA** : « Compris »

### Étape 5 — Le copilote IA

- **Titre** : « Le dossier préparé pour vous »
- **Texte** : « En mode Studio, edifio Sourcing analyse le RC, génère la checklist des pièces, pré-remplit les CERFA et rédige le mémoire technique pondéré sur les critères de jugement. Vous validez, vous signez, vous remettez. »
- **CTA primaire** : « C'est parti »
- **CTA secondaire** : « Revoir le tour plus tard »

---

## 2. Tooltips contextuels (apparaissent au hover ou au focus)

### Vue « AO du jour »

| Élément | Tooltip |
|---------|---------|
| Score (badge rouge) | « Score de pertinence IA (0-100). Calculé sur mots-clés, CPV, géo, montant et historique de vos sélections. » |
| Filtre tri | « Triez par score, échéance ou montant. Le filtre est conservé entre vos sessions. » |
| Bouton « Sélectionner » | « Bascule l'AO en pipeline. Vous choisirez ensuite Solo ou Tandem. » |
| Bouton « Différer » | « Reporte l'AO de 24h. Il reviendra dans le digest de demain. » |
| Bouton « Rejeter » | « Rejette l'AO. Un motif vous sera demandé pour améliorer le scoring. » |

### Modale Solo / Tandem

| Élément | Tooltip |
|---------|---------|
| Score MOE | « Score combiné de matching architecte sur cet AO. Plus c'est haut, plus le Tandem est recommandé. » |
| Toggle TU/VOUS | « Choisissez le registre du mail Brevo à l'architecte. Le réglage est pré-rempli selon la fiche archi et modifiable. » |

### Kanban

| Élément | Tooltip |
|---------|---------|
| Toggle Groupé/Détaillé | « Vue groupée : 3 colonnes (En cours / Diffusé / Clôturé). Vue détaillée : 10 colonnes par statut. » |
| Drag & drop | « Glissez une carte pour changer son statut. L'action est tracée dans la timeline de l'AO. » |
| Compteur colonne | « Nombre d'AO actuellement dans cette étape. » |

### Page tokenisée architecte (vue côté admin)

| Élément | Tooltip |
|---------|---------|
| Token actif | « Lien sécurisé valide jusqu'au {{date}}. Cliquez pour révoquer manuellement. » |
| Statut Brevo | « État du mail : delivered (envoyé), opened (ouvert), clicked (cliqué), bounced (rejeté). » |

### Side-by-side dossier IA

| Élément | Tooltip |
|---------|---------|
| Provenance page | « Numéro de page du RC d'où provient cette extraction. Cliquez pour ouvrir le PDF à cette page. » |
| Validation pièce | « Validez chaque pièce avant diffusion. La revue manuelle est obligatoire en Phase 1. » |

---

## 3. Push notifications PWA

### Format

Toutes les push respectent le format suivant :
- **Titre** : 30-50 caractères, sans emoji
- **Body** : 80-140 caractères, direct
- **Action principale** : 1 bouton ou tap → ouvre la vue concernée
- **Tag** : permet de regrouper les notifications du même type (ex. `ao_du_jour:{{date}}`)

### Catalogue

| # | Type | Titre | Body |
|---|------|-------|------|
| N1 | AO du jour | « {{N}} AO pour vous ce matin » | « Profil {{profile}}. {{top_score}} en tête. Tap pour voir le digest. » |
| N2 | Score exceptionnel | « Pépite détectée : score {{score}}/100 » | « {{tender_short}} - {{amount}}. Remise dans {{days}} jours. » |
| N3 | Architecte a répondu OUI | « {{architect}} accepte le Tandem » | « Sur l'AO {{tender_ref}}. Vous pouvez démarrer la préparation du dossier. » |
| N4 | Architecte a répondu NON | « {{architect}} indisponible » | « Sur l'AO {{tender_ref}}. Voulez-vous proposer le n°2 de la short-list ? » |
| N5 | Architecte demande Plus d'infos | « {{architect}} demande des précisions » | « Sur l'AO {{tender_ref}}. Vérifiez votre boîte mail. » |
| N6 | Dossier IA prêt à revoir | « Dossier prêt pour revue » | « {{tender_ref}}. {{pieces_count}} pièces, mémoire de {{pages}} pages. Tap pour ouvrir. » |
| N7 | Alerte échéance J-7 | « Échéance dans 7 jours » | « {{tender_ref}}. Remise des plis le {{deadline_date}}. Statut actuel : {{status}}. » |
| N8 | Alerte échéance J-3 | « ⚠ Plus que 3 jours » | « {{tender_ref}}. Remise le {{deadline_date}}. {{remaining_actions}} action(s) à finaliser. » |
| N9 | Alerte échéance J-1 | « URGENT — Remise demain » | « {{tender_ref}}. Tout doit être prêt avant {{deadline_time}}. Tap pour la checklist. » |
| N10 | Attestation expire J-30 | « Attestation à renouveler » | « {{attestation_name}} expire dans 30 jours. Tap pour mettre à jour la bibliothèque. » |
| N11 | Attestation expire J-7 | « ⚠ Attestation expire bientôt » | « {{attestation_name}} expire dans 7 jours. Cela peut bloquer une remise. » |
| N12 | Diffusion par user → admin alerte | « Dossier diffusé par {{user}} » | « {{user}} a envoyé le dossier {{tender_ref}} à {{architect}}. Vous pouvez annuler dans les 5 min. » |

### Préférences utilisateur

Dans Paramètres → Notifications, l'utilisateur peut activer/désactiver chaque type (N1 à N12). Par défaut : N1, N2, N3, N4, N5, N6, N7, N8, N9, N10, N11, N12 toutes activées (l'utilisateur peut couper N1 s'il veut juste les pépites).

### Tag de déduplication

Les notifications du même type doivent remplacer les précédentes (pas d'empilement). Exemple : N1 du 2026-05-11 remplace N1 du 2026-05-10 si pas encore consultée.

---

## 4. États d'erreur (toasts in-app)

| Cas | Texte |
|-----|-------|
| Sourcing batch échoué | « Le sourcing du {{date}} a échoué. L'équipe technique est notifiée. Réessai automatique à {{next_time}}. » |
| Envoi Brevo échoué | « L'envoi à {{architect}} a échoué. Réessayer ou solliciter le n°2 ? » |
| Odoo sync échouée | « La synchronisation Odoo a échoué. Vos données sont sauvegardées localement. Réessayer ? » |
| IA timeout | « L'analyse IA a dépassé le délai. Réessayez dans quelques minutes. » |
| Quota Studio dépassé | « Vous avez utilisé vos 20 AO Studio inclus ce mois. Les analyses supplémentaires sont facturées 1,50 € l'unité. Continuer ? » |
| Token archi expiré | « Le lien a expiré. Demandez à l'admin un nouveau lien. » |

---

## 5. Empty states (vues sans données)

| Vue | Texte |
|-----|-------|
| AO du jour vide | « Pas d'AO ce matin. C'est rare, ça se fête. Prochain run : demain à 6h30. » |
| AO du jour erreur sourcing | « Le sourcing a échoué cette nuit. L'équipe technique est notifiée. Retentez le run manuellement ? » |
| Pipeline Kanban vide | « Aucun AO dans le pipeline pour le moment. Sélectionnez un AO depuis le digest. » |
| Base architectes vide | « Aucun architecte enregistré. Importez votre fichier CSV/XLSX ou ajoutez le premier manuellement. » |
| Bibliothèque vide | « Votre bibliothèque est vide. Ajoutez vos présentations, attestations, références et CV pour que l'IA puisse les réutiliser. » |
| Notifications vides | « Aucune notification. Vous êtes à jour. » |

---

*Toutes les strings sont en français. Code interne en anglais. À internationaliser si Phase 2 internationale (peu probable à court terme).*
