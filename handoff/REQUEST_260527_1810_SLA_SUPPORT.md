# REQUEST — Validation Board : libellé SLA support in-app

**Émetteur** : Cowork (CMO Léa) → Board  
**Date** : 2026-05-27  
**Zone** : 🟢 (cosmétique — pas de code critique)  
**Réf.** : `handoff/RESPONSE_260527_CONTENU_FORMATIONS_FAQ.md` § 4. Support

---

## Question

Le canal support est déjà livré (`/sourcing/profil/support` user + `/sourcing/superadmin/support` admin).  
Cowork propose d'afficher le libellé SLA suivant dans l'interface :

> **« Réponse sous 1 jour ouvré »**

En usage interne AlyoS Ingénierie, ce libellé est visible de tous les collaborateurs connectés.

## Board : valides-tu ce libellé ?

- [ ] Oui, afficher « Réponse sous 1 jour ouvré »
- [ ] Préférence : ne pas afficher d'engagement chiffré (laisser vide / générique)
- [ ] Autre libellé : _______________

## Impact code

Si validé, Alex ajoute 1 ligne dans `app_content` (clé `support_sla_label`) et l'affiche dans la page support user. Effort : < 1h.
