/**
 * Codes de spécialités prédéfinis pour architectes et bureaux d'études.
 * Ces codes alimentent les checkboxes dans les formulaires de profil.
 * Source : vocabulaire normalisé edifio Sourcing (adapté du référentiel UNSFA).
 */

export interface SpecialtyCode {
  code: string;
  label: string;
}

/** Spécialités architectes (domaines d'intervention). */
export const ARCHITECT_SPECIALTY_CODES: SpecialtyCode[] = [
  { code: "archi_logement", label: "Logement (neuf & réhabilitation)" },
  { code: "archi_erp", label: "ERP / Équipements publics" },
  { code: "archi_tertiaire", label: "Tertiaire (bureaux, commerces)" },
  { code: "archi_industrie", label: "Industrie & entrepôts" },
  { code: "archi_sport", label: "Sport & loisirs" },
  { code: "archi_sante", label: "Santé & médico-social" },
  { code: "archi_patrimoine", label: "Patrimoine & réhabilitation" },
  { code: "archi_paysage", label: "Architecture paysagère & VRD" },
  { code: "archi_interieur", label: "Architecture intérieure & décoration" },
  { code: "archi_moe_generale", label: "Maîtrise d'œuvre générale (loi MOP)" },
  { code: "archi_conception_realisation", label: "Conception-réalisation" },
];

/** Spécialités bureaux d'études techniques (BET). */
export const BE_SPECIALTY_CODES: SpecialtyCode[] = [
  { code: "be_structure", label: "Structure / Génie civil" },
  { code: "be_fluides", label: "Fluides / CVC / Thermique" },
  { code: "be_elec", label: "Électricité (courants forts & faibles)" },
  { code: "be_bim", label: "BIM / Numérique" },
  { code: "be_acoustique", label: "Acoustique" },
  { code: "be_eco_construction", label: "Économie de la construction (OPC / métrés)" },
  { code: "be_securite", label: "Sécurité incendie / SSI" },
  { code: "be_vrd", label: "VRD / Aménagement extérieur" },
  { code: "be_env", label: "Environnement / HQE / RE2020" },
  { code: "be_accessibilite", label: "Accessibilité / PMR" },
  { code: "be_demolition", label: "Démolition / PEMD / Amiante" },
  { code: "be_paysage", label: "Paysage & espaces verts" },
];
