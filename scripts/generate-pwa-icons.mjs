/**
 * Génération des icônes PWA depuis public/favicon.svg.
 *
 * Prérequis :
 *   pnpm add -D sharp
 *
 * Usage :
 *   node scripts/generate-pwa-icons.mjs
 *
 * Produit :
 *   public/apple-touch-icon.png  — 180×180 px (requis iOS Safari)
 *   public/icons/icon-72x72.png
 *   public/icons/icon-96x96.png
 *   public/icons/icon-128x128.png
 *   public/icons/icon-144x144.png
 *   public/icons/icon-152x152.png
 *   public/icons/icon-192x192.png
 *   public/icons/icon-384x384.png
 *   public/icons/icon-512x512.png
 *
 * Note : la favicon SVG contient un fond rouge opaque (#FF0033), ce qui la
 * rend safe en mode "maskable" — pas de padding supplémentaire nécessaire.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SVG_SRC = path.join(ROOT, "public", "favicon.svg");

/** Tailles PNG à générer (cf. design/pwa_manifest_v1.json). */
const PNG_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

async function main() {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error(
      "sharp n'est pas installé. Lancer : pnpm add -D sharp\n" +
        "puis relancer ce script.",
    );
    process.exit(1);
  }

  if (!fs.existsSync(SVG_SRC)) {
    console.error(`Fichier source introuvable : ${SVG_SRC}`);
    process.exit(1);
  }

  const svgBuffer = fs.readFileSync(SVG_SRC);

  // Dossier public/icons/
  const iconsDir = path.join(ROOT, "public", "icons");
  fs.mkdirSync(iconsDir, { recursive: true });

  // apple-touch-icon.png 180×180
  const appleTouchPath = path.join(ROOT, "public", "apple-touch-icon.png");
  await sharp(svgBuffer).resize(180, 180).png().toFile(appleTouchPath);
  console.log(`✓ ${path.relative(ROOT, appleTouchPath)}`);

  // Icônes PNG multi-tailles
  for (const size of PNG_SIZES) {
    const dest = path.join(iconsDir, `icon-${size}x${size}.png`);
    await sharp(svgBuffer).resize(size, size).png().toFile(dest);
    console.log(`✓ ${path.relative(ROOT, dest)}`);
  }

  console.log("\nToutes les icônes PWA ont été générées.");
  console.log(
    "Mettre à jour public/manifest.webmanifest pour pointer vers les PNG\n" +
      "une fois qu'ils sont générés (cf. design/pwa_manifest_v1.json pour la liste complète).",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
