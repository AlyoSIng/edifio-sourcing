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

import "./globals.css";

export const metadata: Metadata = {
  title: "edifio Sourcing",
  description: "Outil interne AlyoS Ingénierie — sourcing automatique de marchés publics BTP",
  // Robots : on bloque l'indexation tant qu'on est en preview AlyoS interne.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
