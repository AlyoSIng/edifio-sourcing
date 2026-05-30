/**
 * Page Superadmin — FAQ — edifio Sourcing
 *
 * Server Component — triple garde (session + domaine + superadmin).
 * Groupe les items par catégorie, triés par displayOrder ASC.
 *
 * Fonctionnalités :
 *   - Formulaire de création inline (FaqToggleWrapper)
 *   - Groupement par catégorie
 *   - Boutons Activer/Désactiver + Supprimer via Server Actions inline
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { asc } from "drizzle-orm";

import { db } from "@/db/client";
import { faqItems } from "@/db/schema/superadmin";
import type { FaqItem } from "@/db/schema/superadmin";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { deleteFaqItemAction, updateFaqItemAction } from "./actions";
import { FaqToggleWrapper } from "./FaqToggleWrapper";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "FAQ — Superadmin — edifio Sourcing",
};

// ─── Labels de catégorie ──────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  general: "Général",
  sourcing: "Sourcing",
  cotraitance: "Cotraitance",
  compte: "Compte",
};

function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default async function SuperadminFaqPage() {
  // Garde 1 — session
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/superadmin/faq");

  // Garde 2 — domaine
  if (!isAuthorizedEmail(user.email)) redirect("/forbidden");

  // Garde 3 — superadmin
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  // Chargement des items
  let items: FaqItem[] = [];
  let loadError: string | null = null;

  try {
    items = await db.select().from(faqItems).orderBy(asc(faqItems.displayOrder));
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Erreur de chargement de la FAQ.";
  }

  // Groupement par catégorie (ordre d'apparition préservé)
  const groupMap = new Map<string, FaqItem[]>();
  for (const item of items) {
    const cat = item.category ?? "general";
    if (!groupMap.has(cat)) groupMap.set(cat, []);
    groupMap.get(cat)!.push(item);
  }

  const activeCount = items.filter((f) => f.isActive).length;

  return (
    <div>
      {/* En-tête */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">FAQ</h2>
          <p className="mt-0.5 font-mono text-xs text-muted">
            {items.length} question{items.length > 1 ? "s" : ""} · {activeCount} active
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
      <FaqToggleWrapper nextOrder={items.length + 1} />

      {/* Liste groupée par catégorie */}
      {items.length === 0 && !loadError ? (
        <div className="mt-5 rounded-md border border-line bg-paper-2 px-6 py-10 text-center text-sm text-muted">
          Aucune question pour le moment. Ajoutez la première.
        </div>
      ) : (
        <div className="mt-5 space-y-8">
          {Array.from(groupMap.entries()).map(([cat, groupItems]) => (
            <section key={cat}>
              <h3 className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-muted">
                {categoryLabel(cat)}
                <span className="ml-1.5 text-muted">({groupItems.length})</span>
              </h3>
              <div className="space-y-3">
                {groupItems.map((item) => (
                  <FaqItemCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FaqItemCard ──────────────────────────────────────────────────────────────

function FaqItemCard({ item }: { item: FaqItem }) {
  return (
    <article className="overflow-hidden rounded-md border border-line bg-white">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={[
              "inline-flex items-center rounded-full px-2.5 py-0.5",
              "font-mono text-[10px] font-semibold uppercase tracking-wider",
              item.isActive ? "bg-success-bg text-success" : "bg-paper-3 text-ink-2",
            ].join(" ")}
          >
            {item.isActive ? "Active" : "Inactive"}
          </span>
          <span className="inline-flex items-center rounded-full bg-paper-2 px-2 py-0.5 font-mono text-[10px] text-ink-2 ring-1 ring-line">
            {categoryLabel(item.category)}
          </span>
          <span className="font-mono text-[10px] text-muted">#{item.displayOrder}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Toggle actif/inactif */}
          <form
            action={async () => {
              "use server";
              await updateFaqItemAction(item.id, { isActive: !item.isActive });
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
              await deleteFaqItemAction(item.id);
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
        <p className="mb-2 text-sm font-semibold text-ink">{item.question}</p>
        <p className="line-clamp-2 text-xs text-ink-2">{item.answer}</p>
      </div>
    </article>
  );
}
