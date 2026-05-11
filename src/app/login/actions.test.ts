import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getCooldownMs, isSupabaseRateLimitError } from "./rate-limit";
import { RESEND_COOLDOWN_MS } from "./types";

/**
 * Tests de la logique métier extraite de la Server Action `signInWithOtpAction`.
 *
 * NB : on ne teste pas la Server Action de bout-en-bout ici parce qu'elle
 * dépend de `next/headers` (`cookies()`) et de `@supabase/ssr`, qui ne sont
 * pas disponibles hors d'un contexte App Router Next.js. Stubber ces deux
 * modules pour un test unitaire représente plus de complexité de mock que
 * de logique testée — la validation comportementale du flow complet est
 * couverte par l'E2E Playwright (`e2e/login-cooldown.spec.ts`) qui exerce
 * réellement la Server Action via le webServer Next.js.
 *
 * Ici on couvre les deux helpers purs qui portent la décision métier :
 *   1. `isSupabaseRateLimitError` — détection rate-limit via 3 signaux
 *      (status 429, code Supabase, regex filet).
 *   2. `getCooldownMs` — lecture env var `LOGIN_RESEND_COOLDOWN_MS` avec
 *      fallback sur la constante UI 60 000 ms.
 */

describe("isSupabaseRateLimitError", () => {
  it("détecte un status 429 même sans code/message", () => {
    expect(isSupabaseRateLimitError({ status: 429 })).toBe(true);
  });

  it("détecte le code Supabase officiel `over_email_send_rate_limit`", () => {
    expect(
      isSupabaseRateLimitError({ code: "over_email_send_rate_limit", message: "blabla" }),
    ).toBe(true);
  });

  it("détecte la phrase « rate limit » dans le message (filet régression)", () => {
    expect(isSupabaseRateLimitError({ message: "You have hit the rate limit" })).toBe(true);
    expect(isSupabaseRateLimitError({ message: "rate-limit exceeded" })).toBe(true);
    expect(isSupabaseRateLimitError({ message: "Rate Limit" })).toBe(true);
  });

  it("retourne false pour une erreur d'auth quelconque sans signal de rate-limit", () => {
    expect(isSupabaseRateLimitError({ status: 500, code: "internal", message: "boom" })).toBe(
      false,
    );
  });

  it("retourne false pour un objet vide", () => {
    expect(isSupabaseRateLimitError({})).toBe(false);
  });

  it("retourne false pour une erreur 400 banale (bad request)", () => {
    expect(isSupabaseRateLimitError({ status: 400, message: "invalid email" })).toBe(false);
  });

  it("ne se laisse pas piéger par une chaîne contenant « rate » seul (sans limit)", () => {
    expect(isSupabaseRateLimitError({ message: "Exchange rate updated" })).toBe(false);
  });
});

describe("getCooldownMs", () => {
  const original = process.env.LOGIN_RESEND_COOLDOWN_MS;

  beforeEach(() => {
    delete process.env.LOGIN_RESEND_COOLDOWN_MS;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.LOGIN_RESEND_COOLDOWN_MS;
    } else {
      process.env.LOGIN_RESEND_COOLDOWN_MS = original;
    }
  });

  it("retourne 60_000 par défaut (fallback constante UI)", () => {
    expect(getCooldownMs()).toBe(RESEND_COOLDOWN_MS);
    expect(getCooldownMs()).toBe(60_000);
  });

  it("lit la valeur depuis l'env var quand elle est posée", () => {
    process.env.LOGIN_RESEND_COOLDOWN_MS = "2000";
    expect(getCooldownMs()).toBe(2_000);
  });

  it("supporte les valeurs élevées (test de borne haute)", () => {
    process.env.LOGIN_RESEND_COOLDOWN_MS = "120000";
    expect(getCooldownMs()).toBe(120_000);
  });

  it("ignore une valeur non numérique et tombe sur le fallback", () => {
    process.env.LOGIN_RESEND_COOLDOWN_MS = "yolo";
    expect(getCooldownMs()).toBe(RESEND_COOLDOWN_MS);
  });

  it("ignore une valeur négative (NaN-safe) et tombe sur le fallback", () => {
    process.env.LOGIN_RESEND_COOLDOWN_MS = "-100";
    expect(getCooldownMs()).toBe(RESEND_COOLDOWN_MS);
  });

  it("ignore zéro (pas de cooldown ≤ 0) et tombe sur le fallback", () => {
    process.env.LOGIN_RESEND_COOLDOWN_MS = "0";
    expect(getCooldownMs()).toBe(RESEND_COOLDOWN_MS);
  });

  it("ignore une chaîne vide et tombe sur le fallback", () => {
    process.env.LOGIN_RESEND_COOLDOWN_MS = "";
    expect(getCooldownMs()).toBe(RESEND_COOLDOWN_MS);
  });
});

describe("RESEND_COOLDOWN_MS — constante figée à 60 000", () => {
  it("vaut exactement 60_000 ms (1 min) — wording UI cohérent", () => {
    // Si tu changes cette valeur, change AUSSI le wording « 60 secondes »
    // dans `LoginForm.tsx` et dans `actions.ts` (message rate-limit).
    expect(RESEND_COOLDOWN_MS).toBe(60_000);
  });
});

/**
 * Note : la déviation `LoginForm.test.tsx` (test composant React Testing
 * Library) n'a pas été produite — la dépendance `@testing-library/react`
 * n'est pas installée dans le repo et l'ajout de dépendance est interdit
 * par le périmètre actuel. Voir `e2e/login-cooldown.spec.ts` pour la
 * validation comportementale UI dans un vrai navigateur Chromium.
 */
describe.skip("LoginForm — RTL (skipped : dependency not available)", () => {
  it("placeholder pour rappeler la dette", () => {
    expect(true).toBe(true);
  });
});
