/**
 * Types partagés pour les scrapers Playwright — edifio Sourcing
 *
 * Ces types décrivent le contrat d'entrée/sortie de chaque scraper.
 * Ils sont consommés par worker.ts et par chaque module scraper.
 */

export type ScrapingPlatform = "place" | "francmarches";

export interface ScrapeRequest {
  /** Plateforme cible */
  platform: ScrapingPlatform;
  /** Filtres issus du profil de recherche AlyoS */
  profileFilters: {
    keywords?: string[];
    /** Codes département FR sur deux caractères ("75", "91"…) */
    geoZones?: string[];
  };
  /** Date depuis laquelle chercher les AOs (ISO 8601) */
  lastRunAt: string;
  /** Identifiant du profil de recherche en BDD */
  profileId: string;
  /** Identifiant de l'organisation (tenant) */
  orgId: string;
  /** URL Vercel vers laquelle poster les résultats */
  webhookUrl: string;
  /** Identifiants de connexion (requis pour PLACE) */
  credentials?: {
    username?: string;
    password?: string;
  };
}

export interface ScrapedTenderRecord {
  /** Identifiant unique sur la plateforme source */
  externalRef: string;
  /** Intitulé de l'appel d'offres */
  title: string;
  /** Nom de l'acheteur / pouvoir adjudicateur */
  buyer: string;
  /** Codes CPV extraits (8 chiffres, sans tiret ni chiffre de contrôle) */
  cpv?: string[];
  /** Montant estimé en euros */
  amount?: number;
  /** Date limite de remise des offres (ISO 8601) */
  deadline?: string;
  /** Date limite de questions (ISO 8601) */
  questionsDeadline?: string;
  /** URL du DCE (dossier de consultation) */
  dceUrl?: string;
  /** URL de la fiche sur la plateforme */
  sourceUrl: string;
  /** Type de procédure ("appel d'offres ouvert", "procédure adaptée"…) */
  procedure?: string;
  /** Description courte si disponible */
  description?: string;
}

export interface ScrapeJobResult {
  /** UUID du job généré par le worker à la réception de la demande */
  runId: string;
  /** Plateforme scrapée */
  platform: ScrapingPlatform;
  /** Profil de recherche associé */
  profileId: string;
  /** Organisation cible */
  orgId: string;
  /** AOs collectés — null en cas d'erreur fatale */
  tenders: ScrapedTenderRecord[] | null;
  /** Message d'erreur si le scraping a échoué */
  error?: string;
  /** Durée effective du scraping en millisecondes */
  durationMs: number;
}
