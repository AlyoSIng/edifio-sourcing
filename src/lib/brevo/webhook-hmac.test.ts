/**
 * Tests unitaires — vérification HMAC SHA-256 du webhook Brevo.
 *
 * Couvre :
 *  - happy path : signature valide
 *  - signature invalide (mauvais secret)
 *  - signature invalide (body modifié — anti-tampering)
 *  - longueur de signature aberrante → false (pas de throw)
 *  - body vide / secret vide / signature vide → false
 *  - timing-safe (couvert indirectement par timingSafeEqual usage)
 *  - lecture du header dans plusieurs formats (`x-brevo-signature`,
 *    `x-mailin-signature`, `x-webhook-signature`)
 *  - `isTrackedEvent` accepte les events Brevo, rejette les inconnus
 */

import { describe, expect, it } from "vitest";
import crypto from "node:crypto";

import {
  isTrackedEvent,
  readBrevoSignatureHeader,
  TRACKED_EVENTS,
  verifyBrevoHmac,
} from "./webhook-hmac";

const SECRET = "supersecret-test";
const BODY = JSON.stringify({ event: "delivered", "message-id": "abc123" });

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifyBrevoHmac", () => {
  it("retourne true si la signature correspond", () => {
    const sig = sign(BODY, SECRET);
    expect(verifyBrevoHmac(BODY, sig, SECRET)).toBe(true);
  });

  it("retourne false si le secret est différent", () => {
    const sig = sign(BODY, "wrong-secret");
    expect(verifyBrevoHmac(BODY, sig, SECRET)).toBe(false);
  });

  it("retourne false si le body a été modifié (anti-tampering)", () => {
    const sig = sign(BODY, SECRET);
    const tampered = BODY.replace("delivered", "opened");
    expect(verifyBrevoHmac(tampered, sig, SECRET)).toBe(false);
  });

  it("retourne false si la signature a une longueur aberrante (pas de throw)", () => {
    expect(verifyBrevoHmac(BODY, "abc", SECRET)).toBe(false);
    expect(verifyBrevoHmac(BODY, "x".repeat(200), SECRET)).toBe(false);
  });

  it("retourne false si la signature est de la bonne longueur mais invalide", () => {
    const fakeButWellShaped = "0".repeat(64);
    expect(verifyBrevoHmac(BODY, fakeButWellShaped, SECRET)).toBe(false);
  });

  it("retourne false si body vide", () => {
    expect(verifyBrevoHmac("", sign(BODY, SECRET), SECRET)).toBe(false);
  });

  it("retourne false si signature vide", () => {
    expect(verifyBrevoHmac(BODY, "", SECRET)).toBe(false);
  });

  it("retourne false si secret vide", () => {
    expect(verifyBrevoHmac(BODY, sign(BODY, SECRET), "")).toBe(false);
  });

  it("est case-sensitive sur la signature hex (HMAC standard)", () => {
    const sig = sign(BODY, SECRET);
    const upper = sig.toUpperCase();
    // case-sensitive : on attend false sauf si sig est déjà uppercase
    if (sig !== upper) {
      expect(verifyBrevoHmac(BODY, upper, SECRET)).toBe(false);
    }
  });
});

describe("readBrevoSignatureHeader", () => {
  it("lit x-brevo-signature", () => {
    const h = new Headers({ "x-brevo-signature": "abc" });
    expect(readBrevoSignatureHeader(h)).toBe("abc");
  });

  it("lit x-mailin-signature en fallback", () => {
    const h = new Headers({ "x-mailin-signature": "def" });
    expect(readBrevoSignatureHeader(h)).toBe("def");
  });

  it("lit x-webhook-signature en fallback secondaire", () => {
    const h = new Headers({ "x-webhook-signature": "ghi" });
    expect(readBrevoSignatureHeader(h)).toBe("ghi");
  });

  it("priorise x-brevo-signature sur les autres", () => {
    const h = new Headers({
      "x-brevo-signature": "primary",
      "x-mailin-signature": "fallback",
    });
    expect(readBrevoSignatureHeader(h)).toBe("primary");
  });

  it("retourne null si aucun header présent", () => {
    expect(readBrevoSignatureHeader(new Headers())).toBeNull();
  });

  it("trim les espaces autour de la valeur", () => {
    const h = new Headers({ "x-brevo-signature": "  abc  " });
    expect(readBrevoSignatureHeader(h)).toBe("abc");
  });
});

describe("isTrackedEvent", () => {
  it("accepte les events de TRACKED_EVENTS", () => {
    for (const ev of TRACKED_EVENTS) {
      expect(isTrackedEvent(ev)).toBe(true);
    }
  });

  it("rejette null / undefined / chaîne vide", () => {
    expect(isTrackedEvent(null)).toBe(false);
    expect(isTrackedEvent(undefined)).toBe(false);
    expect(isTrackedEvent("")).toBe(false);
  });

  it("rejette les events inconnus", () => {
    expect(isTrackedEvent("custom-event")).toBe(false);
    expect(isTrackedEvent("hello")).toBe(false);
  });

  it("accepte case-insensitive", () => {
    expect(isTrackedEvent("DELIVERED")).toBe(true);
    expect(isTrackedEvent("Opened")).toBe(true);
  });
});
