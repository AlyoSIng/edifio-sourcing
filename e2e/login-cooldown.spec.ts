import { expect, test } from "@playwright/test";

/**
 * Tests E2E du cooldown « renvoyer le lien » sur `/login`.
 *
 * Source : note de suivi `CC_260511_2102.md` (suite Board) + spec UX
 * cooldown polish login.
 *
 * Contrainte clé : on ne peut PAS asserter facilement le rate-limit réel
 * Supabase (non déterministe, dépend du quota du projet preview) sans
 * spammer l'API et fragiliser la CI. La stratégie retenue :
 *
 *  1. **Flow heureux** — soumission d'un email valide AlyoS, état `sent`
 *     affiché, bouton de renvoi présent et cliquable (cooldown UI inactif
 *     au premier envoi : l'invitation `Renvoie-toi un lien dans 60 secondes`
 *     est le wording figé spec, pas une garde technique).
 *  2. **Reset au reload** — un rechargement de page perd l'état React et
 *     ré-affiche le formulaire idle. Confirme qu'on ne persiste pas l'état
 *     `sent` côté sessionStorage (décision Board explicite).
 *  3. **Validation domaine côté Server Action** — un email hors domaine
 *     retourne un état `error` avec le message documenté, le bouton reste
 *     actif pour réessayer avec un autre email (pas de cooldown sur les
 *     refus pré-envoi).
 *
 * La mécanique fine du cooldown (countdown qui tick, bouton ré-activé au
 * bout de 2 s en CI) est validée côté Vitest via les helpers purs
 * `computeRemaining` / `msToCeilSeconds` (cf. `useCountdown.test.ts`). Le
 * comportement composant React (rendu conditionnel, `useFormState`)
 * nécessiterait `@testing-library/react` qui n'est pas dans les
 * dépendances autorisées ; il est observé en bout-de-chaîne ici.
 */

const ALYOS_TEST_EMAIL = `cooldown-${Date.now()}@alyosingenierie.fr`;
const FOREIGN_EMAIL = "intrus@gmail.com";

test.describe("Login cooldown UX — flow heureux + reset + validation domaine", () => {
  test("flow heureux : un email AlyoS valide passe à l'état `sent` avec bouton de renvoi", async ({
    page,
  }) => {
    await page.goto("/login");

    // Le titre est rendu via Space Grotesk (font-display) — pas de check
    // typo ici, l'audit a été fait en amont (note CC_260511_2102.md).
    await expect(page.getByRole("heading", { name: "Connectez-vous" })).toBeVisible();

    const emailInput = page.getByLabel("Email AlyoS");
    await emailInput.fill(ALYOS_TEST_EMAIL);

    const submitButton = page.getByRole("button", { name: /Recevoir mon lien/ });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // L'état `sent` est rendu via `<SuccessState />` avec un `<h3>` portant
    // le texte « Lien envoyé à <email> ». Le focus est déplacé dessus
    // (`useEffect` + `tabIndex={-1}`) — on assert via la présence du texte.
    await expect(page.getByText(`Lien envoyé à`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(ALYOS_TEST_EMAIL)).toBeVisible();

    // Le bouton de renvoi est présent avec le wording d'invitation par
    // défaut (cooldown UI inactif au premier envoi — l'utilisateur peut
    // demander un renvoi tout de suite, c'est Supabase côté serveur qui
    // appliquera son rate-limit si besoin).
    const resendButton = page.getByTestId("resend-button");
    await expect(resendButton).toBeVisible();
    await expect(resendButton).toContainText("Renvoie-toi un lien");
  });

  test("reset au reload : F5 sur l'état `sent` ré-affiche le formulaire idle", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email AlyoS").fill(ALYOS_TEST_EMAIL);
    await page.getByRole("button", { name: /Recevoir mon lien/ }).click();
    await expect(page.getByText(`Lien envoyé à`)).toBeVisible({ timeout: 15_000 });

    // Reload : on doit revenir sur le formulaire idle (pas de persistance
    // sessionStorage — décision Board explicite).
    await page.reload();
    await expect(page.getByRole("heading", { name: "Connectez-vous" })).toBeVisible();
    await expect(page.getByLabel("Email AlyoS")).toBeVisible();
    await expect(page.getByLabel("Email AlyoS")).toHaveValue("");
    await expect(page.getByRole("button", { name: /Recevoir mon lien/ })).toBeEnabled();
  });

  test("validation domaine pré-envoi : un email @gmail.com renvoie une erreur sans déclencher de cooldown", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email AlyoS").fill(FOREIGN_EMAIL);
    await page.getByRole("button", { name: /Recevoir mon lien/ }).click();

    // Message d'erreur attendu (wording figé dans `actions.ts`).
    await expect(page.getByRole("alert")).toContainText("@alyosingenierie.fr");

    // Le bouton reste actif (pas de cooldown sur un refus de domaine — on
    // veut que l'utilisateur puisse corriger immédiatement).
    await expect(page.getByRole("button", { name: /Recevoir mon lien/ })).toBeEnabled();

    // Le countdown ne doit PAS être affiché (pas de rateLimited hint dans
    // l'état d'erreur retourné par la Server Action).
    await expect(page.getByText(/Réessaye dans .* s/)).not.toBeVisible();
  });
});
