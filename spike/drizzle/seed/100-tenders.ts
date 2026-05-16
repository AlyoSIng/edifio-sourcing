// ============================================================================
// seed/100-tenders.ts — Jeu de fixtures déterministes pour le bench scoring
// ----------------------------------------------------------------------------
// Génère :
//   - 1 organization "AlyoS" (tier 'Sourcing')
//   - 50 architects mock (contact_info jsonb réaliste, tutoiement aléatoire mais
//     déterministe via le PRNG seedé)
//   - 100 tenders mock avec raw_data jsonb 10-50 KB par AO (verdict Cowork Q1 :
//     médiane ~25 KB, queue jusqu'à 50 KB)
//
// Idempotent : tronque les 4 tables en début de seed. Permet de rejouer le bench
// plusieurs fois sans drift de données. Utilise TRUNCATE … RESTART IDENTITY
// CASCADE pour reset propre (les FK ON DELETE CASCADE sont déjà en place).
//
// PRNG seedé maison (LCG type Numerical Recipes) — pas de dépendance externe.
// Le seed 'edifio-spike-2a' est hashé en uint32 ; toutes les random* dérivent
// du même générateur → outputs strictement reproductibles d'un run à l'autre,
// indispensable pour comparer Drizzle vs Prisma sur exactement le même jeu.
//
// Usage :
//   pnpm seed                    # depuis spike/drizzle/
//   tsx seed/100-tenders.ts      # direct
// ============================================================================

import { pathToFileURL } from "node:url";
import { sql as drizzleSql } from "drizzle-orm";
import { db, sql as pgSql } from "../db";
import {
  architects,
  architectResponses,
  organizations,
  tenders,
  type ArchitectContactInfo,
  type NewArchitect,
  type NewTender,
} from "../schema";

// ---------------------------------------------------------------------------
// PRNG déterministe — Linear Congruential Generator (Numerical Recipes)
// ---------------------------------------------------------------------------
// Pourquoi pas Math.random ? Aucune garantie de seedabilité en Node.
// Pourquoi pas seedrandom ? Ajouter une dep pour 20 lignes serait disproportionné.
//
// Constants : Numerical Recipes — m = 2^32, a = 1664525, c = 1013904223.
// Période = 2^32 (suffisant pour quelques milliers de tirages dans le seed).
class SeededRandom {
  private state: number;

  constructor(seed: string) {
    // Hash FNV-1a 32 bits du seed string vers un uint32 initial.
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    this.state = h >>> 0;
  }

  next(): number {
    // a * state + c mod 2^32 ; on tronque via >>> 0
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    // Retourne un float [0, 1) — convention Math.random
    return this.state / 0x100000000;
  }

  int(min: number, maxExclusive: number): number {
    return Math.floor(this.next() * (maxExclusive - min)) + min;
  }

  pick<T>(arr: readonly T[]): T {
    // noUncheckedIndexedAccess : on garantit un index valide.
    const idx = this.int(0, arr.length);
    const v = arr[idx];
    if (v === undefined) {
      throw new Error("SeededRandom.pick : array vide");
    }
    return v;
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }
}

// ---------------------------------------------------------------------------
// FIXTURES STATIQUES — arrays natifs, pas de Faker
// ---------------------------------------------------------------------------
// Sources : prénoms / noms / villes / mots-clés métier BTP courants.
// Volontairement limités pour qu'un même nom puisse réapparaître (réaliste
// sur un dataset de 50 architectes — pas tout le monde a un prénom unique).
const FIRST_NAMES = [
  "Sandrine",
  "Marc",
  "Sophie",
  "Léa",
  "Théo",
  "Patrick",
  "Camille",
  "Julien",
  "Émilie",
  "Antoine",
  "Claire",
  "Romain",
  "Élise",
  "Mathieu",
  "Anaïs",
  "Vincent",
  "Pauline",
  "Nicolas",
  "Marion",
  "Étienne",
] as const;

const LAST_NAMES = [
  "Martin",
  "Bernard",
  "Thomas",
  "Petit",
  "Robert",
  "Richard",
  "Dubois",
  "Moreau",
  "Laurent",
  "Simon",
  "Michel",
  "Lefèvre",
  "Leroy",
  "Roux",
  "David",
  "Bertrand",
  "Morel",
  "Fournier",
  "Girard",
  "Bonnet",
] as const;

const FRENCH_CITIES = [
  "Paris",
  "Lyon",
  "Marseille",
  "Toulouse",
  "Nice",
  "Nantes",
  "Strasbourg",
  "Montpellier",
  "Bordeaux",
  "Lille",
  "Rennes",
  "Reims",
  "Saint-Étienne",
  "Le Havre",
  "Toulon",
  "Grenoble",
  "Dijon",
  "Angers",
  "Nîmes",
  "Villeurbanne",
] as const;

const GEO_ZONES = [
  "Île-de-France",
  "Auvergne-Rhône-Alpes",
  "Provence-Alpes-Côte d'Azur",
  "Nouvelle-Aquitaine",
  "Occitanie",
  "Hauts-de-France",
  "Grand Est",
  "Pays de la Loire",
  "Bretagne",
  "Normandie",
  "Bourgogne-Franche-Comté",
  "Centre-Val de Loire",
] as const;

// Codes CPV (Common Procurement Vocabulary) BTP plausibles.
const CPV_CODES = [
  "45000000", // Travaux de construction
  "45100000", // Préparation chantier
  "45200000", // Bâtiments complets ou parties
  "45210000", // Bâtiments
  "45211000", // Logements
  "45212000", // Bâtiments loisirs / sports / culture
  "45213000", // Bâtiments commerciaux
  "45214000", // Bâtiments enseignement / recherche
  "45215000", // Bâtiments santé / social
  "45220000", // Ouvrages art / génie civil
  "71200000", // Architecture
  "71210000", // Conseil architectural
  "71220000", // Conception architecturale
  "71240000", // Architecture + ingénierie
] as const;

const SPECIALTIES = [
  "logement_collectif",
  "logement_individuel",
  "tertiaire_bureaux",
  "sante_hospitalier",
  "enseignement_ecole",
  "enseignement_universite",
  "commerce_centre",
  "industrie_logistique",
  "patrimoine_renovation",
  "culturel_musee",
  "sportif_gymnase",
  "voirie_amenagement",
] as const;

const BUYERS = [
  "Mairie de %CITY%",
  "Conseil départemental %REGION%",
  "Région %REGION%",
  "Communauté d'agglomération %CITY%",
  "Centre hospitalier %CITY%",
  "Université de %CITY%",
  "Office HLM %CITY%",
  "SDIS %REGION%",
  "Établissement public foncier %REGION%",
] as const;

const PROJECT_TYPES = [
  "Construction",
  "Rénovation",
  "Extension",
  "Restructuration",
  "Réhabilitation thermique",
  "Mise aux normes accessibilité",
  "Démolition et reconstruction",
] as const;

const LOT_NAMES = [
  "Gros œuvre",
  "Charpente",
  "Couverture",
  "Étanchéité",
  "Façades",
  "Menuiseries extérieures",
  "Menuiseries intérieures",
  "Cloisons sèches",
  "Plomberie",
  "Chauffage",
  "Ventilation",
  "Climatisation",
  "Électricité courants forts",
  "Électricité courants faibles",
  "Revêtements de sols durs",
  "Revêtements de sols souples",
  "Peinture",
  "Faux-plafonds",
  "Serrurerie",
  "Ascenseurs",
] as const;

// Phrases descriptives utilisées pour gonfler la description et atteindre la
// taille jsonb cible. Pas du Lorem — du texte BTP plausible.
const DESCRIPTION_PARAGRAPHS = [
  "Le présent marché a pour objet la conception et la réalisation d'un projet " +
    "d'envergure visant à répondre aux besoins exprimés par le maître d'ouvrage " +
    "dans le cadre de sa politique de développement territorial.",
  "Les prestations attendues incluent l'ensemble des missions de maîtrise " +
    "d'œuvre depuis les études d'esquisse jusqu'à la réception définitive des " +
    "ouvrages, en passant par l'assistance aux contrats de travaux.",
  "Le candidat devra justifier d'une expérience significative sur des " +
    "opérations similaires en termes de surface, de complexité technique et " +
    "de contraintes environnementales (label E+C-, BBCA, HQE, BREEAM).",
  "Une attention particulière sera portée à la prise en compte des objectifs " +
    "de réduction de l'empreinte carbone du bâtiment, à la qualité des espaces " +
    "extérieurs et à l'intégration urbaine du projet.",
  "Le calendrier prévisionnel prévoit un démarrage des études en phase APS au " +
    "mois suivant la notification du marché, pour une livraison estimée à " +
    "24 mois après ordre de service.",
  "Le titulaire devra organiser une concertation préalable avec les usagers et " +
    "les riverains, conformément aux engagements pris par le maître d'ouvrage " +
    "lors de la délibération du conseil municipal du 14 mars dernier.",
  "Les critères d'analyse des offres porteront sur la valeur technique " +
    "(60 %), le prix des prestations (30 %) et le délai d'exécution (10 %), " +
    "avec une attention spécifique à la qualité de l'équipe de maîtrise d'œuvre.",
  "L'opération s'inscrit dans le cadre du plan pluriannuel d'investissement " +
    "voté par la collectivité et bénéficie de cofinancements de l'État, de la " +
    "région et du fonds européen FEDER.",
] as const;

// ---------------------------------------------------------------------------
// GÉNÉRATEURS
// ---------------------------------------------------------------------------

function generateArchitect(rng: SeededRandom, organizationId: string): NewArchitect {
  const firstname = rng.pick(FIRST_NAMES);
  const lastname = rng.pick(LAST_NAMES);
  const city = rng.pick(FRENCH_CITIES);
  const contactInfo: ArchitectContactInfo = {
    email:
      `${firstname.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}.` +
      `${lastname.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}` +
      `@archi-${city.toLowerCase().replace(/[^a-z]/g, "")}.fr`,
    phone: `+33${rng.int(1, 7)}${rng.int(10, 100)}${rng.int(10, 100)}${rng.int(10, 100)}${rng.int(10, 100)}`,
    title: rng.bool(0.6) ? "M." : "Mme",
  };
  // Specialty codes : 1 à 4 spécialités tirées sans doublon.
  const specialtyCount = rng.int(1, 5);
  const specialtyPool = [...SPECIALTIES];
  const specialtyCodes: string[] = [];
  for (let i = 0; i < specialtyCount && specialtyPool.length > 0; i++) {
    const idx = rng.int(0, specialtyPool.length);
    specialtyCodes.push(specialtyPool.splice(idx, 1)[0] as string);
  }
  // Geo zones : 1 à 3.
  const geoCount = rng.int(1, 4);
  const geoPool = [...GEO_ZONES];
  const geoZones: string[] = [];
  for (let i = 0; i < geoCount && geoPool.length > 0; i++) {
    const idx = rng.int(0, geoPool.length);
    geoZones.push(geoPool.splice(idx, 1)[0] as string);
  }
  return {
    organizationId,
    firstname,
    lastname,
    contactInfo,
    specialtyCodes,
    geoZones,
    // Tutoiement par défaut FALSE (vouvoiement) — directive Board Gate 4 —
    // mais le seed pose ~30 % à TRUE pour tester les deux templates Brevo.
    tutoiement: rng.bool(0.3),
  };
}

/**
 * Génère un payload raw_data jsonb cible 10-50 KB.
 * La distribution est contrôlée pour viser une médiane ~25 KB.
 *
 * Stratégie de gonflage :
 *   - description répétée N fois (N = bucket aléatoire)
 *   - lots (5 à 20)
 *   - critères de jugement (3 à 8 lignes commentées)
 *   - documents annexes (5 à 30 mock)
 *   - pièces administratives (texte fixe long)
 */
function generateRawData(rng: SeededRandom): Record<string, unknown> {
  // Bucket de taille — détermine combien de paragraphes / lots / documents.
  // Distribution : 15 % small (~10 KB), 60 % medium (~25 KB), 25 % large (~45 KB).
  const sizeRoll = rng.next();
  let paragraphReps: number;
  let lotsCount: number;
  let docsCount: number;
  let criteriaCount: number;
  if (sizeRoll < 0.15) {
    paragraphReps = 3;
    lotsCount = 5;
    docsCount = 8;
    criteriaCount = 3;
  } else if (sizeRoll < 0.75) {
    paragraphReps = 8;
    lotsCount = 12;
    docsCount = 18;
    criteriaCount = 5;
  } else {
    paragraphReps = 15;
    lotsCount = 20;
    docsCount = 30;
    criteriaCount = 8;
  }

  // Description longue : on répète les paragraphes BTP.
  const description: string[] = [];
  for (let i = 0; i < paragraphReps; i++) {
    description.push(rng.pick(DESCRIPTION_PARAGRAPHS));
  }

  // Lots — chaque lot a un nom, un montant estimé, et une description courte.
  const lotsPool = [...LOT_NAMES];
  const lots: Array<{
    numero: number;
    nom: string;
    montant_estime_euros: number;
    description: string;
    cpv_lot: string;
  }> = [];
  for (let i = 0; i < lotsCount && lotsPool.length > 0; i++) {
    const idx = rng.int(0, lotsPool.length);
    const lotName = lotsPool.splice(idx, 1)[0] as string;
    lots.push({
      numero: i + 1,
      nom: lotName,
      montant_estime_euros: rng.int(50_000, 2_500_000),
      description: rng.pick(DESCRIPTION_PARAGRAPHS),
      cpv_lot: rng.pick(CPV_CODES),
    });
  }

  // Critères de jugement des offres — pondération aléatoire normalisée à 100.
  const criteriaLabels = [
    "Valeur technique",
    "Prix des prestations",
    "Délai d'exécution",
    "Performance environnementale",
    "Qualité de l'équipe",
    "Méthodologie de pilotage",
    "Insertion sociale",
    "Innovation",
  ];
  const criteria: Array<{ label: string; ponderation: number; commentaire: string }> = [];
  for (let i = 0; i < criteriaCount; i++) {
    criteria.push({
      label: criteriaLabels[i] ?? `Critère ${i + 1}`,
      ponderation: rng.int(5, 35),
      commentaire: rng.pick(DESCRIPTION_PARAGRAPHS),
    });
  }

  // Documents annexes mock — DCE typique d'un AO public.
  const docTypes = [
    "RC (règlement de consultation)",
    "AAPC",
    "CCAP",
    "CCTP",
    "BPU",
    "DPGF",
    "Annexe technique",
    "Plan masse",
    "Plan de coupe",
    "Photos site existant",
    "Diagnostic amiante",
    "Diagnostic plomb",
    "Étude géotechnique",
    "Étude thermique",
    "PV jury",
  ];
  const documents: Array<{ nom: string; type: string; url_mock: string; taille_ko: number }> = [];
  for (let i = 0; i < docsCount; i++) {
    documents.push({
      nom: `${rng.pick(docTypes)} - v${rng.int(1, 4)}.pdf`,
      type: rng.pick(docTypes),
      url_mock: `https://mock-dce.example.fr/files/${rng.int(100000, 999999)}.pdf`,
      taille_ko: rng.int(50, 12_000),
    });
  }

  // Pièces administratives — texte fixe long, gonfle le payload.
  const piecesAdmin =
    "Le candidat doit fournir l'ensemble des pièces suivantes au stade de la " +
    "candidature : déclaration sur l'honneur, attestations fiscales et sociales " +
    "à jour, extrait Kbis ou équivalent de moins de 3 mois, attestation " +
    "d'assurance responsabilité civile professionnelle couvrant les missions " +
    "d'architecte, attestation d'inscription à l'Ordre des architectes, " +
    "références sur opérations similaires des 5 dernières années avec montants " +
    "et descriptifs détaillés, présentation de l'équipe avec CV des intervenants " +
    "clés, attestations de capacité professionnelle, certificats de qualification " +
    "le cas échéant, pouvoirs des signataires, mémoire technique détaillé " +
    "présentant la méthodologie envisagée pour mener à bien la mission.";

  return {
    description_consolidee: description.join("\n\n"),
    lots,
    criteres_jugement: criteria,
    documents_annexes: documents,
    pieces_administratives: piecesAdmin,
    // Bonus métadonnées — utilisées par le scoring (tier_bonus, region_match,
    // budget_fit, delay_score, tutoiement_pref). Cf. edge-function/scoring.ts.
    scoring_hints: {
      preferred_tier: rng.pick(["Sourcing", "Cotraitance", "Studio IA"] as const),
      complexity: rng.int(1, 6), // 1..5
      urgency: rng.int(1, 4), // 1..3
      eco_label_required: rng.bool(0.4),
      cotraitance_required: rng.bool(0.5),
      tutoiement_preferred: rng.bool(0.3),
    },
  };
}

function generateTender(rng: SeededRandom, organizationId: string, index: number): NewTender {
  const city = rng.pick(FRENCH_CITIES);
  const region = rng.pick(GEO_ZONES);
  const projectType = rng.pick(PROJECT_TYPES);
  const buyerTpl = rng.pick(BUYERS);
  const buyer = buyerTpl.replace("%CITY%", city).replace("%REGION%", region);
  // Nombre de codes CPV : 1 à 3.
  const cpvCount = rng.int(1, 4);
  const cpvPool = [...CPV_CODES];
  const cpv: string[] = [];
  for (let i = 0; i < cpvCount && cpvPool.length > 0; i++) {
    const idx = rng.int(0, cpvPool.length);
    cpv.push(cpvPool.splice(idx, 1)[0] as string);
  }
  // Deadline : entre J+30 et J+180.
  const deadline = new Date();
  deadline.setUTCDate(deadline.getUTCDate() + rng.int(30, 181));
  return {
    organizationId,
    externalRef: `BOAMP-2026-${String(index + 1).padStart(6, "0")}`,
    title: `${projectType} - ${rng.pick(SPECIALTIES).replace(/_/g, " ")} à ${city}`,
    buyer,
    cpv,
    geoZone: region,
    // Montant : 500 K€ à 25 M€. Numeric stocké en string par drizzle/postgres.js.
    amount: String(rng.int(500_000, 25_000_001)),
    deadline,
    rawData: generateRawData(rng),
    // status par défaut 'sourced' (cf. schema). On le laisse implicite.
  };
}

// ---------------------------------------------------------------------------
// SEED ALL
// ---------------------------------------------------------------------------

export type SeedResult = {
  organizationId: string;
  architectIds: string[];
  tenderIds: string[];
  rawDataSizeStats: {
    min: number;
    max: number;
    median: number;
    mean: number;
  };
};

export async function seedAll(opts?: {
  tenderCount?: number;
  architectCount?: number;
  seed?: string;
}): Promise<SeedResult> {
  const tenderCount = opts?.tenderCount ?? 100;
  const architectCount = opts?.architectCount ?? 50;
  const seedString = opts?.seed ?? "edifio-spike-2a";
  const rng = new SeededRandom(seedString);

  // -------------------------------------------------------------------------
  // 1. RESET — TRUNCATE CASCADE pour idempotence
  // -------------------------------------------------------------------------
  // Note : on désactive temporairement les triggers user pour éviter qu'un
  // hook de bench (s'il existait) ne se déclenche. Pas de trigger user dans
  // le spike 2a, donc commande purement défensive.
  await db.execute(drizzleSql`
    TRUNCATE TABLE architect_responses, tenders, architects, organizations
    RESTART IDENTITY CASCADE
  `);

  // -------------------------------------------------------------------------
  // 2. ORGANIZATION (1)
  // -------------------------------------------------------------------------
  const [org] = await db
    .insert(organizations)
    .values({
      name: "AlyoS Ingénierie",
      siren: "900123456",
      tier: "Sourcing",
    })
    .returning({ id: organizations.id });
  if (!org) {
    throw new Error("seed: organization insert failed");
  }
  const organizationId = org.id;

  // -------------------------------------------------------------------------
  // 3. ARCHITECTS (50)
  // -------------------------------------------------------------------------
  const architectsBatch: NewArchitect[] = [];
  for (let i = 0; i < architectCount; i++) {
    architectsBatch.push(generateArchitect(rng, organizationId));
  }
  const insertedArchitects = await db
    .insert(architects)
    .values(architectsBatch)
    .returning({ id: architects.id });
  const architectIds = insertedArchitects.map((a) => a.id);

  // -------------------------------------------------------------------------
  // 4. TENDERS (100)
  // -------------------------------------------------------------------------
  const tendersBatch: NewTender[] = [];
  const sizes: number[] = [];
  for (let i = 0; i < tenderCount; i++) {
    const t = generateTender(rng, organizationId, i);
    tendersBatch.push(t);
    // Mesure taille jsonb (sérialisation JSON UTF-8) pour stats finales.
    sizes.push(Buffer.byteLength(JSON.stringify(t.rawData ?? {}), "utf8"));
  }
  const insertedTenders = await db
    .insert(tenders)
    .values(tendersBatch)
    .returning({ id: tenders.id });
  const tenderIds = insertedTenders.map((t) => t.id);

  // Stats taille raw_data
  const sorted = [...sizes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const mean = sizes.reduce((s, v) => s + v, 0) / sizes.length;
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;

  return {
    organizationId,
    architectIds,
    tenderIds,
    rawDataSizeStats: { min, max, median, mean: Math.round(mean) },
  };
}

// ---------------------------------------------------------------------------
// CLI direct
// ---------------------------------------------------------------------------
// Le check `import.meta.url === pathToFileURL(process.argv[1])` permet de ne
// déclencher le main qu'en exécution directe (`tsx seed/100-tenders.ts`),
// pas en import depuis le bench runner.
async function main() {
  console.log('[seed] start (seed="edifio-spike-2a")');
  const t0 = performance.now();
  const result = await seedAll();
  const elapsed = Math.round(performance.now() - t0);
  console.log(
    `[seed] done in ${elapsed} ms — org=${result.organizationId}, ` +
      `architects=${result.architectIds.length}, tenders=${result.tenderIds.length}`,
  );
  console.log("[seed] raw_data size stats (bytes):", result.rawDataSizeStats);
  console.log(
    `[seed] raw_data size stats (KB) : min=${(result.rawDataSizeStats.min / 1024).toFixed(1)}, ` +
      `median=${(result.rawDataSizeStats.median / 1024).toFixed(1)}, ` +
      `mean=${(result.rawDataSizeStats.mean / 1024).toFixed(1)}, ` +
      `max=${(result.rawDataSizeStats.max / 1024).toFixed(1)}`,
  );
  // Forcer la fermeture de la connexion postgres-js pour terminer le process.
  await pgSql.end();
}

// pathToFileURL pour Windows (file:///C:/...) — comparaison robuste cross-OS.
// import.meta.url côté tsx ESM est toujours une URL file://.
const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err) => {
    console.error("[seed] FATAL", err);
    // exit code != 0 pour que le bench runner puisse détecter l'échec.
    process.exit(1);
  });
}
// référence le placeholder architectResponses pour que l'import ne soit pas
// supprimé par tree-shaking — utilisé par la table TRUNCATE.
void architectResponses;
