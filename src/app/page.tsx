// Page d'accueil placeholder de Gate 6 étape 1.
// Sera remplacée à l'étape 3 par /login (Supabase magic-link) et la home
// authentifiée. Le middleware @alyosingenierie.fr (étape 2) protégera tout
// sauf /login dès qu'il sera en place — pour l'instant, route ouverte.

export default function Home() {
  const year = new Date().getFullYear();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-2">
        <h1 className="font-display text-4xl font-bold tracking-tight">edifio Sourcing</h1>
        <p className="text-sm text-neutral-500">Bootstrap Gate 6 — étape 1 / 7</p>
      </div>
      <p className="max-w-md text-center text-sm text-neutral-600">
        Outil interne AlyoS Ingénierie pour le sourcing automatique de marchés publics BTP. Accès
        restreint au domaine <code className="font-mono">@alyosingenierie.fr</code>.
      </p>
      <footer className="absolute bottom-6 text-xs text-neutral-400">
        © AlyoS Ingénierie {year} — Outil interne
      </footer>
    </main>
  );
}
