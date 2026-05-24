/**
 * Contenu informatif de la page architecte — `/archi/[token]`.
 *
 * Server Component pur (pas d'I/O ici — toutes les données viennent du
 * `loadArchitectPageData` upstream).
 *
 * Rendu :
 *   - Salutation (TU/VOUS selon `architects.tutoiement`)
 *   - Récap AO (titre, acheteur, deadline, montant, CPV, lien DCE)
 *   - Bloc « Pourquoi nous avons pensé à toi/vous » (rationale IA)
 *
 * Source de vérité maquette : M4 (TU) / M4 v1.1 (VOUS).
 */

import { formatClotureFr } from "@/lib/brevo/variables";
import type { BrevoRegister } from "@/lib/brevo/template-picker";

import type { ArchitectPageData } from "@/lib/tandem/architect-page-data";

interface Props {
  data: ArchitectPageData;
  register: BrevoRegister;
}

export function ArchitectTandemPageBody({ data, register }: Props) {
  const { architect, tender, match } = data;
  const isTu = register === "tu";
  const greeting = isTu ? salutTu(architect.contactName) : salutVous(architect.contactName);

  return (
    <article className="flex flex-col gap-6">
      <header>
        <span className="pill-eyebrow">Cotraitance — edifio Sourcing</span>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          {greeting}
        </h1>
        <p className="mt-2 text-sm text-ink-2">
          {isTu
            ? "On a un AO public sur lequel on aimerait que tu te positionnes en cotraitance avec nous."
            : "Nous avons un AO public sur lequel nous aimerions que vous vous positionniez en cotraitance avec nous."}
        </p>
      </header>

      {/* Récap AO */}
      <section
        aria-label="Récapitulatif de l'appel d'offres"
        className="rounded-md border border-line bg-white p-5"
      >
        <h2 className="font-display text-base font-semibold text-ink">{tender.title}</h2>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Field label="Acheteur" value={tender.buyer} />
          <Field label="Clôture" value={formatClotureFr(tender.deadline)} />
          {tender.amount ? (
            <Field label="Montant estimé" value={formatAmount(tender.amount)} />
          ) : null}
          {tender.cpv.length > 0 ? (
            <Field label="CPV" value={tender.cpv.slice(0, 3).join(", ")} />
          ) : null}
        </dl>
        {tender.dceUrl ? (
          <a
            href={tender.dceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-4 inline-block text-sm font-medium text-brand-red underline-offset-4 hover:underline"
          >
            Consulter le DCE complet →
          </a>
        ) : tender.sourceUrl ? (
          <a
            href={tender.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-4 inline-block text-sm font-medium text-brand-red underline-offset-4 hover:underline"
          >
            Voir l&rsquo;avis source →
          </a>
        ) : null}
      </section>

      {/* Rationale matching */}
      {match?.rationale ? (
        <section
          aria-label="Pourquoi nous avons pensé à vous"
          className="bg-bg-alt rounded-md border border-line p-5"
        >
          <h2 className="font-display text-sm font-semibold text-ink">
            {isTu ? "Pourquoi on a pensé à toi" : "Pourquoi nous avons pensé à vous"}
          </h2>
          <p className="mt-2 text-sm text-ink-2">{match.rationale}</p>
        </section>
      ) : null}
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}

function salutTu(contactName: string | null): string {
  if (!contactName?.trim()) return "Salut !";
  const prenom = contactName.trim().split(/\s+/)[0];
  return `Salut ${prenom} !`;
}

function salutVous(contactName: string | null): string {
  if (!contactName?.trim()) return "Bonjour,";
  const prenom = contactName.trim().split(/\s+/)[0];
  return `Bonjour ${prenom},`;
}

function formatAmount(amount: string): string {
  // amount est un `numeric(14,2)` Postgres → string. On le formate en euros FR.
  const n = parseFloat(amount);
  if (!Number.isFinite(n)) return amount;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
}
