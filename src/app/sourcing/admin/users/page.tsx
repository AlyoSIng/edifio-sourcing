import { redirect } from "next/navigation";

import type { User } from "@supabase/supabase-js";

import { isAdmin, toUserProfile, type UserMetadata, type UserProfile } from "@/lib/auth/types";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

import { InviteUserDialog } from "./InviteUserDialog";
import { RegeneratePasswordButton } from "./RegeneratePasswordButton";

// TODO Phase 2 MFA TOTP — Board Q3/A 2026-05-12.
// Réserver la place du toggle « Activer la double authentification » dans
// une future section /sourcing/admin/users/[id]/security. Le champ
// `mfa_enabled?: boolean` est déjà présent dans `UserMetadata` (cf.
// `src/lib/auth/types.ts`) mais NON câblé côté UI ni côté API en MVP.
// Activation prévue Phase 2 via `supabase.auth.mfa.enroll({ factorType: "totp" })`.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Administration — Utilisateurs — edifio Sourcing",
};

/**
 * Page admin — liste des utilisateurs AlyoS — refonte UI v1.
 *
 * Source de vérité visuelle : `design/maquettes/maquettes_v5_admin_architectes.html`
 * lignes 144-213 (pattern admin M16-A, table tonalité DS edifio).
 *
 * Garde : le middleware bloque déjà les non-admin — re-check ici pour la
 * défense en profondeur (si le middleware était désactivé par erreur, cette
 * page ne doit RIEN exposer).
 *
 * Pattern : `auth.admin.listUsers()` (service_role) pour récupérer la liste.
 * Pas de table `profiles` (cf. décision Board — metadata dans
 * `auth.users.user_metadata` jusqu'au spike ORM).
 *
 * Pas de fetcher BDD ici (uniquement Supabase Auth) — pas de try/catch
 * absorbé runtime. Le `error` de `listUsers` est géré inline.
 */
export default async function AdminUsersPage() {
  // Vérif admin défensive (le middleware aurait déjà redirigé sinon).
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/admin/users");
  const profile = toUserProfile(user);
  if (!isAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  let usersData: { users: User[] } | null = null;
  let loadError: string | null = null;

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 100, page: 1 });
    if (error) {
      loadError = error.message;
    } else {
      usersData = data;
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-5xl">
        <div
          role="alert"
          className="rounded-md border border-l-4 border-line border-l-error bg-error-bg px-4 py-3 text-sm text-error"
        >
          <strong className="mr-1 font-semibold">Erreur de chargement :</strong>
          {loadError}
        </div>
      </div>
    );
  }

  const users = (usersData?.users ?? []).map((u) => toUserProfile(u));
  const sollicitableCount = users.filter((u) => !u.mustChangePassword).length;
  const provisionalCount = users.length - sollicitableCount;

  return (
    <div className="mx-auto max-w-5xl">
      {/* En-tête de page — pattern M16 ligne 144-154 */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
            Utilisateurs AlyoS
          </h1>
          <p className="mt-1 text-sm text-muted">
            {users.length} compte{users.length > 1 ? "s" : ""} · {sollicitableCount} actif
            {sollicitableCount > 1 ? "s" : ""}
            {provisionalCount > 0 ? ` · ${provisionalCount} en attente de première connexion` : ""}
          </p>
        </div>
        <InviteUserDialog />
      </header>

      {/* Table — pattern M16 ligne 164-210 */}
      <div className="overflow-hidden rounded-md border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper-2">
            <tr>
              <Th>Email</Th>
              <Th>Nom</Th>
              <Th>Rôle</Th>
              <Th>Statut</Th>
              <Th>Provisoire expire</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
                  Aucun utilisateur dans cette organisation pour le moment.
                </td>
              </tr>
            ) : (
              users.map((u) => <UserRow key={u.id} user={u} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="border-b border-line px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted"
    >
      {children}
    </th>
  );
}

function UserRow({ user }: { user: UserProfile }) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "—";

  const isExpired =
    user.mustChangePassword === true &&
    user.provisionalPasswordExpiresAt !== null &&
    new Date(user.provisionalPasswordExpiresAt) < new Date();

  // 3 états : Actif (vert), Provisoire en attente (warn), Provisoire expiré (rouge)
  const statusLabel = user.mustChangePassword
    ? isExpired
      ? "Provisoire expiré"
      : "Provisoire en attente"
    : "Actif";
  const statusChip = user.mustChangePassword
    ? isExpired
      ? "bg-error-bg text-error"
      : "bg-warn-bg text-warn"
    : "bg-success-bg text-success";

  const roleLabel = roleToFr(user.role);

  return (
    <tr className="hover:bg-paper-2">
      <td className="px-3 py-2.5 font-mono text-xs text-ink">{user.email}</td>
      <td className="px-3 py-2.5 text-sm text-ink">{fullName}</td>
      <td className="px-3 py-2.5">
        <span className="inline-flex rounded-xs bg-paper-3 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-2">
          {roleLabel}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span
          className={`inline-flex rounded-xs px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${statusChip}`}
        >
          {statusLabel}
        </span>
      </td>
      <td className="px-3 py-2.5 font-mono text-xs text-muted">
        {user.provisionalPasswordExpiresAt
          ? new Date(user.provisionalPasswordExpiresAt).toLocaleDateString("fr-FR")
          : "—"}
      </td>
      <td className="px-3 py-2.5 text-xs">
        {user.mustChangePassword ? (
          <RegeneratePasswordButton userId={user.id} email={user.email} />
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
    </tr>
  );
}

function roleToFr(role: UserProfile["role"]): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "user":
      return "Utilisateur";
    case "viewer":
      return "Lecteur";
    default:
      return role;
  }
}

// Re-export utilisé indirectement par les types — évite un import inutile
// dans le module principal et garde le typage cohérent.
export type { UserMetadata };
