# RESPONSE — Contenu Tests guidés / Formation / FAQ / Support (réponse à REQUEST_260527_1600)

**Émetteur** : [CMO Léa] + [CEO Marc] (Cowork)
**Destinataire** : Alex (`dev`) / Claude Code
**Date** : 2026-05-27
**Réf.** : `handoff/REQUEST_260527_1600_CONTENU_FORMATIONS_FAQ.md`

> Rappel terminologie (décision Board 27/05) : **Mandataire / Cotraitance / Conception-Réalisation**
> (les termes « Solo » / « Tandem » ne sont plus utilisés).

---

## 1. Tests guidés
- **Format** : QCM / étapes — c'est déjà ce que gère le module superadmin `/sourcing/superadmin/guided-tests`
  (titre + étapes QCM 4 options + bonne réponse, ou questions ouvertes). On reste sur ce format,
  branché aux formations (un test par formation).
- **3-5 scénarios prioritaires** :
  1. Configurer mon profil de recherche (mots-clés / CPV / géo).
  2. Traiter ma file « AO du jour » (reporter / écarter, lire le brief, ouvrir l'annonce et le DCE).
  3. Répondre en **Cotraitance** (lire la shortlist d'architectes, envoyer la sollicitation).
  4. Monter un dossier : coffre documentaire BET (pièces + dates d'expiration).
  5. Gérer mes **Contacts** (Architectes / Bureaux d'Études / Entreprises-Majors).
- **Script réutilisable** : oui — voir `design/copy/script_video_demo_v1.md` (déroulé par scène,
  réutilisable comme trame des tests guidés et des formations).

## 2. Formation
- **Format** : vidéos courtes (8-12 min) en priorité, complétées de docs si besoin. Table `formations`
  déjà prête.
- **Base de contenu** : fournie par Cowork — 4 fiches dans `handoff/content-fixture.ts`
  (`FORMATIONS_FIXTURE`) : prise en main, file AO du jour, réponse en cotraitance, contacts & coffre BET.
  Les **URLs vidéo** (`TODO_URL`) sont à produire (cf. REQUEST storage Supabase) puis à renseigner.
- **Rédacteur** : Léa (CMO) pour titres / descriptions / FAQ ; les vidéos sont générées côté devs/Board.

## 3. Centre d'aide / FAQ
- **Contenu** : livré — 12 Q/R réparties en 5 catégories dans `design/copy/faq_v1.md` et
  `handoff/content-fixture.ts` (`FAQ_FIXTURE`). Catégories : `general`, `sourcing`, **`cotraitance`**
  (ex-`tandem` — renommée), `compte`, `facturation`.
- **Format** : page **interne**, accordéon groupé par catégorie (déjà en UI). **Pas** d'outil externe
  (Notion / HelpScout) — on garde tout dans l'app pour la cohérence et la maîtrise RGPD.
- **Action dev** : aligner la liste des catégories du superadmin/seed sur `cotraitance` (remplace `tandem`).

## 4. Support
- **Canal** : **formulaire in-app** — déjà livré (`/sourcing/profil/support` côté user,
  `/sourcing/superadmin/support` côté traitement). Pas de Slack/email externe au MVP.
- **Qui traite** : le superadmin (Steve) + les admins AlyoS, via la console superadmin.
- **SLA affiché** : proposition « **Réponse sous 1 jour ouvré** » (usage interne AlyoS).
  → Board : valides-tu ce libellé de SLA, ou préfères-tu ne pas afficher d'engagement chiffré ?

---

## Synthèse des livrables Cowork associés
| Besoin | Livrable Cowork |
|--------|-----------------|
| FAQ | `design/copy/faq_v1.md` + `FAQ_FIXTURE` |
| Formations | `FORMATIONS_FIXTURE` (URLs à produire) |
| Tests guidés / démo | `design/copy/script_video_demo_v1.md` |
| Plaquette / Roadmap / Vidéo (hébergement) | `handoff/REQUEST_260527_1700_STORAGE_SUPABASE_ASSETS.md` |

Une fois les `TODO_URL` renseignées (vidéos + assets Supabase), Alex insère le contenu en prod
(fixture ou saisie superadmin).
