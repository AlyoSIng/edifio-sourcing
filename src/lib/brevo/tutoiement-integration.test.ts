/**
 * Test smoke bout-en-bout : tutoiement boolean → defaultRegisterFromTutoiement
 * → pickBrevoTemplateId → templateNameFor.
 *
 * Objectif :
 *  - Documenter la règle de priorité registre pour les lots futurs (lot C
 *    page tokenisée, lot D éventuels templates admin).
 *  - Couvrir les 2 polarités × les 2 kinds principaux (solicitation, followup).
 *  - Vérifier l'invariant decline_ack (registre ignoré).
 *
 * Sans BDD ni Brevo réel — pure logique de la chaîne de fonctions.
 *
 * Règle documentée (décision Tandem lot A 2026-05-25) :
 *  Override explicite > architects.tutoiement > DEFAULT false (vouvoiement).
 *  Le lot C (page tokenisée architecte) NE DOIT PAS passer de register en
 *  override : le registre est fixé lors de l'envoi initial.
 */

import { describe, expect, it } from "vitest";

import {
  defaultRegisterFromTutoiement,
  pickBrevoTemplateId,
  templateNameFor,
  type BrevoRegister,
} from "./template-picker";

// Env de test — IDs fictifs suffisants pour pickBrevoTemplateId
const TEST_ENV = {
  BREVO_TEMPLATE_ID_ARCHITECT_SOLICITATION_TU: "101",
  BREVO_TEMPLATE_ID_ARCHITECT_SOLICITATION_VOUS: "102",
  BREVO_TEMPLATE_ID_ARCHITECT_FOLLOWUP_TU: "103",
  BREVO_TEMPLATE_ID_ARCHITECT_FOLLOWUP_VOUS: "104",
  BREVO_TEMPLATE_ID_ARCHITECT_DECLINE_ACKNOWLEDGMENT: "105",
} as unknown as NodeJS.ProcessEnv;

/**
 * Simule la chaîne complète depuis le flag BDD jusqu'au templateId Brevo.
 * Reproduit le comportement de sendArchitectSolicitation et runTandemFollowups.
 */
function resolveTemplate(
  tutoiement: boolean,
  kind: "solicitation" | "followup" | "decline_ack",
  registerOverride?: BrevoRegister,
): { register: BrevoRegister; templateId: number; templateName: string } {
  // Priorité : override explicite > tutoiement > défaut false (vouvoiement)
  const register: BrevoRegister = registerOverride ?? defaultRegisterFromTutoiement(tutoiement);
  const templateId = pickBrevoTemplateId(kind, register, TEST_ENV);
  const templateName = templateNameFor(kind, register);
  return { register, templateId, templateName };
}

// ============================================================================
// Polarité tutoiement=false (vouvoiement — défaut spec)
// ============================================================================

describe("tutoiement=false (vouvoiement — défaut)", () => {
  it("solicitation → registre 'vous', templateId 102, nom _VOUS", () => {
    const r = resolveTemplate(false, "solicitation");
    expect(r.register).toBe("vous");
    expect(r.templateId).toBe(102);
    expect(r.templateName).toBe("architect_solicitation_VOUS");
  });

  it("followup → registre 'vous', templateId 104, nom _VOUS", () => {
    const r = resolveTemplate(false, "followup");
    expect(r.register).toBe("vous");
    expect(r.templateId).toBe(104);
    expect(r.templateName).toBe("architect_followup_VOUS");
  });
});

// ============================================================================
// Polarité tutoiement=true (tutoiement — collaboration historique)
// ============================================================================

describe("tutoiement=true (tutoiement)", () => {
  it("solicitation → registre 'tu', templateId 101, nom _TU", () => {
    const r = resolveTemplate(true, "solicitation");
    expect(r.register).toBe("tu");
    expect(r.templateId).toBe(101);
    expect(r.templateName).toBe("architect_solicitation_TU");
  });

  it("followup → registre 'tu', templateId 103, nom _TU", () => {
    const r = resolveTemplate(true, "followup");
    expect(r.register).toBe("tu");
    expect(r.templateId).toBe(103);
    expect(r.templateName).toBe("architect_followup_TU");
  });
});

// ============================================================================
// Override explicite — priorité maximale
// ============================================================================

describe("register override explicite — priorité max sur tutoiement", () => {
  it("tutoiement=false + override='tu' → registre 'tu'", () => {
    const r = resolveTemplate(false, "solicitation", "tu");
    expect(r.register).toBe("tu");
    expect(r.templateId).toBe(101);
  });

  it("tutoiement=true + override='vous' → registre 'vous'", () => {
    const r = resolveTemplate(true, "solicitation", "vous");
    expect(r.register).toBe("vous");
    expect(r.templateId).toBe(102);
  });
});

// ============================================================================
// Invariant decline_ack — registre ignoré (template neutre)
// ============================================================================

describe("decline_ack — registre ignoré (template neutre)", () => {
  it("tutoiement=true + decline_ack → templateId 105, nom architect_decline_acknowledgment", () => {
    const r = resolveTemplate(true, "decline_ack");
    expect(r.templateId).toBe(105);
    expect(r.templateName).toBe("architect_decline_acknowledgment");
  });

  it("tutoiement=false + decline_ack → même templateId 105", () => {
    const r = resolveTemplate(false, "decline_ack");
    expect(r.templateId).toBe(105);
    expect(r.templateName).toBe("architect_decline_acknowledgment");
  });

  it("override='tu' + decline_ack → même templateId 105 (override sans effet)", () => {
    const r = resolveTemplate(false, "decline_ack", "tu");
    expect(r.templateId).toBe(105);
  });
});
