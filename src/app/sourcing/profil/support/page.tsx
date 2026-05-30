/**
 * Page Profil — Support — edifio Sourcing (Server Component)
 *
 * Affiche la liste des tickets de l'utilisateur courant (20 derniers)
 * et un bouton/formulaire de création de nouveau ticket.
 *
 * Statuts : open (amber) | in_progress (blue) | closed (green).
 * Si un ticket a une réponse : section dépliable "Réponse de l'équipe edifio".
 * Si la liste est vide : NewTicketToggle defaultOpen=true (formulaire direct).
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

import { desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { supportTickets } from "@/db/schema/superadmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { NewTicketToggle } from "./NewTicketToggle";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Support — Mon profil — edifio Sourcing",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Ouvert",
  in_progress: "En cours",
  closed: "Résolu",
};

const STATUS_CLASSES: Record<string, string> = {
  open: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  closed: "bg-green-100 text-green-800",
};

export default async function ProfilSupportPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = user?.id ?? "";

  let tickets: (typeof supportTickets.$inferSelect)[] = [];

  try {
    if (userId) {
      tickets = await db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.userId, userId))
        .orderBy(desc(supportTickets.createdAt))
        .limit(20);
    }
  } catch {
    return (
      <div>
        <h2 className="mb-4 font-display text-xl font-semibold text-ink">Support</h2>
        <div
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          Impossible de charger vos tickets pour le moment. Veuillez réessayer dans quelques
          instants.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4 font-display text-xl font-semibold text-ink">Support</h2>

      {/* Formulaire : toggle fermé si tickets existants, ouvert si aucun ticket */}
      <NewTicketToggle defaultOpen={tickets.length === 0} />

      {tickets.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Aucun ticket pour le moment. Utilisez le formulaire ci-dessus pour contacter l&apos;équipe
          edifio Sourcing.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {tickets.map((ticket) => {
            const statusLabel = STATUS_LABELS[ticket.status] ?? ticket.status;
            const statusClass = STATUS_CLASSES[ticket.status] ?? "bg-paper-2 text-ink-2";

            const formattedDate = new Intl.DateTimeFormat("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }).format(new Date(ticket.createdAt));

            return (
              <article
                key={ticket.id}
                className="rounded-md border border-line bg-white p-5 shadow-sm"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h3 className="font-display text-base font-semibold text-ink">
                    {ticket.subject}
                  </h3>
                  <span
                    className={[
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                      statusClass,
                    ].join(" ")}
                  >
                    {statusLabel}
                  </span>
                </div>

                <p className="mb-3 text-xs text-muted">{formattedDate}</p>
                <p className="mb-4 whitespace-pre-wrap text-sm text-ink">{ticket.message}</p>

                {ticket.response && (
                  <details className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3">
                    <summary className="cursor-pointer text-sm font-medium text-blue-800">
                      Réponse de l&apos;équipe edifio
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-blue-900">
                      {ticket.response}
                    </p>
                    {ticket.respondedAt && (
                      <p className="mt-2 text-xs text-blue-600">
                        {new Intl.DateTimeFormat("fr-FR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        }).format(new Date(ticket.respondedAt))}
                      </p>
                    )}
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
