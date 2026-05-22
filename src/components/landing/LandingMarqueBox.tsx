/**
 * Section « Que recouvre la marque ? » de la landing publique (M15 —
 * `design/maquettes/maquettes_v3_landing.html`).
 *
 * Info-box sur fond `paper-2` avec pill eyebrow + 2 paragraphes explicatifs sobres
 * pour clarifier la nomenclature edifio (marque) vs edifio Sourcing (produit n°3).
 */
export function LandingMarqueBox() {
  return (
    <section className="mx-auto mb-24 max-w-[1080px] px-8">
      <div className="rounded-lg bg-paper-2 px-10 py-9">
        <span className="pill-eyebrow mb-4">Que recouvre la marque ?</span>
        <p className="mb-3 text-[16px] leading-[1.6] text-ink">
          <strong className="font-semibold text-ink">edifio</strong> est l&apos;éditeur et le panel
          de solutions logicielles d&apos;AlyoS Ingénierie pour les métiers de la maîtrise
          d&apos;œuvre.
        </p>
        <p className="text-[16px] leading-[1.6] text-ink">
          <strong className="font-semibold text-ink">edifio Sourcing</strong> est notre 3
          <sup>e</sup> produit : sourcing automatique d&apos;appels d&apos;offres publics du BTP,
          mobilisation d&apos;architectes cotraitants, préparation IA des dossiers de candidature.
        </p>
      </div>
    </section>
  );
}
