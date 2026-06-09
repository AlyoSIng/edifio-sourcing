# Communiqué post-deploy 10 juin 2026 (récap utilisateurs)

**Sujet** : edifio Sourcing — nouvelles fonctionnalités disponibles (Salve U + sécurité renforcée)

---

Bonjour à toutes et tous,

La mise à jour d'edifio Sourcing est en ligne. Voici ce qui change concrètement pour vous.

**Apprentissage par écartement (Salve U)**

Quand vous écartez un AO, vous choisissez désormais un motif dans une liste structurée (6 motifs : hors zone, hors compétence, calendrier serré, marché trop petit, marché trop gros, autre) au lieu de saisir du texte libre. À partir de 3 occurrences du même motif sur 30 jours glissants, edifio Sourcing vous propose automatiquement un ajustement de votre profil de recherche (élargir une zone, retirer un CPV, etc.).

Important : « Écarter » alimente l'algorithme d'apprentissage, « Exclure » reste neutre (pas d'impact sur les suggestions). Choisissez le bon bouton selon que vous voulez ou non que l'AO compte dans vos statistiques.

**Monitoring du cron quotidien**

Le cron qui rapatrie les AO chaque matin est désormais surveillé. Sébastien reçoit une alerte mail si l'exécution échoue, ce qui nous évite de découvrir le problème en fin de journée.

**Sécurité multi-tenant renforcée**

Nous avons préparé l'ouverture progressive aux PROTECT en cours d'onboarding : RLS forcé sur 4 tables supplémentaires, suppression de plusieurs portes dérobées historiques, fin du fallback automatique sur l'organisation AlyoS. Côté utilisateur, rien à faire : aucune migration manuelle requise.

Pour toute question, écrivez-moi directement.

Steve TEISSIER — AlyoS Ingénierie
