import Link from "next/link";

/**
 * Hero section de la landing publique (M15 — `design/maquettes/maquettes_v3_landing.html`).
 *
 * Patterns marketing edifio.fr (cf. ADR-012) :
 * - Pattern 1 : pill eyebrow rose pâle (classe `.pill-eyebrow` posée dans globals.css)
 * - Pattern 2 : H1 hero 52px / letter-spacing -1.5px / line-height 1.05 (classe
 *   `.marketing-h1`)
 * - Pattern 3 : split-color H1 (2ᵉ ligne en `brand-red`)
 *
 * La tagline produit officielle (« AO publics, du sourcing au pli ») apparaît dans la
 * carte edifio Sourcing en section `LandingSuiteSection`, pas ici — ici on garde le
 * slogan signature « De l'avis publié à l'opportunité gagnée, sans rien tenir à la main. »
 * validé Gate 1 + repris M15.
 */
export function LandingHero() {
  return (
    <section className="mx-auto max-w-[880px] px-8 pb-24 pt-20 text-center">
      <span className="pill-eyebrow mb-6">
        Sourcing AO publics BTP — édité par AlyoS Ingénierie
      </span>

      <h1 className="marketing-h1 mb-6 text-ink">
        De l&apos;avis publié à l&apos;opportunité gagnée,
        <br />
        <span className="text-brand-red">sans rien tenir à la main.</span>
      </h1>

      <p className="mx-auto mb-9 max-w-[720px] text-[19px] leading-[1.55] text-ink-2">
        edifio Sourcing automatise le cycle complet d&apos;un appel d&apos;offres public BTP — du
        flux quotidien d&apos;avis jusqu&apos;au pli remis — pour les collaborateurs AlyoS
        Ingénierie.
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/login"
          className="rounded-full bg-brand-red px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-red-dark"
        >
          Accéder à edifio Sourcing
        </Link>
        <a
          href="#fonctionnement"
          className="rounded-full border border-line bg-transparent px-6 py-3.5 text-[15px] font-semibold text-ink transition-colors hover:bg-paper-2"
        >
          Voir comment ça marche →
        </a>
      </div>
    </section>
  );
}
