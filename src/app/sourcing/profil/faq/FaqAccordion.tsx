"use client";

/**
 * FaqAccordion — accordéon FAQ groupé par catégorie (Client Component).
 *
 * Groupement par `category` (reduce). Clic sur une question toggle
 * la réponse (état Set<string> des IDs ouverts).
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

import { useState } from "react";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

interface FaqAccordionProps {
  items: FaqItem[];
}

const CATEGORY_LABELS: Record<string, string> = {
  general: "Général",
  sourcing: "Sourcing",
  cotraitance: "Cotraitance",
  tandem: "Cotraitance",
  compte: "Compte",
};

function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
}

export function FaqAccordion({ items }: FaqAccordionProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  function toggleItem(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Groupement par catégorie (ordre d'apparition préservé)
  const grouped = items.reduce<Record<string, FaqItem[]>>((acc, item) => {
    const cat = item.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const categories = Object.keys(grouped);

  return (
    <div className="space-y-8">
      {categories.map((category) => (
        <section key={category}>
          <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted">
            {getCategoryLabel(category)}
          </h3>

          <div className="divide-y divide-line rounded-md border border-line bg-white">
            {grouped[category]?.map((item) => {
              const isOpen = openIds.has(item.id);
              return (
                <div key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <span className="text-sm font-medium text-ink">{item.question}</span>
                    <span
                      aria-hidden="true"
                      className={[
                        "shrink-0 text-muted transition-transform duration-200",
                        isOpen ? "rotate-180" : "",
                      ].join(" ")}
                    >
                      ▾
                    </span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-line bg-paper-2 px-5 py-4">
                      <p className="whitespace-pre-wrap text-sm text-ink">{item.answer}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
