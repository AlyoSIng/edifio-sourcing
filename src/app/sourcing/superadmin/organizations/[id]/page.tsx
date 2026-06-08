/**
 * Page Superadmin — Détail d'une organisation — edifio Sourcing
 *
 * Server Component — triple garde (session + domaine + superadmin).
 *
 * Sections :
 *   - En-tête : nom org + tier badge + lien retour
 *   - Section "Paramètres" : OrgSettingsForm (édition inline)
 *   - Section "Membres" : table des membres (email, prénom, nom, rôle, membre depuis)
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { db } from "@/db/client";
import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import {
  getOrganizationById,
  type OrganizationWithMembers,
} from "@/lib/superadmin/organizations-queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { OrgSettingsForm } from "./OrgSettingsForm";

export const dynamic = "force-dynamic";

// ─── Badges tier ─────────────────────────────────────────────────────────────

const TIER_BADGE: Record<string, string> = {
  sourcing: "bg-sky-100 text-sky-700",
  cotraitance: "bg-amber-100 text-amber-700",
  studio: "bg-violet-100 text-violet-700",
};

const TIER_LABEL: Record<string, string> = {
  sourcing: "Sourcing",
  cotraitance: "Cotraitance",
  studio: "Studio",
};

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  user: "Utilisateur",
  viewer: "Lecteur",
};

// ─── Métadonnées dynamiques ───────────────────────────────────────────────────

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return {
    title: `Organisation ${params.id.slice(0, 8)}… — Superadmin — edifio Sourcing`,
  };
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default async function SuperadminOrgDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;

  // Garde 1 — session
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/sourcing/superadmin/organizations/${id}`);

  // Garde 2 — domaine
  if (!isAuthorizedEmail(user.email)) redirect("/forbidden");

  // Garde 3 — superadmin
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  // Chargement de l'organisation
  let org: OrganizationWithMembers | null = null;
  let loadError: string | null = null;

  try {
    org = await getOrganizationById(id, db);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Erreur de chargement de l'organisation.";
  }

  // Org introuvable → 404
  if (!loadError && !org) {
    notFound();
  }

  const tierBadgeCls = org ? (TIER_BADGE[org.subscriptionTier] ?? "bg-paper-3 text-ink-2") : "";
  const tierLabel = org ? (TIER_LABEL[org.subscriptionTier] ?? org.subscriptionTier) : "";

  return (
    <div>
      {/* En-tête */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-xl font-semibold text-ink">
              {org?.name ?? "Organisation"}
            </h2>
            {org && (
              <span
                className={[
                  "inline-flex items-center rounded-full px-2.5 py-0.5",
                  "font-mono text-[10px] font-semibold uppercase tracking-wider",
                  tierBadgeCls,
                ].join(" ")}
              >
                {tierLabel}
              </span>
            )}
          </div>
          {org && (
            <p className="mt-0.5 font-mono text-xs text-muted">
              {org.members.length} membre{org.members.length > 1 ? "s" : ""}
              {org.siren ? ` · SIREN ${org.siren}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {org && (
            <Link
              href={`/sourcing/superadmin/organizations/${org.id}/billing`}
              className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink hover:bg-paper-2"
            >
              💳 Facturation
            </Link>
          )}
          <Link
            href="/sourcing/superadmin/organizations"
            className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            ← Retour aux organisations
          </Link>
        </div>
      </div>

      {/* Erreur de chargement */}
      {loadError && (
        <ErrorBanner
          message={loadError}
          title="Impossible de charger l'organisation"
          description="Une erreur est survenue lors du chargement. Réessayez dans quelques instants."
        />
      )}

      {org && (
        <div className="space-y-8">
          {/* Section Paramètres */}
          <section>
            <h3 className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-muted">
              Paramètres
            </h3>
            <OrgSettingsForm org={org} />
          </section>

          {/* Section Membres */}
          <section>
            <h3 className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-muted">
              Membres <span className="text-muted">({org.members.length})</span>
            </h3>

            {org.members.length === 0 ? (
              <div className="rounded-md border border-line bg-paper-2 px-6 py-8 text-center text-sm text-muted">
                Aucun membre dans cette organisation.
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border border-line bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-paper-2">
                      <th className="px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-widest text-muted">
                        Email
                      </th>
                      <th className="px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-widest text-muted">
                        Prénom
                      </th>
                      <th className="px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-widest text-muted">
                        Nom
                      </th>
                      <th className="px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-widest text-muted">
                        Rôle
                      </th>
                      <th className="px-4 py-3 text-right font-mono text-[11px] font-semibold uppercase tracking-widest text-muted">
                        Membre depuis
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {org.members.map(({ membership, user: memberUser }) => {
                      const memberSince = membership.createdAt.toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      });

                      const roleLabel = ROLE_LABEL[membership.role] ?? membership.role;

                      return (
                        <tr key={memberUser.id} className="hover:bg-paper-2">
                          <td className="px-4 py-3 font-mono text-xs text-ink">
                            {memberUser.email}
                          </td>
                          <td className="px-4 py-3 text-xs text-ink-2">
                            {memberUser.firstname ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-ink-2">
                            {memberUser.lastname ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center rounded-full bg-paper-3 px-2 py-0.5 font-mono text-[10px] text-ink-2 ring-1 ring-line">
                              {roleLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-muted">
                            {memberSince}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
