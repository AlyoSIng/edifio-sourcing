// ============================================================================
// seed/100-tenders.ts — Jeu de fixtures déterministes (variante Prisma)
// ----------------------------------------------------------------------------
// Miroir strict de spike/drizzle/seed/100-tenders.ts (Phase 2a) — MÊMES fixtures,
// MÊME PRNG (LCG type Numerical Recipes), MÊME seed 'edifio-spike-2a'.
// Reproductibilité bench Phase 3 : un seed identique = des données identiques
// = un bench équitable Drizzle vs Prisma. Toute divergence ici fausserait le
// verdict Phase 4.
//
// ÉCART DX PRISMA documenté (critère 25 % Gate 5) :
//   - `prisma.model.createMany()` NE retourne PAS les rows insérées (uniquement
//     `{ count }`). Solution : pré-générer les UUID côté JS via crypto.randomUUID()
//     et fournir des IDs explicites dans le payload. Coût DX : 1 ligne par entité,
//     pas catastrophique. Comparé à Drizzle qui supporte `.returning()` natif sur
//     l'insert, c'est un écart à documenter.
//   - Idem pas de `truncate` natif : on utilise `deleteMany({})` (les FK
//     ON DELETE CASCADE prennent en charge la propagation). Performance plus
//     lente qu'un TRUNCATE CASCADE mais reste acceptable pour 100 tenders + 50
//     architectes (~quelques centaines de ms en local).
//   - Le typage Json column est `Prisma.InputJsonValue` (équivalent unknown
//     contraint) — pas d'équivalent du `$type<ArchitectContactInfo>()` Drizzle.
//     On cast manuellement au point d'usage.
//
// Usage :
//   pnpm seed                          # depuis spike/prisma/
//   tsx seed/100-tenders.ts            # direct
// ============================================================================

import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { Prisma } from "@prisma/client";
import { prisma, pool } from "../src/db";

// ---------------------------------------------------------------------------
// PRNG déterministe — Linear Congruential Generator (Numerical Recipes)
// ---------------------------------------------------------------------------
// Identique au Drizzle. Constantes : m = 2^32, a = 1664525, c = 1013904223.
// Hash FNV-1a 32 bits du seed string vers un uint32 initial. Reproductibilité
// stricte d'une exécution à l'autre, d'un ORM à l'autre, d'une machine à l'autre.
class SeededRandom {
  private state: number;

  constructor(seed: string) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    this.state = h >>> 0;
  }

  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  int(min: number, maxExclusive: number): number {
    return Math.floor(this.next() * (maxExclusive - min)) + min;
  }

  pick<T>(arr: readonly T[]): T {
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
// FIXTURES STATIQUES — copie EXACTE de la variante Drizzle
// ---------------------------------------------------------------------------
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

const CPV_CODES = [
  "45000000",
  "45100000",
  "45200000",
  "45210000",
  "45211000",
  "45212000",
  "45213000",
  "45214000",
  "45215000",
  "45220000",
  "71200000",
  "71210000",
  "71220000",
  "71240000",
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
// TYPES LOCAUX — équivalents au $type<ArchitectContactInfo>() Drizzle
// ---------------------------------------------------------------------------
// Prisma n'autorise pas le typing fort des champs Json côté schema. On expose
// donc un type local pour conserver la sécurité au point d'usage.
type ArchitectContactInfo = {
  email: string;
  phone?: string;
  title?: "M." | "Mme" | "Dr" | "autre";
};

// ---------------------------------------------------------------------------
// GÉNÉRATEURS — logique IDENTIQUE Drizzle, payload mappé Prisma
// ---------------------------------------------------------------------------

type ArchitectSeed = Prisma.ArchitectCreateManyInput;

function generateArchitect(rng: SeededRandom, organizationId: string): ArchitectSeed {
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
  const specialtyCount = rng.int(1, 5);
  const specialtyPool = [...SPECIALTIES];
  const specialtyCodes: string[] = [];
  for (let i = 0; i < specialtyCount && specialtyPool.length > 0; i++) {
    const idx = rng.int(0, specialtyPool.length);
    specialtyCodes.push(specialtyPool.splice(idx, 1)[0] as string);
  }
  const geoCount = rng.int(1, 4);
  const geoPool = [...GEO_ZONES];
  const geoZones: string[] = [];
  for (let i = 0; i < geoCount && geoPool.length > 0; i++) {
    const idx = rng.int(0, geoPool.length);
    geoZones.push(geoPool.splice(idx, 1)[0] as string);
  }
  return {
    // ID pré-généré côté JS (cf. écart DX en tête de fichier).
    id: randomUUID(),
    organizationId,
    firstname,
    lastname,
    // Cast contrôlé : ArchitectContactInfo → InputJsonValue. Pas de typage côté
    // schéma Prisma, on conserve la garantie au runtime via le type local.
    contactInfo: contactInfo as unknown as Prisma.InputJsonValue,
    specialtyCodes,
    geoZones,
    tutoiement: rng.bool(0.3),
  };
}

/**
 * Génère un payload raw_data jsonb cible 10-50 KB.
 * Stratégie identique au seed Drizzle (mêmes buckets, mêmes ratios).
 */
function generateRawData(rng: SeededRandom): Record<string, unknown> {
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

  const description: string[] = [];
  for (let i = 0; i < paragraphReps; i++) {
    description.push(rng.pick(DESCRIPTION_PARAGRAPHS));
  }

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
    scoring_hints: {
      preferred_tier: rng.pick(["Sourcing", "Cotraitance", "Studio IA"] as const),
      complexity: rng.int(1, 6),
      urgency: rng.int(1, 4),
      eco_label_required: rng.bool(0.4),
      cotraitance_required: rng.bool(0.5),
      tutoiement_preferred: rng.bool(0.3),
    },
  };
}

type TenderSeed = Prisma.TenderCreateManyInput;

function generateTender(rng: SeededRandom, organizationId: string, index: number): TenderSeed {
  const city = rng.pick(FRENCH_CITIES);
  const region = rng.pick(GEO_ZONES);
  const projectType = rng.pick(PROJECT_TYPES);
  const buyerTpl = rng.pick(BUYERS);
  const buyer = buyerTpl.replace("%CITY%", city).replace("%REGION%", region);
  const cpvCount = rng.int(1, 4);
  const cpvPool = [...CPV_CODES];
  const cpv: string[] = [];
  for (let i = 0; i < cpvCount && cpvPool.length > 0; i++) {
    const idx = rng.int(0, cpvPool.length);
    cpv.push(cpvPool.splice(idx, 1)[0] as string);
  }
  const deadline = new Date();
  deadline.setUTCDate(deadline.getUTCDate() + rng.int(30, 181));
  return {
    id: randomUUID(),
    organizationId,
    externalRef: `BOAMP-2026-${String(index + 1).padStart(6, "0")}`,
    title: `${projectType} - ${rng.pick(SPECIALTIES).replace(/_/g, " ")} à ${city}`,
    buyer,
    cpv,
    geoZone: region,
    // Prisma Decimal accepte string | number | Prisma.Decimal. On reste sur
    // string pour parité exacte avec le seed Drizzle (postgres-js sérialise
    // numeric en string).
    amount: String(rng.int(500_000, 25_000_001)),
    deadline,
    rawData: generateRawData(rng) as Prisma.InputJsonValue,
    // status par défaut 'sourced' — laissé implicite.
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
  // 1. RESET — deleteMany() en cascade FK (ordre inverse des dépendances)
  // -------------------------------------------------------------------------
  // Note DX : pas de TRUNCATE natif Prisma. `deleteMany({})` est plus lent
  // qu'un TRUNCATE RESTART IDENTITY CASCADE mais reste OK à cette échelle
  // (~quelques centaines de ms pour 100 tenders). Alternative : passer par
  // `$executeRawUnsafe('TRUNCATE ... CASCADE')` — on s'en abstient ici pour
  // rester sur l'API canonique Prisma (le bench mesure aussi la DX réelle).
  await prisma.architectResponse.deleteMany({});
  await prisma.tender.deleteMany({});
  await prisma.architect.deleteMany({});
  await prisma.organization.deleteMany({});

  // -------------------------------------------------------------------------
  // 2. ORGANIZATION (1) — `create` retourne la row (≠ createMany)
  // -------------------------------------------------------------------------
  const org = await prisma.organization.create({
    data: {
      name: "AlyoS Ingénierie",
      siren: "900123456",
      tier: "Sourcing",
    },
    select: { id: true },
  });
  const organizationId = org.id;

  // -------------------------------------------------------------------------
  // 3. ARCHITECTS (50) — IDs pré-générés, insert batch via createMany
  // -------------------------------------------------------------------------
  // ÉCART DX vs Drizzle :
  //   - Drizzle : .insert(...).values(batch).returning({id}) → 1 roundtrip
  //   - Prisma  : on doit pré-générer les UUID côté JS car createMany ne
  //               retourne que { count }. Coût technique : nul (crypto.randomUUID
  //               est rapide). Coût ergo : 1 ligne par entité au seed.
  const architectsBatch: ArchitectSeed[] = [];
  for (let i = 0; i < architectCount; i++) {
    architectsBatch.push(generateArchitect(rng, organizationId));
  }
  await prisma.architect.createMany({ data: architectsBatch });
  const architectIds = architectsBatch.map((a) => a.id as string);

  // -------------------------------------------------------------------------
  // 4. TENDERS (100) — même pattern, IDs pré-générés JS
  // -------------------------------------------------------------------------
  const tendersBatch: TenderSeed[] = [];
  const sizes: number[] = [];
  for (let i = 0; i < tenderCount; i++) {
    const t = generateTender(rng, organizationId, i);
    tendersBatch.push(t);
    // Mesure taille jsonb (sérialisation JSON UTF-8) — métrique stats finale.
    sizes.push(Buffer.byteLength(JSON.stringify(t.rawData ?? {}), "utf8"));
  }
  await prisma.tender.createMany({ data: tendersBatch });
  const tenderIds = tendersBatch.map((t) => t.id as string);

  // Stats taille raw_data — métriques distribution payload.
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
// Détection main robuste cross-OS (cf. seed Drizzle pour rationale).
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
  // Fermeture propre : Prisma $disconnect + pool pg end.
  await prisma.$disconnect();
  await pool.end();
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch(async (err) => {
    console.error("[seed] FATAL", err);
    await prisma.$disconnect().catch(() => undefined);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
}
