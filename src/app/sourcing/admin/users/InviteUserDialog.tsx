"use client";

import { useState } from "react";

/**
 * Modale d'invitation d'un nouveau collaborateur AlyoS.
 *
 * Appelle `POST /api/admin/users` avec form-encoded. La route handler
 * (cf. `src/app/api/admin/users/route.ts`) :
 *   - valide l'appelant côté serveur (role admin)
 *   - génère un mot de passe provisoire
 *   - crée le user via `auth.admin.createUser`
 *   - envoie un email Resend avec le provisoire
 *
 * UX minimaliste — affichage inline d'un état succès / erreur. Sur succès,
 * on demande à l'utilisateur de rafraîchir la page (pas de revalidatePath
 * pour le moment — à enrichir plus tard).
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
        className="rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
      >
        Inviter un collaborateur
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Inviter un collaborateur</h2>
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
            className="text-neutral-500 hover:text-neutral-900"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
            <label htmlFor="role" className="text-sm font-medium text-neutral-700">
              Rôle
            </label>
            <select
              id="role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="user">Utilisateur</option>
              <option value="admin">Administrateur</option>
              <option value="viewer">Lecteur seul</option>
            </select>
          </div>

          {state.status === "error" ? (
            <p
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {state.message}
            </p>
          ) : null}
          {state.status === "success" ? (
            <p
              role="status"
              className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900"
            >
              {state.message}
            </p>
          ) : null}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm"
            >
              Fermer
            </button>
            <button
              type="submit"
              disabled={state.status === "submitting"}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:bg-neutral-400"
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
      <label htmlFor={id} className="text-sm font-medium text-neutral-700">
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
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
