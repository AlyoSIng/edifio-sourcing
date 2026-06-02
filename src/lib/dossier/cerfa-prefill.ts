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
  /**
   * Architecte sélectionné comme mandataire du groupement (Phase 3 — Tandem
   * multi-archi). Quand cette valeur est non-null, le DC1 utilise les
   * coordonnées de l'architecte (qui est mandataire MOE BTP) à la place
   * d'AlyoS. Null → comportement Solo / Tandem sans archi sélectionné
   * (AlyoS = mandataire).
   *
   * Cas d'usage : page `/sourcing/ao/[id]/dossier/cerfa?archi=<uuid>` —
   * un architecte ayant accepté la sollicitation a été choisi via le
   * sélecteur `AcceptedArchitectsSelector`.
   */
  selectedArchitect?: {
    id: string;
    cabinet: string;
    contactName: string | null;
    email: string;
    phone: string | null;
    siren: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    zip: string | null;
    city: string | null;
    signatureCity: string | null;
    legalRepresentativeName: string | null;
    legalRepresentativeRole: string | null;
  } | null;
  /**
   * BE cotraitant sélectionné (Lot B — Cotraitance BE). Quand cette valeur
   * est non-null, le DC2 décrit ce BE en tant que candidat membre du
   * groupement (et non plus AlyoS). Tous les champs candidat (dénomination,
   * SIREN, adresse, représentant légal, capital, etc.) viennent du BE.
   *
   * Cas d'usage : page `/sourcing/ao/[id]/dossier/cerfa?be=<uuid>` — un BE
   * cotraitant a été choisi via `BeCotraitantsSection` sur la page dossier.
   *
   * Mutual exclusivity avec `selectedArchitect` : si les deux sont fournis,
   * `selectedArchitect` (Tandem) prime (cf. logique côté Server Component
   * `cerfa/page.tsx`).
   */
  selectedBe?: {
    id: string;
    cabinet: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    siren: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    zip: string | null;
    city: string | null;
    capitalEur: number | null;
    signatureCity: string | null;
    legalRepresentativeName: string | null;
    legalRepresentativeRole: string | null;
  } | null;
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
 *
 * Phase 3 — Tandem multi-archi : si `selectedArchitect` est fourni,
 * l'architecte devient mandataire du groupement et l'ensemble des champs
 * candidat (mandataire, SIREN, adresse, représentant légal, qualité,
 * téléphone, email, lieu de signature) est rempli depuis sa fiche au lieu
 * d'AlyoS. Le mode Tandem (`isTandem`) reste actif (type candidature =
 * « Groupement momentané d'entreprises »).
 */
export function buildDc1(input: PrefillInput): CerfaDoc {
  const { tender, org, orgProfile, isTandem, selectedArchitect } = input;

  /**
   * Phase 3 — Branching mandataire :
   *   - `selectedArchitect` non-null → archi = mandataire (Tandem multi-archi)
   *   - sinon → AlyoS = mandataire (comportement Solo / Tandem sans archi)
   *
   * Quand un archi est sélectionné, on force le type de candidature à
   * « Groupement momentané d'entreprises » (l'archi mandataire implique
   * Tandem). On reste cohérent avec `isTandem` pour les autres champs.
   */
  const isArchiMandataire = selectedArchitect != null;
  const effectiveIsTandem = isTandem || isArchiMandataire;

  // Adresse archi concaténée à partir des 4 sous-champs (filter Boolean élimine
  // les NULL/strings vides — pas de virgule double si addressLine2 manque).
  const archiAdresse = isArchiMandataire
    ? [
        selectedArchitect.addressLine1,
        selectedArchitect.addressLine2,
        selectedArchitect.zip,
        selectedArchitect.city,
      ]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .join(", ")
    : "";

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
      effectiveIsTandem ? "Groupement momentané d'entreprises" : "Candidat individuel",
      "company_data",
      true,
    ),
  ];

  // Mandataire uniquement en Tandem (au sens large : isTandem OU archi sélectionné)
  if (effectiveIsTandem) {
    fields.push(
      field(
        "dc1_nom_mandataire",
        "Nom du mandataire du groupement",
        isArchiMandataire ? selectedArchitect.cabinet : org.name,
        "company_data",
        true,
      ),
    );
  }

  if (isArchiMandataire) {
    // Mode Tandem multi-archi : DC1 = données archi mandataire
    // Fallback `legalRepresentativeName` → `contactName` si la fiche archi
    // n'expose pas explicitement de représentant légal (ex. import Odoo
    // historique sans champ DC1). `contactName` reste le contact métier.
    const representantLegal =
      selectedArchitect.legalRepresentativeName ?? selectedArchitect.contactName ?? "";

    fields.push(
      field("dc1_siren", "SIREN / SIRET", selectedArchitect.siren ?? "", "company_data", true),
      field("dc1_adresse", "Adresse du candidat", archiAdresse, "company_data", false),
      field(
        "dc1_representant_legal",
        "Nom du représentant légal",
        representantLegal,
        "company_data",
        true,
      ),
      field(
        "dc1_qualite",
        "Qualité du signataire (ex. Président, Gérant)",
        selectedArchitect.legalRepresentativeRole ?? "",
        "company_data",
        true,
      ),
      field("dc1_telephone", "Téléphone", selectedArchitect.phone ?? "", "company_data", false),
      field(
        "dc1_email",
        "Adresse email de contact",
        selectedArchitect.email,
        "company_data",
        false,
      ),
      field(
        "dc1_lieu_date",
        "Fait à (lieu et date de signature)",
        selectedArchitect.signatureCity ?? "",
        "company_data",
        false,
      ),
    );
  } else {
    // Mode historique : DC1 = données AlyoS (Solo ou Tandem sans archi)
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
      field(
        "dc1_qualite",
        "Qualité du signataire (ex. Président, Gérant)",
        "",
        "company_data",
        true,
      ),
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
  }

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
 * `a_completer` — non disponibles dans le profil AlyoS / BE au MVP.
 *
 * Lot B — Cotraitance BE : si `selectedBe` est fourni, le DC2 décrit ce BE
 * cotraitant (et non AlyoS). Tous les champs candidat (dénomination, SIREN,
 * adresse, représentant légal, capital, etc.) viennent de la fiche BE.
 * Sinon → comportement standard (candidat = AlyoS).
 */
export function buildDc2(input: PrefillInput): CerfaDoc {
  const { org, orgProfile, selectedBe } = input;

  // Lot B — Branching candidat : BE cotraitant ou AlyoS.
  const isBeCandidate = selectedBe != null;

  // Adresse BE concaténée (même pattern que pour l'archi DC1).
  const beAdresse = isBeCandidate
    ? [selectedBe.addressLine1, selectedBe.addressLine2, selectedBe.zip, selectedBe.city]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .join(", ")
    : "";

  // Fallback rep légal → contactName si pas de représentant explicite (idem DC1 archi).
  const beRepresentantLegal = isBeCandidate
    ? (selectedBe.legalRepresentativeName ?? selectedBe.contactName ?? "")
    : "";

  // Capital BE : on l'affiche en euros bruts ("125000") — la mise en forme
  // (espaces millier, "€") est réservée au rendu PDF.
  const beCapital =
    isBeCandidate && selectedBe.capitalEur != null ? String(selectedBe.capitalEur) : "";

  const fields: CerfaField[] = [
    field(
      "dc2_denomination",
      "Dénomination sociale",
      isBeCandidate ? selectedBe.cabinet : org.name,
      "company_data",
      true,
    ),
    field(
      "dc2_siren",
      "SIREN / SIRET",
      isBeCandidate ? (selectedBe.siren ?? "") : (org.siren ?? ""),
      "company_data",
      true,
    ),
    field("dc2_forme_juridique", "Forme juridique (ex. SAS, SARL, SA)", "", "company_data", true),
    field(
      "dc2_adresse",
      "Adresse du siège social",
      isBeCandidate ? beAdresse : (orgProfile?.agencyDetails ?? ""),
      "company_data",
      false,
    ),
    field(
      "dc2_representant_legal",
      "Nom du représentant légal",
      isBeCandidate ? beRepresentantLegal : "",
      "company_data",
      true,
    ),
    field(
      "dc2_qualite",
      "Qualité du signataire (ex. Président, Gérant)",
      isBeCandidate ? (selectedBe.legalRepresentativeRole ?? "") : "",
      "company_data",
      true,
    ),
    field(
      "dc2_activite_principale",
      "Activité principale",
      isBeCandidate ? "" : "Ingénierie et conception — BTP, maîtrise d'œuvre",
      "company_data",
      false,
    ),
    field("dc2_effectif", "Effectif moyen annuel (ex. 15)", "", "company_data", false),
    field("dc2_capital", "Capital social (en euros)", beCapital, "company_data", false),
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
    field(
      "dc2_lieu_date",
      "Fait à (lieu et date de signature)",
      isBeCandidate ? (selectedBe.signatureCity ?? "") : "",
      "company_data",
      false,
    ),
  ];

  return {
    cerfa_kind: "DC2",
    label: "DC2 — Déclaration du candidat (CERFA n°13911)",
    fields,
  };
}
