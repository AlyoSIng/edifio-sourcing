# Plan d'offboarding utilisateur — edifio Sourcing v1.0

**Auteurs** : [CMO Léa] + [CTO Sophie]
**Date** : 2026-05-10
**Statut** : Procédure opérationnelle — à appliquer dès le premier départ d'un collaborateur AlyoS
**Référence** : `specs/rgpd_registre_v1.md` § 7 + `specs/audit_log_v1.md` § A12

---

## Quand appliquer cette procédure

| Situation | Action |
|-----------|--------|
| **Départ définitif** d'un collaborateur AlyoS | Désactivation immédiate + archivage |
| **Absence prolongée** (> 30 jours : congé maternité, formation, expatriation) | Suspension temporaire sans suppression |
| **Changement de rôle** (passage de user à viewer, ou inverse) | Modification rôle sans désactivation |
| **Soupçon de compromission** | Désactivation d'urgence + audit |

---

## Procédure standard — départ définitif

### Étape 1 — Pré-départ *(à J-7 si possible)*

Le manager AlyoS informe [CEO TEISSIER] ou [Admin AlyoS]. L'admin :

1. **Identifier les ressources** dont le collaborateur dispose :
   - Compte edifio Sourcing
   - AO en cours dans son pipeline
   - Architectes qu'il a sollicités
   - Documents qu'il a uploadés dans la bibliothèque
   - Sessions actives sur l'app

2. **Planifier le transfert** des AO actifs vers un autre collaborateur AlyoS *(via réassignation manuelle dans le Kanban)*.

3. **Sauvegarder localement** les documents personnels du collaborateur si pertinent.

### Étape 2 — Jour J du départ

1. **Désactiver le compte Supabase** *(via interface admin `/sourcing/admin/users`)* :
   - Click sur la ligne du collaborateur → menu actions → **« Désactiver »**
   - Le statut passe à `inactif`, plus aucun login possible
   - **Sessions actives invalidées** immédiatement (Supabase `signOut` global pour ce user)
   - Audit log : `action='membership_change' operation='deactivate'`

2. **Réassigner les AO en cours** :
   - Filtrer le pipeline par `assigned_to = <user.id>`
   - Pour chaque AO : éditer la fiche → changer `assigned_to` vers un autre user actif
   - Audit log par AO : `action='tender_reassign'`

3. **Notifier les architectes externes** *(si pertinent)* :
   - Si le collaborateur avait des sollicitations en cours avec des architectes
   - Mail Brevo automatique : *« Pour information, X (de l'entreprise AlyoS) ne suit plus ce dossier. Y prendra la suite. »*
   - Template : `architect_handover_notification` *(à créer si besoin réel)*

4. **Audit log de la désactivation** *(automatique)* :
   ```json
   {
     "action": "membership_change",
     "actor_id": "<admin>",
     "subject_id": "<user-departant>",
     "data": {
       "operation": "deactivate",
       "from_role": "user",
       "to_role": null,
       "reason": "departure",
       "approval_board_ref": "[email RH ou note interne]"
     }
   }
   ```

### Étape 3 — J+30 *(rétention)*

Pendant 30 jours après désactivation, **le compte reste désactivé mais non supprimé**. Cela permet :
- Récupération d'urgence si le collaborateur revient ou est consulté pour transition
- Auditabilité des actions historiques (qui a sélectionné quel AO)
- Conformité RGPD : la rétention reste justifiée par l'intérêt légitime opérationnel

### Étape 4 — J+30 *(action RGPD : pseudonymisation)*

Après 30 jours sans demande de réactivation :

1. **Pseudonymiser le compte** dans Supabase Auth :
   - Email → `<user-id>@deleted.alyosingenierie.fr`
   - Nom + prénom → `Utilisateur supprimé`
   - Mot de passe haché → invalidé (random)
2. **Conserver le compte** comme « tombstone » pour l'auditabilité :
   - Toutes les FK des autres tables continuent à pointer vers ce user (audit log, selections, etc.)
   - Mais les données personnelles ont disparu
3. **Audit log** : `action='data_delete' subject_type='user' soft_delete=true reason='offboarding_rgpd'`

### Étape 5 — Sur demande explicite *(droit à l'effacement RGPD)*

Si le collaborateur exerce son droit à l'effacement (rare en B2B, mais possible) :

1. Validation manuelle [CEO] + [CTO]
2. Procédure de purge complète :
   - DELETE de toutes les données personnelles
   - Audit log conservé (obligation légale)
   - Génération d'un **certificat d'effacement** PDF avec date + scope + signature
3. Délai cible : **< 30 jours** (obligation RGPD)
4. Cf. `rgpd_registre_v1.md` § Droit à l'effacement

---

## Procédure variante — Suspension temporaire

Pour les absences > 30 jours sans départ :

1. **Statut Supabase** : passe à `suspended` (intermédiaire entre actif et désactivé)
2. **Login bloqué** pendant la suspension avec message clair : *« Compte temporairement suspendu. Contactez votre admin. »*
3. **Données conservées intégralement** *(pas de pseudonymisation)*
4. **AO en cours** : non automatiquement réassignés (l'admin décide selon contexte)
5. **Audit log** : `action='membership_change' operation='suspend'` avec date de suspension prévue et date de retour estimée

### Réactivation après suspension

1. Admin click « Réactiver » dans `/sourcing/admin/users`
2. Le user retrouve son accès direct (pas de nouveau mot de passe nécessaire)
3. **MAIS** : si la suspension a duré > 90 jours, **forcer un changement de mot de passe** au prochain login *(par sécurité)*
4. Audit log : `action='membership_change' operation='reactivate'`

---

## Procédure variante — Changement de rôle

Pour modifier le rôle d'un user actif (ex. promotion user → admin) :

1. Admin click sur la ligne du user dans `/sourcing/admin/users`
2. Édition du rôle dans la modale
3. Sauvegarde → re-génération du JWT lors du prochain refresh (les permissions s'appliquent immédiatement)
4. Audit log : `action='membership_change' operation='role_change' data.from_role + data.to_role`
5. **Notification** au user (toast + email Resend si downgrade)

---

## Procédure variante — Désactivation d'urgence *(compromission soupçonnée)*

Si soupçon de compte compromis :

1. **Désactivation immédiate** (pas d'attente, pas de procédure pré-départ)
2. **Invalidation de TOUTES les sessions** Supabase pour ce user (revoke tous les refresh tokens)
3. **Audit log** : extraire toutes les actions de ce user sur les 30 derniers jours
4. **Communication** au [CEO Marc] + Board (TEISSIER) dans les 30 min
5. **Investigation** : déclencher le playbook « compte compromis » du `threat_model_runbook` § 5.4
6. **Évaluation RGPD** : si données client/personnelles consultées, notification CNIL sous 72h si risque

---

## Interface admin — actions disponibles dans `/sourcing/admin/users`

| Action | Effet | Audit log | Réversible ? |
|--------|-------|-----------|--------------|
| **Inviter** | Crée compte + mot de passe provisoire | `membership_change` operation=invite | Oui (annuler avant 1ʳᵉ connexion) |
| **Modifier rôle** | Change admin/user/viewer | operation=role_change | Oui (re-modifier) |
| **Renvoyer mot de passe provisoire** | Génère un nouveau provisional + envoi email | operation=resend_provisional | Auto-expire 24h |
| **Force reset password** | Envoie un lien reset au user | operation=force_reset | Le user choisit son nouveau |
| **Suspendre** | Bloque le login temporairement | operation=suspend | Oui (réactiver) |
| **Désactiver** | Bloque + invalide sessions | operation=deactivate | Oui pendant 30 jours |
| **Supprimer (pseudonymiser)** | Anonymise les données personnelles | operation=pseudonymize | **Non** |

---

## Checklist au départ effectif

À cocher dans une note de suivi `notes-de-suivi/OFFBOARDING_<user>_<YYYY-MM-DD>.md` :

- [ ] Pré-départ : transfert des AO en cours
- [ ] Pré-départ : sauvegarde locale des documents perso si applicable
- [ ] J0 : désactivation du compte Supabase
- [ ] J0 : invalidation des sessions actives
- [ ] J0 : notification architectes en cours si pertinent
- [ ] J0 : audit log de désactivation
- [ ] J0 : information au reste de l'équipe AlyoS (Slack/Teams)
- [ ] J+30 : pseudonymisation des données personnelles
- [ ] J+30 : génération du certificat d'effacement si demande RGPD
- [ ] J+30 : clôture du dossier d'offboarding

---

*Procédure à actualiser après chaque offboarding réel pour capter les apprentissages.*
