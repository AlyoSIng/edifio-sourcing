/**
 * Helpers E2E spécifiques au flow password (pivot Board 2026-05-11).
 *
 * Ces helpers utilisent l'admin API Supabase (service_role) pour préparer
 * et nettoyer les utilisateurs de test. Cela évite de dépendre de l'UI
 * admin (qui exige déjà d'être loggué admin) — orthogonal aux tests.
 */

import type { Page, Route } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  PROVISIONAL_PASSWORD_LENGTH,
  PROVISIONAL_PASSWORD_TTL_HOURS,
} from "../../src/lib/auth/constants";
import { computeProvisionalExpiresAt } from "../../src/lib/auth/password";
import { generateProvisionalPassword } from "../../src/lib/auth/password-server";
import type { UserMetadata } from "../../src/lib/auth/types";

function createAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error(
      "Tests E2E auth-password : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant.",
    );
  }
  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Supprime un user par email s'il existe. Idempotent.
 */
export async function deleteUserIfExists(email: string): Promise<void> {
  const admin = createAdmin();
  // listUsers + filter — pas de méthode getUserByEmail dans le SDK admin.
  const { data } = await admin.auth.admin.listUsers({ perPage: 200, page: 1 });
  const found = (data?.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  if (found) {
    await admin.auth.admin.deleteUser(found.id);
  }
}

/**
 * Crée un user de test avec mot de passe DURABLE (must_change_password=false).
 * Utilisé par le scénario 2 (user existant qui se connecte).
 */
export async function createDurableUser(args: {
  email: string;
  password: string;
  role?: "admin" | "user" | "viewer";
  firstName?: string;
  lastName?: string;
}): Promise<void> {
  await deleteUserIfExists(args.email);
  const admin = createAdmin();
  const metadata: UserMetadata = {
    role: args.role ?? "user",
    must_change_password: false,
    provisional_password_expires_at: null,
    first_name: args.firstName ?? "Test",
    last_name: args.lastName ?? "User",
  };
  const { error } = await admin.auth.admin.createUser({
    email: args.email,
    password: args.password,
    email_confirm: true,
    user_metadata: metadata as Record<string, unknown>,
  });
  if (error) throw new Error(`createDurableUser(${args.email}): ${error.message}`);
}

/**
 * Crée un user avec mot de passe PROVISOIRE (must_change_password=true).
 * Reproduit ce que fait `POST /api/admin/users` mais sans envoyer d'email.
 * Renvoie le mot de passe provisoire en clair pour que le test puisse s'en
 * servir au login.
 */
export async function createProvisionalUser(args: {
  email: string;
  /**
   * Override TTL en HEURES pour simuler l'expiration (scénario 6).
   * Si négatif → expiration dans le passé.
   * Board Q1/B 2026-05-12 : unité = heures (était jours).
   */
  ttlHoursFromNow?: number;
  role?: "admin" | "user" | "viewer";
  firstName?: string;
  lastName?: string;
}): Promise<{ provisionalPassword: string; expiresAt: string }> {
  await deleteUserIfExists(args.email);
  const admin = createAdmin();
  const provisional = generateProvisionalPassword();
  const ttlHours = args.ttlHoursFromNow ?? PROVISIONAL_PASSWORD_TTL_HOURS;
  const expiresAt = computeProvisionalExpiresAt(ttlHours);

  // Sanity : valider la longueur attendue (équivalent au schéma constante).
  if (provisional.length !== PROVISIONAL_PASSWORD_LENGTH) {
    throw new Error("createProvisionalUser: générateur incohérent.");
  }

  const metadata: UserMetadata = {
    role: args.role ?? "user",
    must_change_password: true,
    provisional_password_expires_at: expiresAt,
    first_name: args.firstName ?? "Test",
    last_name: args.lastName ?? "Provisoire",
  };
  const { error } = await admin.auth.admin.createUser({
    email: args.email,
    password: provisional,
    email_confirm: true,
    user_metadata: metadata as Record<string, unknown>,
  });
  if (error) throw new Error(`createProvisionalUser(${args.email}): ${error.message}`);

  return { provisionalPassword: provisional, expiresAt };
}

/**
 * Regénère un mot de passe provisoire pour un user existant et le renvoie en
 * clair. Équivalent fonctionnel à ce que fait `requestPasswordResetAction`
 * (ADR-011 couche 3) : pose un nouveau provisoire via `admin.updateUserById`
 * + flag `must_change_password=true` + `provisional_password_expires_at`.
 *
 * Permet aux tests E2E de simuler la réception d'un email reset sans
 * dépendre d'un mail réellement envoyé : le test soumet le form
 * `/forgot-password` pour valider l'UI (succès apparent) puis appelle ce
 * helper pour récupérer le nouveau provisoire et continuer le flow login →
 * force-redirect /reset-password → choix définitif.
 */
export async function regenerateProvisionalPasswordFor(
  email: string,
): Promise<{ provisionalPassword: string; expiresAt: string }> {
  const admin = createAdmin();
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = (data?.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  if (!found) {
    throw new Error(`regenerateProvisionalPasswordFor(${email}): user introuvable.`);
  }

  const provisional = generateProvisionalPassword();
  const expiresAt = computeProvisionalExpiresAt(PROVISIONAL_PASSWORD_TTL_HOURS);

  const currentMeta = (found.user_metadata ?? {}) as UserMetadata;
  const nextMeta: UserMetadata = {
    ...currentMeta,
    must_change_password: true,
    provisional_password_expires_at: expiresAt,
    password_reset_at: new Date().toISOString(),
  };

  const { error } = await admin.auth.admin.updateUserById(found.id, {
    password: provisional,
    user_metadata: nextMeta as Record<string, unknown>,
  });
  if (error) {
    throw new Error(`regenerateProvisionalPasswordFor(${email}): ${error.message}`);
  }

  return { provisionalPassword: provisional, expiresAt };
}

/**
 * Intercepte tout appel sortant vers l'API Resend (`api.resend.com`) — la
 * page ne fait JAMAIS l'appel réel mais on simule une réponse 200 valide.
 * Utile parce que les actions serveur (forgot-password, admin/users) appellent
 * Resend depuis Node, donc ce mock n'est utile que pour les *futurs* tests
 * qui passeraient par le browser. Conservé pour la complétude.
 */
export async function mockResendOnPage(page: Page): Promise<void> {
  await page.route("https://api.resend.com/**", (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "test_mock_id" }),
    });
  });
}
