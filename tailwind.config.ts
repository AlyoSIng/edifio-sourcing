import type { Config } from "tailwindcss";

/**
 * Configuration Tailwind — alignée DS edifio (cf. `design/tokens.json` v1.0.0).
 *
 * Convention :
 *   - Les couleurs reprennent les noms canoniques de `design/tokens.json` et des
 *     maquettes (`brand-red`, `ink`, `paper`, `line`, etc.). Les alias legacy
 *     `alyos-red` sont conservés pour ne casser aucun code existant tant que
 *     le refacto naming (P1.2+) n'est pas réalisé.
 *   - Les radius/shadows pointent directement sur les CSS vars définies dans
 *     `src/app/globals.css`, qui restent la source consommable côté composants
 *     custom non-Tailwind (ex. SVG inline) et côté `:root` overrides.
 *   - `fontFamily.sans` = Inter (corps texte), `fontFamily.display` = Space
 *     Grotesk (titres / wordmark), `fontFamily.mono` = JetBrains Mono (codes,
 *     SIRET, références AO). Polices auto-importées via `@fontsource/*` dans
 *     `src/app/layout.tsx` (self-host, cf. Gate 5).
 */

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // ---- Marque ----
        // Canonical (`brand-red`) + alias rétro-compatible (`alyos-red`).
        // Les deux résolvent vers la même CSS var pour permettre la migration
        // progressive du naming dans les composants.
        "brand-red": {
          DEFAULT: "var(--brand-red)",
          dark: "var(--brand-red-dark)",
          light: "var(--brand-red-light)",
        },
        "alyos-red": {
          DEFAULT: "var(--alyos-red)",
          dark: "var(--alyos-red-dark)",
          light: "var(--alyos-red-light)",
        },

        // ---- Texte / fonds sombres ----
        ink: {
          DEFAULT: "var(--ink)",
          2: "var(--ink-2)",
        },

        // ---- Papier (fonds clairs hiérarchisés) ----
        paper: {
          DEFAULT: "var(--paper)",
          2: "var(--paper-2)",
          3: "var(--paper-3)",
        },

        // ---- Bordures ----
        line: {
          DEFAULT: "var(--line)",
          2: "var(--line-2)",
        },

        // ---- Neutres ----
        muted: "var(--muted)",

        // ---- Statuts ----
        success: {
          DEFAULT: "var(--status-success)",
          bg: "var(--status-success-bg)",
        },
        warn: {
          DEFAULT: "var(--status-warn)",
          bg: "var(--status-warn-bg)",
        },
        error: {
          DEFAULT: "var(--status-error)",
          bg: "var(--status-error-bg)",
        },
        info: {
          DEFAULT: "var(--status-info)",
          bg: "var(--status-info-bg)",
        },
      },

      fontFamily: {
        // Familles auto-utilisées par <html class="font-sans"> et utilitaires Tailwind.
        // Cf. import des CSS fontsource dans src/app/layout.tsx.
        sans: ["Inter", "system-ui", "sans-serif"],
        // Lit la CSS var `--font-display` définie dans globals.css (défaut : Space
        // Grotesk). Le layout Sourcing peut l'overrider via une `<style>` inline
        // injectée par `computeBrandingCss()` selon la police choisie par l'org.
        display: ["var(--font-display)", { fontFeatureSettings: '"ss01"' }],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },

      borderRadius: {
        // Tokens DS (cf. tokens.json radius). Les valeurs Tailwind par défaut
        // (rounded-sm/md/lg) restent disponibles ; on ajoute uniquement les
        // alias DS pour rappeler la sémantique aux développeurs.
        xs: "var(--radius-xs)", // 3px — tags inline mono
        sm: "var(--radius-sm)", // 8px — champs, éléments décoratifs
        md: "var(--radius-md)", // 14px — cartes, panneaux
        lg: "var(--radius-lg)", // 22px — modales, héros
        full: "var(--radius-full)", // 999px — chips, pills
        pill: "99px", // DS variante B — boutons en pills
      },

      boxShadow: {
        // Tokens DS (cf. tokens.json shadow).
        card: "var(--shadow-card)",
        modal: "var(--shadow-modal)",
        logo: "var(--shadow-logo)",
      },

      spacing: {
        // On garde l'échelle Tailwind par défaut (0, 1, 2, 3, 4, ... compatible
        // avec tout le code existant qui consomme déjà px-3, gap-4, etc.). On
        // n'ajoute pas d'alias DS pour ne pas créer de doublons confus avec
        // la nomenclature numérique standard Tailwind.
      },
    },
  },
  plugins: [],
};

export default config;
