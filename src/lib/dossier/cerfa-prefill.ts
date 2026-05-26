/**
 * Préremplissage déterministe des formulaires DC1 et DC2.
 *
 * Règle : pas d'IA ici — les champs sont remplis depuis les données
 * connues d'AlyoS (organisation, profil, AO). Les champs sans donnée
 * disponible reçoivent `source: 'a_completer'` pour signaler à l'utilisateur
 * qu'il doit compléter manuellement.
 *
 * DC1 = CERFA n°12156 — Lettre de candidature
 * DC2 = CERFA n°13911 — Déclaration du candidat individuel ou du membre du groupement
 *
 * Aucun import de BDD : fonction pure, 100 % testable avec Vitest.
 *
 * Source de vérité : brief Board PR-C 2026-05-25.
 */

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

/** Source de la valeur d'un champ CERFA. */
export type CerfaFieldSource = "company_data" | "tender_data" | "a_completer";

/** Représentation d'un champ de formulaire CERFA. */
export interface CerfaField {
  /** Identifiant technique du champ (stable, utilisé comme clé React). */
  field_id: string;
  /** Libellé affiché à l'utilisateur. */
  field_label: string;
  /** Valeur courante du champ (vide = à compléter). */
  value: string;
  /** Origine de la valeur : données société, AO ou à compléter par l'utilisateur. */
  source: CerfaFieldSource;
  /** Champ obligatoire au sens réglementaire CERFA. */
  required: boolean;
}

/** Document CERFA avec ses champs préremplis. */
export interface CerfaDoc {
  cerfa_kind: "DC1" | "DC2";
  /** Libellé complet affiché comme titre du formulaire. */
  label: string;
  fields: CerfaField[];
}

/** Données nécessaires au préremplissage — injectées depuis le Server Component. */
export interface PrefillInput {
  tender: {
    title: string;
    buyer: string;
  };
  org: {
    name: string;
    siren: string | null;
  };
  /** Profil commercial AlyoS — null si absent en BDD (cas edge de recette). */
  orgProfile: {
    commercialName: string | null;
    agencyDetails: string | null;
    phone: string | null;
    contactEmail: string | null;
  } | null;
  /**
   * Mode de réponse.
   * Au MVP, la page dossier est accessible uniquement si
   * `tender.status === 'architect_accepted'` → toujours Tandem.
   * Conservé en paramètre pour préparation Phase 2 Solo.
   */
  isTandem: boolean;
}

// ---------------------------------------------------------------------------
// Helper interne
// ---------------------------------------------------------------------------

/**
 * Crée un champ CERFA.
 *
 * La source est dérivée automatiquement : si `value` est non vide,
 * on applique `forcedSource` ; sinon on utilise `'a_completer'`.
 */
function field(
  id: string,
  label: string,
  value: string,
  forcedSource: "company_data" | "tender_data",
  required: boolean,
): CerfaField {
  const trimmed = value.trim();
  return {
    field_id: id,
    field_label: label,
    value: trimmed,
    source: trimmed.length > 0 ? forcedSource : "a_completer",
    required,
  };
}

// ---------------------------------------------------------------------------
// DC1 — CERFA n°12156 — Lettre de candidature
// ---------------------------------------------------------------------------

/**
 * Construit le DC1 prérempli depuis les données connues.
 *
 * Champs Tandem : `dc1_nom_mandataire` est affiché uniquement quand
 * `isTandem = true` (groupement momentané d'entreprises).
 */
export function buildDc1(input: PrefillInput): CerfaDoc {
  const { tender, org, orgProfile, isTandem } = input;

  const fields: CerfaField[] = [
    field(
      "dc1_pouvoir_adjudicateur",
      "Pouvoir adjudicateur (acheteur public)",
      tender.buyer,
      "tender_data",
      true,
    ),
    field("dc1_objet_marche", "Objet du marché", tender.title, "tender_data", true),
    field(
      "dc1_type_candidature",
      "Type de candidature",
      isTandem ? "Groupement momentané d'entreprises" : "Candidat individuel",
      "company_data",
      true,
    ),
  ];

  // Mandataire uniquement en Tandem
  if (isTandem) {
    fields.push(
      field(
        "dc1_nom_mandataire",
        "Nom du mandataire du groupement",
        org.name,
        "company_data",
        true,
      ),
    );
  }

  fields.push(
    field("dc1_siren", "SIREN / SIRET", org.siren ?? "", "company_data", true),
    field(
      "dc1_adresse",
      "Adresse du candidat",
      orgProfile?.agencyDetails ?? "",
      "company_data",
      false,
    ),
    field("dc1_representant_legal", "Nom du représentant légal", "", "company_data", true),
    field("dc1_qualite", "Qualité du signataire (ex. Président, Gérant)", "", "company_data", true),
    field("dc1_telephone", "Téléphone", orgProfile?.phone ?? "", "company_data", false),
    field(
      "dc1_email",
      "Adresse email de contact",
      orgProfile?.contactEmail ?? "",
      "company_data",
      false,
    ),
    field("dc1_lieu_date", "Fait à (lieu et date de signature)", "", "company_data", false),
  );

  return {
    cerfa_kind: "DC1",
    label: "DC1 — Lettre de candidature (CERFA n°12156)",
    fields,
  };
}

// ---------------------------------------------------------------------------
// DC2 — CERFA n°13911 — Déclaration du candidat
// ---------------------------------------------------------------------------

/**
 * Construit le DC2 prérempli depuis les données connues.
 *
 * Les champs financiers (CA N-1/N-2/N-3) et forme juridique sont toujours
 * `a_completer` — non disponibles dans le profil AlyoS au MVP.
 */
export function buildDc2(input: PrefillInput): CerfaDoc {
  const { org, orgProfile } = input;

  const fields: CerfaField[] = [
    field("dc2_denomination", "Dénomination sociale", org.name, "company_data", true),
    field("dc2_siren", "SIREN / SIRET", org.siren ?? "", "company_data", true),
    field("dc2_forme_juridique", "Forme juridique (ex. SAS, SARL, SA)", "", "company_data", true),
    field(
      "dc2_adresse",
      "Adresse du siège social",
      orgProfile?.agencyDetails ?? "",
      "company_data",
      false,
    ),
    field("dc2_representant_legal", "Nom du représentant légal", "", "company_data", true),
    field("dc2_qualite", "Qualité du signataire (ex. Président, Gérant)", "", "company_data", true),
    field(
      "dc2_activite_principale",
      "Activité principale",
      "Ingénierie et conception — BTP, maîtrise d'œuvre",
      "company_data",
      false,
    ),
    field("dc2_effectif", "Effectif moyen annuel (ex. 15)", "", "company_data", false),
    field("dc2_ca_n1", "Chiffre d'affaires N-1 (en euros)", "", "company_data", false),
    field("dc2_ca_n2", "Chiffre d'affaires N-2 (en euros)", "", "company_data", false),
    field("dc2_ca_n3", "Chiffre d'affaires N-3 (en euros)", "", "company_data", false),
    field(
      "dc2_attestation_fiscal",
      "Attestation fiscale DGFiP",
      "À joindre (attestation DGFiP)",
      "company_data",
      true,
    ),
    field(
      "dc2_attestation_urssaf",
      "Attestation de vigilance URSSAF",
      "À joindre (attestation de vigilance URSSAF)",
      "company_data",
      true,
    ),
    field("dc2_lieu_date", "Fait à (lieu et date de signature)", "", "company_data", false),
  ];

  return {
    cerfa_kind: "DC2",
    label: "DC2 — Déclaration du candidat (CERFA n°13911)",
    fields,
  };
}
