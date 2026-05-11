# Templates Brevo — edifio Sourcing v1.0

**Auteur** : [CMO Léa Charpentier]
**Date** : 2026-05-07
**Statut** : Validés Board en Gate 4
**Destination** : Brevo (templateId distincts par template pour analytics séparés)

---

## Variables Handlebars communes

```
{{user.firstname}}, {{user.lastname}}, {{user.title}}
{{org.name}}
{{architect.firstname}}, {{architect.lastname}}, {{architect.title}}
{{tender.short_ref}}, {{tender.title}}, {{tender.summary}}, {{tender.summary_short}}
{{tender.amount}}, {{tender.deadline}}, {{tender.days_left}}
{{tender.platform}}, {{tender.dce_url}}, {{tender.app_url}}
{{tender.questions_deadline}}, {{tender.visit_date}}, {{tender.next_steps}}
{{tender.buyer}}
{{matching.score}}, {{matching.history_count}}
{{dossier.pieces_count}}, {{dossier.memo_pages}}, {{dossier.attri1}}
{{odoo.opportunity_url}}
{{cta.yes_url}}, {{cta.info_url}}, {{cta.no_url}}, {{cta.dossier_url}}
```

---

## D.1 — `architect_solicitation_TU`

**Sujet** : `[edifio Sourcing] On a un AO sur lequel on aimerait ton avis`

```
Bonjour {{architect.firstname}},

L'entreprise {{org.name}} envisage de répondre à un AO en cotraitance
et te propose le rôle de mandataire MOE. Tu peux répondre en un clic,
sans créer de compte.

▸ L'opération
{{tender.summary}}
Montant prévisionnel : {{tender.amount}}
Remise des plis : {{tender.deadline}}

▸ Pourquoi nous t'avons choisi
Ton score est de {{matching.score}}/1. Tu as déjà signé
{{matching.history_count}} opération(s) similaire(s) avec nous.

▸ Tes options
[Oui, je suis partant]   [Plus d'infos]   [Non, pas cette fois]

À très vite,
{{user.firstname}}
{{org.name}} — via edifio Sourcing
```

---

## D.2 — `architect_solicitation_VOUS`

**Sujet** : `[edifio Sourcing] Votre avis sur un appel d'offres ?`

```
Bonjour {{architect.title}} {{architect.lastname}},

L'entreprise {{org.name}} envisage de répondre à un appel d'offres
en cotraitance et vous propose le rôle de mandataire MOE. Vous pouvez
répondre en un clic, sans créer de compte.

▸ L'opération
{{tender.summary}}
Montant prévisionnel : {{tender.amount}}
Remise des plis : {{tender.deadline}}

▸ Pourquoi vous avez été choisi(e)
Votre score est de {{matching.score}}/1. Vous avez déjà signé
{{matching.history_count}} opération(s) similaire(s) avec nous.

▸ Vos options
[Oui, je suis partant(e)]   [Plus d'infos]   [Non, pas cette fois]

Bien cordialement,
{{user.firstname}} {{user.lastname}}
{{org.name}} — via edifio Sourcing
```

---

## D.3 — `architect_followup_TU`  *(J+3 sans réponse)*

**Sujet** : `[edifio Sourcing] Petite relance — AO {{tender.short_ref}}`

```
Hey {{architect.firstname}},

Je sais que tu es chargé. Je te relance juste sur l'AO
{{tender.summary_short}} — la remise est dans {{tender.days_left}} jours
et on aimerait savoir si tu nous accompagnes pour qu'on s'organise.

[Oui]   [Plus d'infos]   [Non]

Si c'est non, pas de souci — un mot et on passe à l'archi suivant.

À toi,
{{user.firstname}}
```

---

## D.4 — `architect_followup_VOUS`

**Sujet** : `[edifio Sourcing] Relance — AO {{tender.short_ref}}`

```
Bonjour {{architect.title}} {{architect.lastname}},

Je me permets de revenir vers vous concernant l'AO
{{tender.summary_short}}. La remise des plis est dans
{{tender.days_left}} jours et nous aimerions connaître votre
disponibilité pour finaliser notre dossier.

[Oui]   [Plus d'infos]   [Non]

Sans retour de votre part, nous nous tournerons vers un autre partenaire.

Bien à vous,
{{user.firstname}} {{user.lastname}}
```

---

## D.5 — `dossier_diffusion_TU`

**Sujet** : `[edifio Sourcing] Dossier prêt — AO {{tender.short_ref}}`

```
Salut {{architect.firstname}},

Le dossier est prêt. Lien sécurisé ci-dessous (valable 30 jours).

▸ Contenu
- {{dossier.pieces_count}} pièces
- Mémoire technique : {{dossier.memo_pages}} pages
- CERFA pré-remplis : DC1, DC2, DC4{{#if dossier.attri1}}, ATTRI1{{/if}}
- Attestations à jour

▸ Prochaines étapes
{{tender.next_steps}}

[Ouvrir le dossier]

Si quoi que ce soit te bloque, écris-moi.

{{user.firstname}}
```

---

## D.6 — `dossier_diffusion_VOUS`

**Sujet** : `[edifio Sourcing] Dossier prêt — AO {{tender.short_ref}}`

```
Bonjour {{architect.title}} {{architect.lastname}},

Le dossier est désormais prêt. Vous pouvez y accéder via le lien
sécurisé ci-dessous (validité 30 jours).

▸ Contenu
- {{dossier.pieces_count}} pièces
- Mémoire technique : {{dossier.memo_pages}} pages
- CERFA pré-remplis : DC1, DC2, DC4{{#if dossier.attri1}}, ATTRI1{{/if}}
- Attestations à jour

▸ Prochaines étapes
{{tender.next_steps}}

[Ouvrir le dossier]

Pour toute question, n'hésitez pas à revenir vers moi.

{{user.firstname}} {{user.lastname}}
```

---

## D.7 — `tender_summary_to_user` *(Mode Solo, interne, registre neutre)*

**Sujet** : `[edifio Sourcing] {{tender.short_ref}} — AO sélectionné en Solo`

```
Bonjour,

Vous avez sélectionné en Solo l'AO suivant :

▸ {{tender.title}}
Acheteur : {{tender.buyer}}
Montant prévisionnel : {{tender.amount}}
Remise des plis : {{tender.deadline}}
Plateforme source : {{tender.platform}}

▸ Lien DCE : {{tender.dce_url}}

▸ Échéances clés
- Questions : {{tender.questions_deadline}}
- Visite : {{tender.visit_date}}
- Remise : {{tender.deadline}}

▸ Opportunité Odoo : {{odoo.opportunity_url}}
▸ Fiche AO : {{tender.app_url}}

— edifio Sourcing
```

---

## D.8 — `architect_decline_acknowledgment` *(neutre court)*

**Sujet** : `[edifio Sourcing] Reçu — merci !`

```
Pas de souci. À très vite sur un autre AO.

— {{org.name}}
```

---

## Logique de sélection du registre

```typescript
// Pseudo-code à implémenter Gate 6 par [DEV Alex]
function pickTemplate(base: string, architect: Architect, override?: boolean): string {
  // base = "architect_solicitation" | "architect_followup" | "dossier_diffusion"
  if (base === "tender_summary_to_user" || base === "architect_decline_acknowledgment") {
    return base; // template unique neutre
  }
  const useTu = override ?? architect.tutoiement; // toggle envoi > BDD > défaut FALSE
  return `${base}_${useTu ? "TU" : "VOUS"}`;
}
```

---

*Templates v1.0 figés Gate 4. Toute évolution copy passe par PR validée par [CMO] avant déploiement Brevo.*
