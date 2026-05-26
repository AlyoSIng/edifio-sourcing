/**
 * Page stub Conception/Réalisation — edifio Sourcing
 *
 * Pipeline en cours de développement (Phase 2). Accessible depuis :
 *  - Le menu latéral « Conception/Réalisation »
 *  - La redirection après sélection mode C/R depuis la modale AO du jour
 *    (TenderCardActions → handleSelect("conception_realisation"))
 */

export const metadata = { title: "Conception/Réalisation — edifio Sourcing" };

export default function ConceptionRealisationPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
          Conception / Réalisation
        </h1>
        <p className="mt-2 text-sm text-muted">
          Pipeline en cours de développement — disponible prochainement.
        </p>
      </header>
    </div>
  );
}
