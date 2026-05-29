/**
 * Types partagés du module sourcing — edifio Sourcing.
 *
 * Étape 1/7 de la PR n°2 module sourcing engine (cf.
 * `notes-de-suivi/DRAFT_PR2_BOAMP_CONNECTOR.md`).
 *
 * Ce fichier ne contient **que des types** — pas de logique business.
 * Les étapes 2 (connecteur BOAMP), 3 (normalisation) et 4 (insertion BDD)
 * s'appuient sur ces contrats.
 *
 * Source de vérité :
 *  - `specs/module_sourcing_engine_v1.md` §3.1, §3.3
 *  - `src/db/schema/tenders.ts` (forme finale `NewTender` côté Drizzle)
 *  - `src/db/seed/fixtures/boamp-real.json` (forme brute Opendatasoft observée)
 *
 * Convention nommage :
 *  - TypeScript : camelCase (`externalRef`, `platformCode`, `cpvCodes`)
 *  - Postgres   : snake_case (mappé via Drizzle `.column("snake_case")`)
 *  - Les champs BOAMP bruts gardent leur nom d'origine Opendatasoft
 *    (`idweb`, `nomacheteur`, `objet`, ...) pour ne pas masquer la
 *    correspondance 1:1 avec l'API source.
 */

import type { TenderRawData } from "@/db/types/jsonb";

// ============================================================================
// 1. PlatformCode — discriminant plateforme source
// ============================================================================

/**
 * Code des plateformes intégrées (cf. enum Postgres `platform_code`
 * dans `src/db/schema/enums.ts`).
 *
 * Volontairement aligné string-pour-string sur l'enum Postgres pour pouvoir
 * être utilisé tel quel côté `tenders.platform_id` (résolution via
 * `platforms.code`) ainsi que dans le champ discriminant
 * `tenders.raw_data.platform_code`.
 *
 * `prive` : consultations privées / gré à gré créées manuellement
 *           (ajouté migration 0023 — feat/boamp-dce-ao-manuel 2026-05-27).
 */
export type PlatformCode = "boamp" | "place" | "francmarches" | "mp_info" | "prive";

// ============================================================================
// 2. BoampApiRecord — record brut Opendatasoft (BOAMP)
// ============================================================================

/**
 * Forme d'un record renvoyé par l'API Opendatasoft BOAMP
 * (`data.boamp.fr/api/2/datasets/boamp/records`), telle qu'observée dans la
 * fixture committee `src/db/seed/fixtures/boamp-real.json` (livrée par PR #14).
 *
 * Cette interface décrit la **projection « fields »** d'un record
 * Opendatasoft — pas l'enveloppe complète `{record_id, fields: {...}}`.
 * Le connecteur (étape 2) projettera l'enveloppe vers cette forme avant
 * de produire un `RawTender`.
 *
 * Tous les champs sont marqués optionnels (sauf `idweb`) car l'observation
 * de la fixture montre des variations selon la plateforme régionale BOAMP
 * et selon le type de marché. La normalisation (étape 3) impose les
 * contraintes NOT NULL côté `NormalizedTender`.
 *
 * Aucun `any` — quand un champ est mal documenté ou hétérogène (ex. tableaux
 * vs scalaires sur certains codes CPV secondaires), on tape `unknown` avec
 * un commentaire explicite.
 */
export interface BoampApiRecord {
  /** Identifiant unique BOAMP (clef d'idempotence côté `tenders.external_ref`) */
  idweb: string;
  /** Raison sociale de l'acheteur public (mappé vers `tenders.buyer`) */
  nomacheteur?: string;
  /** Objet du marché (mappé vers `tenders.title`) */
  objet?: string;
  /** Descripteur libre (catégorie BOAMP, ex. "Amenagement paysager") */
  descripteur?: string;
  /** Type de marché : "fournitures" | "services" | "travaux" | "concession" | ... */
  type_marche?: string;
  /** Date de parution sur BOAMP (format `YYYY-MM-DD`) */
  dateparution?: string;
  /** Date limite de remise des offres (ISO 8601 avec fuseau) */
  datelimitereponse?: string;
  /** Code CPV principal (format `XXXXXXXX-Y`) */
  codecpv_principal?: string;
  /** Codes CPV secondaires — tableau possiblement vide */
  codecpv_secondaire?: string[];
  /** Numéro de département FR (string car peut être "2A" / "2B" / "971" ...) */
  departement?: string;
  /** Région administrative */
  region?: string;
  /** Montant estimé du marché en euros (entier dans la fixture, mais BOAMP
   *  peut renvoyer un string pour les très gros montants — d'où `unknown`
   *  ici, parsing dans `normalize.ts`) */
  montant_estime?: unknown;
  /** Montant estimé alternatif (parfois utilisé par BOAMP à la place de montant_estime) */
  valeur_estimee?: unknown;
  /** Valeur globale du marché */
  valeur_globale?: unknown;
  /** Montant global */
  montant_global?: unknown;
  /** Montant minimum du marché (marchés à bon de commande) */
  montant_minimum?: unknown;
  /** Montant maximum du marché (marchés à bon de commande) */
  montant_maximum?: unknown;
  /** Procédure : "adapte" | "restreint" | "ouvert" | "negocie" | "dialogue" | ... */
  procedure?: string;
  /** Famille de supports (segmentation interne BOAMP) */
  famille_supports?: string;
  /** Nom du contact côté acheteur */
  contact_nom?: string;
  /** Email du contact côté acheteur */
  contact_email?: string;
  /** Téléphone du contact côté acheteur */
  contact_telephone?: string;
  /** Description longue du marché (peut faire 5-50 KB) */
  description_marche?: string;
  /** Critères d'attribution — liste de strings libres (ex. "Prix : 40%") */
  criteres_attribution?: string[];
  /** URL du DCE (Dossier de Consultation des Entreprises) */
  url_dce?: string;
  /** Type d'avis BOAMP : "Avis de marché", "Avis d'attribution de marché", etc.
   *  Champ `nature` dans l'API Opendatasoft BOAMP v2.1. */
  nature?: string;
  /**
   * Champ d'extension : BOAMP ajoute régulièrement des colonnes sans préavis
   * (date_visite, date_questions, lots, ...). On garde une porte ouverte
   * `unknown` pour ne pas casser le typage à chaque évolution amont.
   *
   * Le payload complet est de toute façon conservé en jsonb
   * `tenders.raw_data.record` pour debug + apprentissage scoring.
   */
  [extraField: string]: unknown;
}

// ============================================================================
// 3. RawTender — projection intermédiaire post-connecteur, pré-normalisation
// ============================================================================

/**
 * Forme intermédiaire produite par le **connecteur** (étape 2). Sert d'entrée
 * à la **normalisation** (étape 3).
 *
 * On porte ici uniquement les champs strictement requis pour identifier
 * l'AO (clef d'idempotence) + le payload complet à conserver en `raw_data`.
 * Tout le reste (parsing date, montant, CPV, ...) est délégué à
 * `normalize.ts` pour garder une séparation propre fetch / mapping / persist.
 */
export interface RawTender {
  /** Référence externe = `idweb` côté BOAMP (clef `tenders.external_ref`) */
  externalRef: string;
  /** Plateforme source — discriminant pour le parsing en étape 3 */
  platformCode: PlatformCode;
  /** Payload brut + métadonnées (typage strict via `TenderRawData`) */
  rawData: TenderRawData;
  /** Timestamp ISO de capture côté connecteur (utile pour SLO + debug) */
  fetchedAt: string;
}

// ============================================================================
// 4. NormalizedTender — forme finale, prête à être insérée en BDD
// ============================================================================

/**
 * Forme finale après passage dans `normalize.ts` (étape 3). Aligne strictement
 * les noms et les types attendus par la table `tenders` (cf.
 * `src/db/schema/tenders.ts`).
 *
 * Conçu pour pouvoir se passer en argument à `db.insert(tenders).values(...)`
 * une fois enrichi par l'appelant avec `organizationId`, `platformId`,
 * `score`, `status`, `matchingProfileId` (cf. signature `insertTender(...)`
 * étape 4).
 *
 * Différences vs `NewTender` (Drizzle inferInsert) :
 *  - `platformCode` (code lisible) au lieu de `platformId` (uuid résolu plus tard)
 *  - pas de `organizationId` (injecté par l'appelant — multi-tenant)
 *  - pas de `score` ni `status` ni `matchingProfileId` (ajoutés post-scoring)
 *  - dates en `Date` natif (pas en string), Drizzle accepte les deux
 */
export interface NormalizedTender {
  /** Référence externe (BOAMP `idweb`, etc.) — clef d'idempotence */
  externalRef: string;
  /** Code lisible — résolu en `platformId` (uuid) côté insertTender */
  platformCode: PlatformCode;
  /** Titre du marché (trim + capitalisation appliquées) */
  title: string;
  /** Acheteur public (trim + capitalisation appliquées) */
  buyer: string;
  /** Codes CPV (principal + secondaires) — tableau dédoublonné, codes 8 digits */
  cpvCodes: string[];
  /**
   * Montant estimé en euros. `null` autorisé (BOAMP ne renseigne pas
   * systématiquement). Numeric côté Drizzle accepte `number | string`,
   * on choisit `number` pour l'API TS interne.
   */
  amount: number | null;
  /** Date limite de réponse — `null` si absente du record source */
  deadline: Date | null;
  /** Date limite de questions — facultative */
  questionsDeadline: Date | null;
  /** Date de visite obligatoire — facultative */
  visitDate: Date | null;
  /** URL du DCE — `null` si absente, normalisée https */
  dceUrl: string | null;
  /** URL source côté plateforme (lien direct fiche AO) — facultative */
  sourceUrl: string | null;
  /**
   * Type d'avis tel que fourni par la plateforme source (nullable).
   * Extrait depuis `rawData.record.nature` pour BOAMP.
   * `null` pour les scrapers (PLACE, francmarches, mp_info, prive).
   */
  noticeType: string | null;
  /** Payload brut + métadonnées (conservé pour debug + apprentissage) */
  rawData: TenderRawData;
}
