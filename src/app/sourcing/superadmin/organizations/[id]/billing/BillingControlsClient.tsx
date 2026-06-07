"use client";

/**
 * Composant Client interactif des transitions billing
 * (Steve 2026-06-05, Stripe minimal MVP).
 *
 * Pas de form react-hook-form ni Zod ici — les Server Actions valident
 * elles-mêmes (UUID, durée, format cus_XXX).
 */

import { useState, useTransition } from "react";

import {
  extendTrialAction,
  markActiveAction,
  markCancelledAction,
  markExpiredAction,
  startTrialAction,
} from "./actions";

interface Props {
  orgId: string;
  currentStatus: string;
  currentStripeCustomerId: string | null;
}

export function BillingControlsClient({ orgId, currentStatus, currentStripeCustomerId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [stripeId, setStripeId] = useState(currentStripeCustomerId ?? "");

  function handleAction(action: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      setFeedback(result.ok ? `✓ ${okMsg}` : `⚠️ ${labelError(result.error)}`);
    });
  }

  return (
    <section className="rounded-lg border border-line bg-white p-5">
      <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted">
        Actions
      </h2>

      {feedback && (
        <p
          role="status"
          className={`mb-3 rounded-sm border-l-4 px-3 py-2 text-sm ${
            feedback.startsWith("✓")
              ? "border-success bg-success-bg text-success"
              : "border-warn bg-warn-bg text-warn"
          }`}
        >
          {feedback}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3">
        {/* Démarrer trial */}
        <ActionCard
          title="Démarrer un essai 30 jours"
          description="Place l'organisation en trial à partir d'aujourd'hui (30 j). Écrase tout statut précédent."
          button="Démarrer essai 30 j"
          disabled={isPending}
          onClick={() => handleAction(() => startTrialAction(orgId, 30), "Essai 30j démarré")}
        />

        {/* Prolonger trial */}
        <ActionCard
          title="Prolonger l'essai de 30 jours"
          description="Ajoute 30 j à la date de fin du trial actuel (ou démarre 30 j si pas d'essai en cours)."
          button="Prolonger +30 j"
          disabled={isPending}
          onClick={() => handleAction(() => extendTrialAction(orgId, 30), "Essai prolongé de 30j")}
        />

        {/* Marquer client payant */}
        <div className="bg-paper-2/40 rounded border border-line p-4">
          <h3 className="font-display text-sm font-semibold text-ink">
            Marquer comme client payant
          </h3>
          <p className="mt-1 text-xs text-muted">
            À utiliser après création de la subscription dans Stripe Dashboard. Renseigne le{" "}
            <code className="bg-paper-2 px-1 font-mono text-[11px]">cus_XXX</code> retourné par
            Stripe.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={stripeId}
              onChange={(e) => setStripeId(e.target.value)}
              placeholder="cus_XXXXXXXXXXXXXX"
              className="flex-1 rounded border border-line bg-white px-3 py-1.5 font-mono text-xs text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
              disabled={isPending}
            />
            <button
              type="button"
              onClick={() =>
                handleAction(() => markActiveAction(orgId, stripeId), "Marqué comme client payant")
              }
              disabled={isPending || stripeId.trim().length < 8}
              className="shrink-0 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ✓ Marquer client payant
            </button>
          </div>
        </div>

        {/* Marquer expiré */}
        <ActionCard
          title="Marquer comme essai expiré"
          description="Verrouille l'app pour les utilisateurs non-superadmin de l'organisation. À utiliser si l'org n'a pas souscrit après le trial."
          button="Marquer expirée"
          variant="danger"
          disabled={isPending || currentStatus === "expired"}
          onClick={() => handleAction(() => markExpiredAction(orgId), "Marquée comme expirée")}
        />

        {/* Marquer annulé */}
        <ActionCard
          title="Marquer comme annulée"
          description="À utiliser si le client a résilié sa souscription (post-active). Verrouille l'accès."
          button="Marquer annulée"
          variant="danger"
          disabled={isPending || currentStatus === "cancelled"}
          onClick={() => handleAction(() => markCancelledAction(orgId), "Marquée comme annulée")}
        />
      </div>
    </section>
  );
}

function ActionCard({
  title,
  description,
  button,
  onClick,
  disabled,
  variant = "default",
}: {
  title: string;
  description: string;
  button: string;
  onClick: () => void;
  disabled: boolean;
  variant?: "default" | "danger";
}) {
  return (
    <div className="bg-paper-2/40 rounded border border-line p-4">
      <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-xs text-muted">{description}</p>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`mt-3 rounded-full px-4 py-1.5 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          variant === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-ink hover:bg-ink-2"
        }`}
      >
        {button}
      </button>
    </div>
  );
}

function labelError(code: string | undefined): string {
  switch (code) {
    case "not_authenticated":
      return "Session expirée — reconnectez-vous.";
    case "forbidden_role":
      return "Réservé aux superadministrateurs.";
    case "invalid_org_id":
      return "Identifiant d'organisation invalide.";
    case "invalid_duration":
      return "Durée invalide (1 à 365 jours).";
    case "invalid_stripe_customer_id":
      return "Stripe customer ID invalide (doit commencer par cus_).";
    case "org_not_found":
      return "Organisation introuvable.";
    case "db_error":
      return "Erreur base de données — réessayez.";
    default:
      return "Erreur inattendue.";
  }
}
