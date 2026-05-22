import Link from "next/link";

/**
 * Section « Notre suite » de la landing publique (M15 —
 * `design/maquettes/maquettes_v3_landing.html`).
 *
 * 4 cards produits :
 *   - edifio Suivi (DISPONIBLE — lien externe `suivi.edifio.fr`)
 *   - edifio Sourcing (INTERNE AlyoS — bordure brand-red + CTA fonctionnel `/login`)
 *   - edifio AO (BIENTÔT T3 2026 — CTA inactif)
 *   - edifio ACT (BIENTÔT T4 2026 — CTA inactif)
 *
 * La carte edifio Sourcing porte la tagline produit officielle validée Board
 * 2026-05-10 : « AO publics, du sourcing au pli » (cf. `design/tokens.json`
 * `product.tagline`).
 */
type ProductStatus = "available" | "internal" | "comingSoon";

interface Product {
  name: string;
  tagline: string;
  features: string[];
  badge: { label: string; status: ProductStatus };
  cta: { label: string; href: string; external?: boolean; disabled?: boolean };
  highlight?: boolean;
}

const products: Product[] = [
  {
    name: "Suivi",
    tagline: "Pilotage de chantier MOE",
    features: [
      "Comptes-rendus de chantier structurés",
      "Tâches, plans, diffusion centralisés",
      "Application mobile pour le terrain",
      "Sécurisé RGPD, hébergement UE",
    ],
    badge: { label: "Disponible", status: "available" },
    cta: { label: "Accéder à edifio Suivi", href: "https://suivi.edifio.fr", external: true },
  },
  {
    name: "Sourcing",
    tagline: "AO publics, du sourcing au pli",
    features: [
      "Sourcing quotidien BOAMP + PLACE + Francmarchés",
      "Mobilisation architectes cotraitants par mail",
      "Préparation dossier IA (analyse RC, CERFA, mémoire)",
      "Synchronisation Odoo CRM",
    ],
    badge: { label: "Interne AlyoS", status: "internal" },
    cta: { label: "Accéder à edifio Sourcing", href: "/login" },
    highlight: true,
  },
  {
    name: "AO",
    tagline: "Suivi des réponses aux appels d'offres",
    features: [
      "Pipeline de réponses unifié",
      "Indicateurs de performance commerciale",
      "Archive des mémoires techniques",
    ],
    badge: { label: "Bientôt T3 2026", status: "comingSoon" },
    cta: { label: "Être informé du lancement", href: "#", disabled: true },
  },
  {
    name: "ACT",
    tagline: "Actes administratifs et marchés",
    features: [
      "Gestion centralisée des marchés",
      "Templates administratifs",
      "Audit trail réglementaire",
    ],
    badge: { label: "Bientôt T4 2026", status: "comingSoon" },
    cta: { label: "Être informé du lancement", href: "#", disabled: true },
  },
];

export function LandingSuiteSection() {
  return (
    <section id="suite" className="mx-auto mb-24 max-w-[1080px] px-8">
      <span className="pill-eyebrow mb-3">Notre suite</span>
      <h2 className="mb-3 font-display text-[32px] font-bold leading-[1.15] tracking-[-0.8px] text-ink">
        Une seule source de vérité, modulaire selon vos besoins.
      </h2>
      <p className="mb-8 max-w-[640px] text-[17px] text-ink-2">
        Chaque produit est utilisable indépendamment, mais ils se complètent pour couvrir tout le
        cycle d&apos;un projet de construction.
      </p>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {products.map((product) => (
          <ProductCard key={product.name} product={product} />
        ))}
      </div>
    </section>
  );
}

function ProductCard({ product }: { product: Product }) {
  const cardBorder = product.highlight ? "border-2 border-brand-red" : "border border-line";

  return (
    <article
      className={`rounded-[14px] bg-white px-7 pb-8 pt-7 ${cardBorder}`}
      data-testid={`product-card-${product.name.toLowerCase()}`}
    >
      <ProductBadge label={product.badge.label} status={product.badge.status} />
      <h3 className="mb-2 font-display text-2xl font-bold text-ink">
        edifio<span className="font-medium text-muted"> {product.name}</span>
      </h3>
      <p className="mb-4 text-sm text-ink-2">{product.tagline}</p>
      <ul className="mb-5 space-y-1">
        {product.features.map((feature) => (
          <li key={feature} className="text-[13.5px] text-ink-2">
            <span className="mr-1.5 font-bold text-brand-red">✓</span>
            {feature}
          </li>
        ))}
      </ul>
      <ProductCta cta={product.cta} />
    </article>
  );
}

function ProductBadge({ label, status }: { label: string; status: ProductStatus }) {
  const styles: Record<ProductStatus, string> = {
    available: "bg-brand-red text-white",
    internal: "bg-[var(--marketing-pill-bg)] text-[var(--marketing-pill-color)]",
    comingSoon: "bg-[#FFE89E] text-[#74540B]",
  };
  return (
    <span
      className={`mb-4 inline-block rounded-full px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-[0.8px] ${styles[status]}`}
    >
      {label}
    </span>
  );
}

function ProductCta({ cta }: { cta: Product["cta"] }) {
  if (cta.disabled) {
    return (
      <span
        aria-disabled="true"
        className="inline-block cursor-not-allowed text-[13px] font-semibold text-muted"
      >
        {cta.label} →
      </span>
    );
  }
  if (cta.external) {
    return (
      <a
        href={cta.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-[13px] font-semibold text-ink transition-colors hover:text-brand-red"
      >
        {cta.label} →
      </a>
    );
  }
  return (
    <Link
      href={cta.href}
      className="inline-block text-[13px] font-semibold text-ink transition-colors hover:text-brand-red"
    >
      {cta.label} →
    </Link>
  );
}
