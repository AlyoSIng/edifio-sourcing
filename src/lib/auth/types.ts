/**
 * Types et type guards du modèle utilisateur — auth par email + password
 * (pivot Board 2026-05-11, surclasse le magic-link).
 *
 * Décision Board : on stocke 100 % des métadonnées utilisateur dans
 * `auth.users.user_metadata` (JSONB). Pas de table `profiles` dédiée — la
 * décision ORM (Drizzle vs Prisma) n'étant pas tranchée, AUCUNE migration BDD
 * n'est committée tant que le spike n'est pas validé (cf. CLAUDE.md / Gate 5
 * Arbitrage 3 — REPORTÉ).
 *
 * Source : `notes-de-suivi/CC_260511_2102.md` + brief Board pivot password.
 */
import type { User } from "@supabase/supabase-js";

/**
 * Rôles applicatifs — match strict des valeurs en BDD.
 * - superadmin : éditeur edifio (contact@edifio.fr + steissier@alyosingenierie.fr).
 *                Inclut tous les droits admin + accès /sourcing/superadmin.
 *                Décision Board 2026-05-27.
 * - admin      : full access AlyoS (admin pages, audit, gestion membres)
 * - user       : usage standard
 * - viewer     : lecture seule
 */
export type Role = "admin" | "user" | "viewer" | "superadmin";

/**
 * Shape attendue de `auth.users.user_metadata`. Toutes les propriétés
 * sont OPTIONNELLES côté typage parce que :
 *   - Supabase n'impose pas de schéma JSON sur user_metadata ;
 *   - le premier admin est créé manuellement (cf. brief §4) et peut, par
 *     erreur, oublier un champ.
 *
 * Les type guards plus bas (`isAdmin`, `mustChangePassword`, etc.) valident
 * à la lecture ce qui est strictement requis pour chaque décision.
 */
export interface UserMetadata {
  role?: Role;
  must_change_password?: boolean;
  /** ISO 8601 ; null si déjà changé / non applicable. */
  provisional_password_expires_at?: string | null;
  /**
   * ISO 8601 — horodatage de la dernière demande de reset password (ADR-011
   * couche 3, posé par `requestPasswordResetAction`). Permet à l'audit log
   * post-ORM de distinguer un provisoire « invitation » d'un provisoire
   * « reset à l'initiative du user ». Optionnel : absent pour les comptes
   * créés via invitation admin qui n'ont jamais demandé de reset.
   */
  password_reset_at?: string | null;
  first_name?: string;
  last_name?: string;
  /**
   * Phase 2 — TOTP via Supabase Auth (`supabase.auth.mfa.enroll`).
   * Désactivé MVP cf. DECISIONS.md Q3/A 2026-05-12. Aucune surface UI / API
   * pour le moment — le champ existe uniquement pour réserver la place dans
   * le shape `user_metadata` et préparer l'ouverture sans dette de typage.
   * Ne PAS lire ni écrire ce champ en MVP. TODO Phase 2 MFA TOTP.
   */
  mfa_enabled?: boolean;
}

/**
 * Profil applicatif — projection narrow d'un `User` Supabase + son
 * `user_metadata`. Utilisé partout sauf dans la couche Supabase brute.
 */
export interface UserProfile {
  id: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
  provisionalPasswordExpiresAt: string | null;
  firstName: string;
  lastName: string;
}

/**
 * Lit le metadata d'un `User` Supabase et renvoie un `UserProfile` normalisé.
 * Valeurs par défaut conservatrices :
 *   - `role` absent → `"user"` (le moindre privilège applicatif)
 *   - `must_change_password` absent → `false` (on ne force pas le reset
 *     d'un utilisateur déjà connu sans raison)
 *   - prénom/nom absents → chaîne vide (UI gère gracieusement)
 */
export function toUserProfile(user: User): UserProfile {
  const meta = (user.user_metadata ?? {}) as UserMetadata;
  return {
    id: user.id,
    email: user.email ?? "",
    role: meta.role ?? "user",
    mustChangePassword: meta.must_change_password === true,
    provisionalPasswordExpiresAt: meta.provisional_password_expires_at ?? null,
    firstName: meta.first_name ?? "",
    lastName: meta.last_name ?? "",
  };
}

/**
 * Type guard : l'utilisateur a-t-il le rôle admin ?
 * Note : un superadmin N'est PAS considéré "admin" par cette garde seule —
 * utiliser `isAdmin(p) || isSuperAdmin(p)` pour les ressources admin standard.
 */
export function isAdmin(profile: UserProfile): boolean {
  return profile.role === "admin";
}

/**
 * Type guard : l'utilisateur a-t-il le rôle superadmin ?
 * Le superadmin est l'éditeur edifio (contact@edifio.fr + steissier@alyosingenierie.fr).
 * Il dispose de tous les droits admin + accès exclusif à /sourcing/superadmin.
 * Décision Board 2026-05-27.
 */
export function isSuperAdmin(profile: UserProfile): boolean {
  return profile.role === "superadmin";
}

/** Type guard : l'utilisateur doit-il changer son mot de passe au prochain login ? */
export function mustChangePassword(profile: UserProfile): boolean {
  return profile.mustChangePassword === true;
}

/**
 * Type guard : le mot de passe provisoire a-t-il expiré ?
 * Retourne `false` si pas de provisoire actif (provisionalPasswordExpiresAt null).
 *
 * @param now — injectable pour les tests (défaut : `new Date()`).
 */
export function isProvisionalPasswordExpired(
  profile: UserProfile,
  now: Date = new Date(),
): boolean {
  if (!profile.provisionalPasswordExpiresAt) return false;
  const expiresAt = new Date(profile.provisionalPasswordExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) return false;
  return expiresAt.getTime() < now.getTime();
}
