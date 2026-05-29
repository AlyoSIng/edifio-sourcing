// =====================================================================
// formations-content-fixture.ts — Contenu intégré des 4 guides de formation
// Produit par Cowork (CMO Léa) le 2026-05-29.
// Destination repo : src/db/seed/formations-content-fixture.ts
// Réf : handoff/RESPONSE_260529_FORMATIONS_GUIDES_INTEGRES.md
//
// Important : contenu intégré dans la BDD (champ content_md), rendu inline
// dans l'app. Pas d'URL externe. La page utilisateur est servie à
// `/sourcing/profil/formations/<slug>` et charge le markdown depuis BDD.
// =====================================================================

export type FormationSeed = {
  id: string; // UUID déterministe pour idempotence seed
  slug: string; // identifiant URL stable
  title: string;
  description: string;
  type: "doc"; // contenu écrit intégré
  durationMin: number; // durée de lecture estimée
  contentMd: string; // corps du guide en markdown
  isActive: boolean;
  displayOrder: number;
};

const GUIDE_1 = `Bienvenue dans edifio Sourcing. En une dizaine de minutes, tu vas comprendre à quoi sert l'outil, où trouver tes appels d'offres, et comment ouvrir ton premier dossier.

## 1. Tu te connectes
Rends-toi sur l'URL de l'application avec ton adresse \`@alyosingenierie.fr\` et ton mot de passe. À ta toute première connexion, l'outil te demande de remplacer le mot de passe provisoire — choisis-en un long (au moins 16 caractères), avec une majuscule, une minuscule, un chiffre et un symbole. Une passphrase comme « marche-rapide-soleil-42! » fait très bien l'affaire.

## 2. Trois zones du menu, trois usages
Une fois connecté, tu repères trois zones : **AO du jour** (ta file de travail quotidienne), **Contacts** (annuaires Architectes, Bureaux d'Études, Entreprises / Majors), et **Mon profil** (formations, FAQ, support, actualités produit). C'est tout ce dont tu as besoin pour commencer.

## 3. À quoi sert edifio Sourcing
L'outil détecte chaque matin les appels d'offres publics du BTP qui correspondent à AlyoS, te propose un score de pertinence, et t'aide à monter le dossier — en **Mandataire** (seul), en **Cotraitance** avec un architecte, ou en **Conception-Réalisation** (groupement maîtrise d'œuvre + réalisateur).

## 4. D'où viennent les annonces
Sources connectées : **BOAMP**, **PLACE**, **Francmarchés**, et d'autres plateformes complémentaires. La collecte tourne automatiquement chaque jour ouvré à **6 h 30 (heure de Paris)**. Tu n'as rien à lancer.

## 5. Ta file « AO du jour »
Ouvre la page **AO du jour**. Tu vois les annonces non traitées, triées par score. Les annonces des jours précédents qui n'ont pas encore été décidées restent visibles : rien ne se perd. Tu peux trier et filtrer par **département** et par **jours avant clôture** pour prioriser les marchés proches ou les plus urgents.

## 6. Ton profil de recherche
Ce qu'edifio détecte dépend du profil actif : mots-clés métier, CPV, géographie, types de marché. Tu peux consulter ces critères dans **Admin > Profils de recherche**. Si la file ne correspond pas à ce que tu attends, c'est généralement le profil qu'il faut ajuster, pas le tri.

## 7. Ouvrir ton premier appel d'offres
Clique sur une carte. L'écran de résultat te donne, en haut : le **maître d'ouvrage**, l'**objet du marché**, la **date de clôture**. Plus bas : les boutons **Voir l'annonce** (source officielle) et **Télécharger le DCE** (dossier de consultation).

## 8. Le brief d'opportunité
Sur la même page, tu trouves un bouton **Générer le brief**. En trois à quatre lignes, l'outil te résume l'objet, les lots clés, et un signal d'adéquation avec AlyoS. Si une information manque dans l'annonce, le brief le dit explicitement — il n'invente pas.

## 9. Et après ?
Tu décides : tu traites le dossier (Mandataire / Cotraitance / Conception-Réalisation), tu reportes l'AO à plus tard, ou tu l'écartes. Les guides suivants te montrent comment.`;

const GUIDE_2 = `Une fois ton profil de recherche bien réglé, l'enjeu quotidien est simple : passer la file et prendre une décision sur chaque annonce. Ce guide te donne la routine.

## 1. Trois statuts pour un AO traité
Un appel d'offres a trois sorties possibles :
- **Sélectionné** — tu le traites (Mandataire, Cotraitance ou Conception-Réalisation). Il bascule en pipeline.
- **Reporté** — tu n'es pas prêt à décider. Tu le mets de côté pour 1, 3 ou 7 jours ; il réapparaîtra automatiquement.
- **Écarté** — tu décides qu'il n'est pas pour AlyoS. L'action est tracée, l'annonce reste en base, rien n'est perdu.

## 2. Reporter un appel d'offres
Sur la carte de l'AO, le bouton **Reporter** ouvre un petit menu avec trois raccourcis : **+1 jour**, **+3 jours**, **+7 jours**. Choisis, et l'annonce disparaît de ta file. À l'échéance, elle revient en haut de la liste. Cet usage est précieux quand tu attends une information (le DCE qui sera publié dans 48 h, un retour d'un MOA, etc.).

## 3. Écarter un appel d'offres
Le bouton **Écarter** ouvre une fenêtre où tu indiques rapidement la raison (hors zone, hors compétence, montant trop bas…). L'AO sort de ta file mais reste consultable dans l'historique : si tu changes d'avis, rien n'est définitif.

## 4. Lire le brief d'opportunité
Avant de trancher, prends 30 secondes pour ouvrir l'AO et générer le brief IA. Il te donne l'objet, les lots et le signal d'adéquation AlyoS. C'est souvent suffisant pour décider.

## 5. Identifier la procédure
Dans l'annonce officielle (bouton **Voir l'annonce**), repère le **type de procédure** :
- **AO ouvert** — tout le monde peut candidater jusqu'à la date limite.
- **MAPA** (procédure adaptée) — marché en dessous des seuils européens, plus souple, mais souvent rapide.
- **Restreint** — il faut d'abord candidater (phase candidature) puis être retenu pour remettre une offre.

Cette information conditionne le rythme et les pièces à préparer.

## 6. Naviguer entre profils de recherche
Si tu travailles avec plusieurs profils (par exemple un profil « toutes régions » et un profil « Île-de-France »), tu peux basculer depuis la page **AO du jour**. Tu verras des files différentes — c'est normal et utile pour adapter ton focus.

## 7. La routine du matin
La meilleure pratique tient en trois étapes :
1. Tu ouvres **AO du jour** entre 9 h et 10 h.
2. Tu passes la file du haut vers le bas, en t'aidant du score.
3. Tu décides sur chaque annonce : **Sélectionner / Reporter / Écarter**. Pas de « à voir plus tard » sans bouton — soit tu reportes formellement, soit tu écartes.

En quelques jours, ta file devient courte et pertinente.`;

const GUIDE_3 = `Quand un appel d'offres exige une maîtrise d'œuvre (rénovation, restructuration, marché global), AlyoS répond en **Cotraitance** avec un architecte. edifio te guide pour identifier le bon partenaire et lancer la sollicitation.

## 1. Activer la Cotraitance sur un AO
Sur l'écran de résultat d'un appel d'offres, choisis **Cotraitance** dans le sélecteur de configuration de réponse. L'outil ouvre la **shortlist** des architectes les plus pertinents.

## 2. Comprendre la shortlist
La shortlist combine plusieurs critères :
- **Proximité géographique** — un architecte situé dans le **même département** que le lieu d'exécution est largement priorisé, puis les **départements limitrophes**.
- **Taille du cabinet** — les structures suffisamment armées sont mises en avant, sans exclure les cabinets plus petits si leur score global est élevé.
- **Spécialité** — adéquation entre le marché (ERP, logement, scolaire…) et l'expertise du cabinet.
- **Historique avec AlyoS** — un partenaire avec qui tu as déjà collaboré remonte naturellement.

Tu obtiens ainsi une liste courte et pertinente, pas un annuaire à éplucher.

## 3. Le rôle d'AlyoS dans le tandem
Dans la majorité des cas, AlyoS est **mandataire** du groupement : tu pilotes la candidature, tu coordonnes le cotraitant, tu portes la réponse. L'architecte est associé pour la part de maîtrise d'œuvre. Ce positionnement t'engage à fournir l'animation, le calendrier et le mémoire technique.

## 4. Lire la fiche d'un architecte
Clique sur un nom de la shortlist. La fiche affiche : spécialité, localisation, candidatures passées (avec AlyoS et au-delà), et — si renseignées — son effectif, son chiffre d'affaires et son adresse. C'est suffisant pour savoir si tu veux le solliciter.

## 5. Envoyer une sollicitation
Le bouton **Solliciter** ouvre un aperçu de l'e-mail qui sera envoyé : objet de l'AO, date limite, lien vers la fiche tokenisée pour répondre, mention RGPD et lien d'opposition. Vérifie la civilité (tu / vous est piloté par la fiche architecte), puis envoie. L'architecte reçoit immédiatement.

## 6. La relance automatique à J+3
Si l'architecte n'a pas répondu **trois jours** après ta sollicitation, edifio envoie automatiquement une relance courte. Tu n'as rien à faire — c'est tracé, idempotent (jamais deux fois), et l'architecte peut toujours répondre ou s'opposer.

## 7. Si l'architecte décline
Quand un architecte refuse, l'AO passe en statut **Architecte décliné**. Tu retournes alors à la shortlist pour solliciter le suivant. Pas de drame : c'est le quotidien. Réagis vite tant que la date de clôture le permet.

## 8. Suivre tes dossiers Cotraitance
Le tableau de bord Cotraitance liste tes dossiers en attente, avec la date limite et le délai restant. Tu vois immédiatement où concentrer ton énergie.`;

const GUIDE_4 = `Pour candidater rapidement, tu dois pouvoir réutiliser tes pièces administratives sans les rechercher. edifio centralise tout dans la **Bibliothèque entreprise**.

## 1. La Bibliothèque entreprise, ton coffre
Accède à **Admin > Bibliothèque entreprise**. Tu y déposes une fois chaque pièce, et edifio les met à disposition pour toutes tes candidatures, en Mandataire comme en Cotraitance.

## 2. Les 14 catégories
La bibliothèque organise tes documents en 14 catégories, parmi lesquelles : **DC1**, **DC2**, **DC4**, **Pouvoir**, **Kbis**, **Attestation d'assurance**, **Attestation URSSAF**, **Attestation fiscale**, **Présentation du BE**, **Moyens humains et matériels**, **Références**, **Mémoire RSE**… Tu choisis la bonne catégorie au moment du dépôt.

## 3. Charger ton URSSAF et ton Kbis
Commence par les deux pièces les plus demandées : l'**attestation URSSAF de vigilance** (à renouveler tous les six mois) et le **Kbis** (idéalement de moins de trois mois). Dépose le PDF, renseigne la **date d'expiration**, valide. Le document est immédiatement disponible pour les candidatures.

## 4. Le rôle particulier du DC2
Le **DC2** est la *Déclaration du candidat individuel ou membre d'un groupement*. C'est la pièce qui prouve que tu as les capacités économiques et professionnelles pour exécuter le marché. Tiens un DC2 à jour dans la bibliothèque : tu le réutiliseras à chaque candidature, et tu le mettras à jour annuellement.

## 5. Réutiliser sans ressaisir
À la constitution d'un dossier, edifio puise dans la bibliothèque : tu ne télécharges plus les mêmes pièces à chaque fois. Si un acheteur exige une pièce datée d'un mois maximum (par exemple le Kbis), l'outil te signale si ta version est trop ancienne.

## 6. Être alerté avant expiration
Chaque pièce affiche un **badge de validité** : **vert** (à jour), **orange** (expire dans moins de 30 jours), **rouge** (expiré). Tu n'as plus besoin de surveiller toi-même — passe régulièrement et remplace ce qui est orange ou rouge.

## 7. L'annuaire des architectes et leurs pièces
Côté **Contacts > Architectes**, les cabinets partenaires disposent du même coffre : leurs propres pièces administratives et leurs dates d'expiration. Quand tu sollicites un architecte en Cotraitance, tu vois immédiatement si sa documentation est exploitable.

## 8. Tes priorités pour bien démarrer
Si tu commences avec edifio Sourcing, charge en premier ces cinq pièces : **Kbis**, **Attestation URSSAF**, **Attestation fiscale**, **Attestation d'assurance**, **DC2**. Avec ça, tu peux candidater à 90 % des appels d'offres dès demain.`;

export const FORMATIONS_CONTENT_FIXTURE: FormationSeed[] = [
  {
    id: "fb000001-0000-0000-0000-000000000001",
    slug: "prise-en-main",
    title: "Prendre en main edifio Sourcing en 10 minutes",
    description: "Tour d'horizon : connexion, AO du jour, premier traitement d'annonce.",
    type: "doc",
    durationMin: 7,
    contentMd: GUIDE_1,
    isActive: true,
    displayOrder: 1,
  },
  {
    id: "fb000001-0000-0000-0000-000000000002",
    slug: "ao-du-jour",
    title: "Traiter sa file « AO du jour »",
    description: "Reporter, écarter, lire le brief, ouvrir l'annonce et le DCE.",
    type: "doc",
    durationMin: 6,
    contentMd: GUIDE_2,
    isActive: true,
    displayOrder: 2,
  },
  {
    id: "fb000001-0000-0000-0000-000000000003",
    slug: "cotraitance",
    title: "Répondre en cotraitance avec un architecte",
    description: "Comprendre la shortlist, solliciter un architecte, suivre les réponses.",
    type: "doc",
    durationMin: 8,
    contentMd: GUIDE_3,
    isActive: true,
    displayOrder: 3,
  },
  {
    id: "fb000001-0000-0000-0000-000000000004",
    slug: "contacts-coffre-bet",
    title: "Gérer les contacts et le coffre documentaire BET",
    description: "Annuaires Architectes / BE / Entreprises, pièces administratives et expirations.",
    type: "doc",
    durationMin: 7,
    contentMd: GUIDE_4,
    isActive: true,
    displayOrder: 4,
  },
];
