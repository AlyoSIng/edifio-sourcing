import { redirect } from "next/navigation";

import { EdifioLogo } from "@/components/EdifioLogo";
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

export const metadata = {
  title: "Administration — Utilisateurs — edifio Sourcing",
};

/**
 * Page admin — liste des utilisateurs AlyoS.
 *
 * Garde : le middleware bloque déjà les non-admin (cf. `src/middleware.ts`
 * gate role admin) — mais on re-checke côté Server Component pour la défense
 * en profondeur (si le middleware était désactivé par erreur, cette page ne
 * doit RIEN exposer).
 *
 * On utilise `auth.admin.listUsers()` (service_role) pour récupérer la liste.
 * Pas de table `profiles` (cf. décision Board — metadata dans
 * `auth.users.user_metadata` jusqu'au spike ORM).
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

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 100, page: 1 });

  if (error) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm">
          Erreur de chargement de la liste des utilisateurs : {error.message}
        </p>
      </main>
    );
  }

  const users = (data?.users ?? []).map((u) => toUserProfile(u));

  return (
    <main className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <EdifioLogo />
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">
            Utilisateurs AlyoS
          </h1>
          <p className="text-sm text-neutral-600">
            {users.length} compte{users.length > 1 ? "s" : ""} actif{users.length > 1 ? "s" : ""}
          </p>
        </div>
        <InviteUserDialog />
      </header>

      <div className="overflow-hidden rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Rôle</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Provisoire expire</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {users.map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-8 text-center font-mono text-[10px] text-neutral-500">
        © AlyoS Ingénierie 2026 — Outil interne
      </p>
    </main>
  );
}

function UserRow({ user }: { user: UserProfile }) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "—";
  const status = user.mustChangePassword
    ? user.provisionalPasswordExpiresAt && new Date(user.provisionalPasswordExpiresAt) < new Date()
      ? "Provisoire expiré"
      : "Provisoire en attente"
    : "Actif";
  const statusClass = user.mustChangePassword
    ? "bg-amber-100 text-amber-800"
    : "bg-green-100 text-green-800";

  return (
    <tr>
      <td className="px-4 py-3 font-mono text-xs">{user.email}</td>
      <td className="px-4 py-3">{fullName}</td>
      <td className="px-4 py-3 capitalize">{user.role}</td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2 py-1 text-xs ${statusClass}`}>{status}</span>
      </td>
      <td className="px-4 py-3 text-xs text-neutral-600">
        {user.provisionalPasswordExpiresAt
          ? new Date(user.provisionalPasswordExpiresAt).toLocaleDateString("fr-FR")
          : "—"}
      </td>
      <td className="px-4 py-3 text-xs">
        {user.mustChangePassword ? (
          <RegeneratePasswordButton userId={user.id} email={user.email} />
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </td>
    </tr>
  );
}

// Re-export utilisé indirectement par les types — évite un import inutile
// dans le module principal et garde le typage cohérent.
export type { UserMetadata };
