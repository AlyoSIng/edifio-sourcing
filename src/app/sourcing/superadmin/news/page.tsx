/**
 * Page Superadmin — Actualités produit — edifio Sourcing
 *
 * Server Component — Phase 2 (implémentation complète).
 *
 * Fonctionnalités :
 *   - Triple garde (session + domaine + superadmin)
 *   - Récupération de tous les `newsItems` triés par createdAt desc (Drizzle)
 *   - Affichage du statut publié / brouillon via badge font-mono
 *   - Bouton "Publier" (brouillon) ou "Dépublier" (publié) via Server Action inline
 *   - Bouton "Supprimer" via Server Action inline
 *   - `NewsToggleWrapper` Client Component pour contrôler l'affichage du formulaire
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { desc } from "drizzle-orm";

import { db } from "@/db/client";
import { newsItems } from "@/db/schema/superadmin";
import type { NewsItem } from "@/db/schema/superadmin";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { deleteNewsAction, togglePublishAction } from "./actions";
import { NewsToggleWrapper } from "./NewsToggleWrapper";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Actualités produit — Superadmin — edifio Sourcing",
};

// ─── Page principale ──────────────────────────────────────────────────────────

export default async function SuperadminNewsPage() {
  // Garde 1 — session
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/superadmin/news");

  // Garde 2 — domaine
  if (!isAuthorizedEmail(user.email)) redirect("/forbidden");

  // Garde 3 — superadmin
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  // ─── Chargement des articles ─────────────────────────────────────────────────
  let items: NewsItem[] = [];
  let loadError: string | null = null;

  try {
    items = await db.select().from(newsItems).orderBy(desc(newsItems.createdAt));
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Erreur de chargement des actualités.";
  }

  // ─── Stats rapides ───────────────────────────────────────────────────────────
  const publishedCount = items.filter((n) => n.isPublished).length;
  const draftCount = items.filter((n) => !n.isPublished).length;

  return (
    <div>
      {/* En-tête */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">Actualités produit</h2>
          <p className="mt-0.5 font-mono text-xs text-muted">
            {publishedCount} publiée{publishedCount > 1 ? "s" : ""} · {draftCount} brouillon
            {draftCount > 1 ? "s" : ""}
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
          className={[
            "mb-5 rounded-md border border-l-4 border-line border-l-error",
            "bg-error-bg px-4 py-3 text-sm text-error",
          ].join(" ")}
        >
          <strong className="mr-1 font-semibold">Erreur de chargement :</strong>
          {loadError}
        </div>
      )}

      {/*
        NewsToggleWrapper : Client Component qui gère le bouton "Nouvelle actualité"
        et le formulaire de création inline. Positionné avant la liste pour que
        le formulaire s'insère naturellement en haut du contenu.
      */}
      <NewsToggleWrapper />

      {/* Liste des articles */}
      {items.length === 0 && !loadError ? (
        <div className="mt-5 rounded-md border border-line bg-paper-2 px-6 py-10 text-center text-sm text-muted">
          Aucun article pour le moment. Créez la première actualité produit.
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {items.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── NewsCard ─────────────────────────────────────────────────────────────────

/**
 * Carte affichant un article d'actualité.
 * Inclut les boutons Publier/Dépublier et Supprimer via Server Actions inline.
 */
function NewsCard({ item }: { item: NewsItem }) {
  const createdAt = new Date(item.createdAt).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Extrait : 2 lignes ≈ 200 caractères
  const excerpt =
    item.content.length > 200 ? item.content.slice(0, 200).trimEnd() + "…" : item.content;

  return (
    <article className="overflow-hidden rounded-md border border-line bg-white">
      {/* En-tête de la carte */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={[
              "inline-flex items-center rounded-full px-2.5 py-0.5",
              "font-mono text-[10px] font-semibold uppercase tracking-wider",
              item.isPublished ? "bg-success-bg text-success" : "bg-paper-3 text-ink-2",
            ].join(" ")}
          >
            {item.isPublished ? "Publié" : "Brouillon"}
          </span>
          <time className="font-mono text-xs text-muted">{createdAt}</time>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Bouton Publier / Dépublier */}
          <form
            action={async () => {
              "use server";
              await togglePublishAction(item.id, item.isPublished);
            }}
          >
            <button
              type="submit"
              className={[
                "inline-flex items-center rounded-md border px-3 py-1 text-xs font-medium transition-colors",
                item.isPublished
                  ? "border-line bg-paper-2 text-ink-2 hover:bg-paper-3 hover:text-ink"
                  : "border-brand-red bg-brand-red text-white hover:brightness-110",
              ].join(" ")}
            >
              {item.isPublished ? "Dépublier" : "Publier"}
            </button>
          </form>

          {/* Bouton Supprimer */}
          <form
            action={async () => {
              "use server";
              await deleteNewsAction(item.id);
            }}
          >
            <button
              type="submit"
              className={[
                "inline-flex items-center rounded-md border border-line bg-paper-2 px-3 py-1",
                "text-xs font-medium text-error hover:border-error hover:bg-error-bg",
              ].join(" ")}
            >
              Supprimer
            </button>
          </form>
        </div>
      </div>

      {/* Corps */}
      <div className="px-4 py-4">
        <h3 className="mb-1.5 text-sm font-semibold text-ink">{item.title}</h3>
        <p className="line-clamp-2 text-sm text-ink-2">{excerpt}</p>

        {/* Date de publication si publié */}
        {item.isPublished && item.publishedAt && (
          <p className="mt-2 font-mono text-[10px] text-muted">
            Publié le{" "}
            {new Date(item.publishedAt).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>
    </article>
  );
}
