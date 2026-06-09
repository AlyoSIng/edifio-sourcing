import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId, NoOrganizationMembershipError } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createTemplateResolver,
  TEMPLATE_META,
  type TemplateKey,
} from "@/lib/email/template-resolver";

import { TemplateEditor } from "./TemplateEditor";

export const metadata = {
  title: "Administration — Modèles d'e-mail — edifio Sourcing",
};

export const dynamic = "force-dynamic";

/**
 * Page admin — éditeur de TOUS les templates d'e-mail (Exigence C).
 *
 * Source de vérité :
 *  - `handoff/SPEC_ADDENDUM_260525_ARCHITECTES_MENU_ET_TRAME_MAIL.md` §Exigence C
 *  - Décision Board 2026-05-25
 *
 * Architecture :
 *  - Server Component : lit la session, charge les templates depuis BDD
 *    (ou fallback par défaut) via `createTemplateResolver`.
 *  - `TemplateEditor` (Client Component) : formulaire réactif + palette variables.
 *  - Réssilience : try/catch absorbé (règle MEMORY — pattern /ao-du-jour).
 *
 * Affichage : onglets par canal (Brevo / Resend), puis un accordion par template.
 */

/** Ordre d'affichage des templates par canal. */
const BREVO_KEYS: TemplateKey[] = [
  "solicitation_tu",
  "solicitation_vous",
  "relance_tu",
  "relance_vous",
  "diffusion_tu",
  "diffusion_vous",
  "decline_acknowledgment",
];

const RESEND_KEYS: TemplateKey[] = [
  "tender_summary_to_user",
  "user_provisional_password",
  "user_password_reset",
  "user_notification",
];

export default async function ModelesEmailPage(props: {
  searchParams?: Promise<{ canal?: string; template?: string }>;
}) {
  const searchParams = await props.searchParams;
  // 1. Auth check
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/admin/modeles-email");

  const profile = toUserProfile(user);
  if (!isAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");
  // Résolution dynamique de l'org (Phase A multi-tenant).
  // Lot 1.6-bis (Hugo, 2026-06-09) — suppression du fallback ALYOS_ORG_ID.
  // Si pas de membership : redirect /no-org (ne JAMAIS fallback — fuite CC-2).
  let orgId: string;
  try {
    orgId = await getRequiredOrgId(user.id);
  } catch (err) {
    if (err instanceof NoOrganizationMembershipError) {
      redirect("/no-org");
    }
    throw err;
  }

  // 2. Paramètres URL (canal actif + template actif)
  const params = searchParams ? await searchParams : {};
  const activeCanal = params?.canal === "resend" ? "resend" : "brevo";
  const activeKey = params?.template as TemplateKey | undefined;

  // 3. Chargement des templates (try/catch résilience)
  const resolver = createTemplateResolver(db, orgId);
  const allKeys: TemplateKey[] = [...BREVO_KEYS, ...RESEND_KEYS];

  type TemplateData = {
    subject: string;
    body: string;
    fromDatabase: boolean;
    version: number;
  };
  const templates: Partial<Record<TemplateKey, TemplateData>> = {};
  let fetchError: string | null = null;

  try {
    const results = await Promise.all(allKeys.map((k) => resolver.loadRaw(k)));
    allKeys.forEach((k, i) => {
      templates[k] = results[i];
    });
  } catch (err) {
    console.error("[modeles-email:fetch:fail]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  const displayKeys = activeCanal === "resend" ? RESEND_KEYS : BREVO_KEYS;
  // Template affiché par défaut : 1er du canal actif
  const defaultKey: TemplateKey = displayKeys[0] ?? "solicitation_vous";
  const selectedKey: TemplateKey =
    activeKey !== undefined && (displayKeys as string[]).includes(activeKey)
      ? (activeKey as TemplateKey)
      : defaultKey;

  return (
    <div className="mx-auto max-w-4xl">
      {/* En-tête */}
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Modèles d&apos;e-mail
        </h1>
        <p className="mt-1 text-sm text-muted">
          Éditeur des {allKeys.length} templates d&apos;e-mail (Brevo + Resend). Les variables en
          rouge sont obligatoires (garde-fous RGPD).
        </p>
      </header>

      {/* Erreur chargement */}
      {fetchError && (
        <div
          role="alert"
          className="mb-6 rounded-md border border-l-4 border-line border-l-error bg-error-bg px-4 py-3 text-sm text-error"
        >
          <strong className="mr-1 font-semibold">Erreur de chargement :</strong>
          {fetchError}
        </div>
      )}

      <div className="flex gap-6">
        {/* Colonne gauche — navigation templates */}
        <nav className="w-56 shrink-0" aria-label="Liste des templates">
          {/* Sélecteur canal */}
          <div className="mb-4 flex overflow-hidden rounded border border-line">
            <CanalTab label="Brevo" canal="brevo" active={activeCanal === "brevo"} />
            <CanalTab label="Resend" canal="resend" active={activeCanal === "resend"} />
          </div>

          {/* Liste des templates du canal */}
          <ul className="space-y-0.5">
            {displayKeys.map((k) => {
              const meta = TEMPLATE_META[k];
              const isActive = k === selectedKey;
              return (
                <li key={k}>
                  <a
                    href={`/sourcing/admin/modeles-email?canal=${activeCanal}&template=${k}`}
                    className={`flex flex-col rounded px-3 py-2 text-sm transition ${
                      isActive ? "bg-brand-red text-white" : "text-ink-2 hover:bg-paper-2"
                    }`}
                  >
                    <span className="font-medium">{meta.labelFr}</span>
                    <span
                      className={`font-mono text-[9px] uppercase tracking-wider ${
                        isActive ? "text-white/60" : "text-muted"
                      }`}
                    >
                      {k}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Colonne droite — éditeur */}
        <div className="min-w-0 flex-1 rounded-md border border-line bg-white p-6">
          <h2 className="mb-5 font-display text-lg font-semibold text-ink">
            {TEMPLATE_META[selectedKey].labelFr}
          </h2>

          {templates[selectedKey] ? (
            <TemplateEditor
              templateKey={selectedKey}
              initialSubject={templates[selectedKey]!.subject}
              initialBody={templates[selectedKey]!.body}
              version={templates[selectedKey]!.version}
              fromDatabase={templates[selectedKey]!.fromDatabase}
            />
          ) : (
            <p className="text-sm text-muted">Chargement du template…</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sous-composant : onglet canal                                               */
/* -------------------------------------------------------------------------- */

function CanalTab({ label, canal, active }: { label: string; canal: string; active: boolean }) {
  return (
    <a
      href={`/sourcing/admin/modeles-email?canal=${canal}`}
      className={`flex-1 px-3 py-1.5 text-center text-xs font-medium transition ${
        active ? "bg-ink text-white" : "bg-white text-ink-2 hover:bg-paper-2"
      }`}
    >
      {label}
    </a>
  );
}
