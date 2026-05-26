/**
 * Types TypeScript pour les réponses Pappers API v2.
 *
 * Documentation officielle : https://api.pappers.fr/documentation
 *
 * Seuls les champs utiles à la moulinette d'enrichissement architectes
 * sont typés ici — le contrat complet Pappers est beaucoup plus large.
 */

/** Réponse de /v2/entreprise (lookup par SIREN) */
export interface PappersEntreprise {
  siren: string;
  denomination: string;
  /**
   * Code tranche effectif salarié INSEE (ex: "02" = 3-5 salariés, "11" = 10-19...).
   * Absent si non renseigné par l'INSEE.
   */
  tranche_effectif_salarie?: string;
  /**
   * CA dernier exercice (en euros).
   * Peut être absent si non publié (ex : entreprises non soumises à dépôt des comptes).
   */
  chiffre_affaires?: number;
  /** Forme juridique de l'entreprise (ex: "SARL", "SAS", "EI"...). */
  forme_juridique?: string;
}

/** Résultat unitaire dans /v2/recherche */
export interface PappersRechercheEntreprise {
  siren: string;
  /** Dénomination sociale (personnes morales). */
  nom_entreprise?: string;
  /** Prénom (personnes physiques / auto-entrepreneurs). */
  prenom?: string;
  /** Nom (personnes physiques). */
  nom?: string;
  /**
   * Score de pertinence retourné par Pappers (entre 0 et 1).
   * Plus la valeur est proche de 1, plus le résultat est pertinent.
   */
  score?: number;
  /** Données du siège social. */
  siege?: {
    /** Code NAF/APE (ex: "7111Z" = Activités d'architecture). */
    code_naf?: string;
    /** Libellé du code NAF (ex: "Activités d'architecture"). */
    libelle_code_naf?: string;
  };
}

/** Réponse complète de /v2/recherche */
export interface PappersRechercheResponse {
  resultats_entreprises: PappersRechercheEntreprise[];
}
