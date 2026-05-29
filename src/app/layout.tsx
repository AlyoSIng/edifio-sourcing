import type { Metadata } from "next";

// Polices self-host via fontsource (Gate 5 : pas d'appel fonts.googleapis.com).
// Inter = corps de texte / UI. Space Grotesk = titres et libellés produits.
// JetBrains Mono = code, identifiants techniques, montants tabulaires.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/jetbrains-mono/400.css";
// Polices additionnelles pour le branding organisation (feature Gate 6 — Personnalisation).
// Chargées globalement pour être disponibles immédiatement quand --font-display est overridé.
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";

import "./globals.css";

export const metadata: Metadata = {
  // `metadataBase` est utilisé pour résoudre les URLs relatives des images OG /
  // Twitter (cf. landing `src/app/page.tsx`). En preview Vercel, on retombe
  // automatiquement sur `VERCEL_URL` ; en local sur `localhost:3000`. URL prod
  // définitive à arbitrer Gate 7 (custom domain).
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
  ),
  title: "edifio Sourcing",
  description: "Outil interne AlyoS Ingénierie — sourcing automatique de marchés publics BTP",
  // Robots : on bloque l'indexation tant qu'on est en preview AlyoS interne.
  robots: { index: false, follow: false },
  // ── PWA / favicon ────────────────────────────────────────────────────────
  // apple-touch-icon.png (180×180) est généré par scripts/generate-pwa-icons.mjs
  // (prérequis : pnpm add -D sharp puis node scripts/generate-pwa-icons.mjs).
  // Tant qu'il n'est pas généré, Safari iOS affiche un screenshot de la page.
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  // themeColor colore la barre d'adresse Chrome / Safari en mode standalone.
  // Valeur identique à theme_color dans manifest.webmanifest et design/tokens.json.
  themeColor: "#FF0033",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "edifio Sourcing",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      {/* Surfaces par défaut alignées DS edifio (cf. design/tokens.json) :
       * `bg-paper` = #FAF9F6 (fond app principal), `text-ink` = #0F1A2E (texte
       * principal). Les pages publiques marketing-like (/login, /forbidden)
       * peuvent surclasser via leurs propres conteneurs si nécessaire. */}
      <body className="bg-paper font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
