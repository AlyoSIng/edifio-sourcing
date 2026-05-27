// =====================================================================
// content-fixture.ts — Contenu initial espace utilisateur edifio Sourcing
// Produit par Cowork (CMO Léa) le 2026-05-27.
// Destination repo : src/db/seed/content-fixture.ts
// Réf : handoff/REQUEST_260527_0912_CONTENU_PROFIL_FORMATIONS_FAQ_DEMO.md
//
// NOTE : les URLs marquées TODO_URL doivent être renseignées par le Board
// (vidéos de formation, vidéo démo, PDF plaquette, PDF roadmap) une fois
// les ressources hébergées (YouTube / Google Drive / Notion…).
// =====================================================================

// ---------- FAQ (table faq_items) ----------
// Contenu complet : design/copy/faq_v1.md
export const FAQ_FIXTURE = [
  // general
  {
    question: "Qu'est-ce qu'edifio Sourcing ?",
    answer:
      "edifio Sourcing est l'outil interne d'AlyoS Ingénierie qui détecte chaque jour les appels d'offres publics pertinents, vous aide à décider lesquels traiter, et monte vos dossiers de candidature — en mandataire seul, en cotraitance avec un architecte, ou en conception-réalisation.",
    category: "general",
    isActive: true,
    displayOrder: 1,
  },
  {
    question: "Par où commencer ?",
    answer:
      "Ouvrez « AO du jour » : c'est votre file de travail quotidienne. Les appels d'offres y sont classés par pertinence. Vous traitez, reportez ou écartez chaque annonce.",
    category: "general",
    isActive: true,
    displayOrder: 2,
  },
  {
    question: "À quelle fréquence les appels d'offres sont-ils mis à jour ?",
    answer:
      "La collecte tourne automatiquement chaque matin. Les annonces non traitées des jours précédents restent visibles tant que vous n'avez pas pris de décision.",
    category: "general",
    isActive: true,
    displayOrder: 3,
  },
  {
    question: "Où trouver les formations et la vidéo de démonstration ?",
    answer:
      "Dans votre profil : rubriques « Formations » et « Démo ». Les tests guidés vérifient votre prise en main au fil des formations.",
    category: "general",
    isActive: true,
    displayOrder: 4,
  },

  // sourcing
  {
    question: "Que veulent dire « Reporter » et « Écarter » sur une annonce ?",
    answer:
      "« Reporter » met l'annonce de côté pour +1, +3 ou +7 jours : elle réapparaîtra à la date choisie. « Écarter » la retire de votre file (l'action est tracée, rien n'est perdu).",
    category: "sourcing",
    isActive: true,
    displayOrder: 1,
  },
  {
    question: "À quoi sert le brief d'opportunité ?",
    answer:
      "C'est un résumé de 3-4 lignes généré à la demande : objet du marché, lots clés, et un signal d'adéquation avec AlyoS. S'il manque une information, il le dit.",
    category: "sourcing",
    isActive: true,
    displayOrder: 2,
  },
  {
    question: "Comment accéder à l'annonce officielle et au DCE ?",
    answer:
      "Depuis l'écran de résultat de l'AO : bouton « Voir l'annonce » (source officielle) et « Télécharger le DCE » (dossier de consultation).",
    category: "sourcing",
    isActive: true,
    displayOrder: 3,
  },
  {
    question: "Puis-je trier les appels d'offres par département ou par échéance ?",
    answer:
      "Oui : « AO du jour » permet de trier et filtrer par département et par nombre de jours avant la clôture.",
    category: "sourcing",
    isActive: true,
    displayOrder: 4,
  },

  // cotraitance
  {
    question: "Quelles sont les façons de répondre à un appel d'offres ?",
    answer:
      "Trois : en Mandataire (vous répondez en propre, seul), en Cotraitance (vous mobilisez un architecte cotraitant), ou en Conception-Réalisation (groupement où AlyoS assure la maîtrise d'œuvre et coordonne un partenaire réalisateur).",
    category: "cotraitance",
    isActive: true,
    displayOrder: 1,
  },
  {
    question: "Comment fonctionne la cotraitance ?",
    answer:
      "edifio propose des architectes scorés pour l'appel d'offres (proximité géographique, taille du cabinet) et gère la sollicitation.",
    category: "cotraitance",
    isActive: true,
    displayOrder: 2,
  },
  {
    question: "Qu'est-ce que la bibliothèque cotraitants ?",
    answer:
      "Un annuaire de cotraitants réutilisable d'un appel d'offres à l'autre, avec leurs pièces administratives — vous ne ressaisissez pas les mêmes documents à chaque dossier.",
    category: "cotraitance",
    isActive: true,
    displayOrder: 3,
  },
  {
    question: "Quels documents puis-je stocker pour un Bureau d'Études ?",
    answer:
      "Les 12 pièces types d'un dossier de candidature (DC1, DC2, DC4, Kbis, attestations d'assurance / URSSAF / fiscale, références, mémoire RSE…), avec une alerte avant expiration.",
    category: "cotraitance",
    isActive: true,
    displayOrder: 4,
  },

  // compte
  {
    question: "Comment inviter un collaborateur ?",
    answer:
      "Un administrateur se rend dans Admin > Utilisateurs > Créer un compte. Le collaborateur reçoit un mot de passe provisoire et le change à sa première connexion.",
    category: "compte",
    isActive: true,
    displayOrder: 1,
  },
  {
    question: "Qui peut accéder à edifio Sourcing ?",
    answer:
      "Les comptes dont l'adresse e-mail se termine par @alyosingenierie.fr. Toute autre adresse est refusée par sécurité.",
    category: "compte",
    isActive: true,
    displayOrder: 2,
  },
  {
    question: "J'ai oublié mon mot de passe, que faire ?",
    answer:
      "Utilisez le lien « Mot de passe oublié » sur l'écran de connexion. Si votre mot de passe provisoire a expiré (24 h), demandez à un administrateur de le régénérer.",
    category: "compte",
    isActive: true,
    displayOrder: 3,
  },
  {
    question: "Comment activer la double authentification (MFA) ?",
    answer:
      "Dans les paramètres de votre compte. Optionnelle mais recommandée pour les comptes administrateurs.",
    category: "compte",
    isActive: true,
    displayOrder: 4,
  },
];

// ---------- Formations (table formations) ----------
// Squelette de parcours. Le Board renseigne les URLs (TODO_URL) après hébergement des vidéos.
export const FORMATIONS_FIXTURE = [
  {
    title: "Prendre en main edifio Sourcing en 10 minutes",
    description: "Tour d'horizon : connexion, AO du jour, premier traitement d'annonce.",
    url: "TODO_URL",
    type: "video" as const,
    durationMin: 10,
    isActive: true,
    displayOrder: 1,
  },
  {
    title: "Traiter sa file « AO du jour »",
    description: "Reporter, écarter, lire le brief d'opportunité, ouvrir l'annonce et le DCE.",
    url: "TODO_URL",
    type: "video" as const,
    durationMin: 8,
    isActive: true,
    displayOrder: 2,
  },
  {
    title: "Répondre en cotraitance avec un architecte",
    description: "Comprendre la shortlist, solliciter un architecte, suivre les réponses.",
    url: "TODO_URL",
    type: "video" as const,
    durationMin: 12,
    isActive: true,
    displayOrder: 3,
  },
  {
    title: "Gérer les contacts et le coffre documentaire BET",
    description: "Annuaires Architectes / BE / Entreprises, pièces administratives et expirations.",
    url: "TODO_URL",
    type: "video" as const,
    durationMin: 9,
    isActive: true,
    displayOrder: 4,
  },
];

// ---------- app_content (table app_content) ----------
export const APP_CONTENT_FIXTURE = [
  { key: "demo_video_url", contentUrl: "TODO_URL" }, // 🔴 vidéo de démonstration (YouTube/mp4)
  { key: "pitch_pdf_url", contentUrl: "TODO_URL" }, // plaquette commerciale (PDF Google Drive)
  { key: "roadmap_pdf_url", contentUrl: "TODO_URL" }, // roadmap produit (PDF Google Drive)
  { key: "market_study_url", contentUrl: "TODO_URL" }, // étude de marché v4 (URL hébergée)
];
