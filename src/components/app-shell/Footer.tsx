/**
 * Footer mono global de l'AppShell.
 *
 * Mise à jour ADR-014 (Steve 2026-06-05) — ouverture multi-tenant :
 * suppression de « Outil interne » et passage à « © edifio » (marque produit
 * éditée par AlyoS Ingénierie) puisque l'app sert désormais plusieurs
 * organisations clientes (PROTECT, ...) en plus d'AlyoS.
 *
 * Server Component pur — l'année est calculée côté serveur au build/render.
 */
export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-white px-4 py-4 text-center md:px-6">
      <p className="font-mono text-[10px] text-muted">
        © edifio {year} · édité par AlyoS Ingénierie
      </p>
    </footer>
  );
}
