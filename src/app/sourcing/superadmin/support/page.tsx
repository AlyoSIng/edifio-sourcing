/**
 * Page Superadmin — Support utilisateurs — edifio Sourcing
 *
 * Server Component — Phase 2 (implémentation complète).
 *
 * Fonctionnalités :
 *   - Triple garde (session + domaine + superadmin)
 *   - Récupération de tous les tickets depuis `support_tickets` (Drizzle)
 *   - Résolution email → userId via `auth.admin.listUsers`
 *   - Filtre par statut via URL searchParam `?status=open|in_progress|closed|all`
 *   - Stats (ouverts / en cours / fermés)
 *   - Onglets de filtre
 *   - Carte par ticket : email auteur, date, badge statut, sujet, message, réponse
 *   - `ReplyForm` pour les tickets sans réponse
 *   - Bouton "Marquer fermé" pour les tickets 'in_progress'
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { desc } from "drizzle-orm";

import { db } from "@/db/client";
import { supportTickets } from "@/db/schema/superadmin";
import type { SupportTicket } from "@/db/schema/superadmin";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

import { closeTicketAction } from "./actions";
import { ReplyForm } from "./ReplyForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Support — Superadmin — edifio Sourcing",
};

// ─── Types locaux ─────────────────────────────────────────────────────────────

type StatusFilter = "all" | "open" | "in_progress" | "closed";

// ─── Page principale ──────────────────────────────────────────────────────────

export default async function SuperadminSupportPage(props: {
  searchParams: Promise<{ status?: string }>;
}) {
  const searchParams = await props.searchParams;
  // Garde 1 — session
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/superadmin/support");

  // Garde 2 — domaine
  if (!isAuthorizedEmail(user.email)) redirect("/forbidden");

  // Garde 3 — superadmin
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  // Filtre URL
  const rawStatus = searchParams.status ?? "all";
  const statusFilter: StatusFilter = ["open", "in_progress", "closed"].includes(rawStatus)
    ? (rawStatus as StatusFilter)
    : "all";

  // ─── Chargement des tickets ─────────────────────────────────────────────────
  let tickets: SupportTicket[] = [];
  let ticketError: string | null = null;

  try {
    tickets = await db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt));
  } catch (err) {
    ticketError = err instanceof Error ? err.message : "Erreur de chargement des tickets.";
  }

  // ─── Résolution email utilisateurs ─────────────────────────────────────────
  const userEmailMap = new Map<string, string>();

  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
    for (const u of data?.users ?? []) {
      if (u.id && u.email) userEmailMap.set(u.id, u.email);
    }
  } catch {
    // Non bloquant — on affiche l'UUID brut en fallback
  }

  // ─── Stats ──────────────────────────────────────────────────────────────────
  const openCount = tickets.filter((t) => t.status === "open").length;
  const inProgressCount = tickets.filter((t) => t.status === "in_progress").length;
  const closedCount = tickets.filter((t) => t.status === "closed").length;

  // ─── Filtrage local ─────────────────────────────────────────────────────────
  const filtered =
    statusFilter === "all" ? tickets : tickets.filter((t) => t.status === statusFilter);

  // ─── Onglets ────────────────────────────────────────────────────────────────
  const tabs: { label: string; value: StatusFilter; count?: number }[] = [
    { label: "Tous", value: "all", count: tickets.length },
    { label: "Ouverts", value: "open", count: openCount },
    { label: "En cours", value: "in_progress", count: inProgressCount },
    { label: "Fermés", value: "closed", count: closedCount },
  ];

  return (
    <div>
      {/* En-tête */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">Support utilisateurs</h2>
          <p className="mt-0.5 font-mono text-xs text-muted">
            {openCount} ouvert{openCount > 1 ? "s" : ""} · {inProgressCount} en cours ·{" "}
            {closedCount} fermé{closedCount > 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/sourcing/superadmin"
          className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Retour au dashboard
        </Link>
      </div>

      {/* Erreur chargement tickets */}
      {ticketError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-l-4 border-line border-l-error bg-error-bg px-4 py-3 text-sm text-error"
        >
          <strong className="mr-1 font-semibold">Erreur de chargement :</strong>
          {ticketError}
        </div>
      )}

      {/* Onglets de filtre */}
      <nav className="mb-5 flex gap-1 border-b border-line pb-0">
        {tabs.map((tab) => {
          const isActive = statusFilter === tab.value;
          return (
            <Link
              key={tab.value}
              href={tab.value === "all" ? "?" : `?status=${tab.value}`}
              className={[
                "inline-flex items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-2 text-xs font-medium transition-colors",
                isActive
                  ? "border-line bg-white text-ink"
                  : "border-transparent text-muted hover:text-ink",
              ].join(" ")}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={[
                    "inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 font-mono text-[10px]",
                    isActive ? "bg-paper-3 text-ink-2" : "bg-paper-3 text-muted",
                  ].join(" ")}
                >
                  {tab.count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Liste des tickets */}
      {filtered.length === 0 ? (
        <div className="rounded-md border border-line bg-paper-2 px-6 py-10 text-center text-sm text-muted">
          Aucun ticket{statusFilter !== "all" ? ` avec le statut « ${statusFilter} »` : ""}.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              authorEmail={userEmailMap.get(ticket.userId) ?? ticket.userId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TicketCard ───────────────────────────────────────────────────────────────

/**
 * Carte affichant un ticket de support.
 * Inclut le formulaire de réponse inline si pas de réponse,
 * et le bouton "Marquer fermé" si statut = 'in_progress'.
 */
function TicketCard({ ticket, authorEmail }: { ticket: SupportTicket; authorEmail: string }) {
  const badgeClass = statusBadgeClass(ticket.status);
  const badgeLabel = statusLabel(ticket.status);

  const createdAt = new Date(ticket.createdAt).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article className="overflow-hidden rounded-md border border-line bg-white">
      {/* En-tête de la carte */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-ink">{authorEmail}</span>
          <span className="text-muted">·</span>
          <time className="font-mono text-xs text-muted" dateTime={ticket.createdAt.toISOString()}>
            {createdAt}
          </time>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${badgeClass}`}
        >
          {badgeLabel}
        </span>
      </div>
      {/* Corps */}
      <div className="px-4 py-4">
        <h3 className="mb-2 text-sm font-semibold text-ink">{ticket.subject}</h3>
        <p className="line-clamp-3 text-sm text-ink-2">{ticket.message}</p>

        {/* Réponse existante */}
        {ticket.response ? (
          <div className="mt-4 rounded-md border border-success bg-success-bg px-4 py-3">
            <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-success">
              Réponse du superadmin
            </p>
            <p className="text-sm text-ink">{ticket.response}</p>
          </div>
        ) : (
          /* Formulaire de réponse */
          <ReplyForm ticketId={ticket.id} />
        )}

        {/* Bouton "Marquer fermé" */}
        {ticket.status === "in_progress" && (
          <form
            action={async () => {
              "use server";
              await closeTicketAction(ticket.id);
            }}
            className="mt-3 flex justify-end"
          >
            <button
              type="submit"
              className="inline-flex items-center rounded-full border border-line bg-paper-2 px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-paper-3 hover:text-ink"
            >
              Marquer fermé
            </button>
          </form>
        )}
      </div>
    </article>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadgeClass(status: string): string {
  switch (status) {
    case "open":
      return "bg-error-bg text-error";
    case "in_progress":
      return "bg-warn-bg text-warn";
    case "closed":
      return "bg-success-bg text-success";
    default:
      return "bg-paper-3 text-ink-2";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "open":
      return "Ouvert";
    case "in_progress":
      return "En cours";
    case "closed":
      return "Fermé";
    default:
      return status;
  }
}
