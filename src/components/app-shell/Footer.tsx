/**
 * Footer mono global de l'AppShell.
 *
 * Source : naming strict CLAUDE.md — « © AlyoS Ingénierie {year} — Outil interne ».
 * Server Component pur — l'année est calculée côté serveur au build/render.
 */
export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-white px-4 py-4 text-center md:px-6">
      <p className="font-mono text-[10px] text-muted">
        © AlyoS Ingénierie {year} — Outil interne · via edifio Sourcing
      </p>
    </footer>
  );
}
