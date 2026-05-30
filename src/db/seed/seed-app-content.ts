/**
 * seed-app-content.ts — Insère les entrées app_content depuis APP_CONTENT_FIXTURE
 * de façon idempotente (ON CONFLICT DO UPDATE).
 *
 * Lancement : pnpm db:seed:app-content
 * Règle ops prod : Steve pose DATABASE_URL dans SA session avant de lancer.
 *
 * Idempotence : INSERT ... ON CONFLICT (key) DO UPDATE SET content_url, updated_at.
 * Les entrées dont contentUrl === "TODO_URL" sont silencieusement ignorées (log).
 */

import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { appContent } from "@/db/schema/superadmin";
import { APP_CONTENT_FIXTURE } from "./content-fixture";

async function seedAppContent() {
  console.log(`[seed-app-content] Traitement de ${APP_CONTENT_FIXTURE.length} entrées...`);

  let upserted = 0;
  let skipped = 0;

  for (const item of APP_CONTENT_FIXTURE) {
    // Ignorer silencieusement les URLs non encore fournies par le Board
    if (item.contentUrl === "TODO_URL") {
      console.log(`[seed-app-content] Ignoré (TODO_URL) : "${item.key}"`);
      skipped++;
      continue;
    }

    await db
      .insert(appContent)
      .values({
        key: item.key,
        contentUrl: item.contentUrl,
      })
      .onConflictDoUpdate({
        target: appContent.key,
        set: {
          contentUrl: item.contentUrl,
          updatedAt: sql`now()`,
        },
      });

    console.log(`[seed-app-content] Upserted : "${item.key}"`);
    upserted++;
  }

  console.log(`[seed-app-content] Terminé. ${upserted} upsertés, ${skipped} ignorés (TODO_URL).`);
  process.exit(0);
}

seedAppContent().catch((e) => {
  console.error("[seed-app-content] Erreur fatale :", e);
  process.exit(1);
});
