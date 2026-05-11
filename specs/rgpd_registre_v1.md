# Registre des traitements RGPD — edifio Sourcing v1.0

**Auteur** : [CTO Sophie Vasseur] + [CEO Marc]
**Date** : 2026-05-10
**Statut** : Préparation Gate 8 — à finaliser et signer par le Board en clôture Gate 8
**Responsable de traitement** : AlyoS Ingénierie (SIREN à compléter), représentée par TEISSIER
**Délégué à la protection des données (DPO)** : à désigner — proposition : TEISSIER lui-même (PME < 250 salariés, DPO non obligatoire)

---

## Cadre légal

- **RGPD** (Règlement UE 2016/679)
- **Loi Informatique et Libertés** (loi n°78-17 modifiée)
- Hébergement strictement UE (Supabase Frankfurt, Vercel EU, Fly.io EU)
- DPA (Data Processing Agreement) signé avec chaque sous-traitant — cf. § Sous-traitants

---

## Traitement n°1 — Authentification et gestion des comptes utilisateurs

| Item | Valeur |
|------|--------|
| Finalité | Permettre l'accès sécurisé à edifio Sourcing aux collaborateurs AlyoS Ingénierie |
| Base légale | Exécution du contrat de travail (article 6.1.b RGPD) |
| Catégories de données | Email professionnel, nom, prénom, rôle, identifiants de session |
| Personnes concernées | Salariés AlyoS Ingénierie |
| Sous-traitants impliqués | Supabase (Auth), Vercel (frontend) |
| Durée de conservation | Pendant toute la durée du contrat de travail + 1 an post-départ |
| Mesures de sécurité | Magic-link (pas de mot de passe), session HTTPS, JWT signé, middleware domaine `@alyosingenierie.fr`, audit log connexions |
| Transferts hors UE | Non |
| Droits exerçables | Accès, rectification, opposition (effets : suppression du compte) |

---

## Traitement n°2 — Sourcing AO public

| Item | Valeur |
|------|--------|
| Finalité | Détecter les appels d'offres publics correspondant aux critères AlyoS |
| Base légale | Intérêt légitime (article 6.1.f) — exploitation de données publiques |
| Catégories de données | Données AO (référence, intitulé, acheteur, lots, montant, échéances) — issues de plateformes publiques (BOAMP, PLACE, etc.) |
| Personnes concernées | Aucune (données 100 % entité publique acheteuse) |
| Sous-traitants impliqués | Supabase (stockage), Fly.io (scraping Playwright), Anthropic (scoring optionnel) |
| Durée de conservation | 7 ans (alignement avec la durée de prescription des marchés publics) |
| Mesures de sécurité | RLS Postgres, chiffrement TLS, accès restreint via domaine `@alyosingenierie.fr` |
| Transferts hors UE | Non (Anthropic UE — à confirmer dans le DPA) |

---

## Traitement n°3 — Base de contacts architectes externes

| Item | Valeur |
|------|--------|
| Finalité | Permettre la sollicitation d'architectes pour des cotraitances MOE |
| Base légale | Intérêt légitime (article 6.1.f) — relation B2B, données professionnelles |
| Catégories de données | Nom, prénom, email professionnel, téléphone, SIRET, spécialités, zones d'intervention, historique des collaborations, statut partenariat |
| Personnes concernées | Architectes professionnels (cibles de sollicitation) |
| Sous-traitants impliqués | Supabase (stockage), Brevo (emailing), Anthropic (génération du texte de matching) |
| Durée de conservation | 3 ans après le dernier contact effectif, ou suppression à la demande de l'architecte |
| Mesures de sécurité | RLS, audit log des modifications, chiffrement TLS, token JWT 30 j pour la page tokenisée |
| Transferts hors UE | Non |
| Droits exerçables | Accès, rectification, opposition, effacement (procédure documentée § Droit d'effacement) |
| Information de la personne | Mention dans le mail de sollicitation Brevo (ligne footer) + page d'opposition accessible via lien tokenisé |

**Spécificité** : la base d'architectes constitue un fichier B2B. La conformité repose sur **l'intérêt légitime documenté** (analyse à conserver) et **le droit d'opposition systématique** dans chaque mail.

---

## Traitement n°4 — Sollicitation architecte par mail transactionnel

| Item | Valeur |
|------|--------|
| Finalité | Envoyer une sollicitation pour un AO précis à un architecte |
| Base légale | Intérêt légitime (sollicitation B2B individualisée) |
| Catégories de données | Email, nom, prénom de l'architecte ; contenu du mail (synthèse AO) |
| Sous-traitants | Brevo (envoi + tracking) |
| Durée de conservation | Traces d'envoi : 1 an (Brevo) — relation : 3 ans (Supabase) |
| Mesures de sécurité | API key Brevo en Vault, webhook signé HMAC, lien tokenisé JWT 30 j révocable |
| Tracking | Ouverture / clic / bounce — finalité pilotage de la relation |
| Droit d'opposition | Mention dans le footer du mail + lien direct vers la page tokenisée qui inclut un bouton « Ne plus me solliciter » (à intégrer en Gate 6) |

---

## Traitement n°5 — Analyse IA des dossiers (RC + mémoire technique)

| Item | Valeur |
|------|--------|
| Finalité | Automatiser l'analyse du Règlement de Consultation et la génération du mémoire technique |
| Base légale | Exécution du contrat de travail (productivité interne AlyoS) |
| Catégories de données | Contenu du RC (donnée publique) + données entreprise AlyoS (référence + attestations) |
| Personnes concernées | Aucune (données entreprise) — sauf si CV / nom de collaborateur cité dans une référence (alors voir Traitement 7) |
| Sous-traitants | Anthropic (Claude Sonnet 4.6 + Haiku 4.5) — DPA signé, hébergement UE confirmé |
| Durée de conservation | Inputs/outputs IA conservés 12 mois pour audit qualité, anonymisés au-delà |
| Mesures de sécurité | Pas de transfert hors UE, prompts versionnés en BDD, audit log de chaque appel `ai_run` |
| Note | Anthropic confirme ne pas entraîner ses modèles sur les inputs API (politique zero-retention activable, à confirmer DPA) |

---

## Traitement n°6 — Logs d'audit

| Item | Valeur |
|------|--------|
| Finalité | Sécurité, traçabilité, conformité réglementaire |
| Base légale | Intérêt légitime (sécurité) + obligation légale (article 32 RGPD) |
| Catégories de données | Email + rôle de l'acteur, IP, user-agent, type d'action, payload |
| Durée de conservation | 5 ans (alignement avec délai prescription pour litiges techniques) |
| Mesures de sécurité | Immutable (INSERT only), RLS strict admin only |

---

## Traitement n°7 — Bibliothèque pièces (présentations, attestations, références, CV)

| Item | Valeur |
|------|--------|
| Finalité | Stockage et réutilisation automatique de pièces dans les dossiers de candidature |
| Base légale | Exécution du contrat (gestion interne) + intérêt légitime (visibilité commerciale) |
| Catégories de données | Documents PDF de l'entreprise ; **éventuellement** CV de collaborateurs (avec données personnelles) |
| Personnes concernées | Collaborateurs AlyoS (CV) — information à donner |
| Sous-traitants | Supabase Storage |
| Durée de conservation | Documents : pendant durée d'usage. CV individuels : pendant durée du contrat + 1 an, retirables sur demande |
| Mesures de sécurité | Bucket privé RLS, lien signé pour téléchargement, expiration des liens |

---

## Sous-traitants et DPA

| Sous-traitant | Localisation | Service rendu | DPA signé |
|---------------|--------------|---------------|-----------|
| Supabase | Frankfurt (EU) | Hébergement DB + Auth + Storage | ⚠️ à signer Gate 8 |
| Vercel | EU (region eu-west-3 si activée) | Hébergement frontend + API | ⚠️ à signer Gate 8 |
| Fly.io | Frankfurt (EU) | Container scraping Playwright | ⚠️ à signer Gate 8 |
| Brevo | France (Paris) | Email transactionnel architectes | ⚠️ à signer Gate 8 |
| Resend | UE | Email transactionnel utilisateurs | ⚠️ à signer Gate 8 |
| Anthropic | UE (à confirmer région inference) | API IA (Sonnet + Haiku) | ⚠️ à signer Gate 8 |
| OVH | France | DNS + Object Storage (backups) | ✅ contrat existant Alyos |

**Action Gate 8 bloquante** : 6 DPA à signer avant mise en prod (Gate 9).

---

## Droits des personnes concernées

### Droit d'accès, rectification, opposition

- **Architectes** : via la page tokenisée → bouton « Mes données » qui ouvre un récap + bouton « M'opposer / Me supprimer » qui déclenche un workflow admin AlyoS (réponse < 1 mois)
- **Salariés AlyoS** : via l'admin interne ou par email à `dpo@alyosingenierie.fr` (à créer)

### Droit à l'effacement

- Workflow admin : un endpoint `/api/admin/rgpd/erase` (rôle admin only) qui :
  - Supprime / pseudonymise les données du contact dans `architects`, `match_proposals`, `architect_responses`
  - Conserve les `audit_logs` (obligation légale) en pseudonymisant l'email
  - Génère un certificat d'effacement (PDF) à conserver

### Droit à la portabilité

- Export JSON / CSV des données personnelles via endpoint admin (Gate 6+)

---

## Notifications de violation de données

Procédure en cas de fuite :
1. Détection (alerte Sentry / Supabase logs)
2. Évaluation par CTO (Sophie) + CEO (Marc) dans les 24 h
3. Si risque pour les droits/libertés → notification CNIL sous 72 h via téléprocédure
4. Si risque élevé → notification individuelle aux personnes concernées
5. Documentation interne du registre des violations

---

## Mentions légales et politique de confidentialité

À publier sur :
- Page `/forbidden` (utilisateur hors domaine connecté)
- Page `/legal` accessible depuis le footer
- Footer de tous les mails Brevo (lien)

Cf. document `mentions_legales_v1.md` pour le template.

---

## Validation et signature

| Étape | Responsable | Date prévue |
|-------|-------------|-------------|
| Compléter SIREN AlyoS | [CEO] | Gate 8 |
| Désigner DPO formellement | [BOARD] | Gate 8 |
| Signer 6 DPA sous-traitants | [BOARD] + [CTO] | Gate 8 (bloquant Gate 9) |
| Publier registre sur extranet AlyoS | [CEO] | Gate 9 |
| Revue annuelle du registre | [CTO] + [CEO] | chaque 2026-05-10 |

---

*Registre à signer en clôture Gate 8 par TEISSIER. Conserver une version PDF datée et numérotée dans les archives AlyoS.*
