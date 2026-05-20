import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getSiteUrl, normalizeSiteUrl } from "./site-url";

describe("normalizeSiteUrl", () => {
  it("trim les espaces de début et fin", () => {
    expect(normalizeSiteUrl("  https://example.com  ")).toBe("https://example.com");
  });

  it("retire le trailing slash", () => {
    expect(normalizeSiteUrl("https://example.com/")).toBe("https://example.com");
  });

  it("retire un schéma dupliqué `https://https://`", () => {
    expect(normalizeSiteUrl("https://https://example.com")).toBe("https://example.com");
  });

  it("retire un schéma dupliqué `http://http://`", () => {
    expect(normalizeSiteUrl("http://http://example.com")).toBe("http://example.com");
  });

  it("retire un schéma dupliqué mixte (garde le premier détecté)", () => {
    expect(normalizeSiteUrl("https://http://example.com")).toBe("https://example.com");
  });

  it("normalise une URL propre sans rien changer", () => {
    expect(normalizeSiteUrl("https://edifio-sourcing.vercel.app")).toBe(
      "https://edifio-sourcing.vercel.app",
    );
  });

  it("ne touche pas une URL avec path (ex. /api)", () => {
    expect(normalizeSiteUrl("https://example.com/api")).toBe("https://example.com/api");
  });
});

describe("getSiteUrl", () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const originalVercelUrl = process.env.VERCEL_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
  });

  afterEach(() => {
    if (originalSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    }
    if (originalVercelUrl === undefined) {
      delete process.env.VERCEL_URL;
    } else {
      process.env.VERCEL_URL = originalVercelUrl;
    }
  });

  it("retourne NEXT_PUBLIC_SITE_URL si défini", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://edifio.example.com/";
    expect(getSiteUrl()).toBe("https://edifio.example.com");
  });

  it("normalise NEXT_PUBLIC_SITE_URL même avec schéma dupliqué (incident 2026-05-14)", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://https://edifio.example.com";
    expect(getSiteUrl()).toBe("https://edifio.example.com");
  });

  it("fallback sur VERCEL_URL en préfixant `https://` (Vercel preview/prod)", () => {
    process.env.VERCEL_URL = "edifio-sourcing-abc.vercel.app";
    expect(getSiteUrl()).toBe("https://edifio-sourcing-abc.vercel.app");
  });

  it("fallback ultime sur `http://localhost:3000` quand aucune var n'est définie", () => {
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });

  it("priorité NEXT_PUBLIC_SITE_URL > VERCEL_URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://custom.example.com";
    process.env.VERCEL_URL = "edifio-sourcing-abc.vercel.app";
    expect(getSiteUrl()).toBe("https://custom.example.com");
  });
});
