import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // Environment node : on teste des fonctions pures + serveur (middleware, lib/auth, etc.).
    // Bascule sur "jsdom" à l'étape 4 quand on ajoutera les tests React Testing Library
    // sur les composants critiques (cf. Gate 5 stratégie de tests).
    environment: "node",
    globals: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Exclusion explicite des E2E Playwright (qui ont leur propre runner).
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // À l'étape 3 Gate 6, on ne couvre que les fonctions pures testables
      // côté Vitest (src/lib/auth/*). Le reste (pages, composants, Server
      // Actions, middleware, helpers Supabase) est validé via :
      //   - E2E Playwright (matrice 12 cas C1-C12 du middleware)
      //   - tests d'intégration à venir Gate 6 step 7+ (RLS pgTAP, etc.)
      // Le périmètre coverage s'élargira progressivement aux libs `lib-ai`
      // et `matching-engine` (Gate 5 seuil ≥ 90 %) à mesure qu'elles arrivent.
      include: ["src/lib/auth/**/*.{ts,tsx}"],
      exclude: ["**/*.{test,spec}.{ts,tsx}", "**/*.d.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
