/**
 * Logo edifio Sourcing — pin rouge (DS officiel) + wordmark + libellé produit.
 *
 * Source : `design/tokens.json` (alyos-red `#FF0033`) + `design/maquettes/`.
 * Naming strict : `edifio` lowercase + composition « edifio + nom produit ».
 */
export function EdifioLogo({ withSuite = true }: { withSuite?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-display text-xl tracking-tight">
      <svg viewBox="0 0 20 24" fill="none" aria-hidden className="h-6 w-5">
        <path
          d="M 10 0 C 16 0 20 4 20 10 C 20 17 10 24 10 24 C 10 24 0 17 0 10 C 0 4 4 0 10 0 Z"
          fill="#0F1828"
        />
        <circle cx="10" cy="10" r="4" fill="#FF0033" />
      </svg>
      <span className="font-bold">edifio</span>
      {withSuite ? <span className="text-neutral-500">Sourcing</span> : null}
    </span>
  );
}
