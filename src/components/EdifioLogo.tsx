/**
 * Logo edifio Sourcing — pin rouge (DS officiel) + wordmark + libellé produit.
 *
 * Source : `design/tokens.json` (alyos-red `#FF0033`) + `design/maquettes/`.
 * Référence visuelle exacte : `design/maquettes/maquettes_v3_landing.html`
 * `.edifio-pin` (36×36, border-radius 50 %, fond rouge, goutte blanche dedans,
 * point rouge central).
 *
 * Naming strict : `edifio` lowercase + composition « edifio + nom produit ».
 *
 * Prop `onDarkBg` : à passer à `true` quand le logo est rendu sur fond ink
 * (ex. footer landing, sidebar AppShell éventuelle). Bascule le wordmark sur
 * blanc et le suffixe sur `white/60`.
 */
export function EdifioLogo({
  withSuite = true,
  onDarkBg = false,
}: {
  withSuite?: boolean;
  onDarkBg?: boolean;
}) {
  const wordmarkClass = onDarkBg ? "text-white" : "text-ink";
  const suffixClass = onDarkBg ? "text-white/60" : "text-muted";
  return (
    <span className="inline-flex items-center gap-2 font-display text-xl tracking-tight">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-red">
        <svg viewBox="0 0 20 24" fill="none" aria-hidden className="h-5 w-4">
          <path
            d="M 10 0 C 16 0 20 4 20 10 C 20 17 10 24 10 24 C 10 24 0 17 0 10 C 0 4 4 0 10 0 Z"
            fill="white"
          />
          <circle cx="10" cy="10" r="3" fill="#FF0033" />
        </svg>
      </span>
      <span className={`font-bold ${wordmarkClass}`}>edifio</span>
      {withSuite ? <span className={suffixClass}>Sourcing</span> : null}
    </span>
  );
}
