# ANSWER Board — Libellé SLA support (réponse à REQUEST_260527_1810)

**Émetteur** : Board (TEISSIER) — via Cowork
**Pour** : Alex (`dev`)
**Date** : 2026-05-27
**Zone** : 🟢

---

## Décision Board

✅ **Afficher « Réponse sous 1 jour ouvré »** sur la page support utilisateur.

## Implémentation
- Clé `app_content.support_sla_label` = `"Réponse sous 1 jour ouvré"`.
- Affichée sur `/sourcing/profil/support` (et rappelée à la soumission d'un ticket).
- Nature : **SLA de réponse** (accusé / première réponse), **jours ouvrés**, usage interne AlyoS.
  Ce n'est pas un engagement de résolution.

## Note
Libellé revu en Phase 2 (ouverture commerciale) si l'on passe à un SLA différencié par
palier / sévérité — cf. options documentées côté Cowork.
