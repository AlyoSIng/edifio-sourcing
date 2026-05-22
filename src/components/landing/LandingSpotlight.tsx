import Link from "next/link";

/**
 * Section « Spotlight » sombre de la landing publique (M15 —
 * `design/maquettes/maquettes_v3_landing.html`).
 *
 * Card ink avec accent rouge décoratif (cercle flou en haut à droite), titre split-color,
 * paragraphe explicatif de la promesse produit (Détecte. Sélectionne. Réponds.) + 3 KPIs
 * de gain utilisateur.
 *
 * Les chiffres ont été repris tels quels de la maquette M15 — toute mise à jour ultérieure
 * devra être validée par le CMO (Léa) avec data réelle post-déploiement.
 */
const stats = [
  {
    value: "50–80h",
    label: ["économisées / mois", "par utilisateur actif"],
  },
  {
    value: "4",
    label: ["plateformes", "BOAMP · PLACE · Francmarchés · MP.info"],
  },
  {
    value: "10 min",
    label: ["de revue dossier IA", "vs 2 jours à la main"],
  },
];

export function LandingSpotlight() {
  return (
    <section id="fonctionnement" className="mx-auto mb-24 max-w-[1080px] px-8">
      <div className="relative overflow-hidden rounded-lg bg-ink px-14 py-[60px] text-white">
        {/* Cercle décoratif rouge floutté (effet visuel signature M15) */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-[100px] -top-[100px] h-[300px] w-[300px] rounded-full bg-brand-red opacity-20"
        />

        <span
          className="relative inline-block rounded-full bg-white/15 px-3.5 py-1.5 font-display text-[12px] font-bold uppercase tracking-[1.2px]"
          style={{ color: "var(--marketing-pill-bg)" }}
        >
          Pour les collaborateurs AlyoS Ingénierie
        </span>

        <h2 className="relative mb-4 mt-4 max-w-[700px] font-display text-[40px] font-bold leading-[1.1] tracking-[-1px]">
          Détecte. Sélectionne. <span className="text-brand-red">Réponds.</span>
        </h2>

        <p className="relative mb-7 max-w-[600px] text-[16px] leading-[1.6] text-white/85">
          Chaque matin à 6 h 30, edifio Sourcing scanne les plateformes de marchés publics, filtre
          selon tes profils de recherche, te livre les AO pertinents triés par score. Tu
          sélectionnes en un tap. Mode Solo ou Tandem avec architecte cotraitant. L&apos;IA analyse
          le RC et prépare le dossier en 30 minutes.
        </p>

        <Link
          href="/login"
          className="relative inline-block rounded-sm bg-brand-red px-7 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-red-dark"
        >
          Accéder à edifio Sourcing
        </Link>

        <div className="relative mt-10 flex flex-wrap gap-12">
          {stats.map((stat) => (
            <div key={stat.value}>
              <span className="block font-display text-[36px] font-bold tracking-[-1px] text-brand-red">
                {stat.value}
              </span>
              <span className="mt-1 block text-[13px] text-white/70">
                {stat.label[0]}
                <br />
                {stat.label[1]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
