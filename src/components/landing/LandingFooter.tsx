import { EdifioLogo } from "@/components/EdifioLogo";

/**
 * Footer 4 colonnes de la landing publique (M15 —
 * `design/maquettes/maquettes_v3_landing.html`).
 *
 * Colonnes :
 *   - col 1 (2fr) : logo edifio + description courte
 *   - col 2 : Produits (fratrie edifio)
 *   - col 3 : AlyoS
 *   - col 4 : Légal
 *
 * Bottom-bar : copyright dynamique + identifiant version.
 *
 * Naming strict CLAUDE.md : copyright = « © AlyoS Ingénierie {year} — Outil interne ».
 */
export function LandingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-ink px-8 pb-8 pt-12 text-white/70">
      <div className="mx-auto max-w-[1080px]">
        <div className="mb-10 grid grid-cols-1 gap-12 md:grid-cols-[2fr_1fr_1fr_1fr]">
          {/* Col 1 — Logo + description */}
          <div>
            <div className="mb-3 [&_.text-neutral-500]:text-white/70">
              <EdifioLogo />
            </div>
            <p className="text-[13.5px] leading-[1.6] text-white/70">
              Outil interne AlyoS Ingénierie — sourcing automatique d&apos;appels d&apos;offres
              publics BTP, cotraitance architecte et préparation IA des dossiers.
            </p>
          </div>

          {/* Col 2 — Produits */}
          <FooterCol title="Produits">
            <FooterLink href="https://suivi.edifio.fr" external>
              edifio Suivi
            </FooterLink>
            <FooterLink href="/login">edifio Sourcing</FooterLink>
            <FooterLink href="#" disabled>
              edifio AO
            </FooterLink>
            <FooterLink href="#" disabled>
              edifio ACT
            </FooterLink>
          </FooterCol>

          {/* Col 3 — AlyoS */}
          <FooterCol title="AlyoS">
            <FooterLink href="https://alyosingenierie.fr" external>
              Le site AlyoS
            </FooterLink>
            <FooterLink href="/about">À propos d&apos;edifio</FooterLink>
            <FooterLink href="mailto:it@alyosingenierie.fr">Contact</FooterLink>
          </FooterCol>

          {/* Col 4 — Légal */}
          <FooterCol title="Légal">
            <FooterLink href="#" disabled>
              Mentions légales
            </FooterLink>
            <FooterLink href="#" disabled>
              Politique de confidentialité
            </FooterLink>
            <FooterLink href="mailto:dpo@alyosingenierie.fr">DPO</FooterLink>
          </FooterCol>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/10 pt-6 font-mono text-[12px] md:flex-row md:justify-between">
          <span>© AlyoS Ingénierie {year} — Outil interne, hébergement strict UE</span>
          <span>edifio Sourcing v1.0 — AO publics, du sourcing au pli</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-3.5 font-display text-[14px] font-semibold uppercase tracking-[0.8px] text-white">
        {title}
      </h4>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function FooterLink({
  href,
  children,
  external = false,
  disabled = false,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    // Lien désactivé : on n'utilise pas `aria-disabled` sur `<li>` (role
    // implicite `listitem` ne supporte pas cet attribut — jsx-a11y). Le `<span>`
    // interne porte la sémantique d'élément non interactif.
    return (
      <li className="py-1 text-[13px] text-white/40">
        <span>{children}</span>
      </li>
    );
  }
  return (
    <li className="py-1 text-[13px]">
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="text-white/70 transition-colors hover:text-white"
      >
        {children}
      </a>
    </li>
  );
}
