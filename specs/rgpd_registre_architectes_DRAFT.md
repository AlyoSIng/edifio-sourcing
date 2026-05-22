# BROUILLON — Entrée registre RGPD : base architectes / cotraitants

**Statut** : BROUILLON — à valider par le Board en Gate 8 (audit sécu + RGPD)
**Date** : 2026-05-21
**Auteur** : [CTO Sophie]
**À intégrer dans** : `specs/rgpd_registre_v1.md` après validation
**Déclencheur** : import de `Contact_complete.xlsx` (~3805 cabinets, ~1900 emails, ~1750 noms de dirigeants) + module Tandem

> Champs entre crochets `[à confirmer Board]` = décisions qui t'appartiennent.

---

## Traitement n°[X] — Gestion de la base architectes et sollicitation en cotraitance

| Rubrique | Contenu |
|----------|---------|
| **Finalité principale** | Identifier et solliciter des architectes / cabinets pour répondre en cotraitance à des appels d'offres publics de maîtrise d'œuvre. |
| **Finalités secondaires** | Matching de pertinence (spécialité, zone), suivi des sollicitations et réponses, historique de collaboration. |
| **Base légale** | Intérêt légitime (art. 6.1.f RGPD) — relation professionnelle B2B entre AlyoS Ingénierie et des cabinets d'architecture. *(Pas de consentement requis pour une prospection/mise en relation B2B ciblée, sous réserve du droit d'opposition.)* |
| **Catégories de personnes** | Dirigeants et contacts de cabinets d'architecture (personnes physiques exerçant une activité professionnelle). |
| **Catégories de données** | Identité pro (nom du dirigeant/contact, nom du cabinet), coordonnées pro (email, téléphone, site, ville, CP), données entreprise (SIREN, effectif, CA, date de création), données métier (spécialités, départements d'intervention), historique de sollicitations/collaborations. **Aucune donnée sensible.** |
| **Source des données** | Export Odoo AlyoS (`Contact_complete.xlsx`) — données collectées via sourcing/enrichissement antérieur + bases publiques (SIRENE). |
| **Destinataires** | Utilisateurs internes AlyoS Ingénierie habilités (rôle admin/sourcing). Aucune transmission à des tiers. Sous-traitants techniques : Supabase (hébergement BDD, UE/Frankfurt), Brevo (envoi des sollicitations, UE). |
| **Transferts hors UE** | Aucun. Hébergement Supabase Frankfurt (UE), Brevo (UE), Vercel (région UE). |
| **Durée de conservation** | `[à confirmer Board]` — proposition : **3 ans** après le dernier contact/sollicitation sans suite, puis anonymisation ou suppression. Architecte ayant collaboré : conservation pendant la durée de la relation + durée légale comptable. |
| **Droits des personnes** | Accès, rectification, opposition, effacement. **Mise en œuvre** : un architecte peut être **désactivé** (`active=false`, retiré du matching et des sollicitations) et **supprimé** sur demande via l'écran admin. Email de sollicitation Brevo : lien de désinscription / mention « ne plus me solliciter ». |
| **Mesures de sécurité** | RLS Postgres FORCE (cloisonnement par organisation), accès réservé aux rôles habilités (middleware `@alyosingenierie.fr`), audit log immuable des éditions (`architect_edit`), fichier source PII jamais committé en Git, secrets en `.env.local`/Vercel, chiffrement en transit (TLS) et au repos (Supabase). |
| **Mention d'information** | `[à prévoir]` — mention dans le 1er email de sollicitation expliquant l'origine des données + droit d'opposition (cf. obligation d'information art. 14 RGPD pour données non collectées directement). |

---

## Points d'attention spécifiques (art. 14 — données non collectées auprès de la personne)

Les données venant d'un export/enrichissement (et non de l'architecte lui-même), l'obligation d'information de l'article 14 s'applique :

- **À acter `[Board]`** : inclure dans le **premier mail de sollicitation Brevo** un court paragraphe d'information (qui est AlyoS, pourquoi on a ses coordonnées, finalité, droit d'opposition + lien). Léa rédige, à valider Gate 8.
- Tenir à jour la liste des sous-traitants (Supabase, Brevo, Vercel) avec leurs garanties (DPA).

---

## Décisions attendues du Board (Gate 8)

1. Valider la **durée de conservation** (proposition : 3 ans sans suite).
2. Valider la **base légale** intérêt légitime (vs consentement) — recommandation CTO : intérêt légitime B2B, suffisant ici.
3. Valider la **mention d'information** dans le mail de sollicitation (rédaction Léa).
4. Confirmer la liste des **sous-traitants** et l'existence des DPA (Supabase, Brevo, Vercel).

---

*Brouillon. Ne remplace pas le registre tant que le Board n'a pas validé en Gate 8.*
