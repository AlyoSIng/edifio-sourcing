/**
 * Page Superadmin — Formations — edifio Sourcing
 *
 * Server Component — triple garde (session + domaine + superadmin).
 * Liste toutes les formations triées par displayOrder ASC.
 *
 * Fonctionnalités :
 *   - Formulaire de création inline (FormationToggleWrapper)
 *   - Liste avec badge type, durée, URL tronquée, isActive
 *   - Boutons Modifier (toggle isActive) / Supprimer via Server Actions inline
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { asc } from "drizzle-orm";

import { db } from "@/db/client";
import { formations } from "@/db/schema/superadmin";
import type { Formation } from "@/db/schema/superadmin";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { deleteFormationAction, updateFormationAction } from "./actions";
import { FormationToggleWrapper } from "./FormationToggleWrapper";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Formations — Superadmin — edifio Sourcing",
};

// ─── Type labels ──────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  video: "Vidéo",
  doc: "Document",
  external: "Lien externe",
};

const TYPE_COLOR: Record<string, string> = {
  video: "bg-blue-50 text-blue-700",
  doc: "bg-amber-50 text-amber-700",
  external: "bg-violet-50 text-violet-700",
};

// ─── Page principale ──────────────────────────────────────────────────────────

export default async function SuperadminFormationsPage() {
  // Garde 1 — session
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/superadmin/formations");

  // Garde 2 — domaine
  if (!isAuthorizedEmail(user.email)) redirect("/forbidden");

  // Garde 3 — superadmin
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  // Chargement des formations
  let items: Formation[] = [];
  let loadError: string | null = null;

  try {
    items = await db.select().from(formations).orderBy(asc(formations.displayOrder));
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Erreur de chargement des formations.";
  }

  const activeCount = items.filter((f) => f.isActive).length;

  return (
    <div>
      {/* En-tête */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">Formations</h2>
          <p className="mt-0.5 font-mono text-xs text-muted">
            {items.length} formation{items.length > 1 ? "s" : ""} · {activeCount} active
            {activeCount > 1 ? "s" : ""}
          </p>
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
        <div
          role="alert"
          className="mb-5 rounded-md border border-l-4 border-line border-l-error bg-error-bg px-4 py-3 text-sm text-error"
        >
          <strong className="mr-1 font-semibold">Erreur de chargement :</strong>
          {loadError}
        </div>
      )}

      {/* Formulaire de création */}
      <FormationToggleWrapper nextOrder={items.length + 1} />

      {/* Liste */}
      {items.length === 0 && !loadError ? (
        <div className="mt-5 rounded-md border border-line bg-paper-2 px-6 py-10 text-center text-sm text-muted">
          Aucune formation pour le moment. Créez la première.
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {items.map((item) => (
            <FormationCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FormationCard ─────────────────────────────────────────────────────────────

function FormationCard({ item }: { item: Formation }) {
  const truncatedUrl =
    (item.url ?? "").length > 60 ? (item.url ?? "").slice(0, 57) + "…" : (item.url ?? "—");
  const typeLabel = TYPE_LABEL[item.type] ?? item.type;
  const typeCls = TYPE_COLOR[item.type] ?? "bg-paper-2 text-ink-2";

  return (
    <article className="overflow-hidden rounded-md border border-line bg-white">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Badge type */}
          <span
            className={[
              "inline-flex items-center rounded-full px-2.5 py-0.5",
              "font-mono text-[10px] font-semibold uppercase tracking-wider",
              typeCls,
            ].join(" ")}
          >
            {typeLabel}
          </span>
          {/* Badge actif */}
          <span
            className={[
              "inline-flex items-center rounded-full px-2.5 py-0.5",
              "font-mono text-[10px] font-semibold uppercase tracking-wider",
              item.isActive ? "bg-success-bg text-success" : "bg-paper-3 text-ink-2",
            ].join(" ")}
          >
            {item.isActive ? "Active" : "Inactive"}
          </span>
          {/* Durée */}
          {item.durationMin ? (
            <span className="font-mono text-xs text-muted">{item.durationMin} min</span>
          ) : null}
          {/* Ordre */}
          <span className="font-mono text-[10px] text-muted">#{item.displayOrder}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Toggle actif/inactif */}
          <form
            action={async () => {
              "use server";
              await updateFormationAction(item.id, { isActive: !item.isActive });
            }}
          >
            <button
              type="submit"
              className={[
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                item.isActive
                  ? "border-line bg-paper-2 text-ink-2 hover:bg-paper-3 hover:text-ink"
                  : "border-brand-red bg-brand-red text-white hover:brightness-110",
              ].join(" ")}
            >
              {item.isActive ? "Désactiver" : "Activer"}
            </button>
          </form>

          {/* Supprimer */}
          <form
            action={async () => {
              "use server";
              await deleteFormationAction(item.id);
            }}
          >
            <button
              type="submit"
              className="inline-flex items-center rounded-full border border-line bg-paper-2 px-3 py-1 text-xs font-medium text-error hover:border-error hover:bg-error-bg"
            >
              Supprimer
            </button>
          </form>
        </div>
      </div>

      {/* Corps */}
      <div className="px-4 py-4">
        <h3 className="mb-1 text-sm font-semibold text-ink">{item.title}</h3>
        {item.description ? (
          <p className="mb-1.5 line-clamp-2 text-xs text-ink-2">{item.description}</p>
        ) : null}
        <p className="font-mono text-[10px] text-muted" title={item.url ?? undefined}>
          {truncatedUrl}
        </p>
      </div>
    </article>
  );
}
