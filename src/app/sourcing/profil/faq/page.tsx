/**
 * Page Profil — FAQ — edifio Sourcing (Server Component)
 *
 * Charge les `faq_items` actifs ordonnés par display_order.
 * Rend un accordéon groupé par catégorie via `FaqAccordion` (Client Component).
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

import { asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { faqItems } from "@/db/schema/superadmin";

import { FaqAccordion } from "./FaqAccordion";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "FAQ — Mon profil — edifio Sourcing",
};

export default async function ProfilFaqPage() {
  let items: (typeof faqItems.$inferSelect)[] = [];

  try {
    items = await db
      .select()
      .from(faqItems)
      .where(eq(faqItems.isActive, true))
      .orderBy(asc(faqItems.displayOrder));
  } catch {
    return (
      <div>
        <h2 className="mb-4 font-display text-xl font-semibold text-ink">FAQ</h2>
        <div
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          Impossible de charger les questions fréquentes pour le moment. Veuillez réessayer dans
          quelques instants.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4 font-display text-xl font-semibold text-ink">FAQ</h2>

      {items.length === 0 ? (
        <div className="rounded-md border border-line bg-paper-2 px-6 py-10 text-center text-sm text-muted">
          Aucune question fréquente disponible pour le moment.
        </div>
      ) : (
        <FaqAccordion
          items={items.map((item) => ({
            id: item.id,
            question: item.question,
            answer: item.answer,
            category: item.category,
          }))}
        />
      )}
    </div>
  );
}
