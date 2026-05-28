/**
 * scripts/generate-pdf-assets.ts
 *
 * Génère les PDFs de la plaquette commerciale et de la roadmap produit edifio Sourcing
 * en rendant les fichiers HTML source via Playwright Chromium, puis les uploade dans
 * le bucket Supabase `app-assets` (chemin : `onboarding/`).
 *
 * Usage :
 *   pnpm tsx scripts/generate-pdf-assets.ts
 *
 * Variables d'environnement requises (dans la session shell de Steve) :
 *   NEXT_PUBLIC_SUPABASE_URL        URL publique du projet Supabase
 *   SUPABASE_SERVICE_ROLE_KEY       Clé service role (jamais loguée)
 *
 * Fichiers HTML source (auto-suffisants, CSS inline) :
 *   design/copy/plaquette_commerciale_edifio_sourcing.html → onboarding/plaquette_edifio_sourcing.pdf
 *   design/copy/roadmap_produit_edifio_sourcing.html       → onboarding/roadmap_edifio_sourcing.pdf
 *
 * Le script est idempotent : `upsert: true` — peut être relancé sans effet de bord.
 * Les credentials ne sont jamais affichés ni loggués.
 *
 * Refs : DECISIONS.md (Gate 6 — assets onboarding superadmin).
 */

import * as path from "path";
import * as fs from "fs";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Configuration des assets à générer
// ---------------------------------------------------------------------------

/** Racine du repo — le script est dans `scripts/`, un niveau en dessous. */
const REPO_ROOT = path.resolve(__dirname, "..");

interface PdfAsset {
  /** Chemin absolu vers le fichier HTML source. */
  htmlPath: string;
  /** Path de destination dans le bucket Supabase (sans slash initial). */
  bucketPath: string;
  /** Clé de résultat affichée sur stdout. */
  label: string;
}

const ASSETS: PdfAsset[] = [
  {
    htmlPath: path.join(REPO_ROOT, "design", "copy", "plaquette_commerciale_edifio_sourcing.html"),
    bucketPath: "onboarding/plaquette_edifio_sourcing.pdf",
    label: "pitch_pdf_url",
  },
  {
    htmlPath: path.join(REPO_ROOT, "design", "copy", "roadmap_produit_edifio_sourcing.html"),
    bucketPath: "onboarding/roadmap_edifio_sourcing.pdf",
    label: "roadmap_pdf_url",
  },
];

const BUCKET = "app-assets";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // 1. Vérification des variables d'environnement requises.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    fail("Variable d'environnement manquante : NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!serviceRoleKey) {
    fail("Variable d'environnement manquante : SUPABASE_SERVICE_ROLE_KEY");
  }

  // 2. Vérification que les fichiers HTML source existent.
  for (const asset of ASSETS) {
    if (!fs.existsSync(asset.htmlPath)) {
      fail(`Fichier HTML source introuvable : ${asset.htmlPath}`);
    }
  }

  // 3. Initialisation du client Supabase avec la clé service role.
  //    autoRefreshToken et persistSession désactivés (script Node éphémère).
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 4. Rendu PDF via Playwright Chromium.
  console.log("Lancement de Playwright Chromium (headless)…");
  const browser = await chromium.launch({ headless: true });

  const pdfBuffers: Map<string, Buffer> = new Map();

  try {
    for (const asset of ASSETS) {
      console.log(`  → Rendu PDF : ${path.basename(asset.htmlPath)}`);

      const page = await browser.newPage();

      // Chargement du fichier HTML en file:// (chemin absolu, cross-platform).
      const fileUrl = `file:///${asset.htmlPath.replace(/\\/g, "/")}`;
      await page.goto(fileUrl, { waitUntil: "networkidle" });

      // Export PDF : format A4, fond imprimé, marges nulles (le HTML gère ses propres marges).
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });

      pdfBuffers.set(asset.bucketPath, Buffer.from(pdfBuffer));
      await page.close();
    }
  } finally {
    // Fermeture de Playwright dans tous les cas (succès ou erreur de rendu).
    await browser.close();
    console.log("Playwright fermé.");
  }

  // 5. Upload vers le bucket Supabase `app-assets`.
  console.log(`\nUpload vers le bucket « ${BUCKET} »…`);

  const results: Array<{ label: string; url: string }> = [];

  for (const asset of ASSETS) {
    const buffer = pdfBuffers.get(asset.bucketPath);
    if (!buffer) {
      fail(`Buffer PDF manquant pour : ${asset.bucketPath}`);
    }

    console.log(`  → Upload : ${asset.bucketPath}`);

    const { error } = await supabase.storage.from(BUCKET).upload(asset.bucketPath, buffer, {
      contentType: "application/pdf",
      upsert: true, // Idempotent : écrase si déjà présent.
    });

    if (error) {
      fail(`Échec upload « ${asset.bucketPath} » : ${error.message}`);
    }

    // 6. Construction de l'URL publique.
    //    Pattern : ${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${asset.bucketPath}`;
    results.push({ label: asset.label, url: publicUrl });
  }

  // 7. Affichage des URLs résultantes sur stdout, format facilement copiable.
  console.log("\nPDFs générés et uploadés avec succès :\n");

  // Alignement des flèches pour lisibilité.
  const maxLabelLength = Math.max(...results.map((r) => r.label.length));
  for (const { label, url } of results) {
    const padding = " ".repeat(maxLabelLength - label.length);
    console.log(`  ✓ ${label}${padding} → ${url}`);
  }

  console.log("");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n✗ Erreur non gérée : ${message}`);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
