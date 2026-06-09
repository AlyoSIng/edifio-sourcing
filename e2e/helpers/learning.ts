/**
 * Helpers d'authentification multi-org pour les specs de la recette PROTECT.
 *
 * **Pourquoi un helper dédié et pas `signInWith` (e2e/helpers/auth.ts)** ?
 * `signInWith` accepte uniquement les emails matchant le pattern
 * `^(e2e-test\+|alice|bob)[^@]*@` côté route `/api/test/seed-session`. La
 * fixture multi-org utilise `e2e-test+multiorg-<org>-<role>@<domain>`, qui
 * matche bien le pattern. On peut donc l'utiliser directement.
 *
 * Ce module fournit deux choses :
 *   1. `signInAsAdminOf(orgKey)` — login rapide pour un admin d'une org de la
 *      fixture multi-org (renvoie l'email pour audit / log).
 *   2. Helpers learning : compteurs / reset des `learning_events`. Initialement
 *      prévus pour la recette salve U, repris ici parce que la recette finale
 *      PROTECT s'appuie sur le même type d'introspection BDD (S4, S6).
 *
 * Note : "learning" dans le nom du fichier vient de la spec de recette
 * (RECETTE_FINALE_PROTECT_BASCULE_JUILLET §3 + plan_recette_salve_U). Le
 * helper reste générique « introspection BDD via service_role ».
 */

import type { Page } from "@playwright/test";

import { signInWith } from "./auth";
import {
  MULTI_ORG_USERS,
  MULTI_ORG_IDS,
  type OrgKey,
  getAdminClient,
} from "../fixtures/multi-org-seed";

/**
 * Connecte la page sous l'identité de l'admin d'une org de la fixture multi-org.
 *
 * Renvoie l'email signé (utile pour les asserts qui veulent vérifier que le
 * bon user est connecté).
 */
export async function signInAsAdminOf(page: Page, orgKey: OrgKey): Promise<string> {
  const email = MULTI_ORG_USERS[orgKey].admin;
  await signInWith(page, email);
  return email;
}

/**
 * Connecte la page sous l'identité d'un member (non-admin) d'une org de la
 * fixture multi-org.
 */
export async function signInAsMemberOf(page: Page, orgKey: OrgKey): Promise<string> {
  const email = MULTI_ORG_USERS[orgKey].member;
  await signInWith(page, email);
  return email;
}

/**
 * Compte les événements d'apprentissage d'une org via service_role.
 * Utile pour la recette salve U + spot-check post-cron sourcing-run (S6).
 *
 * Renvoie 0 si la table est vide pour l'org (cas attendu en sortie de seed
 * frais).
 */
export async function countLearningEvents(orgId: string): Promise<number> {
  const admin = getAdminClient();
  const { count, error } = await admin
    .from("learning_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if (error) {
    // En CI sans migration learning, la table peut ne pas exister — on
    // renvoie 0 pour ne pas faire planter le test indépendant.
    if (/relation .* does not exist/i.test(error.message)) return 0;
    throw new Error(`countLearningEvents(${orgId}): ${error.message}`);
  }
  return count ?? 0;
}

/**
 * Reset les événements d'apprentissage d'une org (DELETE). Idempotent.
 * À utiliser en `beforeEach` pour rétablir un état de référence avant un
 * spec qui mesure une variation.
 */
export async function resetLearningState(orgId: string): Promise<void> {
  const admin = getAdminClient();
  const { error } = await admin.from("learning_events").delete().eq("organization_id", orgId);
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return;
    throw new Error(`resetLearningState(${orgId}): ${error.message}`);
  }
}

/** Ré-export des constantes pour ergonomie des specs. */
export { MULTI_ORG_USERS, MULTI_ORG_IDS };
