/**
 * Page Superadmin — Billing d'une organisation — Stripe minimal MVP
 * (Steve 2026-06-05).
 *
 * Affiche l'état de souscription + boutons de transition manuelle :
 *   - Démarrer un trial 30j
 *   - Prolonger trial (+30j)
 *   - Marquer comme client payant (saisir le cus_XXX de Stripe Dashboard)
 *   - Marquer comme expirée
 *   - Marquer comme annulée
 *
 * Pas de webhook ni d'intégration Stripe SDK — facturation 100 % manuelle.
 * À la migration vers le monorepo edifio (T3), remplacée par la gestion
 * trial/Stripe auto du module `common/stripe`.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { organizations } from "@/db/schema/organizations";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { computeTrialState } from "@/lib/billing/trial";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { BillingControlsClient } from "./BillingControlsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facturation organisation · edifio Sourcing" };

export default async function BillingPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Auth + rôle
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  const orgId = params.id;
  if (!/^[0-9a-fA-F-]{36}$/.test(orgId)) notFound();

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      subscriptionStatus: organizations.subscriptionStatus,
      trialStartedAt: organizations.trialStartedAt,
      trialEndsAt: organizations.trialEndsAt,
      stripeCustomerId: organizations.stripeCustomerId,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) notFound();

  const state = computeTrialState({
    subscriptionStatus: org.subscriptionStatus,
    trialEndsAt: org.trialEndsAt,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/sourcing/superadmin/organizations/${orgId}`}
        className="mb-4 inline-flex items-center text-xs text-muted hover:text-ink"
      >
        ← Retour à l&apos;organisation
      </Link>

      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Facturation — {org.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Gestion manuelle du cycle de vie billing (Stripe minimal MVP). Pas de webhook ni de
          checkout self-service — la souscription Stripe est créée à la main dans le Dashboard.
        </p>
      </header>

      {/* Statut actuel */}
      <section className="mb-6 rounded-lg border border-line bg-white p-5">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted">
          État actuel
        </h2>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Field label="Statut">
            <StatusBadge status={org.subscriptionStatus} />
          </Field>
          <Field label="Trial expire le">
            {formatDate(org.trialEndsAt)}
            {state.daysLeft !== null && (
              <span className="ml-2 text-xs text-muted">
                (
                {state.daysLeft > 0
                  ? `${state.daysLeft} j restants`
                  : `${-state.daysLeft} j de retard`}
                )
              </span>
            )}
          </Field>
          <Field label="Trial démarré le">{formatDate(org.trialStartedAt)}</Field>
          <Field label="Stripe customer ID">
            {org.stripeCustomerId ? (
              <code className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[11px] text-ink">
                {org.stripeCustomerId}
              </code>
            ) : (
              <span className="italic text-muted">—</span>
            )}
          </Field>
        </div>
      </section>

      {/* Actions */}
      <BillingControlsClient
        orgId={org.id}
        currentStatus={org.subscriptionStatus}
        currentStripeCustomerId={org.stripeCustomerId}
      />

      {/* Aide opérationnelle */}
      <section className="mt-6 rounded-lg border border-blue-100 bg-blue-50/40 p-5 text-xs text-blue-900">
        <h3 className="mb-2 font-display text-sm font-semibold text-blue-900">
          Workflow opérationnel
        </h3>
        <ol className="ml-4 list-decimal space-y-1.5">
          <li>Démarrer le trial 30 jours pour une nouvelle organisation cliente.</li>
          <li>
            L&apos;org utilise l&apos;app pendant l&apos;essai (bannière info / warning
            automatique).
          </li>
          <li>
            À J-3 / J0, contact commercial avec l&apos;admin de l&apos;org pour proposer la
            souscription.
          </li>
          <li>
            Si OK : créer le customer dans Stripe Dashboard (Customers &gt; Add) avec l&apos;email
            admin de l&apos;org. Copier le <code>cus_XXX</code> retourné.
          </li>
          <li>
            Créer une subscription au plan Solo 99€/mois dans Stripe Dashboard. Stripe envoie
            automatiquement l&apos;invoice par email.
          </li>
          <li>
            Renseigner le <code>cus_XXX</code> ci-dessus et cliquer « Marquer comme client payant ».
            L&apos;app redevient/reste accessible sans bannière.
          </li>
          <li>
            Si refus : prolonger le trial OU marquer comme expirée (l&apos;org passe en lecture-zéro
            sauf superadmin).
          </li>
        </ol>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <div className="mt-0.5 text-ink">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    none: { label: "Non activé", cls: "bg-paper-2 text-muted" },
    trial: { label: "En essai", cls: "bg-amber-100 text-amber-800" },
    active: { label: "Client payant", cls: "bg-emerald-100 text-emerald-800" },
    expired: { label: "Essai expiré", cls: "bg-red-100 text-red-800" },
    cancelled: { label: "Annulé", cls: "bg-rose-100 text-rose-800" },
  };
  const m = map[status] ?? map.none!;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
