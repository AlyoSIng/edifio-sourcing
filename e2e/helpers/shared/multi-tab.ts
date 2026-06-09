/**
 * Helpers shared — multi-onglets / multi-contextes Playwright.
 *
 * Pourquoi : certains scénarios (S9 RBAC member/admin, audit Suivi+ACT
 * monorepo) doivent vérifier qu'un user A ouvert dans un onglet ne voit pas
 * les données d'un user B ouvert dans un autre onglet — alors qu'on est
 * dans le MÊME process navigateur.
 *
 * Playwright modélise ça par des `BrowserContext` indépendants : chaque
 * contexte a son propre storage (cookies, localStorage). On ne peut PAS se
 * contenter de `browser.newPage()` car ça partagerait les cookies sb-* avec
 * la 1re session, ce qui ferait fail le test silencieusement.
 *
 * Ces helpers garantissent l'isolation et facilitent l'assertion de
 * cloisonnement (« la page admin ne doit PAS contenir d'email member et
 * inverse »).
 */

import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { MULTI_ORG_USERS, type OrgKey } from "../../fixtures/multi-org-seed";
import { signInWith } from "../auth";

/**
 * Ouvre un BrowserContext isolé + une page dedans, et se connecte sous
 * l'admin de `orgKey`. Renvoie la page + le contexte (le contexte est
 * nécessaire pour `context.close()` à la fin du test).
 *
 * **Important** : le caller doit appeler `context.close()` après usage —
 * Playwright ne nettoie pas automatiquement les contextes manuels.
 *
 * Si le caller préfère se connecter comme `member` (cf. S9), passer
 * `{ as: "member" }` en option.
 */
export async function loginInNewTab(
  browser: Browser,
  orgKey: OrgKey,
  options: { as?: "admin" | "member" } = {},
): Promise<{ page: Page; context: BrowserContext; email: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const role = options.as ?? "admin";
  const email = MULTI_ORG_USERS[orgKey][role];
  await signInWith(page, email);
  return { page, context, email };
}

/**
 * Vérifie qu'aucune donnée sensible d'un onglet ne fuite vers l'autre.
 *
 * Stratégie : on récupère le DOM des deux pages et on s'assure que :
 *   1. La page A ne contient AUCUNE des chaînes interdites de la page B.
 *   2. La page B ne contient AUCUNE des chaînes interdites de la page A.
 *
 * Les chaînes interdites sont les emails distinctifs des users connectés
 * dans chaque onglet (par défaut). Le caller peut fournir des
 * `forbiddenStringsInA`/`forbiddenStringsInB` pour ajouter des données
 * métier (ex: noms de cabinets archis seedés dans l'autre tenant).
 */
export async function assertCrossTabIsolation(
  tabA: { page: Page; email: string },
  tabB: { page: Page; email: string },
  options: {
    forbiddenStringsInA?: string[];
    forbiddenStringsInB?: string[];
  } = {},
): Promise<void> {
  const htmlA = await tabA.page.content();
  const htmlB = await tabB.page.content();

  // Garde-fous symétriques : l'email B ne doit pas apparaître dans A, et inverse.
  const forbiddenInA = [tabB.email, ...(options.forbiddenStringsInA ?? [])];
  const forbiddenInB = [tabA.email, ...(options.forbiddenStringsInB ?? [])];

  for (const forbidden of forbiddenInA) {
    expect(htmlA, `Tab A ne doit pas contenir "${forbidden}" (donnée de Tab B)`).not.toContain(
      forbidden,
    );
  }
  for (const forbidden of forbiddenInB) {
    expect(htmlB, `Tab B ne doit pas contenir "${forbidden}" (donnée de Tab A)`).not.toContain(
      forbidden,
    );
  }
}
