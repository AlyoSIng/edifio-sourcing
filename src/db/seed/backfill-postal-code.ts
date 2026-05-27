/**
 * Script de backfill — colonnes `postal_code` sur les tenders existants.
 *
 * Contexte 2026-05-27 :
 *   - `tenders.department` est rempli (107/107 lignes en prod via code_departement[0]).
 *   - `tenders.postal_code` est vide (0/107 lignes) car le payload Opendatasoft
 *     ne contient pas de CP 5 chiffres dans les champs standards.
 *   - Ce script tente quand même l'extraction selon la règle de résolution définie
 *     dans `derive-department.ts` : lieu_execution → acheteur → buyer regex.
 *
 * Comportement :
 *   1. Lit tous les tenders où `postal_code IS NULL` et `raw_data IS NOT NULL`.
 *   2. Pour chaque tender, appelle `derivePostalCodeAndDepartment()` (logique
 *      centralisée — pas de duplication).
 *   3. Si un CP est trouvé → UPDATE `postal_code` (idempotent : ne touche pas
 *      les lignes déjà renseignées grâce au WHERE IS NULL).
 *   4. Si aucun CP → ligne ignorée (on n'invente pas).
 *   5. Log du bilan : nb mises à jour / nb ignorées / nb erreurs.
 *
 * IMPORTANT : ce script ne doit pas être lancé en CI ni en prod par un agent.
 * Steve le lance dans sa session après avoir positionné DATABASE_URL.
 * Cf. mémo `feedback_ops_prod_user_runs_migration.md`.
 *
 * Lancement : `pnpm db:backfill:postal-code`
 *
 * Sécurité idempotence : le WHERE `postal_code IS NULL` garantit qu'une
 * 2e exécution est sans effet sur les lignes déjà backfillées.
 */

import { and, isNull, isNotNull, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { tenders } from "@/db/schema/tenders";
import { derivePostalCodeAndDepartment } from "@/lib/sourcing/derive-department";
import type { TenderRawData } from "@/db/types/jsonb";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Taille du batch pour les lectures. Évite de charger 10 000 lignes en RAM. */
const BATCH_SIZE = 200;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("[backfill:postal-code] Démarrage...");

  let offset = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // Boucle de pagination — chaque batch est traité séquentiellement pour ne
  // pas saturer la connexion Postgres (pas de parallélisme intentionnel ici).
  while (true) {
    // Lecture du batch : tenders sans CP et avec rawData présent.
    const batch = await db
      .select({
        id: tenders.id,
        buyer: tenders.buyer,
        rawData: tenders.rawData,
      })
      .from(tenders)
      .where(and(isNull(tenders.postalCode), isNotNull(tenders.rawData)))
      .limit(BATCH_SIZE)
      .offset(offset);

    if (batch.length === 0) {
      // Plus rien à traiter — fin normale.
      break;
    }

    for (const row of batch) {
      try {
        const rawData = row.rawData as TenderRawData | null;
        const buyer = row.buyer ?? "";

        const { postalCode } = derivePostalCodeAndDepartment(rawData, buyer);

        if (!postalCode) {
          // Aucun CP extractible — on n'invente pas, on passe.
          totalSkipped++;
          continue;
        }

        // UPDATE ciblé sur la seule colonne postal_code (idempotent).
        await db.update(tenders).set({ postalCode }).where(eq(tenders.id, row.id));

        totalUpdated++;
        console.log(`  [OK] tender ${row.id} → postal_code = ${postalCode}`);
      } catch (err) {
        // Erreur isolée — on log et on continue les autres.
        totalErrors++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [ERR] tender ${row.id} : ${msg}`);
      }
    }

    offset += BATCH_SIZE;

    // Si le batch était plus petit que BATCH_SIZE, on est à la fin.
    if (batch.length < BATCH_SIZE) break;
  }

  // ---------------------------------------------------------------------------
  // Bilan
  // ---------------------------------------------------------------------------
  console.log("\n[backfill:postal-code] Terminé.");
  console.log(`  Mis à jour : ${totalUpdated}`);
  console.log(`  Ignorés (pas de CP extractible) : ${totalSkipped}`);
  console.log(`  Erreurs : ${totalErrors}`);

  if (totalErrors > 0) {
    // Sortie non-zéro pour signaler les erreurs à l'opérateur.
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[backfill:postal-code] Erreur fatale :", err);
  process.exit(1);
});
