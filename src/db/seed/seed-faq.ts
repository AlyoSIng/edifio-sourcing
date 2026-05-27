/**
 * seed-faq.ts — Insère les FAQ items depuis FAQ_FIXTURE de façon idempotente.
 *
 * Lancement : pnpm db:seed:faq
 * (règle ops prod : Steve pose DATABASE_URL dans SA session avant de lancer)
 *
 * Idempotence : on vérifie l'existence de chaque question avant insertion.
 * La table faq_items n'a pas de contrainte UNIQUE sur `question`, donc on
 * évite le doublon par lecture préalable plutôt que par ON CONFLICT.
 */

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { faqItems } from "@/db/schema/superadmin";
import { FAQ_FIXTURE } from "./content-fixture";

async function seedFaq() {
  console.log(`[seed-faq] Insertion de ${FAQ_FIXTURE.length} FAQ items...`);

  let inserted = 0;
  let skipped = 0;

  for (const item of FAQ_FIXTURE) {
    // Vérification idempotente : on cherche une entrée avec la même question
    const existing = await db
      .select({ id: faqItems.id })
      .from(faqItems)
      .where(eq(faqItems.question, item.question))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[seed-faq] Ignoré (déjà présent) : "${item.question.slice(0, 50)}..."`);
      skipped++;
      continue;
    }

    await db.insert(faqItems).values({
      question: item.question,
      answer: item.answer,
      category: item.category,
      isActive: item.isActive,
      displayOrder: item.displayOrder,
    });

    console.log(`[seed-faq] Inséré : "${item.question.slice(0, 50)}..."`);
    inserted++;
  }

  console.log(`[seed-faq] Terminé. ${inserted} insérés, ${skipped} ignorés.`);
  process.exit(0);
}

seedFaq().catch((e) => {
  console.error("[seed-faq] Erreur fatale :", e);
  process.exit(1);
});
