/**
 * Page Superadmin — Organisations — edifio Sourcing
 *
 * Server Component — triple garde (session + domaine + superadmin).
 * Liste toutes les organisations avec compteur de membres.
 *
 * Fonctionnalités :
 *   - Formulaire de création inline (NewOrgToggleWrapper)
 *   - Table des organisations : nom | tier | nb membres | créé le | lien "Voir →"
 *   - Empty state si aucune organisation
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { listAllOrganizations } from "@/lib/superadmin/organizations-queries";
import type { OrganizationWithCount } from "@/lib/superadmin/organizations-queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { NewOrgToggleWrapper } from "./NewOrgToggleWrapper";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Organisations — Superadmin — edifio Sourcing",
};

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

// ─── Page principale ──────────────────────────────────────────────────────────

export default async function SuperadminOrganizationsPage() {
  // Garde 1 — session
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/superadmin/organizations");

  // Garde 2 — domaine
  if (!isAuthorizedEmail(user.email)) redirect("/forbidden");

  // Garde 3 — superadmin
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  // Chargement des organisations
  let orgs: OrganizationWithCount[] = [];
  let loadError: string | null = null;

  try {
    orgs = await listAllOrganizations(db);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Erreur de chargement des organisations.";
  }

  return (
    <div>
      {/* En-tête */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-xl font-semibold text-ink">Organisations</h2>
          {!loadError && (
            <span className="inline-flex items-center rounded-full bg-paper-3 px-2.5 py-0.5 font-mono text-xs font-semibold text-ink-2 ring-1 ring-line">
              {orgs.length}
            </span>
          )}
        </div>
        <Link
          href="/sourcing/superadmin"
          className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Retour au dashboard
        </Link>
      </div>

      {/* Erreur de chargement */}
      {loadError && (
        <div className="mb-5">
          <ErrorBanner
            message={loadError}
            title="Impossible de charger les organisations"
            description="Une erreur est survenue lors du chargement. Réessayez dans quelques instants."
          />
        </div>
      )}

      {/* Formulaire de création */}
      {!loadError && <NewOrgToggleWrapper />}

      {/* Liste des organisations */}
      {!loadError && orgs.length === 0 ? (
        <div className="mt-5 rounded-md border border-line bg-paper-2 px-6 py-10 text-center text-sm text-muted">
          Aucune organisation pour le moment. Créez la première.
        </div>
      ) : !loadError ? (
        <div className="mt-5 overflow-hidden rounded-md border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-paper-2">
                <th className="px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-widest text-muted">
                  Nom
                </th>
                <th className="px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-widest text-muted">
                  Palier
                </th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-semibold uppercase tracking-widest text-muted">
                  Membres
                </th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-semibold uppercase tracking-widest text-muted">
                  Créé le
                </th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-semibold uppercase tracking-widest text-muted">
                  &nbsp;
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orgs.map((org) => (
                <OrgRow key={org.id} org={org} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

// ─── OrgRow ───────────────────────────────────────────────────────────────────

function OrgRow({ org }: { org: OrganizationWithCount }) {
  const tierBadgeCls = TIER_BADGE[org.subscriptionTier] ?? "bg-paper-3 text-ink-2";
  const tierLabel = TIER_LABEL[org.subscriptionTier] ?? org.subscriptionTier;

  const createdDate = org.createdAt.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <tr className="hover:bg-paper-2">
      <td className="px-4 py-3 font-medium text-ink">{org.name}</td>
      <td className="px-4 py-3">
        <span
          className={[
            "inline-flex items-center rounded-full px-2.5 py-0.5",
            "font-mono text-[10px] font-semibold uppercase tracking-wider",
            tierBadgeCls,
          ].join(" ")}
        >
          {tierLabel}
        </span>
      </td>
      <td className="px-4 py-3 text-right font-mono text-xs text-ink-2">{org.memberCount}</td>
      <td className="px-4 py-3 text-right font-mono text-xs text-muted">{createdDate}</td>
      <td className="px-4 py-3 text-right">
        <Link
          href={`/sourcing/superadmin/organizations/${org.id}`}
          className="text-xs text-brand-red underline-offset-2 hover:underline"
        >
          Voir →
        </Link>
      </td>
    </tr>
  );
}
