/**
 * Tests unitaires de `getRequiredOrgId`.
 *
 * Stratégie : mock de `@/db/client` avec une chain fluent Drizzle simulée.
 * Le `.limit()` est le point de résolution (awaité) — il retourne `mockSelectResult`.
 * On vérifie les deux branches :
 *   1. membership trouvée → retourne l'orgId de la ligne
 *   2. aucune membership → throw `NoOrganizationMembershipError`
 *      (ADR-014 hardening : fallback ALYOS_ORG_ID supprimé pour éviter
 *      la fuite cross-tenant silencieuse d'un user externe non rattaché).
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ============================================================================
// Contrôle du mock — muté par chaque test avant l'appel
// ============================================================================

let mockSelectResult: { organizationId: string }[] = [];

// Mock de @/db/client avant tout import du module sous test
vi.mock("@/db/client", () => {
  // Reproduit la chain fluent utilisée dans getRequiredOrgId :
  //   db.select({ organizationId: ... }).from(memberships).where(...)
  //     .orderBy(memberships.createdAt).limit(1)
  // L'ordre orderBy a été ajouté ADR-014 (multi-tenant déterministe).
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => mockSelectResult,
  };
  return { db: chain };
});

// Imports après le mock (hoisting Vitest garantit l'ordre correct)
import { getRequiredOrgId, NoOrganizationMembershipError } from "./get-required-org-id";

// ============================================================================
// Constante de test
// ============================================================================

const MOCK_ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// ============================================================================
// Tests
// ============================================================================

describe("getRequiredOrgId()", () => {
  beforeEach(() => {
    // Réinitialise le résultat mock entre chaque test
    mockSelectResult = [];
  });

  it("retourne l'orgId de la membership si elle existe", async () => {
    mockSelectResult = [{ organizationId: MOCK_ORG_ID }];

    const result = await getRequiredOrgId("user-123");

    expect(result).toBe(MOCK_ORG_ID);
  });

  it("throw NoOrganizationMembershipError si aucune membership (ADR-014 hardening)", async () => {
    mockSelectResult = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(getRequiredOrgId("user-sans-membership")).rejects.toBeInstanceOf(
      NoOrganizationMembershipError,
    );
    // Vérifie que l'incident sécurité est bien tracé (alertable en prod)
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("user-sans-membership"));
    errorSpy.mockRestore();
  });
});
