# Collecte des paramètres Odoo — module Solo / Tandem (création d'opportunités)

**Date** : 2026-05-21
**Pour** : Board (à remplir) → Alex (consomme)
**Objet** : tout ce dont edifio Sourcing a besoin pour créer des opportunités dans l'Odoo d'AlyoS via XML-RPC.

> ⚠️ **SÉCURITÉ — à lire avant de remplir.**
> - Ne **colle JAMAIS la clé API ni un mot de passe dans le chat Cowork** ni dans ce fichier s'il doit être committé.
> - Les secrets (`ODOO_API_KEY` notamment) se renseignent **directement** dans `.env.local` (jamais committé) et dans les variables d'environnement Vercel. Ce fichier-ci ne contient que des infos **non secrètes** (URL, nom de base, version, noms de pipeline…).
> - La clé API Odoo se génère dans Odoo : *Préférences utilisateur → Compte → Sécurité du compte → Clé API*. Préfère une **clé dédiée à un compte de service** (pas ton compte perso).

---

## 1. Connexion XML-RPC *(non secret sauf clé)*

| Paramètre | À fournir | Exemple |
|-----------|-----------|---------|
| `ODOO_URL` | URL de l'instance | `https://alyos.odoo.com` ou `https://erp.alyosingenierie.fr` |
| `ODOO_DB` | Nom de la base | `alyos-production` |
| `ODOO_USER` | Login du **compte de service** | `integration@alyosingenierie.fr` |
| `ODOO_API_KEY` | **Clé API** → directement dans `.env.local` / Vercel, **pas ici** | *(secret)* |
| Version Odoo | 14 / 15 / 16 / 17 / 18 ? | impacte les champs dispo |
| Hébergement | Odoo Online (SaaS) / Odoo.sh / self-hosted ? | impacte l'accès XML-RPC |
| XML-RPC activé ? | oui/non (souvent oui par défaut) | endpoint `/xmlrpc/2/common` + `/xmlrpc/2/object` |

## 2. Cible CRM

| Question | À fournir |
|----------|-----------|
| Modèle cible | `crm.lead` (opportunité) — confirmer |
| **Pipeline / équipe commerciale** (`crm.team`) où créer l'opportunité | nom exact, ex. « AO publics » |
| **Étape de départ** (`crm.stage`) | nom exact, ex. « Sourcing » / « Nouveau » |
| **Étape Tandem** (réponse cotraitance) — même pipeline ou autre étape ? | ex. « Réponse cotraitance » |
| **Commercial à assigner** (`user_id`) | qui est responsable par défaut ? |
| Tags Odoo à poser (`tag_ids`) | existe-t-il des tags par typologie/CPV ? |
| Source/Medium (`source_id`/`medium_id`) | créer une source « edifio Sourcing » pour tracer l'origine ? oui/non |

## 3. Mapping des champs *(à confirmer / compléter)*

| Champ Odoo (`crm.lead`) | Source edifio | OK ? |
|--------------------------|---------------|------|
| `name` | objet de l'AO (≤120 car.) | ☐ |
| `partner_name` | acheteur public (texte) | ☐ |
| Faut-il créer un `res.partner` pour l'acheteur, ou laisser en texte ? | — | ☐ |
| `expected_revenue` | montant estimé AO | ☐ |
| `date_deadline` | date de clôture AO | ☐ |
| `description` | lien BOAMP + réf + CPV + score edifio | ☐ |
| Champs personnalisés `x_studio_*` à remplir sur l'opportunité ? | (réf AO, lien BOAMP, score…) | ☐ |
| En Tandem : où stocker l'architecte cotraitant ? (champ libre / partenaire lié / tag) | — | ☐ |

## 4. Instance de test *(fortement recommandé)*

| Question | À fournir |
|----------|-----------|
| Existe-t-il une **base Odoo de test/staging** ? | oui/non + URL/DB |
| Sinon : peut-on créer un **pipeline ou des tags « TEST edifio »** sur la prod pour les premiers essais sans polluer le CRM réel ? | oui/non |

> **Pourquoi** : on ne veut pas écrire de fausses opportunités dans ton CRM de production pendant les tests. Idéalement on teste contre une base de test ; à défaut, contre un pipeline « TEST » isolé, supprimé ensuite.

## 5. Politique de réversibilité

| Question | À fournir |
|----------|-----------|
| Si l'utilisateur repasse de Solo à Tandem (ou annule) : on **archive** l'opportunité Odoo (`active=false`), jamais suppression dure. OK ? | ☐ oui |
| Qui a le droit d'archiver côté Odoo (le compte de service a-t-il ce droit) ? | — |

---

## Récap — ce qui est bloquant vs non

- **Bloquant pour le test réel Solo/Tandem** : §1 (connexion) + §2 (pipeline/étape) + §4 (instance de test).
- **Non bloquant pour le code** : Alex développe contre un **mock Odoo**, le branchement réel se fait quand tu as rempli ce document.
