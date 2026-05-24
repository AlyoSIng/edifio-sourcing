/**
 * Tests unitaires — sélection template Brevo (TU/VOUS + 5 IDs).
 *
 * Couvre :
 *  - templateNameFor : 5 combinaisons (solicitation TU/VOUS, followup TU/VOUS, decline)
 *  - pickBrevoTemplateId : lit la bonne var d'env, throw si manquante, throw si invalide
 *  - defaultRegisterFromTutoiement : true → 'tu', false → 'vous'
 */

import { describe, expect, it } from "vitest";

import {
  defaultRegisterFromTutoiement,
  pickBrevoTemplateId,
  templateNameFor,
} from "./template-picker";

describe("templateNameFor", () => {
  it("solicitation TU", () => {
    expect(templateNameFor("solicitation", "tu")).toBe("architect_solicitation_TU");
  });
  it("solicitation VOUS", () => {
    expect(templateNameFor("solicitation", "vous")).toBe("architect_solicitation_VOUS");
  });
  it("followup TU/VOUS", () => {
    expect(templateNameFor("followup", "tu")).toBe("architect_followup_TU");
    expect(templateNameFor("followup", "vous")).toBe("architect_followup_VOUS");
  });
  it("decline_ack (registre ignoré)", () => {
    expect(templateNameFor("decline_ack", "tu")).toBe("architect_decline_acknowledgment");
    expect(templateNameFor("decline_ack", "vous")).toBe("architect_decline_acknowledgment");
  });
});

describe("pickBrevoTemplateId", () => {
  it("lit BREVO_TEMPLATE_ID_ARCHITECT_SOLICITATION_TU pour solicitation TU", () => {
    const env = {
      BREVO_TEMPLATE_ID_ARCHITECT_SOLICITATION_TU: "42",
    } as unknown as NodeJS.ProcessEnv;
    expect(pickBrevoTemplateId("solicitation", "tu", env)).toBe(42);
  });
  it("lit BREVO_TEMPLATE_ID_ARCHITECT_SOLICITATION_VOUS pour solicitation VOUS", () => {
    const env = {
      BREVO_TEMPLATE_ID_ARCHITECT_SOLICITATION_VOUS: "84",
    } as unknown as NodeJS.ProcessEnv;
    expect(pickBrevoTemplateId("solicitation", "vous", env)).toBe(84);
  });
  it("lit BREVO_TEMPLATE_ID_ARCHITECT_DECLINE_ACKNOWLEDGMENT pour decline_ack", () => {
    const env = {
      BREVO_TEMPLATE_ID_ARCHITECT_DECLINE_ACKNOWLEDGMENT: "99",
    } as unknown as NodeJS.ProcessEnv;
    expect(pickBrevoTemplateId("decline_ack", "tu", env)).toBe(99);
    expect(pickBrevoTemplateId("decline_ack", "vous", env)).toBe(99);
  });
  it("throw si var manquante", () => {
    const env = {} as unknown as NodeJS.ProcessEnv;
    expect(() => pickBrevoTemplateId("followup", "tu", env)).toThrow(/non configuré/);
  });
  it("throw si var non entier", () => {
    const env = {
      BREVO_TEMPLATE_ID_ARCHITECT_FOLLOWUP_TU: "not-a-number",
    } as unknown as NodeJS.ProcessEnv;
    expect(() => pickBrevoTemplateId("followup", "tu", env)).toThrow(/entier positif/);
  });
  it("throw si var <= 0", () => {
    const env = { BREVO_TEMPLATE_ID_ARCHITECT_FOLLOWUP_TU: "0" } as unknown as NodeJS.ProcessEnv;
    expect(() => pickBrevoTemplateId("followup", "tu", env)).toThrow(/entier positif/);
  });
});

describe("defaultRegisterFromTutoiement", () => {
  it("tutoiement=true → 'tu'", () => {
    expect(defaultRegisterFromTutoiement(true)).toBe("tu");
  });
  it("tutoiement=false → 'vous'", () => {
    expect(defaultRegisterFromTutoiement(false)).toBe("vous");
  });
});
