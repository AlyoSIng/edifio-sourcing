# ADDENDUM SPEC — Registre tu/vous, accès liste architectes, éditeur de trame d'e-mail, personnalisation société

**Émetteur** : CTO Sophie + CMO Léa (Cowork)
**Destinataires** : Nadia (`dev_tandem`), Alex (`dev`), Théo (graphiste), Hugo (`reviewer`)
**Date** : 2026-05-25
**Origine** : demandes Board 2026-05-25.
**Rattachement** : étend le **Lot A** (architectes in-app, #43) et le module Tandem (sollicitation Brevo). Périmètre validé Board.
**Base réelle** : table `architects` (colonnes : `id, organization_id, firstname, lastname, title, email, phone, siret, specialty_codes[], geo_zones[], references, partnership_status, notes, tutoiement, created_at, updated_at`). 3440 architectes en prod.

---

## Exigence A — Registre tu/vous persistant par architecte

**Besoin** : pouvoir choisir, par architecte, tutoiement ou vouvoiement. Une fois le choix fait, il **s'applique à tous les messages futurs** vers cet architecte, **sauf modification ultérieure** de la donnée par le Board.

**Implémentation** :
- Champ **`architects.tutoiement`** (booléen, **déjà en base**) : `false` = vouvoiement (variante formelle A), `true` = tutoiement (variante B). **Défaut à la création = `false` (vouvoiement)**.
- L'envoi de sollicitation **lit ce champ** pour sélectionner automatiquement le template Brevo (`architect_solicitation_VOUS` / `_TU`).
- Éditable dans la **fiche architecte** (Exigence B). Persistant : aucune réinitialisation automatique.
- Audit log à la modification (traçabilité du changement de registre).

---

## Exigence B — Accès à la liste des architectes dans le menu (amender)

**Besoin** : le Board veut accéder à la **liste des architectes depuis le menu** pour la consulter et l'amender.

**Implémentation (sidebar)** : ajouter une entrée **« Architectes »** dans la section **PILOTAGE** (au-dessus/à côté de « Cotraitance »), visible admin.

Écran `/sourcing/architectes` (= livrable Lot A #43) :
- **Liste** : recherche + filtres (spécialité `specialty_codes`, zone `geo_zones`, `partnership_status`, registre tu/vous, actif/opposition). Tri, pagination (3440 lignes).
- **Fiche éditable** : `firstname, lastname, title, email, phone, siret, specialty_codes[], geo_zones[], references, partnership_status, notes`, **`tutoiement` (toggle tu/vous)**, état d'opposition (lecture). Toute modification → audit log.
- Création / désactivation (opposition) ; **pas de suppression dure** (RGPD : opposition = `active=false`/opposition token, conservation maîtrisée).
- ⚠️ **Données perso architectes** : RLS org-scopée, jamais d'export non tracé, jamais de commit du fichier source (`Contact_complete.xlsx` reste hors repo).

---

## Exigence C — Éditeur de TOUS les templates d'e-mail (avec variables) dans la configuration

**Besoin (élargi Board 2026-05-25)** : le Board veut **configurer la trame de TOUS les e-mails** (objet + corps + variables), pas seulement la sollicitation.

**Périmètre — inventaire complet des templates à rendre éditables** :

*Canal Brevo (architectes) — cf. `design/copy/templates_brevo_v1.md` (D.1→D.8)* :
- `solicitation_tu` / `solicitation_vous` (D.1 / D.2) — 1er contact.
- `relance_tu` / `relance_vous` (D.3 / D.4) — relance J+3.
- `diffusion_tu` / `diffusion_vous` (D.5 / D.6) — dossier diffusé à l'architecte.
- `decline_acknowledgment` (D.8) — accusé de refus courtois.

*Canal Resend (utilisateurs internes AlyoS)* :
- `tender_summary_to_user` (D.7) — récap AO (mode Solo).
- `user_provisional_password` — mot de passe provisoire (admin-create).
- `user_password_reset` — réinitialisation.
- `user_notification` — notifications internes.

> La liste fait foi depuis `templates_brevo_v1.md` + les e-mails Resend ci-dessus. Tout nouveau template suit le même mécanisme.

**Implémentation** :
- Nouvel écran **CONFIGURATION → « Modèles d'e-mail »** (`/sourcing/admin/modeles-email`) : liste de **tous** les templates ci-dessus, chacun éditable (objet + corps).
- Stockage : table **`message_templates`** (org-scopée : `organization_id`, `key` = identifiant du template ci-dessus, `channel` ∈ {`brevo`,`resend`}, `subject`, `body`, `updated_by`, `updated_at`, `version`). Régénérable/versionnée, **1 ligne par template par org**.
- **Variables disponibles propres à chaque template** : la palette s'adapte au type (ex. les e-mails utilisateurs n'ont pas `{{archi_*}}` mais `{{user_prenom}}`, `{{mot_de_passe_provisoire}}`, `{{lien_reset}}`, etc.). Documenter le jeu de variables autorisé par `key`.
- **Variables disponibles** affichées et insérables (palette) : `{{civilite}}, {{archi_prenom}}, {{archi_nom}}, {{cabinet}}, {{ao_objet}}, {{ao_acheteur}}, {{ao_departement}}, {{ao_cloture}}, {{lien_ao}}, {{lien_opposition}}`.
- **Garde-fous non négociables** : la **mention RGPD art. 14** (bloc C de la copie) et le **lien d'opposition** sont **obligatoires et non supprimables** sur le 1er envoi (validation à l'enregistrement). Le `{{lien_ao}}` (CTA) reste requis.
- Aperçu (preview) avec données d'exemple + envoi de test à une adresse interne.
- Synchronisation Brevo : la trame validée alimente le template Brevo correspondant (ou Brevo reçoit `subject`/`htmlContent` au moment de l'envoi — choix d'archi Nadia/Alex à acter).

---

## Exigence D — Personnalisation par société

**Besoin** : « personnaliser selon la société » — le contenu propre à l'émetteur (présentation, identité) ne doit pas être figé en dur.

**Implémentation (org-level, multi-tenant ready via `organization_id`)** :
- Écran **CONFIGURATION → « Présentation société »** (`/sourcing/admin/societe`) ou section de l'écran modèles.
- Champs org : **bloc de présentation** (les 4 puces « qui est AlyoS » — éditable), nom commercial, signature, coordonnées (agences, téléphone, e-mail de contact), logo.
- Variable de trame **`{{presentation_societe}}`** injectée dans les modèles (Exigence C) → la même trame sert plusieurs sociétés, chacune avec son bloc.
- Au MVP (mono-org AlyoS) : seed avec le bloc AlyoS actuel (4 puces : éco construction/MOE ; accessibilité-Ad'AP + AMO PPMS + démolition/PEMD/amiante + économie circulaire/réemploi ; BIM/ACCA ; 2 agences Normandie & PACA). Structure déjà org-scopée pour l'ouverture Phase 2 sans dette.

---

## Séquencement proposé

1. **Exigence B** (liste + fiche architectes, dont toggle `tutoiement`) — c'est le Lot A #43, prioritaire : débloque l'amendement par le Board et porte l'Exigence A.
2. **Exigence A** (lecture `tutoiement` à l'envoi) — quasi gratuite une fois B faite.
3. **Exigences C + D** (éditeur de trame + présentation société) — ensemble, car la trame consomme `{{presentation_societe}}`. Garde-fou RGPD impératif.

→ Board, ce découpage te convient ? L'accès « Architectes » au menu + fiche éditable (B) part en premier ; l'éditeur de trame + présentation société (C+D) suit.
