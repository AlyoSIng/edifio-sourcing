/**
 * Script de backfill — colonnes postal_code + department sur tenders.
 *
 * Utilisé après la migration 0020 pour rétroactivement peupler les lignes
 * existantes qui ont department IS NULL.
 *
 * Usage :
 *   npx tsx scripts/backfill-departments.ts           # dry-run (pas de modif DB)
 *   npx tsx scripts/backfill-departments.ts --commit  # applique les mises à jour
 *   npx tsx scripts/backfill-departments.ts --force   # traite TOUTES les lignes
 *   npx tsx scripts/backfill-departments.ts --force --commit
 *
 * Prérequis : DATABASE_URL dans .env.local OU variables PG* (PGHOST, PGPORT, PGUSER,
 *             PGPASSWORD, PGDATABASE) posées dans la session shell avant lancement.
 *
 * Ce script utilise le driver `postgres` directement (pas Drizzle) pour éviter
 * d'avoir besoin du schéma Drizzle compilé. Les colonnes postal_code et
 * department doivent déjà exister en DB (migration 0020 appliquée).
 */

import { loadEnvConfig } from "@next/env";

import postgres from "postgres";

import { derivePostalCodeAndDepartment } from "../src/lib/sourcing/derive-department";
import type { TenderRawData } from "../src/db/types/jsonb";

// ---------------------------------------------------------------------------
// Résolution de la config DB (DATABASE_URL OU variables PG*)
// ---------------------------------------------------------------------------
loadEnvConfig(process.cwd());

function resolveDbUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;

  const host = process.env.PGHOST;
  const port = process.env.PGPORT ?? "5432";
  const user = process.env.PGUSER ?? "postgres";
  const password = process.env.PGPASSWORD ?? "";
  const database = process.env.PGDATABASE ?? "postgres";

  if (host) {
    const encodedPassword = encodeURIComponent(password);
    return `postgresql://${user}:${encodedPassword}@${host}:${port}/${database}`;
  }

  console.error(
    "[backfill-departments] ERROR: ni DATABASE_URL ni PGHOST définis.\n" +
      "  Option 1 : $env:DATABASE_URL = 'postgresql://postgres:pass@host:5432/postgres'\n" +
      "  Option 2 : $env:PGHOST='host'; $env:PGUSER='postgres'; $env:PGPASSWORD='pass'",
  );
  process.exit(1);
}

const DATABASE_URL = resolveDbUrl();

// ---------------------------------------------------------------------------
// Arguments CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const isCommit = args.includes("--commit");
const isForce = args.includes("--force");

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Usage:
  npx tsx scripts/backfill-departments.ts          # dry-run
  npx tsx scripts/backfill-departments.ts --commit  # applique en DB
  npx tsx scripts/backfill-departments.ts --force   # traite toutes les lignes
  npx tsx scripts/backfill-departments.ts --force --commit
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Types internes
// ---------------------------------------------------------------------------
interface TenderRow {
  id: string;
  buyer: string;
  raw_data: TenderRawData | null;
}

interface UpdateRow {
  id: string;
  buyer50: string;
  postalCode: string | null;
  department: string | null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const sql = postgres(DATABASE_URL!, { max: 5 });

  try {
    // Sélectionner les lignes à traiter
    const rows = isForce
      ? await sql<TenderRow[]>`
          SELECT id, buyer, raw_data
          FROM tenders
          ORDER BY created_at DESC
        `
      : await sql<TenderRow[]>`
          SELECT id, buyer, raw_data
          FROM tenders
          WHERE department IS NULL
          ORDER BY created_at DESC
        `;

    const total = rows.length;
    console.log(
      `[backfill-departments] ${isForce ? "Mode --force : toutes les lignes" : "Lignes avec department IS NULL"} : ${total} tender(s) à traiter`,
    );

    if (total === 0) {
      console.log("[backfill-departments] Aucune ligne à mettre à jour.");
      await sql.end();
      return;
    }

    // Calculer les dérivations
    const updates: UpdateRow[] = rows.map((row) => {
      const { postalCode, department } = derivePostalCodeAndDepartment(row.raw_data, row.buyer);
      return {
        id: row.id,
        buyer50: row.buyer.slice(0, 50),
        postalCode,
        department,
      };
    });

    // Afficher le tableau récapitulatif
    console.log(
      "\n id (extrait)                           | buyer (50 car)                     | postalCode | department",
    );
    console.log(
      "----------------------------------------|------------------------------------|-----------|-----------",
    );
    for (const u of updates) {
      const idShort = u.id.slice(0, 8) + "...";
      console.log(
        ` ${idShort.padEnd(38)} | ${u.buyer50.padEnd(34)} | ${(u.postalCode ?? "—").padEnd(9)} | ${u.department ?? "—"}`,
      );
    }
    console.log("");

    if (!isCommit) {
      console.log(
        `[backfill-departments] dry-run — ${total} ligne(s) seraient mises à jour. Relancer avec --commit pour appliquer.`,
      );
      await sql.end();
      return;
    }

    // Appliquer en batch de 100
    const BATCH_SIZE = 100;
    let updated = 0;

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);

      for (const u of batch) {
        await sql`
          UPDATE tenders
          SET
            postal_code = ${u.postalCode},
            department  = ${u.department},
            updated_at  = now()
          WHERE id = ${u.id}
        `;
        updated++;
      }

      console.log(
        `[backfill-departments] Progression : ${Math.min(i + BATCH_SIZE, updates.length)} / ${total}`,
      );
    }

    console.log(`[backfill-departments] OK — ${updated} ligne(s) mises à jour.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("[backfill-departments] ERREUR FATALE :", err);
  process.exit(1);
});
