/**
 * Utilitaires de branding organisation — edifio Sourcing.
 *
 * Ce module fournit :
 *  - Les types `OrgFontFamily` et `OrgBranding`
 *  - La liste des polices disponibles (`FONT_OPTIONS`)
 *  - `computeBrandingCss()` : génère le bloc CSS `:root{...}` à injecter
 *    dans le `<head>` pour overrider les CSS vars brand de l'organisation.
 *  - Helpers internes `darkenHex` / `lightenHex` (sans dépendance externe).
 *
 * Règles :
 *  - Si `branding` est null ou aucun champ n'est renseigné → retourne "".
 *  - `primaryColor` doit passer le regex `/^#[0-9a-fA-F]{6}$/` (validé côté
 *    server action aussi — défense en profondeur ici).
 *  - `fontFamily` doit être une valeur de `OrgFontFamily` (sinon ignoré).
 *
 * Pas de dépendance externe : les calculs hex sont implémentés en pur TS
 * pour ne pas alourdir le bundle edge.
 */

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Familles de polices disponibles pour l'override `--font-display`. */
export type OrgFontFamily = "space-grotesk" | "outfit" | "playfair-display" | "inter";

/** Branding d'une organisation tel que stocké en BDD. */
export interface OrgBranding {
  logoUrl: string | null;
  primaryColor: string | null;
  fontFamily: string | null;
}

// --------------------------------------------------------------------------
// Options de sélection (utilisées par le formulaire client)
// --------------------------------------------------------------------------

/** Liste des polices proposées dans le formulaire « Personnalisation ». */
export const FONT_OPTIONS: { value: OrgFontFamily; label: string; preview: string }[] = [
  { value: "space-grotesk", label: "Space Grotesk", preview: "Moderne, sans-serif (défaut)" },
  { value: "outfit", label: "Outfit", preview: "Géométrique, épuré" },
  { value: "playfair-display", label: "Playfair Display", preview: "Élégant, serif" },
  { value: "inter", label: "Inter", preview: "Neutre, très lisible" },
];

/** Set de valeurs valides — utilisé pour la validation côté génération CSS. */
const VALID_FONT_FAMILIES = new Set<OrgFontFamily>([
  "space-grotesk",
  "outfit",
  "playfair-display",
  "inter",
]);

/** Correspondance slug → déclaration CSS `font-family`. */
const FONT_CSS_MAP: Record<OrgFontFamily, string> = {
  "space-grotesk": "'Space Grotesk', sans-serif",
  outfit: "'Outfit', sans-serif",
  "playfair-display": "'Playfair Display', serif",
  inter: "'Inter', sans-serif",
};

// --------------------------------------------------------------------------
// Génération CSS
// --------------------------------------------------------------------------

/**
 * Génère la chaîne CSS à injecter dans `<style>` pour overrider les vars brand.
 *
 * @param branding  Données branding issues de la BDD (peut être null).
 * @returns Chaîne CSS `:root{...}` ou `""` si aucun override à appliquer.
 *
 * @example
 * computeBrandingCss({ logoUrl: null, primaryColor: "#1a2b3c", fontFamily: "outfit" })
 * // → ":root{--brand-red:#1a2b3c;--brand-red-dark:#152230;--brand-red-light:#415060;--font-display:'Outfit', sans-serif;}"
 */
export function computeBrandingCss(branding: OrgBranding | null): string {
  if (!branding) return "";

  const lines: string[] = [];

  // --- Couleur dominante ---
  if (branding.primaryColor && /^#[0-9a-fA-F]{6}$/.test(branding.primaryColor)) {
    const base = branding.primaryColor;
    const dark = darkenHex(base, 0.2);
    const light = lightenHex(base, 0.15);
    lines.push(`--brand-red:${base};`);
    lines.push(`--brand-red-dark:${dark};`);
    lines.push(`--brand-red-light:${light};`);
  }

  // --- Police de titre ---
  if (branding.fontFamily && isValidFontFamily(branding.fontFamily)) {
    lines.push(`--font-display:${FONT_CSS_MAP[branding.fontFamily]};`);
  }

  if (lines.length === 0) return "";
  return `:root{${lines.join("")}}`;
}

// --------------------------------------------------------------------------
// Helpers internes
// --------------------------------------------------------------------------

/**
 * Type guard : vérifie que la chaîne est une `OrgFontFamily` valide.
 * Sépare la responsabilité de validation de la logique de mapping.
 */
function isValidFontFamily(value: string): value is OrgFontFamily {
  return VALID_FONT_FAMILIES.has(value as OrgFontFamily);
}

/**
 * Décompose une couleur hex 6 chiffres en composantes [R, G, B].
 * Précondition : `hex` est de la forme `#RRGGBB` (validé en amont).
 */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Recompose [R, G, B] en chaîne hex `#RRGGBB`.
 * Clamp à [0, 255] + arrondi avant conversion.
 */
function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((x) =>
        Math.min(255, Math.max(0, Math.round(x)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/**
 * Assombrit une couleur hex d'un ratio [0..1].
 * Ex. : darkenHex("#ff0033", 0.2) → retire 20 % de chaque composante.
 *
 * @param hex    Couleur source au format `#RRGGBB`.
 * @param ratio  Facteur d'assombrissement (0 = inchangé, 1 = noir).
 */
export function darkenHex(hex: string, ratio: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - ratio), g * (1 - ratio), b * (1 - ratio));
}

/**
 * Éclaircit une couleur hex d'un ratio [0..1].
 * Ex. : lightenHex("#ff0033", 0.15) → rapproche de 15 % du blanc sur chaque composante.
 *
 * @param hex    Couleur source au format `#RRGGBB`.
 * @param ratio  Facteur d'éclaircissement (0 = inchangé, 1 = blanc).
 */
export function lightenHex(hex: string, ratio: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * ratio, g + (255 - g) * ratio, b + (255 - b) * ratio);
}
