/**
 * Liste des formes juridiques les plus courantes — pour datalist HTML.
 *
 * Décision Steve 2026-06-03 : pas d'enum BDD (champ libre TEXT) car les formes
 * sont nombreuses et certaines spécialisées (SELARL pour les libéraux, SCI pour
 * l'immobilier, etc.) ou étrangères. La datalist est seulement un guide pour
 * l'admin — l'input reste éditable librement.
 *
 * Source : https://entreprendre.service-public.fr/vosdroits/F23844.
 * Ordre : commerciales courantes d'abord (les plus saisies pour MOE/BE), puis
 * spécialisées (libéral, immobilier, coopératives, individuelles).
 */

export const COMMON_LEGAL_FORMS = [
  "SARL",
  "SAS",
  "SASU",
  "EURL",
  "SA",
  "SNC",
  // Libéral
  "SELARL",
  "SELAS",
  "SCP",
  // Coopératives, associatives, individuelles
  "SCOP",
  "EI",
  "EIRL",
  "Micro-entreprise",
  // Immobilier
  "SCI",
  // Autres
  "GIE",
  "Association",
] as const;

export type CommonLegalForm = (typeof COMMON_LEGAL_FORMS)[number];
