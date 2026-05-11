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
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.{test,spec}.{ts,tsx}", "src/app/**", "src/**/*.d.ts"],
      // Seuils Gate 5 : ≥ 70 % global, ≥ 90 % sur lib-ai et matching-engine.
      // Middleware = surface critique → on vise 90 % sur src/lib/auth/* dès maintenant.
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
        "src/lib/auth/**": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
