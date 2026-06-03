/**
 * Tests unitaires — builders du mail digest expiration biblio.
 *
 * Pas de test sur `runLibraryExpiryDigest` lui-même (intégration BDD + Resend
 * trop lourde sans mocks complets — couvert en e2e). On valide les helpers
 * purs (subject / html / text / escape) qui sont la partie risquée.
 */

import { describe, expect, it } from "vitest";

import { buildDigestHtml, buildDigestSubject, buildDigestText } from "./expiry-digest";

const BASE_CONTENT = {
  organizationName: "AlyoS Ingénierie",
  libraryUrl: "https://app.example.com/sourcing/admin/bibliotheque",
};

describe("buildDigestSubject", () => {
  it("priorise expired dans le sujet", () => {
    const subject = buildDigestSubject({
      ...BASE_CONTENT,
      expired: [{ name: "URSSAF", validUntilIso: "2026-05-30" }],
      expiringSoon: [{ name: "DGFIP", validUntilIso: "2026-06-15" }],
    });
    expect(subject).toMatch(/expiré/i);
    expect(subject).toContain("1");
  });

  it("annonce le total expirant si pas d'expirés", () => {
    const subject = buildDigestSubject({
      ...BASE_CONTENT,
      expired: [],
      expiringSoon: [
        { name: "URSSAF", validUntilIso: "2026-06-15" },
        { name: "DGFIP", validUntilIso: "2026-06-20" },
      ],
    });
    expect(subject).toContain("2");
    expect(subject).not.toMatch(/expiré/i);
  });

  it("pluralise correctement", () => {
    const subject = buildDigestSubject({
      ...BASE_CONTENT,
      expired: [
        { name: "URSSAF", validUntilIso: "2026-05-30" },
        { name: "DGFIP", validUntilIso: "2026-05-15" },
      ],
      expiringSoon: [],
    });
    expect(subject).toContain("expirés");
    expect(subject).toContain("documents");
  });
});

describe("buildDigestHtml", () => {
  it("génère les 2 sections quand expired + soon non vides", () => {
    const html = buildDigestHtml({
      ...BASE_CONTENT,
      expired: [{ name: "URSSAF", validUntilIso: "2026-05-30" }],
      expiringSoon: [{ name: "DGFIP", validUntilIso: "2026-06-15" }],
    });
    expect(html).toContain("URSSAF");
    expect(html).toContain("2026-05-30");
    expect(html).toContain("DGFIP");
    expect(html).toContain("2026-06-15");
    expect(html).toContain(BASE_CONTENT.libraryUrl);
  });

  it("omet la section expired si vide", () => {
    const html = buildDigestHtml({
      ...BASE_CONTENT,
      expired: [],
      expiringSoon: [{ name: "DGFIP", validUntilIso: "2026-06-15" }],
    });
    expect(html).not.toContain("exclu");
    expect(html).toContain("DGFIP");
  });

  it("échappe les caractères HTML dans le nom de l'item", () => {
    const html = buildDigestHtml({
      ...BASE_CONTENT,
      expired: [{ name: '<script>alert("xss")</script>', validUntilIso: "2026-05-30" }],
      expiringSoon: [],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("échappe l'organizationName aussi", () => {
    const html = buildDigestHtml({
      organizationName: 'Org "Sneaky"',
      libraryUrl: BASE_CONTENT.libraryUrl,
      expired: [{ name: "X", validUntilIso: "2026-05-30" }],
      expiringSoon: [],
    });
    expect(html).toContain("Org &quot;Sneaky&quot;");
  });
});

describe("buildDigestText", () => {
  it("liste tous les items en texte brut", () => {
    const text = buildDigestText({
      ...BASE_CONTENT,
      expired: [{ name: "URSSAF", validUntilIso: "2026-05-30" }],
      expiringSoon: [{ name: "DGFIP", validUntilIso: "2026-06-15" }],
    });
    expect(text).toContain("URSSAF");
    expect(text).toContain("DGFIP");
    expect(text).toContain(BASE_CONTENT.libraryUrl);
  });

  it("ne met pas de HTML dans la version texte", () => {
    const text = buildDigestText({
      ...BASE_CONTENT,
      expired: [{ name: "<b>BOLD</b>", validUntilIso: "2026-05-30" }],
      expiringSoon: [],
    });
    // Pas d'échappement HTML côté text — on garde tel quel
    expect(text).toContain("<b>BOLD</b>");
  });
});
