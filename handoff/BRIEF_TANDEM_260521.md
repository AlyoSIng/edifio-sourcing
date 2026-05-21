# BRIEF — Lancement Module Tandem (PR prioritaire) puis Module Solo

**Date** : 2026-05-21
**Émetteur** : [CEO Marc] + [CTO Sophie]
**Destinataire** : Alex (dev) via Claude Code
**Décision Board** : Tandem prioritaire, Solo juste après. Sub-agents QA (Camille) + reviewer (Hugo) intégrés.

---

## Ordre de marche

1. **Module Tandem d'abord** — spec : `specs/module_tandem_engine_v1.md` (complète).
2. **Module Solo ensuite** — spec : `specs/module_solo_engine_v1.md`. Le connecteur
   Odoo (`createOdooOpportunity`) écrit dans Solo est **réutilisé** par Tandem au moment
   de l'acceptation architecte → coordonne les deux : écris le connecteur Odoo une fois,
   propre, partagé.
3. Maquettes de référence : `design/maquettes/maquettes_v4_sourcing_modules.html`
   (M-D1 short-list, M-D2 preview Brevo, M-B modale, M-C flux Solo/Odoo).

## Prompt à diffuser à Alex

```
Alex — on lance le Module Tandem (PR prioritaire), Solo juste après. Le Board a validé.
Deux renforts arrivent : Camille (QA) écrit/tient les tests E2E+RLS, Hugo (reviewer)
relit chaque PR avant validation Board.

CONTEXTE À LIRE
- specs/module_tandem_engine_v1.md (flow complet, matching V1, page tokenisée, webhook Brevo, relance J+3)
- specs/module_solo_engine_v1.md (connecteur Odoo partagé — à écrire proprement, réutilisé par Tandem)
- design/maquettes/maquettes_v4_sourcing_modules.html (M-B, M-C, M-D1, M-D2)
- design/copy/templates_brevo_v1.md (D.1–D.4, D.8) + specs/ai_prompts_v1.md (P5)
- CLAUDE.md (naming strict, RLS FORCE, audit immutable)

PÉRIMÈTRE PR TANDEM (branche feat/tandem-engine depuis feat/sourcing-mvp)
Implémente la spec module_tandem_engine_v1.md : matching V1, short-list UI (M-D1),
preview/édition Brevo TU/VOUS (M-D2), server action sendArchitectSolicitation + JWT 30j,
page tokenisée publique /archi/[token] (hors middleware), 3 actions réponse, webhook
Brevo, relance J+3. Au "accepted" → triggerOdooOpportunity (connecteur Solo).

DÉPENDANCE DONNÉE — IMPORTANT
Le matching a besoin d'architectes en base. Le Board fournit la liste réelle via
specs/architects_seed_template.csv. EN ATTENDANT : code avec un seed d'architectes
FICTIFS (3-5) pour développer et tester. Ne bloque pas sur la liste réelle ; elle
arrivera et remplacera le seed fictif.

CONTRAINTES
- RGPD : les architectes sont des personnes physiques externes → données perso.
  Hébergement EU strict (déjà le cas Supabase Frankfurt). Ajouter l'entrée au
  registre RGPD (specs/rgpd_registre_v1.md) : finalité = mise en relation cotraitance,
  base = intérêt légitime/relation pro, durée de conservation à acter.
- JWT architecte signé, 30j, révocable. Page tokenisée SANS login, HORS middleware domaine.
- Audit : action architect_solicit + architect_response. Si codes A manquants au
  registre audit_log_v1.md → handoff REQUEST, n'invente pas de code.
- Toute migration BDD : drizzle-kit generate puis revue CTO (ADR-013).
- Ne touche pas à DATABASE_URL / mot de passe BDD / middleware domaine.
- Aucun test désactivé pour verdir la CI (Camille veille).

MÉTHODE
- Plan court 3–7 étapes au Board AVANT de coder, attends l'OK.
- Camille (QA) écrit les tests E2E tandem.spec.ts (12 scénarios spec §4) + pgTAP RLS.
- Hugo (reviewer) relit la PR (sécurité JWT, fuite secret, RLS, idempotence) avant validation Board.
- DECISIONS.md + note de suivi en fin de PR. Commit via Yann (feat(tandem): ...).

Estimation spec : ~7 jours Tandem, ~5 jours Solo.
```

## Demandes au Board (handoff)

- **Liste architectes réelle** : remplir `specs/architects_seed_template.csv` (champs : nom, email, tu/vous, spécialités, départements, collabs passées, préféré). Bloquant pour le test réel, pas pour le code (seed fictif en attendant).
- **Accès Odoo** (pour Solo) : URL, base, compte service, clé API → `.env.local`.
- **Pipeline + étape Odoo** : confirmer « AO publics » / « Sourcing ».
- **Durée de conservation RGPD** des données architectes : à acter (Gate 8).
