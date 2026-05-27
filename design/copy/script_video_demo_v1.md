# Script + spécifications — Vidéo de démonstration edifio Sourcing (v1)

**Émetteur** : [CMO Léa] + [CEO Marc] — Cowork
**Destinataires** : Alex (`dev`) / Board (génération de la vidéo)
**Date** : 2026-05-27
**Objet** : script de voix off + déroulé écran + spec technique pour produire la vidéo démo
demandée (clé `app_content.demo_video_url`, page `/sourcing/profil/demo`).

---

## 1. Spécifications techniques

| Paramètre | Valeur |
|-----------|--------|
| Durée cible | **3 à 4 minutes** |
| Format | MP4, 1080p (1920×1080), 30 fps |
| Voix off | Français, ton professionnel et sobre (pas commercial agressif) |
| Sous-titres | Oui (.srt ou intégrés) — accessibilité |
| Capture | Écran réel de l'app (preview Vercel ou prod), curseur visible |
| Charte | Respecter le rouge edifio (#C8002A) ; intro/outro avec logo edifio Sourcing |
| Hébergement | YouTube **non répertorié** (unlisted) ou Google Drive lien public → coller l'URL dans `/superadmin` |
| Musique | Optionnelle, discrète, libre de droits |

### ⚠️ Contrainte RGPD (bloquante)
La vidéo capture des écrans réels. **Aucune donnée personnelle réelle d'architecte ne doit
être visible** (noms, emails, SIREN nominatifs). Utiliser **un jeu de données de démo / seed**,
ou **flouter** systématiquement les annuaires Contacts. Idem pour toute adresse e-mail utilisateur.

---

## 2. Vocabulaire (important)

Les anciens termes **« Solo » et « Tandem » ne sont plus utilisés**. Employer les libellés exacts
de l'interface (confirmés Board 27/05) :
- **Mandataire** (vous répondez en propre, en mandataire seul),
- **Cotraitance** (vous mobilisez un architecte cotraitant),
- **Conception-Réalisation** (groupement : AlyoS assure la maîtrise d'œuvre et coordonne un partenaire réalisateur).

---

## 3. Script séquencé (voix off + actions écran)

### Scène 1 — Ouverture (0:00 → 0:25)
**Écran** : logo edifio Sourcing, puis écran de connexion, puis tableau de bord.
**Voix off** :
« edifio Sourcing, c'est l'outil qui détecte chaque jour les appels d'offres publics du BTP
qui vous correspondent — et qui vous accompagne jusqu'au dépôt de votre candidature. Voyons
comment, en quelques minutes. »

### Scène 2 — AO du jour (0:25 → 1:15)
**Écran** : la file « AO du jour ». Montrer le tri par **département** et par **jours avant
clôture** ; passer un AO en « Reporter +3 j », en « Écarter » un autre.
**Voix off** :
« Chaque matin, edifio collecte les nouveaux appels d'offres et les classe par pertinence.
Vous filtrez par département, vous priorisez les marchés dont la clôture approche. D'un clic,
vous reportez une annonce à plus tard, ou vous l'écartez : votre file reste toujours propre. »

### Scène 3 — Comprendre un appel d'offres (1:15 → 1:55)
**Écran** : ouverture d'un AO → brief d'opportunité IA (3-4 lignes), boutons « Voir l'annonce »
et « Télécharger le DCE ».
**Voix off** :
« Sur chaque appel d'offres, edifio génère un brief synthétique : l'objet du marché, les lots
clés, et un signal d'adéquation avec votre activité. L'annonce officielle et le dossier de
consultation sont accessibles directement. »

### Scène 4 — Répondre : Mandataire, Cotraitance ou Conception-Réalisation (1:55 → 2:50)
**Écran** : sur un AO, montrer le choix entre les trois configurations, puis la **shortlist
d'architectes** (Cotraitance) avec le scoring géographique, la **bibliothèque cotraitants**,
et l'assemblage d'un groupement **Conception-Réalisation** (maîtrise d'œuvre + réalisateur via
l'annuaire Entreprises / Majors).
**Voix off** :
« Vous répondez en Mandataire — en propre, seul — ou vous montez un groupement. En Cotraitance,
edifio vous propose les architectes les plus pertinents, par proximité géographique et taille
de cabinet, et gère la sollicitation. En Conception-Réalisation, AlyoS assure la maîtrise
d'œuvre et coordonne un partenaire réalisateur — et vous réutilisez vos cotraitants d'un
dossier à l'autre. »

### Scène 5 — Contacts & coffre documentaire (2:50 → 3:20)
**Écran** : annuaires Contacts (Architectes / Bureaux d'Études / Entreprises-Majors — **données
de démo**), puis le coffre documentaire d'un BET avec les badges d'expiration.
**Voix off** :
« Tous vos contacts BTP sont centralisés. Et pour les bureaux d'études, le coffre documentaire
conserve les pièces de candidature — DC1, Kbis, attestations — avec une alerte avant chaque
expiration. Vous ne courez plus après les documents. »

### Scène 6 — Votre espace & l'accompagnement (3:20 → 3:45)
**Écran** : profil utilisateur — formations, FAQ, actualités, support.
**Voix off** :
« Enfin, votre espace réunit les formations, la FAQ, les actualités produit et le support :
de quoi être autonome dès le premier jour. »

### Scène 7 — Clôture (3:45 → 4:00)
**Écran** : logo edifio Sourcing + mention « édité par AlyoS Ingénierie ».
**Voix off** :
« edifio Sourcing — gagnez du temps, ne manquez plus le bon marché. »

---

## 4. Check-list avant publication
- [ ] Durée ≤ 4 min, 1080p, sous-titres présents.
- [ ] Aucune donnée perso réelle visible (RGPD) — données de démo ou flou.
- [ ] Aucun terme « Solo » / « Tandem ».
- [ ] Intro/outro charte edifio, mention « AlyoS Ingénierie ».
- [ ] Hébergement OK → URL collée dans `/superadmin` (clé `demo_video_url`).
