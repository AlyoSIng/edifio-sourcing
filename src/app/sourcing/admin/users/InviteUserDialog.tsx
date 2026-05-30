"use client";

import { useState } from "react";

/**
 * Modale d'invitation d'un nouveau collaborateur AlyoS — refonte UI v1.
 *
 * Source design : pattern modale `design/maquettes/maquettes_v5_admin_architectes.html`
 * lignes 86-104 + 218-274 (M16-B fiche éditable).
 *
 * Appelle `POST /api/admin/users` avec form-encoded. La route handler
 * (cf. `src/app/api/admin/users/route.ts`) :
 *   - valide l'appelant côté serveur (role admin)
 *   - génère un mot de passe provisoire
 *   - crée le user via `auth.admin.createUser`
 *   - envoie un email Resend avec le provisoire
 *
 * UX :
 *   - Bouton primaire `bg-brand-red` pour ouvrir
 *   - Modale fond `--paper-3` overlay + carte `white` shadow-modal
 *   - Champs DS edifio (bordure `--line-2`, focus `brand-red`)
 *   - Erreur 401 → redirect manuel /login (P3 2026-05-22)
 */
type Role = "admin" | "user" | "viewer";

interface State {
  status: "idle" | "submitting" | "success" | "error";
  message?: string;
}

export function InviteUserDialog() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ status: "idle" });
  const [form, setForm] = useState<{
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
  }>({ email: "", firstName: "", lastName: "", role: "user" });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState({ status: "submitting" });

    try {
      const fd = new FormData();
      fd.set("email", form.email);
      fd.set("first_name", form.firstName);
      fd.set("last_name", form.lastName);
      fd.set("role", form.role);

      const resp = await fetch("/api/admin/users", { method: "POST", body: fd });

      // P3 (2026-05-22) — middleware renvoie JSON 401 plutôt qu'un 307 HTML.
      // On gère ici le cas session expirée.
      if (resp.status === 401) {
        setState({
          status: "error",
          message: "Session expirée — redirection vers la page de connexion...",
        });
        const next = encodeURIComponent("/sourcing/admin/users");
        window.location.href = `/login?next=${next}`;
        return;
      }

      const json = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };

      if (!resp.ok || !json.ok) {
        setState({
          status: "error",
          message: json.message ?? `Erreur HTTP ${resp.status}`,
        });
        return;
      }
      setState({
        status: "success",
        message:
          "Compte créé. L'utilisateur va recevoir un email avec un mot de passe provisoire (valable 24 heures).",
      });
      setForm({ email: "", firstName: "", lastName: "", role: "user" });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setState({ status: "idle" });
        }}
        className="rounded-full bg-brand-red px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-brand-red-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1"
      >
        + Inviter un collaborateur
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-user-title"
      className="bg-ink/45 fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-modal">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="invite-user-title" className="font-display text-base font-semibold text-ink">
            Inviter un collaborateur
          </h2>
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
            className="rounded-sm px-2 py-1 text-muted transition hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-5">
          <Field
            label="Email AlyoS"
            id="email"
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
            type="email"
            placeholder="prenom.nom@alyosingenierie.fr"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Prénom"
              id="first_name"
              value={form.firstName}
              onChange={(v) => setForm({ ...form, firstName: v })}
              required
            />
            <Field
              label="Nom"
              id="last_name"
              value={form.lastName}
              onChange={(v) => setForm({ ...form, lastName: v })}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="role" className="text-xs font-semibold text-ink">
              Rôle
            </label>
            <select
              id="role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              className="rounded-sm border border-line-2 bg-white px-3 py-2 text-sm text-ink focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red"
            >
              <option value="user">Utilisateur</option>
              <option value="admin">Administrateur</option>
              <option value="viewer">Lecteur seul</option>
            </select>
          </div>

          {state.status === "error" ? (
            <p
              role="alert"
              className="rounded-sm border-l-4 border-error bg-error-bg px-3 py-2 text-sm text-error"
            >
              {state.message}
            </p>
          ) : null}
          {state.status === "success" ? (
            <p
              role="status"
              className="rounded-sm border-l-4 border-success bg-success-bg px-3 py-2 text-sm text-success"
            >
              {state.message}
            </p>
          ) : null}

          <div className="mt-2 flex items-center justify-end gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-line-2 bg-white px-3.5 py-1.5 text-xs font-semibold text-ink transition hover:bg-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-line-2"
            >
              Fermer
            </button>
            <button
              type="submit"
              disabled={state.status === "submitting"}
              className="rounded-full bg-brand-red px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-red-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red disabled:bg-line-2 disabled:opacity-70"
            >
              {state.status === "submitting" ? "Création…" : "Créer et envoyer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="rounded-sm border border-line-2 bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red"
      />
    </div>
  );
}
