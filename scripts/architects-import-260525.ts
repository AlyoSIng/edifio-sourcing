/**
 * Import architectes — `Contact_complete.xlsx` (3805 cabinets) → table `architects`
 * ============================================================================
 *
 * Source : Decision Board 2026-05-25 (arbitrages Steve sur recos Nadia,
 * cf. notes-de-suivi/CC_260525_0326_NADIA_IMPORT_ARCHITECTS.md §4 scenario B
 * + §7 questions Q1-Q4).
 *
 * Contexte :
 *   - 3805 lignes export Odoo CRM + enrichissement SIRENE (50% emails, 16%
 *     spécialités, 99% géo, 0.1% Contact CRM, 46% dirigeant SIRENE).
 *   - Cible : peupler la table `architects` (refonte 2026-05-25 Tandem-ready,
 *     cf. src/db/schema/architects.ts) sans toucher au schéma.
 *   - Idempotent : upsert sur `odoo_external_id` UNIQUE → ré-import safe.
 *   - PII strict : Contact_complete.xlsx jamais commit (gitignored),
 *     rapports JSON anonymisés (pas d'email/nom/phone en clair dans samples).
 *
 * Arbitrages Steve 2026-05-25 :
 *   1. Cible : dev d'abord (dry-run + commit), puis prod après GO Nadia.
 *   2. Sans email (1903 lignes) : importer avec solicitable=false (auto GENERATED).
 *   3. Tutoiement : tout `false` par défaut (Steve corrige ciblé après).
 *   4. Sans name (4 lignes) : fallback `dirigeant_sirene` puis
 *      `"Cabinet sans nom (${odoo_id})"`.
 *
 * --------------------------------------------------------------------------
 * USAGE
 * --------------------------------------------------------------------------
 *
 *   # Dry-run dev (defaut) — parse + valide + rapport JSON, AUCUN INSERT
 *   pnpm tsx scripts/architects-import-260525.ts
 *   pnpm tsx scripts/architects-import-260525.ts --target=dev
 *
 *   # Commit dev — execute l'upsert apres dry-run valide
 *   pnpm tsx scripts/architects-import-260525.ts --target=dev --commit
 *
 *   # Dry-run prod (Steve, apres GO Nadia)
 *   pnpm tsx scripts/architects-import-260525.ts --target=prod
 *
 *   # Commit prod (Steve, apres GO Nadia et dry-run prod OK)
 *   pnpm tsx scripts/architects-import-260525.ts --target=prod --commit
 *
 *   # Options:
 *   --xlsx=<path>      chemin du XLSX (defaut: src/db/seed/Contact_complete.xlsx)
 *   --batch=<N>        taille de batch (defaut: 200)
 *
 * --------------------------------------------------------------------------
 * DOUBLE GARDE ANTI-PROD-ACCIDENT (impératif)
 * --------------------------------------------------------------------------
 *
 *   - `--target=dev`  : refuse si DATABASE_URL ne contient PAS 'localhost' OU
 *                       '127.0.0.1' OU '.supabase.co' avec ref dev distincte
 *                       (cf. assertDevContext).
 *   - `--target=prod` : refuse si DATABASE_URL contient 'localhost'/'127.0.0.1'
 *                       (pattern identique à src/db/seed/prod.ts:assertProdContext).
 *
 * --------------------------------------------------------------------------
 * RAPPORT JSON
 * --------------------------------------------------------------------------
 *
 *   tmp/architects-import-260525-{dev|prod}-{dry|commit}-{HHMMSS}.json
 *
 *   {
 *     "context": { "target", "mode", "started_at", "duration_ms" },
 *     "parsed": { "total", "header_columns" },
 *     "upsert": { "attempted", "inserted_estimate", "updated_estimate", "skipped" },
 *     "warnings": [...],   // fallback cabinet, parse SIREN id, typologie inconnue,
 *                          // headcount range, geo_zones malformee, etc.
 *     "errors": [...],
 *     "cabinet_fallbacks": [...],  // anonymise: { odoo_external_id, source }
 *     "specialty_unknowns": [...]  // anonymise: { token, count }
 *   }
 *
 * --------------------------------------------------------------------------
 * MAPPING (cf. notes-de-suivi/CC_260525_0326 §2 + spec architects_data §3)
 * --------------------------------------------------------------------------
 *
 *   cabinet (NOT NULL) : name -> dirigeant_sirene -> "Cabinet sans nom (id)"
 *   contact_name       : Contact -> dirigeant_sirene -> NULL
 *   email              : col email (NULL si vide)
 *   phone              : col phone (NULL si vide)
 *   website            : col website (NULL si vide, normalisation https?:// prefix)
 *   siren              : col siren -> extraction sirene_(\d+) depuis id
 *   zip / city         : direct (collapse NBSP &#160;)
 *   headcount          : x_studio_effectif -> effectif_sirene (range "3-5" -> 4)
 *   companySize        : col categorie (PME/ETI/GE)
 *   companyCreatedAt   : date_creation YYYY-MM-DD -> timestamptz
 *   odooExternalId     : col id (clé upsert UNIQUE)
 *   specialtyCodes     : x_studio_typologie_1 split sur ',' + normalisation
 *                        spec architects_specialty_mapping_v1.md (accent+case
 *                        insensitive)
 *   geoZones           : departements_intervention split sur ',' ou ';' (\d{2,3})
 *   tutoiement=false, preferred=false, active=true, pastCollabsCount=0
 *   solicitable = GENERATED (email IS NOT NULL) — on ne pose PAS
 *   notes              : NULL (curation admin manuelle, pas de Commentaire CRM)
 *   organizationId     : ALYOS_ORG_ID (UUID stable, source unique de verite)
 *
 * --------------------------------------------------------------------------
 * RGPD
 * --------------------------------------------------------------------------
 *
 *   - Pas de leak email/nom/phone dans rapport JSON ni stdout.
 *   - Le fichier source reste en local (gitignored), jamais envoye a un service externe.
 *   - Audit log (action `architect_import`) hors perimetre ce script CLI — sera
 *     ajoute quand l'UI admin sera implementee (M16, Alex).
 *
 * NOTE encoding : accents volontairement remplaces par ASCII dans les
 * messages console (coherence avec `seed/index.ts` + `seed/prod.ts`, evite
 * problemes encoding shell Windows).
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { sql } from "drizzle-orm";

import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { db } from "@/db/client";
import { architects, organizations } from "@/db/schema";

// ============================================================================
// SECTION 1 -- CLI args + double garde
// ============================================================================

interface CliOptions {
  target: "dev" | "prod";
  commit: boolean;
  xlsxPath: string;
  batchSize: number;
}

function parseCli(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const target = (args.find((a) => a.startsWith("--target="))?.split("=")[1] ?? "dev") as
    | "dev"
    | "prod";
  if (target !== "dev" && target !== "prod") {
    throw new Error(`[import] --target invalide: ${target} (attendu: dev|prod)`);
  }
  const commit = args.includes("--commit");
  const xlsxPath =
    args.find((a) => a.startsWith("--xlsx="))?.split("=")[1] ??
    resolve(process.cwd(), "src/db/seed/Contact_complete.xlsx");
  const batchSizeRaw = args.find((a) => a.startsWith("--batch="))?.split("=")[1] ?? "200";
  const batchSize = Number.parseInt(batchSizeRaw, 10);
  if (!Number.isFinite(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new Error(`[import] --batch invalide: ${batchSizeRaw} (attendu: 1..1000)`);
  }
  return { target, commit, xlsxPath, batchSize };
}

export interface CtxGuardEnv {
  DATABASE_URL?: string;
  NODE_ENV?: string;
}

/**
 * Garde anti-prod-accident.
 *
 *   - target=prod : refuse si DATABASE_URL contient 'localhost' / '127.0.0.1'
 *                   (meme pattern que src/db/seed/prod.ts:assertProdContext).
 *   - target=dev  : refuse si DATABASE_URL pointe sur la prod (heuristique :
 *                   nom de host ne contient ni 'localhost' ni '127.0.0.1' ni
 *                   '.test' ni 'edifio-sourcing-dev' ni '-preview.' ET le
 *                   NODE_ENV vaut 'production'). La regle stricte : pour
 *                   target=dev, on EXIGE 'localhost' OU '127.0.0.1' dans
 *                   DATABASE_URL (impose le pgcontainer dev, evite tout
 *                   accident type ".env.local pointe sur prod Supabase").
 */
export function assertTargetContext(target: "dev" | "prod", env: CtxGuardEnv): void {
  const url = env.DATABASE_URL ?? "";
  if (!url) {
    throw new Error("[import] DATABASE_URL non posee. Voir .env.example pour le format.");
  }

  const isLocal = url.includes("localhost") || url.includes("127.0.0.1");

  if (target === "prod") {
    if (isLocal) {
      throw new Error(
        "[import] --target=prod REFUSE : DATABASE_URL pointe sur localhost / 127.0.0.1. " +
          "Si vraiment prod : poser DATABASE_URL prod Supabase (5432 direct).",
      );
    }
    // ceinture supplementaire : NODE_ENV doit etre 'production' pour --commit prod
    // (dry-run prod sans NODE_ENV=production reste autorise pour inspection)
  } else {
    // target === 'dev'
    if (!isLocal) {
      throw new Error(
        "[import] --target=dev REFUSE : DATABASE_URL ne pointe pas sur localhost / 127.0.0.1. " +
          "Pose DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres " +
          "(container docker postgres:15) avant de relancer. " +
          "(Garde anti-accident : evite d'inserer 3805 lignes en prod via le mauvais .env.local.)",
      );
    }
  }
}

// ============================================================================
// SECTION 2 -- Parser XLSX minimal (sheet1.xml inline strings)
// ============================================================================
//
// Le fichier Contact_complete.xlsx a la specificite d'avoir tout son contenu
// en cellules `inlineStr` (pas de sharedStrings.xml). Le parsing est donc
// linearisable sans table de strings. Cf. tmp/parse-xlsx.js pour la version
// d'analyse, refacto ici en module reutilisable et testable.
//
// XLSX = ZIP. On extrait xl/worksheets/sheet1.xml via decompression maison
// (zip-no-deps n'est pas idiomatique en Node ; on utilise plutot AdmZip via
// zlib.inflateRaw sur les entrees DEFLATED — ou plus simple : on s'appuie sur
// l'unzip Windows deja fait par tmp/xlsx_unzip/). Pour rester autonome, on
// inclut un mini-unzipper deflate maison.

import { inflateRawSync } from "node:zlib";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- interface de documentation (non instanciée directement)
interface ZipEntry {
  name: string;
  data: Buffer;
}

/**
 * Mini-unzipper deflate sync pour XLSX (ZIP standard, methode 0=store ou 8=deflate).
 * Pas de support encryption, ZIP64, multi-disk. Suffisant pour XLSX standard.
 *
 * Format ZIP : on scanne le End Of Central Directory (EOCD), puis le Central
 * Directory, puis on extrait chaque Local File Header demande.
 */
function unzipXlsx(buf: Buffer, wantedNames: Set<string>): Map<string, Buffer> {
  // Find EOCD signature 0x06054b50 (scan from end, max 65557 bytes back)
  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  const scanStart = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= scanStart; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("[xlsx] EOCD introuvable — fichier ZIP corrompu ou non standard");
  }
  const cdEntries = buf.readUInt16LE(eocdOffset + 10);
  // cdSize (eocdOffset + 12) non utilisé — on en a pas besoin pour le parsing
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  // Parse Central Directory headers
  const result = new Map<string, Buffer>();
  let p = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) {
      throw new Error(`[xlsx] CD entry ${i} signature invalide @ ${p}`);
    }
    const compressionMethod = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const fileNameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    const fileName = buf.toString("utf8", p + 46, p + 46 + fileNameLen);

    if (wantedNames.has(fileName)) {
      // Parse Local File Header
      const lh = localHeaderOffset;
      if (buf.readUInt32LE(lh) !== 0x04034b50) {
        throw new Error(`[xlsx] LH ${fileName} signature invalide @ ${lh}`);
      }
      const lhFileNameLen = buf.readUInt16LE(lh + 26);
      const lhExtraLen = buf.readUInt16LE(lh + 28);
      const dataStart = lh + 30 + lhFileNameLen + lhExtraLen;
      const compressed = buf.subarray(dataStart, dataStart + compressedSize);

      let data: Buffer;
      if (compressionMethod === 0) {
        data = Buffer.from(compressed); // stored
      } else if (compressionMethod === 8) {
        data = inflateRawSync(compressed);
      } else {
        throw new Error(
          `[xlsx] methode compression ${compressionMethod} non supportee (${fileName})`,
        );
      }
      if (data.length !== uncompressedSize) {
        // pas bloquant : on log silencieux
      }
      result.set(fileName, data);
    }

    p += 46 + fileNameLen + extraLen + commentLen;
  }
  return result;
}

/**
 * Unescape XML/HTML entities frequemment vues dans le sheet1.xml
 * (notamment &#NNN; pour les caracteres accentues, et &amp; / &lt; / &gt;).
 *
 * Note : c'est suffisant pour notre source Odoo. Ne couvre pas les entites
 * HTML nommees rares (`&copy;`, `&hellip;`, etc.) car absentes du dataset.
 */
export function unescapeXml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number.parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n: string) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Convertit "A" -> 0, "B" -> 1, ..., "AA" -> 26. */
function colLetterToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) {
    n = n * 26 + (ch.charCodeAt(0) - "A".charCodeAt(0) + 1);
  }
  return n - 1;
}

export interface ParsedRow {
  rowIdx: number;
  cells: string[]; // index = col, value = string (vide = '')
}

/**
 * Parse sheet1.xml minimal (inlineStr only — le fichier source n'utilise pas
 * sharedStrings). Retourne header + data rows en string[][] (col-indexed).
 */
export function parseSheet1(xml: string): { header: string[]; rows: ParsedRow[]; maxCol: number } {
  const rowRe = /<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  const rows: ParsedRow[] = [];
  let maxCol = 0;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const rowIdx = Number.parseInt(rowMatch[1]!, 10);
    const inner = rowMatch[2]!;
    const cells: string[] = [];

    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(inner)) !== null) {
      const attrs = cellMatch[1]!;
      const innerCell = cellMatch[2]!;
      const rMatch = attrs.match(/\br="([A-Z]+)(\d+)"/);
      if (!rMatch) continue;
      const col = colLetterToIndex(rMatch[1]!);
      const tMatch = attrs.match(/\bt="(\w+)"/);
      const t = tMatch ? tMatch[1] : "n";
      let value = "";
      if (t === "inlineStr") {
        const isMatch = innerCell.match(/<is>([\s\S]*?)<\/is>/);
        if (isMatch) {
          const tNodes = isMatch[1]!.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [];
          value = tNodes
            .map((n) => n.replace(/^<t[^>]*>/, "").replace(/<\/t>$/, ""))
            .map(unescapeXml)
            .join("");
        }
      } else {
        const vMatch = innerCell.match(/<v>([\s\S]*?)<\/v>/);
        value = vMatch ? unescapeXml(vMatch[1]!) : "";
      }
      cells[col] = value;
      if (col > maxCol) maxCol = col;
    }
    // Aussi : cellules vides auto-closed <c r="X" />
    const emptyRe = /<c\b([^>]*)\/>/g;
    let emptyMatch: RegExpExecArray | null;
    while ((emptyMatch = emptyRe.exec(inner)) !== null) {
      const rMatch = emptyMatch[1]!.match(/\br="([A-Z]+)(\d+)"/);
      if (rMatch) {
        const col = colLetterToIndex(rMatch[1]!);
        if (cells[col] === undefined) cells[col] = "";
        if (col > maxCol) maxCol = col;
      }
    }
    // Normalize array: pad with '' up to maxCol
    for (let i = 0; i <= maxCol; i++) {
      if (cells[i] === undefined) cells[i] = "";
    }
    rows.push({ rowIdx, cells });
  }

  const headerRow = rows.find((r) => r.rowIdx === 1);
  if (!headerRow) {
    throw new Error("[xlsx] header (ligne 1) introuvable");
  }
  const header: string[] = [];
  for (let i = 0; i <= maxCol; i++) {
    header[i] = headerRow.cells[i] ?? "";
  }
  const dataRows = rows.filter((r) => r.rowIdx > 1);
  return { header, rows: dataRows, maxCol };
}

// ============================================================================
// SECTION 3 -- Mapping vocabulaire specialites
// (specs/architects_specialty_mapping_v1.md §2)
// ============================================================================

/**
 * Normalisation accent-insensitive + case-insensitive.
 * Utilise NFD + suppression marks Unicode (categorie Mn).
 */
export function normalizeToken(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Table de correspondance token (normalise) -> code controle.
 * Source : specs/architects_specialty_mapping_v1.md §2.
 * Toutes les cles sont DEJA passees par normalizeToken().
 */
const SPECIALTY_MAPPING: Record<string, string> = {
  // habitat_individuel
  "habitat ind": "habitat_individuel",
  villa: "habitat_individuel",
  habitat: "habitat_individuel",
  "architecture bois": "habitat_individuel",
  // logements_collectifs
  "logements collectifs": "logements_collectifs",
  "habitat collectif": "logements_collectifs",
  logements: "logements_collectifs",
  // tertiaire
  tertiaire: "tertiaire",
  bureaux: "tertiaire",
  "espace bureau": "tertiaire",
  // commerces (absorbe Hotels/Hotellerie via normalize accent)
  commerces: "commerces",
  commercial: "commerces",
  hotellerie: "commerces",
  hotels: "commerces",
  // equipement_public
  "equipement public": "equipement_public",
  // sante (absorbe Hopitaux via normalize)
  sante: "sante",
  hopitaux: "sante",
  "medico social": "sante",
  // petite_enfance (Board 2026-05-21)
  creches: "petite_enfance",
  // enseignement
  enseignement: "enseignement",
  fac: "enseignement",
  // culture
  culture: "culture",
  culturel: "culture",
  culturelle: "culture",
  "architecture culturelle": "culture",
  musees: "culture",
  // sport
  sport: "sport",
  // patrimoine
  patrimoine: "patrimoine",
  // rehabilitation
  rehabilitation: "rehabilitation",
  restructuration: "rehabilitation",
  extension: "rehabilitation",
  renovation: "rehabilitation",
  thermorennovation: "rehabilitation",
  "eco-construction": "rehabilitation",
  // industriel
  industriel: "industriel",
  industrie: "industriel",
  infrastrcture: "industriel", // sic typo source
  // amenagement_paysage
  "amenagement exterieur": "amenagement_paysage",
  paysagiste: "amenagement_paysage",
  paysage: "amenagement_paysage",
  environnement: "amenagement_paysage",
  // urbanisme
  urbaniste: "urbanisme",
  urbanisme: "urbanisme",
  // interieur
  "architecture interieur": "interieur",
  decoration: "interieur",
  design: "interieur",
  // non_classe (exclu matching)
  architecture: "non_classe",
  "architecture contemporaine": "non_classe",
  moe: "non_classe",
  amo: "non_classe",
  "gestion immobiliere": "non_classe",
  not_found: "non_classe",
  pending_research: "non_classe",
};

/**
 * Mappe la colonne `x_studio_typologie_1` (split sur ',') vers les codes
 * controles. Tokens inconnus → 'non_classe' + signalement dans `unknowns`.
 *
 * @returns { codes: string[], unknowns: string[] } — codes dedupliques.
 */
export function mapSpecialtyTokens(raw: string): { codes: string[]; unknowns: string[] } {
  if (!raw.trim()) return { codes: [], unknowns: [] };
  const tokens = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const codes = new Set<string>();
  const unknowns: string[] = [];
  for (const tok of tokens) {
    const norm = normalizeToken(tok);
    const code = SPECIALTY_MAPPING[norm];
    if (code) {
      codes.add(code);
    } else {
      codes.add("non_classe");
      unknowns.push(tok); // garde la casse originale pour pouvoir enrichir la table
    }
  }
  return { codes: Array.from(codes), unknowns };
}

// ============================================================================
// SECTION 4 -- Mapping ligne XLSX -> NewArchitect
// ============================================================================

interface ImportRowResult {
  row?: typeof architects.$inferInsert;
  warnings: string[]; // cabinet_fallback, typology_unknown, siren_extracted, headcount_range, geo_malformed, etc.
  errors: string[]; // bloquant : odoo_external_id manquant, cabinet vide apres fallbacks
  cabinetFallback?: { odooExternalId: string; source: "dirigeant_sirene" | "synthetic" };
  specialtyUnknowns: string[];
}

/** Index des colonnes Excel attendues (cf. tmp/fill-stats.json header). */
const COL = {
  id: 0,
  name: 1,
  website: 2,
  email: 3,
  phone: 4,
  zip: 5,
  city: 6,
  x_studio_effectif: 7,
  x_studio_typologie_1: 8,
  // ca_moyen_3ans: 9 — ignore V1
  departements_intervention: 10,
  Contact: 11,
  // Commentaire: 12 — ignore (notes reserve curation admin)
  siren: 13,
  // effectif_sirene_code: 14 — ignore
  effectif_sirene: 15,
  date_creation: 16,
  dirigeant_sirene: 17,
  // ca_dernier: 18, annee_ca_dernier: 19 — ignore V1
  categorie: 20,
  // match_source: 21, match_score: 22 — ignore (metadata sourcing anterieur)
} as const;

function cleanString(s: string | undefined): string | null {
  if (s === undefined) return null;
  const t = s.replace(/ /g, " ").trim(); // collapse NBSP (vu &#160; en data)
  return t === "" ? null : t;
}

function cleanEmail(s: string | undefined): string | null {
  const t = cleanString(s);
  return t ? t.toLowerCase() : null;
}

function normalizeWebsite(s: string | undefined): string | null {
  const t = cleanString(s);
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `http://${t}`;
}

function parseSiren(rawSiren: string | undefined, rawId: string): string | null {
  const direct = cleanString(rawSiren);
  if (direct && /^\d{9}$/.test(direct)) return direct;
  // Fallback : extraire depuis l'id `sirene_XXXXXX...` (les IDs SIRENE
  // commencent par `sirene_` puis 9 chiffres SIREN + suffixe SIRET 5 chiffres
  // potentiel — on capture les 9 premiers chiffres).
  const m = rawId.match(/^sirene_(\d{9})/);
  if (m) return m[1]!;
  return direct; // ce qu'on a, meme malforme — laisser passer (pas critique V1)
}

function parseHeadcount(
  rawXStudio: string | undefined,
  rawSireneRange: string | undefined,
): { value: number | null; warning?: string } {
  // 1) x_studio_effectif (preferred — saisie CRM)
  const x = cleanString(rawXStudio);
  if (x) {
    const n = Number.parseInt(x, 10);
    if (Number.isFinite(n) && n >= 0) return { value: n };
  }
  // 2) effectif_sirene (range "3-5" -> moyenne 4)
  const r = cleanString(rawSireneRange);
  if (!r) return { value: null };
  const m = r.match(/^(\d+)-(\d+)$/);
  if (m) {
    const a = Number.parseInt(m[1]!, 10);
    const b = Number.parseInt(m[2]!, 10);
    return { value: Math.round((a + b) / 2), warning: `headcount_range_parsed:${r}` };
  }
  const single = Number.parseInt(r, 10);
  if (Number.isFinite(single) && single >= 0) return { value: single };
  return { value: null, warning: `headcount_unparseable:${r}` };
}

function parseCompanyCreatedAt(raw: string | undefined): { value: Date | null; warning?: string } {
  const t = cleanString(raw);
  if (!t) return { value: null };
  // Format attendu: YYYY-MM-DD
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { value: null, warning: `date_creation_unparseable:${t}` };
  const d = new Date(`${t}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { value: null, warning: `date_creation_invalid:${t}` };
  return { value: d };
}

function parseGeoZones(raw: string | undefined): { zones: string[]; warning?: string } {
  const t = cleanString(raw);
  if (!t) return { zones: [] };
  // split sur , ou ; — pad zero si 1 char (rare), accepte 2-3 chars
  const parts = t
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    // Normalise : si 1 chiffre, pad 0 ; accepte 2-3 chars alphanum (Corse 2A/2B + DOM 971-976)
    let z = p;
    if (/^\d$/.test(z)) z = `0${z}`;
    if (/^(\d{2,3}|2[AB])$/i.test(z)) {
      valid.push(z.toUpperCase().replace(/^0/, (m) => m)); // garde la representation
    } else {
      invalid.push(p);
    }
  }
  // Renormalise : on garde le format 2-3 chiffres tel quel (cohérent avec seed)
  const normalized = valid.map((z) => z);
  if (invalid.length > 0) {
    return { zones: normalized, warning: `geo_zones_malformed:${invalid.join("|")}` };
  }
  return { zones: normalized };
}

/**
 * Mappe UNE ligne XLSX vers une `NewArchitect` (ou collecte les erreurs).
 */
export function mapRowToArchitect(cells: string[], organizationId: string): ImportRowResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  let cabinetFallback: ImportRowResult["cabinetFallback"];
  const specialtyUnknowns: string[] = [];

  const odooExternalId = cleanString(cells[COL.id]);
  if (!odooExternalId) {
    errors.push("missing_odoo_external_id");
    return { warnings, errors, specialtyUnknowns };
  }

  // Cabinet (NOT NULL) avec fallback chaine
  const rawName = cleanString(cells[COL.name]);
  const rawDirigeant = cleanString(cells[COL.dirigeant_sirene]);
  let cabinet: string;
  if (rawName) {
    cabinet = rawName;
  } else if (rawDirigeant) {
    cabinet = rawDirigeant;
    cabinetFallback = { odooExternalId, source: "dirigeant_sirene" };
    warnings.push(`cabinet_fallback:dirigeant_sirene`);
  } else {
    cabinet = `Cabinet sans nom (${odooExternalId})`;
    cabinetFallback = { odooExternalId, source: "synthetic" };
    warnings.push(`cabinet_fallback:synthetic`);
  }

  // Contact (Contact CRM puis dirigeant_sirene)
  const contactName = cleanString(cells[COL.Contact]) ?? rawDirigeant ?? null;

  // Email (NULL si vide → solicitable=false derive)
  const email = cleanEmail(cells[COL.email]);

  // Phone, website
  const phone = cleanString(cells[COL.phone]);
  const website = normalizeWebsite(cells[COL.website]);

  // SIREN : col + fallback id
  const siren = parseSiren(cells[COL.siren], odooExternalId);
  if (siren && !cleanString(cells[COL.siren]) && /^sirene_/.test(odooExternalId)) {
    warnings.push("siren_extracted_from_id");
  }

  // Zip + city (collapse NBSP via cleanString)
  const zip = cleanString(cells[COL.zip]);
  const city = cleanString(cells[COL.city]);

  // Headcount
  const { value: headcount, warning: hcWarn } = parseHeadcount(
    cells[COL.x_studio_effectif],
    cells[COL.effectif_sirene],
  );
  if (hcWarn) warnings.push(hcWarn);

  // Company size
  const companySize = cleanString(cells[COL.categorie]);

  // Company created at
  const { value: companyCreatedAt, warning: dWarn } = parseCompanyCreatedAt(
    cells[COL.date_creation],
  );
  if (dWarn) warnings.push(dWarn);

  // Specialty codes
  const { codes: specialtyCodes, unknowns } = mapSpecialtyTokens(
    cells[COL.x_studio_typologie_1] ?? "",
  );
  for (const u of unknowns) {
    warnings.push(`specialty_unknown:${u}`);
    specialtyUnknowns.push(u);
  }

  // Geo zones
  const { zones: geoZones, warning: gWarn } = parseGeoZones(cells[COL.departements_intervention]);
  if (gWarn) warnings.push(gWarn);

  const row: typeof architects.$inferInsert = {
    organizationId,
    cabinet,
    contactName,
    email,
    phone,
    website,
    siren,
    zip,
    city,
    headcount,
    companySize,
    companyCreatedAt,
    odooExternalId,
    specialtyCodes,
    geoZones,
    tutoiement: false,
    preferred: false,
    active: true,
    pastCollabsCount: 0,
    notes: null,
  };

  return { row, warnings, errors, cabinetFallback, specialtyUnknowns };
}

// ============================================================================
// SECTION 4bis -- Dedup intra-fichier (organization_id, email)
// ============================================================================
//
// Bug 2026-05-25 (dry-run commit dev) : batches 1-12 FAIL avec
//   `duplicate key value violates unique constraint
//    "architects_organization_id_email_key"`.
// Cause : `ON CONFLICT (odoo_external_id)` ne couvre qu'UNE seule contrainte
// par INSERT, donc 2 lignes intra-batch avec meme (org, email) plantent le
// batch entier (resultat observe : ok=1405/3805, errors=12, 0 res_partner en DB).
//
// Fix Option A (Steve, 2026-05-25) : dedup deterministe par ordre du fichier.
// Premiere occurrence (org, email) gagne, suivantes loggees comme deduped.
// Les lignes email=NULL ne sont JAMAIS dedup (NULL != NULL).
//
// Reco future Option B/C (best-of merge, prefer-non-empty) : a evaluer si le
// metier remonte des cas de cabinets perdant de l'info au dedup. Pas V1.

/**
 * Hash anonyme 8 chars d'une string (sha256 tronque). Utilise pour echantillons
 * email dedupliques dans le rapport — RGPD strict : pas d'email/nom en clair.
 */
function anonymize(s: string): string {
  return `[${createHash("sha256").update(s).digest("hex").slice(0, 8)}]`;
}

export interface DedupResult {
  kept: (typeof architects.$inferInsert)[];
  dedupedCount: number;
  dedupedEmailSamples: string[]; // anonymise, max 10
}

/**
 * Dedup par cle (organizationId, email LOWER) — strategie Option A : on garde
 * la PREMIERE occurrence dans l'ordre fourni (deterministe, tracable). Les
 * lignes email=NULL/empty traversent sans dedup (cf. UNIQUE Postgres autorise
 * N NULL).
 *
 * @internal export uniquement pour tests Vitest.
 */
export function dedupByOrgEmail(rows: (typeof architects.$inferInsert)[]): DedupResult {
  const seen = new Set<string>();
  const kept: (typeof architects.$inferInsert)[] = [];
  const dedupedSamples = new Set<string>();
  let dedupedCount = 0;
  for (const row of rows) {
    if (!row.email) {
      kept.push(row);
      continue;
    }
    const key = `${row.organizationId}::${row.email.toLowerCase()}`;
    if (seen.has(key)) {
      dedupedCount++;
      if (dedupedSamples.size < 10) {
        dedupedSamples.add(anonymize(row.email));
      }
      continue;
    }
    seen.add(key);
    kept.push(row);
  }
  return {
    kept,
    dedupedCount,
    dedupedEmailSamples: Array.from(dedupedSamples),
  };
}

// ============================================================================
// SECTION 5 -- Rapport JSON
// ============================================================================

interface ImportReport {
  context: {
    target: "dev" | "prod";
    mode: "dry-run" | "commit";
    started_at: string;
    duration_ms: number;
    xlsx_path: string;
    organization_id: string;
  };
  parsed: {
    total: number;
    header_columns: number;
  };
  upsert: {
    attempted: number;
    inserted_or_updated: number; // pas distinguable sans returning detaille en batch — on totalise
    skipped: number;
  };
  /**
   * Dedup intra-fichier sur la cle (organization_id, email) — la contrainte
   * UNIQUE Postgres `architects_organization_id_email_key` rejette les doublons
   * (organization_id, email NOT NULL). Comme `ON CONFLICT` ne peut viser qu'UNE
   * SEULE contrainte par INSERT (ici `odoo_external_id`), un batch contenant 2
   * lignes avec meme (org, email) plante. On dedup en amont, strategie Option A
   * (1re occurrence dans l'ordre du fichier, deterministe et tracable).
   *
   * NB : les lignes avec email=NULL ne sont JAMAIS dedup (NULL != NULL en SQL,
   * Postgres autorise N lignes (org, NULL) — confirme par test dev 2026-05-25).
   */
  dedup: {
    deduped_email_count: number;
    deduped_email_samples: string[]; // anonymise (hash 8 char), max 10
  };
  warnings_summary: Record<string, number>;
  errors: { odooExternalId: string | null; reason: string }[];
  cabinet_fallbacks: { odooExternalId: string; source: string }[];
  specialty_unknowns: { token: string; count: number }[];
  // Hash anonymise des emails pour stats (sans leak email)
  email_stats: { with_email: number; without_email: number };
}

function buildReport(state: ImportRunState): ImportReport {
  // Aggregate warnings
  const warningsSummary: Record<string, number> = {};
  for (const w of state.warnings) {
    const key = w.split(":")[0] ?? w;
    warningsSummary[key] = (warningsSummary[key] ?? 0) + 1;
  }
  // Aggregate unknown specialties
  const specCount = new Map<string, number>();
  for (const u of state.specialtyUnknowns) {
    specCount.set(u, (specCount.get(u) ?? 0) + 1);
  }
  const specialty_unknowns = Array.from(specCount.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([token, count]) => ({ token, count }));

  return {
    context: {
      target: state.target,
      mode: state.commit ? "commit" : "dry-run",
      started_at: state.startedAt,
      duration_ms: Date.now() - state.startedAtMs,
      xlsx_path: state.xlsxPath,
      organization_id: state.organizationId,
    },
    parsed: {
      total: state.parsedTotal,
      header_columns: state.headerColumns,
    },
    upsert: {
      attempted: state.upsertAttempted,
      inserted_or_updated: state.upsertOk,
      skipped: state.upsertSkipped,
    },
    dedup: {
      deduped_email_count: state.dedupedEmailCount,
      deduped_email_samples: state.dedupedEmailSamples,
    },
    warnings_summary: warningsSummary,
    errors: state.errors,
    cabinet_fallbacks: state.cabinetFallbacks,
    specialty_unknowns,
    email_stats: state.emailStats,
  };
}

interface ImportRunState {
  target: "dev" | "prod";
  commit: boolean;
  startedAt: string;
  startedAtMs: number;
  xlsxPath: string;
  organizationId: string;
  parsedTotal: number;
  headerColumns: number;
  upsertAttempted: number;
  upsertOk: number;
  upsertSkipped: number;
  warnings: string[];
  errors: { odooExternalId: string | null; reason: string }[];
  cabinetFallbacks: { odooExternalId: string; source: string }[];
  specialtyUnknowns: string[];
  emailStats: { with_email: number; without_email: number };
  dedupedEmailCount: number;
  dedupedEmailSamples: string[];
}

function writeReport(report: ImportReport): string {
  const hh = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(8, 14); // HHMMSS
  const fname = `architects-import-260525-${report.context.target}-${
    report.context.mode === "commit" ? "commit" : "dry"
  }-${hh}.json`;
  const reportPath = resolve(process.cwd(), "tmp", fname);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  return reportPath;
}

// ============================================================================
// SECTION 6 -- Orchestration
// ============================================================================

async function ensureOrgExists(organizationId: string): Promise<void> {
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(sql`${organizations.id} = ${organizationId}`)
    .limit(1);
  if (rows.length === 0) {
    throw new Error(
      `[import] organization ${organizationId} introuvable. ` +
        `Lance pnpm db:seed (dev) ou pnpm db:seed:prod (prod) avant l'import.`,
    );
  }
}

async function main(): Promise<void> {
  const opts = parseCli(process.argv);

  // eslint-disable-next-line no-console
  console.log(`[import] ==== architects-import-260525 ====`);
  // eslint-disable-next-line no-console
  console.log(
    `[import] target=${opts.target} mode=${opts.commit ? "commit" : "dry-run"} batch=${opts.batchSize}`,
  );

  // 1. Double garde anti-prod-accident
  assertTargetContext(opts.target, {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
  });

  // 2. Verifier fichier XLSX present
  if (!existsSync(opts.xlsxPath)) {
    throw new Error(`[import] XLSX introuvable : ${opts.xlsxPath}`);
  }

  // 3. Parser XLSX
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const buf = readFileSync(opts.xlsxPath);
  const extracted = unzipXlsx(buf, new Set(["xl/worksheets/sheet1.xml"]));
  const sheetXml = extracted.get("xl/worksheets/sheet1.xml");
  if (!sheetXml) {
    throw new Error("[import] xl/worksheets/sheet1.xml absent du XLSX");
  }
  const { header, rows: dataRows, maxCol } = parseSheet1(sheetXml.toString("utf8"));

  // eslint-disable-next-line no-console
  console.log(
    `[import] parsed : ${dataRows.length} lignes data, ${maxCol + 1} colonnes (header: ${header.length} attendues)`,
  );

  // 4. Verifier organisation cible
  await ensureOrgExists(ALYOS_ORG_ID);
  // eslint-disable-next-line no-console
  console.log(`[import] org AlyoS OK (${ALYOS_ORG_ID})`);

  // 5. Mapping toutes les lignes
  const state: ImportRunState = {
    target: opts.target,
    commit: opts.commit,
    startedAt,
    startedAtMs,
    xlsxPath: opts.xlsxPath,
    organizationId: ALYOS_ORG_ID,
    parsedTotal: dataRows.length,
    headerColumns: header.length,
    upsertAttempted: 0,
    upsertOk: 0,
    upsertSkipped: 0,
    warnings: [],
    errors: [],
    cabinetFallbacks: [],
    specialtyUnknowns: [],
    emailStats: { with_email: 0, without_email: 0 },
    dedupedEmailCount: 0,
    dedupedEmailSamples: [],
  };

  const mapped: (typeof architects.$inferInsert)[] = [];
  for (const r of dataRows) {
    const res = mapRowToArchitect(r.cells, ALYOS_ORG_ID);
    state.warnings.push(...res.warnings);
    state.specialtyUnknowns.push(...res.specialtyUnknowns);
    if (res.cabinetFallback) state.cabinetFallbacks.push(res.cabinetFallback);
    if (res.errors.length > 0) {
      for (const reason of res.errors) {
        state.errors.push({
          odooExternalId: (res.row?.odooExternalId as string) ?? null,
          reason,
        });
      }
      state.upsertSkipped++;
      continue;
    }
    if (!res.row) {
      state.upsertSkipped++;
      continue;
    }
    mapped.push(res.row);
  }

  // Dedup intra-fichier sur (organization_id, email) — voir SECTION 4bis.
  const dedup = dedupByOrgEmail(mapped);
  state.dedupedEmailCount = dedup.dedupedCount;
  state.dedupedEmailSamples = dedup.dedupedEmailSamples;
  const toInsert = dedup.kept;

  // email_stats post-dedup (refletent les lignes vraiment envoyees a l'upsert)
  for (const row of toInsert) {
    if (row.email) {
      state.emailStats.with_email++;
    } else {
      state.emailStats.without_email++;
    }
  }

  state.upsertAttempted = toInsert.length;
  // eslint-disable-next-line no-console
  console.log(
    `[import] mapping : ${mapped.length} lignes mappees / ${state.errors.length} erreurs / ${state.cabinetFallbacks.length} cabinet fallbacks`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `[import] dedup (org,email) : ${dedup.dedupedCount} doublons retires -> ${toInsert.length} lignes a upsert`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `[import] email_stats : with=${state.emailStats.with_email} (-> solicitable=true derive) without=${state.emailStats.without_email}`,
  );

  // 6. Upsert (ou dry-run)
  if (!opts.commit) {
    // eslint-disable-next-line no-console
    console.log("[import] DRY-RUN : aucun INSERT execute.");
    state.upsertOk = 0;
  } else {
    // eslint-disable-next-line no-console
    console.log(`[import] COMMIT : upsert en batches de ${opts.batchSize} ...`);
    for (let i = 0; i < toInsert.length; i += opts.batchSize) {
      const batch = toInsert.slice(i, i + opts.batchSize);
      try {
        await db
          .insert(architects)
          .values(batch)
          .onConflictDoUpdate({
            target: architects.odooExternalId,
            set: {
              cabinet: sql`excluded.cabinet`,
              contactName: sql`excluded.contact_name`,
              email: sql`excluded.email`,
              phone: sql`excluded.phone`,
              website: sql`excluded.website`,
              siren: sql`excluded.siren`,
              zip: sql`excluded.zip`,
              city: sql`excluded.city`,
              headcount: sql`excluded.headcount`,
              companySize: sql`excluded.company_size`,
              companyCreatedAt: sql`excluded.company_created_at`,
              specialtyCodes: sql`excluded.specialty_codes`,
              geoZones: sql`excluded.geo_zones`,
              // tutoiement / preferred / active : on NE TOUCHE PAS sur update
              //   (Steve modifie ces flags via UI/SQL ciblé apres l'import)
              updatedAt: sql`now()`,
            },
          });
        state.upsertOk += batch.length;
        // eslint-disable-next-line no-console
        console.log(
          `[import]   batch ${i / opts.batchSize + 1} : OK (${batch.length} lignes, total ${state.upsertOk}/${toInsert.length})`,
        );
      } catch (err: unknown) {
        state.errors.push({
          odooExternalId: `batch[${i}..${i + batch.length - 1}]`,
          reason: `batch_upsert_fail: ${(err as Error).message}`,
        });
        // eslint-disable-next-line no-console
        console.error(
          `[import]   batch ${i / opts.batchSize + 1} FAIL : ${(err as Error).message}`,
        );
      }
    }
  }

  // 7. Rapport
  const report = buildReport(state);
  const reportPath = writeReport(report);
  // eslint-disable-next-line no-console
  console.log(`[import] rapport ecrit : ${reportPath}`);
  // eslint-disable-next-line no-console
  console.log(
    `[import] resume : parsed=${report.parsed.total} deduped=${report.dedup.deduped_email_count} attempted=${report.upsert.attempted} ok=${report.upsert.inserted_or_updated} skipped=${report.upsert.skipped} errors=${report.errors.length} duration=${report.context.duration_ms}ms`,
  );
  // eslint-disable-next-line no-console
  console.log(`[import] ==== termine ${opts.commit ? "COMMIT" : "DRY-RUN"} ====`);
}

// ============================================================================
// SECTION 7 -- Entry guard
// ============================================================================

const isDirectRun =
  process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/architects-import-260525.ts") ?? false;

if (isDirectRun) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error("[import] FAIL", (err as Error).message);
      // eslint-disable-next-line no-console
      console.error((err as Error).stack);
      process.exit(1);
    });
}
