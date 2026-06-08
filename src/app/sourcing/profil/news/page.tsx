/**
 * Page Profil — Actualités produit — edifio Sourcing (Server Component)
 *
 * Charge les `news_items` publiés (20 derniers) et les marqueurs de lecture
 * de l'utilisateur courant. Rend une liste de cartes `NewsCard` (Client Component)
 * avec badge "Nouveau" pour les articles non lus.
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { newsItems, userNewsReads } from "@/db/schema/superadmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { NewsCard } from "./NewsCard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Actualités — Mon profil — edifio Sourcing",
};

export default async function ProfilNewsPage() {
  // Récupération de l'utilisateur courant (layout a déjà gardé la session)
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = user?.id ?? "";

  let articles: (typeof newsItems.$inferSelect)[] = [];
  let readNewsIds = new Set<string>();

  try {
    articles = await db
      .select()
      .from(newsItems)
      .where(eq(newsItems.isPublished, true))
      .orderBy(desc(newsItems.publishedAt))
      .limit(20);

    if (articles.length > 0 && userId) {
      const articleIds = articles.map((a) => a.id);
      const reads = await db
        .select({ newsId: userNewsReads.newsId })
        .from(userNewsReads)
        .where(and(eq(userNewsReads.userId, userId), inArray(userNewsReads.newsId, articleIds)));
      readNewsIds = new Set(reads.map((r) => r.newsId));
    }
  } catch {
    return (
      <div>
        <h2 className="mb-4 font-display text-xl font-semibold text-ink">Actualités produit</h2>
        <div
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          Impossible de charger les actualités pour le moment. Veuillez réessayer dans quelques
          instants.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4 font-display text-xl font-semibold text-ink">Actualités produit</h2>

      {articles.length === 0 ? (
        <div className="rounded-md border border-line bg-paper-2 px-6 py-10 text-center text-sm text-muted">
          Aucune actualité disponible pour le moment.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {articles.map((article) => (
            <NewsCard
              key={article.id}
              id={article.id}
              title={article.title}
              content={article.content}
              publishedAt={article.publishedAt}
              isRead={readNewsIds.has(article.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
