import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { isAdmin, isProvisionalPasswordExpired, mustChangePassword, toUserProfile } from "./types";

/** Crée un faux `User` Supabase suffisant pour les tests (cast pour ne pas
 * répliquer tout le shape `auth.users`). */
function fakeUser(metadata: Record<string, unknown>, email = "alice@alyosingenierie.fr"): User {
  return {
    id: "user-id-1",
    email,
    user_metadata: metadata,
  } as unknown as User;
}

describe("toUserProfile", () => {
  it("projette un user complet correctement", () => {
    const profile = toUserProfile(
      fakeUser({
        role: "admin",
        must_change_password: false,
        provisional_password_expires_at: null,
        first_name: "Alice",
        last_name: "Dupont",
      }),
    );
    expect(profile).toEqual({
      id: "user-id-1",
      email: "alice@alyosingenierie.fr",
      role: "admin",
      mustChangePassword: false,
      provisionalPasswordExpiresAt: null,
      firstName: "Alice",
      lastName: "Dupont",
    });
  });

  it("applique des défauts conservateurs si metadata vide", () => {
    const profile = toUserProfile(fakeUser({}));
    expect(profile.role).toBe("user");
    expect(profile.mustChangePassword).toBe(false);
    expect(profile.provisionalPasswordExpiresAt).toBeNull();
    expect(profile.firstName).toBe("");
    expect(profile.lastName).toBe("");
  });
});

describe("isAdmin / mustChangePassword", () => {
  it("isAdmin true pour role admin uniquement", () => {
    expect(isAdmin(toUserProfile(fakeUser({ role: "admin" })))).toBe(true);
    expect(isAdmin(toUserProfile(fakeUser({ role: "user" })))).toBe(false);
    expect(isAdmin(toUserProfile(fakeUser({ role: "viewer" })))).toBe(false);
  });

  it("mustChangePassword true uniquement si flag === true", () => {
    expect(mustChangePassword(toUserProfile(fakeUser({ must_change_password: true })))).toBe(true);
    expect(mustChangePassword(toUserProfile(fakeUser({ must_change_password: false })))).toBe(
      false,
    );
    expect(mustChangePassword(toUserProfile(fakeUser({})))).toBe(false);
  });
});

describe("isProvisionalPasswordExpired", () => {
  const now = new Date("2026-05-11T10:00:00.000Z");

  it("retourne false si pas d'expiration définie", () => {
    expect(isProvisionalPasswordExpired(toUserProfile(fakeUser({})), now)).toBe(false);
  });

  it("retourne false si expiration future", () => {
    const profile = toUserProfile(
      fakeUser({ provisional_password_expires_at: "2026-05-18T10:00:00.000Z" }),
    );
    expect(isProvisionalPasswordExpired(profile, now)).toBe(false);
  });

  it("retourne true si expiration passée", () => {
    const profile = toUserProfile(
      fakeUser({ provisional_password_expires_at: "2026-05-04T10:00:00.000Z" }),
    );
    expect(isProvisionalPasswordExpired(profile, now)).toBe(true);
  });

  it("retourne false si date ISO invalide (défensif)", () => {
    const profile = toUserProfile(fakeUser({ provisional_password_expires_at: "pas une date" }));
    expect(isProvisionalPasswordExpired(profile, now)).toBe(false);
  });
});
