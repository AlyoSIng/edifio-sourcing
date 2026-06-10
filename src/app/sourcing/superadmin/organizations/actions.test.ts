/**
 * Tests createOrgAction — HARDFAIL post-mortem 2026-06-10.
 *
 * Couvre :
 *   - Gardes auth + superadmin (défense en profondeur)
 *   - Chemin nominal : org + public.users + memberships + email, aucun rollback
 *   - HARDFAIL : si l'insert `users` ou `memberships` échoue →
 *       1. rollback compte Supabase Auth (deleteUser)
 *       2. rollback organisation (db.delete(organizations))
 *       3. retour { ok: false } explicite + email d'invitation JAMAIS envoyé
 *   - Résilience : un rollback qui rate ne fait pas throw l'action
 *
 * Stratégie : mocks de @/db/client (chain fluent Drizzle simulée),
 * @/lib/supabase/server (server + admin clients), @/lib/auth/types,
 * @/lib/email/send et @/lib/superadmin/organizations-queries.
 * Les schémas Drizzle (@/db/schema/*) sont les vrais modules (pgTable purs) —
 * on compare les tables par référence pour vérifier les cibles insert/delete.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// État mutable contrôlant les mocks — réinitialisé entre chaque test.
// Les factories vi.mock ne référencent ces variables qu'à l'exécution des
// fonctions mockées (test time), jamais au moment du hoisting (pas de TDZ).
// ============================================================================

interface MockUser {
  id: string;
  email: string;
}

let mockCaller: MockUser | null = null;
let mockIsSuperAdmin = false;

/** Inserts capturés : cible (table) + values. */
let insertCalls: { table: unknown; values: unknown }[] = [];
/** Index (1-based) de l'insert qui doit throw — null = aucun échec. */
let insertFailsAtCall: number | null = null;

/** Deletes capturés : cible (table). */
let deleteCalls: unknown[] = [];
let deleteOrgShouldThrow = false;

const createUserMock = vi.fn();
const deleteUserMock = vi.fn();
const sendWelcomeEmailMock = vi.fn();

// ============================================================================
// Mocks de modules
// ============================================================================

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/site-url", () => ({
  getSiteUrl: () => "https://test.example.com",
}));

vi.mock("@/lib/auth/types", () => ({
  toUserProfile: (u: unknown) => u,
  isSuperAdmin: () => mockIsSuperAdmin,
}));

// Déterministe + évite node:crypto dans les tests
vi.mock("@/lib/auth/password-server", () => ({
  generateProvisionalPassword: () => "Provisional#Pass1234",
}));

vi.mock("@/lib/email/send", () => ({
  sendWelcomeEmail: (...args: unknown[]) => sendWelcomeEmailMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: mockCaller }, error: null }),
    },
  }),
  createSupabaseAdminClient: () => ({
    auth: {
      admin: {
        createUser: (...args: unknown[]) => createUserMock(...args),
        deleteUser: (...args: unknown[]) => deleteUserMock(...args),
      },
    },
  }),
}));

vi.mock("@/lib/superadmin/organizations-queries", () => ({
  createOrganization: async () => ({ id: ORG_ID, name: "Atelier Test" }),
  updateOrganization: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: {
    insert: (table: unknown) => ({
      values: (values: unknown) => ({
        onConflictDoNothing: async () => {
          insertCalls.push({ table, values });
          if (insertFailsAtCall === insertCalls.length) {
            throw new Error("insert or update on table violates foreign key constraint");
          }
          return [];
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async () => {
        deleteCalls.push(table);
        if (deleteOrgShouldThrow) throw new Error("connection terminated");
        return [];
      },
    }),
  },
}));

// Imports APRÈS les vi.mock (hoisting Vitest les remonte au top du module).
import { organizations } from "@/db/schema/organizations";
import { memberships, users } from "@/db/schema/users";

import { createOrgAction } from "./actions";

// ============================================================================
// Constantes + helpers
// ============================================================================

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const ADMIN_USER_ID = "22222222-2222-2222-2222-222222222222";
const SUPERADMIN: MockUser = {
  id: "33333333-3333-3333-3333-333333333333",
  email: "sebastien@edifio.fr",
};

/** FormData valide pour le chemin nominal. */
function validFormData(): FormData {
  const fd = new FormData();
  fd.set("name", "Atelier Test");
  fd.set("subscriptionTier", "studio");
  fd.set("siren", "");
  fd.set("siret", "");
  fd.set("adminEmail", "admin@atelier-test.fr");
  fd.set("adminFirstName", "Jeanne");
  fd.set("adminLastName", "Martin");
  return fd;
}

beforeEach(() => {
  mockCaller = SUPERADMIN;
  mockIsSuperAdmin = true;
  insertCalls = [];
  insertFailsAtCall = null;
  deleteCalls = [];
  deleteOrgShouldThrow = false;
  createUserMock.mockReset().mockResolvedValue({
    data: { user: { id: ADMIN_USER_ID } },
    error: null,
  });
  deleteUserMock.mockReset().mockResolvedValue({ data: {}, error: null });
  sendWelcomeEmailMock.mockReset().mockResolvedValue(undefined);
});

// ============================================================================
// Gardes
// ============================================================================

describe("createOrgAction — gardes", () => {
  it("refuse si pas authentifié", async () => {
    mockCaller = null;
    const result = await createOrgAction(validFormData());
    expect(result).toEqual({ ok: false, error: "Authentification requise." });
    expect(insertCalls).toHaveLength(0);
  });

  it("refuse si authentifié mais pas superadmin", async () => {
    mockIsSuperAdmin = false;
    const result = await createOrgAction(validFormData());
    expect(result).toEqual({ ok: false, error: "Réservé aux superadmins." });
    expect(insertCalls).toHaveLength(0);
  });
});

// ============================================================================
// Chemin nominal
// ============================================================================

describe("createOrgAction — chemin nominal", () => {
  it("crée org + public.users + membership admin + envoie l'email, sans rollback", async () => {
    const result = await createOrgAction(validFormData());

    expect(result).toEqual({ ok: true });

    // Inserts : 1er = public.users, 2e = memberships (comparaison par référence)
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0]!.table).toBe(users);
    expect(insertCalls[0]!.values).toMatchObject({
      id: ADMIN_USER_ID,
      email: "admin@atelier-test.fr",
    });
    expect(insertCalls[1]!.table).toBe(memberships);
    expect(insertCalls[1]!.values).toEqual({
      organizationId: ORG_ID,
      userId: ADMIN_USER_ID,
      role: "admin",
    });

    // Email d'invitation envoyé, AUCUN rollback déclenché
    expect(sendWelcomeEmailMock).toHaveBeenCalledTimes(1);
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(deleteCalls).toHaveLength(0);
  });
});

// ============================================================================
// HARDFAIL post-mortem 2026-06-10 — rollback complet
// ============================================================================

describe("createOrgAction — HARDFAIL rollback (post-mortem 2026-06-10)", () => {
  it("rollback user + org si l'insert memberships échoue, retour ok:false, pas d'email", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    insertFailsAtCall = 2; // memberships

    const result = await createOrgAction(validFormData());

    expect(result.ok).toBe(false);
    expect(result.error).toContain("annulés");

    // Rollback 1/2 : compte Supabase Auth supprimé
    expect(deleteUserMock).toHaveBeenCalledTimes(1);
    expect(deleteUserMock).toHaveBeenCalledWith(ADMIN_USER_ID);
    // Rollback 2/2 : organisation supprimée
    expect(deleteCalls).toEqual([organizations]);
    // JAMAIS d'email d'invitation pour un compte annulé
    expect(sendWelcomeEmailMock).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("rollback user + org si l'insert public.users échoue (1er insert)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    insertFailsAtCall = 1; // public.users

    const result = await createOrgAction(validFormData());

    expect(result.ok).toBe(false);
    expect(deleteUserMock).toHaveBeenCalledWith(ADMIN_USER_ID);
    expect(deleteCalls).toEqual([organizations]);
    expect(sendWelcomeEmailMock).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("si le rollback deleteUser rate (reject), log + continue : l'org est quand même supprimée et l'erreur retournée", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    insertFailsAtCall = 2;
    deleteUserMock.mockReset().mockRejectedValue(new Error("network down"));

    const result = await createOrgAction(validFormData());

    expect(result.ok).toBe(false);
    // Le rollback org est tout de même tenté
    expect(deleteCalls).toEqual([organizations]);
    // L'échec du rollback user est tracé (alertable en prod)
    expect(errorSpy).toHaveBeenCalledWith(
      "[createOrgAction:db:fail-hardfail:rollback-user-failed]",
      expect.objectContaining({ user_id: ADMIN_USER_ID }),
    );

    errorSpy.mockRestore();
  });

  it("si deleteUser retourne une erreur supabase-js (sans throw), elle est détectée et tracée", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    insertFailsAtCall = 2;
    deleteUserMock.mockReset().mockResolvedValue({
      data: {},
      error: { message: "User not allowed" },
    });

    const result = await createOrgAction(validFormData());

    expect(result.ok).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      "[createOrgAction:db:fail-hardfail:rollback-user-failed]",
      expect.objectContaining({ message: "User not allowed" }),
    );
    expect(deleteCalls).toEqual([organizations]);

    errorSpy.mockRestore();
  });

  it("si le rollback org rate aussi, l'action ne throw pas et retourne ok:false", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    insertFailsAtCall = 2;
    deleteOrgShouldThrow = true;

    const result = await createOrgAction(validFormData());

    expect(result.ok).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      "[createOrgAction:db:fail-hardfail:rollback-org-failed]",
      expect.objectContaining({ org_id: ORG_ID }),
    );

    errorSpy.mockRestore();
  });
});
