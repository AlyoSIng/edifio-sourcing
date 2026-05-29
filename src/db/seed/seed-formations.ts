/**
 * seed-formations.ts — Insère les formations et tests guidés de façon idempotente.
 *
 * Lancement : pnpm db:seed:formations
 * (règle ops prod : Steve pose DATABASE_URL dans SA session avant de lancer)
 *
 * Idempotence : UUID déterministes + ON CONFLICT DO NOTHING.
 * Les 4 formations et les 4 tests guidés sont insérés dans l'ordre d'affichage.
 */

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { formations, guidedTests, type GuidedTestStep } from "@/db/schema/superadmin";

// ─── Données formations ───────────────────────────────────────────────────────

const FORMATIONS: Array<typeof formations.$inferInsert> = [
  {
    id: "fb000001-0000-0000-0000-000000000001",
    title: "Prendre en main edifio Sourcing en 10 minutes",
    description: "Tour d'horizon : connexion, AO du jour, premier traitement d'annonce.",
    url: null,
    type: "video",
    isActive: true,
    displayOrder: 1,
  },
  {
    id: "fb000001-0000-0000-0000-000000000002",
    title: "Traiter sa file « AO du jour »",
    description: "Reporter, écarter, lire le brief d'opportunité, ouvrir l'annonce et le DCE.",
    url: null,
    type: "video",
    isActive: true,
    displayOrder: 2,
  },
  {
    id: "fb000001-0000-0000-0000-000000000003",
    title: "Répondre en cotraitance avec un architecte",
    description: "Comprendre la shortlist, solliciter un architecte, suivre les réponses.",
    url: null,
    type: "video",
    isActive: true,
    displayOrder: 3,
  },
  {
    id: "fb000001-0000-0000-0000-000000000004",
    title: "Gérer les contacts et le coffre documentaire BET",
    description: "Annuaires Architectes / BE / Entreprises, pièces administratives et expirations.",
    url: null,
    type: "video",
    isActive: true,
    displayOrder: 4,
  },
];

// ─── Données tests guidés ─────────────────────────────────────────────────────

interface GuidedTestSeedRow {
  id: string;
  title: string;
  formationId: string;
  displayOrder: number;
  steps: GuidedTestStep[];
}

const GUIDED_TESTS: GuidedTestSeedRow[] = [
  {
    id: "tb000001-0000-0000-0000-000000000001",
    title: "Prise en main & navigation",
    formationId: "fb000001-0000-0000-0000-000000000001",
    displayOrder: 1,
    steps: [
      {
        id: "s1_01",
        type: "action",
        question:
          "Connectez-vous à edifio Sourcing. Repérez les 3 sections principales du menu latéral : « AO du jour », « Architectes » et « Mon profil ».",
      },
      {
        id: "s1_02",
        type: "qcm",
        question: "Quel est l'objectif principal d'edifio Sourcing ?",
        options: [
          "Gérer les congés et absences d'AlyoS",
          "Détecter et traiter les appels d'offres publics pertinents",
          "Facturer les prestations aux clients",
        ],
        correctIndex: 1,
      },
      {
        id: "s1_03",
        type: "qcm",
        question: "Quelles sources alimentent la base d'AO dans edifio Sourcing ?",
        options: [
          "BOAMP uniquement",
          "BOAMP, PLACE, Francmarchés et d'autres plateformes",
          "Uniquement les AO de la région PACA",
        ],
        correctIndex: 1,
      },
      {
        id: "s1_04",
        type: "action",
        question:
          "Accédez à la page « AO du jour ». Comptez combien d'appels d'offres s'affichent aujourd'hui.",
      },
      {
        id: "s1_05",
        type: "qcm",
        question: "Le profil de recherche sert à :",
        options: [
          "Créer votre compte utilisateur",
          "Définir les critères qui filtrent les AO (mots-clés, géographie, types de marché)",
          "Gérer les mots de passe des collaborateurs",
        ],
        correctIndex: 1,
      },
      {
        id: "s1_06",
        type: "action",
        question:
          "Accédez à « Admin > Profils de recherche » et consultez les critères du profil actif : mots-clés positifs/négatifs, zones géographiques, types de marché.",
      },
      {
        id: "s1_07",
        type: "qcm",
        question:
          "À quelle heure la collecte automatique des AO se déclenche-t-elle les jours ouvrés ?",
        options: ["08h00 Paris", "06h30 Paris (04h30 UTC)", "Minuit heure locale"],
        correctIndex: 1,
      },
      {
        id: "s1_08",
        type: "action",
        question:
          "Cliquez sur un appel d'offres. Identifiez le maître d'ouvrage, l'objet du marché et la date de clôture.",
      },
      {
        id: "s1_09",
        type: "qcm",
        question: "Un « brief d'opportunité » est :",
        options: [
          "Un email envoyé automatiquement au maître d'ouvrage",
          "Un résumé IA généré à la demande (objet, lots, signal d'adéquation AlyoS)",
          "Une notification push envoyée sur mobile",
        ],
        correctIndex: 1,
      },
      {
        id: "s1_10",
        type: "action",
        question:
          "Générez le brief d'opportunité d'un AO. Lisez le signal d'adéquation pour AlyoS Ingénierie.",
      },
      {
        id: "s1_11",
        type: "qcm",
        question:
          "Si aucun AO n'a été importé ce matin, que voyez-vous sur la page « AO du jour » ?",
        options: [
          "Une page d'erreur 404",
          "Un état vide ou les AO non traités des jours précédents",
          "Une liste de 50 AO génériques de France",
        ],
        correctIndex: 1,
      },
      {
        id: "s1_12",
        type: "open",
        question:
          "En quelques mots, décrivez votre première impression de l'interface et ce que vous trouvez le plus utile dans « AO du jour ».",
      },
    ],
  },
  {
    id: "tb000001-0000-0000-0000-000000000002",
    title: "Traitement des annonces quotidiennes",
    formationId: "fb000001-0000-0000-0000-000000000002",
    displayOrder: 2,
    steps: [
      {
        id: "s2_01",
        type: "action",
        question:
          "Sur la liste « AO du jour », repérez les badges de statut : « À traiter », « Reporté », « Écarté ». Identifiez au moins un AO dans chaque état si possible.",
      },
      {
        id: "s2_02",
        type: "qcm",
        question: "Quels statuts peut prendre un AO que vous avez traité ?",
        options: [
          "Uniquement « À traiter » ou « Validé »",
          "« Sélectionné », « Reporté » ou « Écarté »",
          "« Facturé », « En cours », « Fermé »",
        ],
        correctIndex: 1,
      },
      {
        id: "s2_03",
        type: "action",
        question:
          "Reportez un AO à +3 jours. Vérifiez qu'il disparaît de la liste principale et réapparaîtra à la date choisie.",
      },
      {
        id: "s2_04",
        type: "qcm",
        question: "Que signifie « Reporter un AO à +7 jours » ?",
        options: [
          "L'annonce sera supprimée dans 7 jours",
          "L'annonce réapparaîtra dans votre file dans 7 jours",
          "La date de clôture de l'AO est repoussée de 7 jours",
        ],
        correctIndex: 1,
      },
      {
        id: "s2_05",
        type: "action",
        question:
          "Écartez un AO. L'action est-elle réversible ? Consultez les logs si disponibles.",
      },
      {
        id: "s2_06",
        type: "qcm",
        question: "Écarter un AO est-il définitif ?",
        options: [
          "Oui, l'annonce est supprimée de la base",
          "Non, l'action est tracée mais l'annonce reste en BDD",
          "Oui, impossible de retrouver l'annonce ensuite",
        ],
        correctIndex: 1,
      },
      {
        id: "s2_07",
        type: "action",
        question:
          "Ouvrez un AO et cliquez sur « Voir l'annonce » pour accéder à la source officielle. Identifiez la procédure (appel d'offres ouvert, MAPA, restreint…).",
      },
      {
        id: "s2_08",
        type: "qcm",
        question:
          "Les AO affichés dans « AO du jour » sont-ils tous les AO français ou seulement ceux correspondant à vos profils ?",
        options: [
          "Tous les AO français publiés sur BOAMP",
          "Seulement ceux filtrés par vos profils de recherche actifs",
          "Tous les AO de votre région",
        ],
        correctIndex: 1,
      },
      {
        id: "s2_09",
        type: "action",
        question:
          "Si vous avez plusieurs profils de recherche, basculez d'un profil à l'autre dans la page « AO du jour ». Observez comment la liste change.",
      },
      {
        id: "s2_10",
        type: "open",
        question:
          "Décrivez en 2-3 phrases votre routine idéale pour traiter les AO chaque matin avec edifio Sourcing.",
      },
    ],
  },
  {
    id: "tb000001-0000-0000-0000-000000000003",
    title: "Cotraitance Tandem avec un architecte",
    formationId: "fb000001-0000-0000-0000-000000000003",
    displayOrder: 3,
    steps: [
      {
        id: "s3_01",
        type: "action",
        question:
          "Sélectionnez un AO et activez le mode « Cotraitance » (Tandem). Observez la shortlist d'architectes proposés.",
      },
      {
        id: "s3_02",
        type: "qcm",
        question: "Qu'est-ce qu'un « tandem » dans edifio Sourcing ?",
        options: [
          "Un binôme AlyoS-client final",
          "Une cotraitance Bureau d'Études + architecte sur un appel d'offres",
          "Un mode de double signature électronique",
        ],
        correctIndex: 1,
      },
      {
        id: "s3_03",
        type: "qcm",
        question: "Quel rôle occupe AlyoS Ingénierie dans un tandem ?",
        options: [
          "Sous-traitant de l'architecte",
          "Mandataire (pilote la candidature et coordonne l'architecte cotraitant)",
          "Assistant maître d'ouvrage",
        ],
        correctIndex: 1,
      },
      {
        id: "s3_04",
        type: "action",
        question:
          "Consultez la fiche d'un architecte dans la shortlist. Vérifiez sa spécialité, sa localisation et ses candidatures passées avec AlyoS.",
      },
      {
        id: "s3_05",
        type: "qcm",
        question: "Comment la shortlist d'architectes est-elle constituée ?",
        options: [
          "Tirage au sort dans l'annuaire national",
          "Scoring basé sur la proximité géographique, la spécialité et l'historique AlyoS",
          "Choix manuel par le directeur d'AlyoS",
        ],
        correctIndex: 1,
      },
      {
        id: "s3_06",
        type: "action",
        question:
          "Envoyez une sollicitation à un architecte depuis l'interface Tandem. Vérifiez l'email généré automatiquement.",
      },
      {
        id: "s3_07",
        type: "qcm",
        question:
          "Après combien de jours sans réponse d'un architecte une relance automatique est-elle envoyée ?",
        options: ["1 jour", "3 jours", "7 jours"],
        correctIndex: 1,
      },
      {
        id: "s3_08",
        type: "qcm",
        question: "Que signifie le statut « Architecte décliné » dans un dossier Tandem ?",
        options: [
          "L'architecte a refusé de participer à cette candidature",
          "L'architecte est hors zone géographique",
          "La candidature a été rejetée par le maître d'ouvrage",
        ],
        correctIndex: 0,
      },
      {
        id: "s3_09",
        type: "action",
        question:
          "Dans le tableau de bord Tandem, repérez un dossier en statut « En attente de réponse ». Identifiez la date limite de réponse architecte.",
      },
      {
        id: "s3_10",
        type: "open",
        question:
          "Décrivez les étapes que vous suivriez pour constituer un tandem sur un AO de réhabilitation de logements sociaux en Bretagne.",
      },
    ],
  },
  {
    id: "tb000001-0000-0000-0000-000000000004",
    title: "Bibliothèque documentaire & coffre BET",
    formationId: "fb000001-0000-0000-0000-000000000004",
    displayOrder: 4,
    steps: [
      {
        id: "s4_01",
        type: "action",
        question:
          "Accédez à « Admin > Bibliothèque entreprise ». Observez les catégories de documents disponibles (Kbis, URSSAF, DC1, DC2, DC4, attestation assurance…).",
      },
      {
        id: "s4_02",
        type: "qcm",
        question: "Combien de catégories de documents accueille la bibliothèque AlyoS ?",
        options: [
          "5 catégories",
          "10 catégories",
          "14 catégories (Kbis, DC1, DC2, DC4, attestations…)",
        ],
        correctIndex: 2,
      },
      {
        id: "s4_03",
        type: "qcm",
        question: "À quoi sert le document « DC2 » dans un dossier de candidature ?",
        options: [
          "Déclaration du candidat individuel ou du membre du groupement (capacités financières et techniques)",
          "Acte d'engagement signé par le mandataire",
          "Attestation de régularité fiscale éditée par les impôts",
        ],
        correctIndex: 0,
      },
      {
        id: "s4_04",
        type: "action",
        question:
          "Vérifiez si l'attestation URSSAF et le Kbis sont bien chargés dans la bibliothèque. Notez leur date d'expiration si disponible.",
      },
      {
        id: "s4_05",
        type: "qcm",
        question: "Les documents de la bibliothèque sont :",
        options: [
          "Propres à chaque appel d'offres, à re-télécharger à chaque fois",
          "Réutilisables pour toutes les candidatures AlyoS sans ressaisie",
          "Partagés automatiquement avec tous les architectes cotraitants",
        ],
        correctIndex: 1,
      },
      {
        id: "s4_06",
        type: "action",
        question:
          "Consultez l'annuaire des architectes. Ouvrez la fiche d'un architecte et vérifiez ses pièces administratives chargées.",
      },
      {
        id: "s4_07",
        type: "qcm",
        question: "Quel est l'avantage principal de centraliser les pièces dans edifio Sourcing ?",
        options: [
          "Réduction du coût de stockage serveur",
          "Ne pas ressaisir les mêmes documents à chaque dossier et être alerté avant expiration",
          "Les pièces sont signées électroniquement par Docusign",
        ],
        correctIndex: 1,
      },
      {
        id: "s4_08",
        type: "open",
        question:
          "Quels documents d'AlyoS Ingénierie pensez-vous prioritaires à charger dans la bibliothèque pour les prochaines candidatures ? Pourquoi ?",
      },
    ],
  },
];

// ─── Script principal ─────────────────────────────────────────────────────────

async function seedFormations() {
  // --- Formations (idempotence par titre — la table peut déjà avoir des lignes) ---

  console.log(`[seed-formations] Vérification / insertion de ${FORMATIONS.length} formations...`);

  let formationsInserted = 0;
  let formationsSkipped = 0;

  // Map title → id réel en BDD (pour lier les guided_tests correctement)
  const formationIdByTitle = new Map<string, string>();

  for (let i = 0; i < FORMATIONS.length; i++) {
    const f = FORMATIONS[i]!;
    const label = `Formation ${i + 1}/${FORMATIONS.length} : "${f.title}"`;

    // Cherche d'abord par titre (cas prod : la table peut avoir des UUIDs random)
    const existing = await db
      .select({ id: formations.id })
      .from(formations)
      .where(eq(formations.title, f.title))
      .limit(1);

    if (existing.length > 0 && existing[0]) {
      console.log(`[seed-formations] ${label} — OK (déjà présente, id=${existing[0].id})`);
      formationIdByTitle.set(f.title, existing[0].id);
      formationsSkipped++;
    } else {
      const inserted = await db.insert(formations).values(f).returning({ id: formations.id });

      const newId = inserted[0]?.id ?? f.id!;
      console.log(`[seed-formations] ${label} — OK (insérée, id=${newId})`);
      formationIdByTitle.set(f.title, newId);
      formationsInserted++;
    }
  }

  // --- Tests guidés ---

  console.log(`[seed-formations] Insertion de ${GUIDED_TESTS.length} tests guidés...`);

  let testsInserted = 0;
  let testsSkipped = 0;

  // Titres des formations correspondant à chaque test (index 0-3)
  const FORMATION_TITLES = FORMATIONS.map((f) => f.title);

  for (let i = 0; i < GUIDED_TESTS.length; i++) {
    const t = GUIDED_TESTS[i]!;
    const label = `Test guidé ${i + 1}/${GUIDED_TESTS.length} : "${t.title}" (${t.steps.length} étapes)`;

    // Résoudre le formationId réel (lookup par titre de la formation associée)
    const formationTitle = FORMATION_TITLES[i];
    const resolvedFormationId = formationTitle
      ? (formationIdByTitle.get(formationTitle) ?? t.formationId)
      : t.formationId;

    const result = await db
      .insert(guidedTests)
      .values({
        id: t.id,
        title: t.title,
        formationId: resolvedFormationId,
        steps: t.steps,
        isActive: true,
        displayOrder: t.displayOrder,
      })
      .onConflictDoNothing()
      .returning({ id: guidedTests.id });

    if (result.length > 0) {
      console.log(`[seed-formations] ${label} — OK (inséré)`);
      testsInserted++;
    } else {
      console.log(`[seed-formations] ${label} — OK (déjà présent)`);
      testsSkipped++;
    }
  }

  // --- Résumé ---

  console.log(
    `[seed-formations] Terminé. ${FORMATIONS.length} formations (${formationsInserted} insérées, ${formationsSkipped} ignorées), ${GUIDED_TESTS.length} tests guidés (${testsInserted} insérés, ${testsSkipped} ignorés).`,
  );

  process.exit(0);
}

seedFormations().catch((e) => {
  console.error("[seed-formations] Erreur fatale :", e);
  process.exit(1);
});
