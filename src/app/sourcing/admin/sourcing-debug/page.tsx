/**
 * Page admin — Debug du dernier run sourcing-run (chantier K1, Steve 2026-06-04).
 *
 * Affiche la décomposition fetched → filtered (par cause) → inserted/updated
 * pour le dernier `cron_run_log` `sourcing-run` `status='ok'`. Permet de
 * diagnostiquer rapidement pourquoi un cron a renvoyé 1482 fetched / 0
 * inserted (typiquement parce que tous les records sont filtrés au stade
 * `no_positive_keyword`).
 *
 * Server Component superadmin. Lit `cron_run_log.payload` (jsonb) qui contient
 * `{ totalProfiles, results: [{profileId, fetched, filtered, inserted, updated, errors}], failedProfiles }`.
 *
 * Source du payload : `src/lib/sourcing/orchestrator.ts` → `runSourcingForProfiles`.
 */

import { redirect } from "next/navigation";

import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";

export const metadata = { title: "Debug sourcing · edifio Sourcing" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Types du payload `runSourcingForProfiles` — duck-typing prudent.
// ---------------------------------------------------------------------------

interface ProfileResult {
  profileId?: string;
  profileName?: string;
  fetched?: number;
  inserted?: number;
  updated?: number;
  filtered?: Record<string, number>;
  errors?: unknown[];
}

interface SourcingPayload {
  totalProfiles?: number;
  results?: ProfileResult[];
  failedProfiles?: Array<{ profileId: string; error: string }>;
  scrapersDispatched?: number;
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Mapping raison → libellé + suggestion d'action
// ---------------------------------------------------------------------------

const REASON_HINTS: Record<string, { label: string; hint: string }> = {
  no_positive_keyword: {
    label: "Aucun mot-clé positif trouvé",
    hint: "Vérifie que le profil actif a bien des `keywords.positive`. Sans ça, AUCUN record ne peut passer.",
  },
  cpv_mismatch: {
    label: "CPV hors liste",
    hint: "Le code CPV du record n'est pas dans `cpvCodes` du profil. Vérifie que la liste couvre bien ton périmètre métier.",
  },
  amount_below_min: {
    label: "Montant sous le seuil minimum",
    hint: "Le marché est trop petit pour le profil. Augmente/baisse `amountMin` si besoin.",
  },
  amount_above_max: {
    label: "Montant au-dessus du seuil maximum",
    hint: "Le marché est trop gros pour le profil. Augmente `amountMax` si besoin.",
  },
};

function reasonLabel(reason: string): { label: string; hint: string } {
  if (reason.startsWith("negative_keyword:")) {
    const keyword = reason.slice("negative_keyword:".length);
    return {
      label: `Mot-clé exclu : « ${keyword} »`,
      hint: "Un mot-clé négatif du profil match ce record. Vérifie la liste `keywords.negative`.",
    };
  }
  return REASON_HINTS[reason] ?? { label: reason, hint: "Raison non documentée." };
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatInt(n: number): string {
  return n.toLocaleString("fr-FR");
}

function pct(value: number, total: number): string {
  if (total === 0) return "0 %";
  return `${Math.round((value / total) * 100)} %`;
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

interface DebugRow {
  id: string;
  started_at: string;
  duration_ms: number | null;
  payload: SourcingPayload | null;
}

interface ActiveProfile {
  id: string;
  name: string;
  is_default: boolean;
  keywords: { positive?: string[]; negative?: string[]; exact?: string[] } | null;
  cpv_codes: string[] | null;
  geo_zones: string[] | null;
  market_types: string[] | null;
  amount_min: string | null;
  amount_max: string | null;
}

interface TrendRow {
  id: string;
  started_at: string;
  duration_ms: number | null;
  status: string;
  payload: SourcingPayload | null;
}

export default async function SourcingDebugPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/admin/sourcing-debug");
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  let fetchError: string | null = null;
  let row: DebugRow | null = null;
  let profileNames: Record<string, string> = {};
  let activeProfiles: ActiveProfile[] = [];
  let trendRows: TrendRow[] = [];

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("cron_run_log")
      .select("id, started_at, duration_ms, payload")
      .eq("cron_name", "sourcing-run")
      .eq("status", "ok")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    row = data as DebugRow | null;

    // Récupère les noms lisibles de tous les profils mentionnés dans le payload.
    // Service_role bypasse RLS (la page est superadmin-only).
    const payloadResults = (row?.payload?.results ?? []) as ProfileResult[];
    const profileIds = payloadResults
      .map((r) => r.profileId)
      .filter((id): id is string => typeof id === "string");
    if (profileIds.length > 0) {
      const { data: profiles, error: profErr } = await admin
        .from("search_profiles")
        .select("id, name")
        .in("id", profileIds);
      if (!profErr && profiles) {
        profileNames = Object.fromEntries(
          profiles.map((p: { id: string; name: string }) => [p.id, p.name]),
        );
      }
    }

    // L1 — Profils actifs : montre la config réelle pour diagnostiquer le
    // « 1482 fetched / 0 inserted ». Si keywords.positive est vide, on le
    // signale immédiatement.
    const { data: actives, error: actErr } = await admin
      .from("search_profiles")
      .select(
        "id, name, is_default, keywords, cpv_codes, geo_zones, market_types, amount_min, amount_max",
      )
      .eq("active", true)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });
    if (!actErr && actives) {
      activeProfiles = actives as ActiveProfile[];
    }

    // L2 — Tendance des 7 derniers runs OK pour voir l'évolution.
    const { data: trends, error: trendErr } = await admin
      .from("cron_run_log")
      .select("id, started_at, duration_ms, status, payload")
      .eq("cron_name", "sourcing-run")
      .eq("status", "ok")
      .order("started_at", { ascending: false })
      .limit(7);
    if (!trendErr && trends) {
      trendRows = (trends as TrendRow[]).reverse(); // ordre chronologique pour les barres
    }
  } catch (err) {
    console.error("[admin-sourcing-debug:fetch:fail]", err);
    fetchError = "db-error";
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Debug sourcing
        </h1>
        <p className="mt-1 text-sm text-muted">
          Décomposition fetched → filtered → inserted du dernier run <code>sourcing-run</code>{" "}
          réussi. Permet de diagnostiquer pourquoi des records BOAMP sont rejetés et où ajuster la
          config du profil de recherche.
        </p>
      </header>

      {fetchError ? (
        <ErrorBanner
          message={fetchError}
          title="Indisponible"
          description="Impossible de charger le dernier run — réessaie dans quelques instants."
        />
      ) : (
        <>
          {/* L1 — Profils actifs (toujours affiché, indépendant du dernier run). */}
          <ActiveProfilesSection profiles={activeProfiles} />

          {!row ? (
            <p className="text-sm italic text-muted">
              Aucun run <code>sourcing-run</code> réussi enregistré. Déclenche-le manuellement
              depuis{" "}
              <a href="/sourcing/admin/crons" className="underline">
                /admin/crons
              </a>{" "}
              puis reviens ici.
            </p>
          ) : (
            <>
              {/* L2 — Mini-graphique tendance 7 derniers runs. */}
              <TrendSection rows={trendRows} />

              <DebugContent row={row} profileNames={profileNames} />
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// L1 — Section profils actifs
// ---------------------------------------------------------------------------

function ActiveProfilesSection({ profiles }: { profiles: ActiveProfile[] }) {
  if (profiles.length === 0) {
    return (
      <section
        role="alert"
        className="mb-6 rounded-md border border-l-4 border-line border-l-error bg-error-bg p-4"
      >
        <p className="text-sm font-semibold text-error">
          ⚠ Aucun profil de recherche actif — le cron sourcing-run ne fera rien.
        </p>
        <p className="mt-1 text-xs text-muted">
          Va dans{" "}
          <a href="/sourcing/admin/search-profiles" className="underline">
            Configuration &gt; Profils de recherche
          </a>{" "}
          et active au moins un profil avec des mots-clés positifs.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <h2 className="mb-3 font-display text-base font-semibold text-ink">
        Profils de recherche actifs ({profiles.length})
      </h2>
      <div className="space-y-3">
        {profiles.map((p) => {
          const positive = p.keywords?.positive ?? [];
          const negative = p.keywords?.negative ?? [];
          const exact = p.keywords?.exact ?? [];
          const cpv = p.cpv_codes ?? [];
          const geo = p.geo_zones ?? [];
          const markets = p.market_types ?? [];
          const hasPositiveProblem = positive.length === 0;

          return (
            <div
              key={p.id}
              className={`rounded-lg border bg-white p-4 ${
                hasPositiveProblem ? "border-l-4 border-line border-l-error" : "border-line"
              }`}
            >
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-ink">
                  {p.name}
                  {p.is_default && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-paper-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-2">
                      Par défaut
                    </span>
                  )}
                </p>
                <p className="font-mono text-[10px] text-muted">{p.id.slice(0, 8)}…</p>
              </div>

              {hasPositiveProblem && (
                <p className="mb-2 rounded bg-error-bg px-2 py-1 text-xs font-medium text-error">
                  ⚠ Aucun mot-clé positif — 100 % des records seront rejetés.
                </p>
              )}

              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <ProfileField label="Mots-clés positifs" values={positive} highlight="emerald" />
                <ProfileField label="Mots-clés exclus" values={negative} highlight="error" />
                <ProfileField label="Mots-clés exacts" values={exact} />
                <ProfileField label="Codes CPV" values={cpv} />
                <ProfileField label="Zones géo" values={geo} />
                <ProfileField label="Types de marché" values={markets} />
              </div>

              {(p.amount_min !== null || p.amount_max !== null) && (
                <p className="mt-2 font-mono text-[11px] text-muted">
                  Montant :{" "}
                  {p.amount_min !== null
                    ? `≥ ${Number(p.amount_min).toLocaleString("fr-FR")} €`
                    : "—"}
                  {" · "}
                  {p.amount_max !== null
                    ? `≤ ${Number(p.amount_max).toLocaleString("fr-FR")} €`
                    : "pas de plafond"}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProfileField({
  label,
  values,
  highlight,
}: {
  label: string;
  values: string[];
  highlight?: "emerald" | "error";
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
        {label} ({values.length})
      </p>
      {values.length === 0 ? (
        <p className="font-mono text-[11px] text-muted">—</p>
      ) : (
        <p className="font-mono text-[11px] text-ink-2">
          {values.slice(0, 8).map((v, i) => (
            <span
              key={i}
              className={`mr-1 inline-block rounded px-1.5 py-0.5 ${
                highlight === "emerald"
                  ? "bg-emerald-50 text-emerald-700"
                  : highlight === "error"
                    ? "bg-error-bg text-error"
                    : "bg-paper-2"
              }`}
            >
              {v}
            </span>
          ))}
          {values.length > 8 && <span className="text-muted">+ {values.length - 8}…</span>}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// L2 — Section mini-graphique tendance
// ---------------------------------------------------------------------------

function TrendSection({ rows }: { rows: TrendRow[] }) {
  if (rows.length < 2) return null;

  // Pour chaque run, on extrait totalFetched + totalInserted depuis le payload.
  const points = rows.map((r) => {
    const results = (r.payload?.results ?? []) as ProfileResult[];
    let fetched = 0;
    let inserted = 0;
    for (const rr of results) {
      fetched += rr.fetched ?? 0;
      inserted += rr.inserted ?? 0;
    }
    return {
      startedAt: r.started_at,
      durationMs: r.duration_ms ?? 0,
      fetched,
      inserted,
    };
  });

  const maxFetched = Math.max(...points.map((p) => p.fetched), 1);

  return (
    <section className="mb-8">
      <h2 className="mb-3 font-display text-base font-semibold text-ink">
        Tendance — {rows.length} derniers runs OK
      </h2>
      <div className="rounded-lg border border-line bg-white p-4">
        <div className="flex items-end gap-3" style={{ minHeight: "120px" }}>
          {points.map((p, idx) => {
            const heightPct = (p.fetched / maxFetched) * 100;
            const insertedPct = p.fetched > 0 ? (p.inserted / p.fetched) * 100 : 0;
            return (
              <div key={idx} className="flex flex-1 flex-col items-center">
                <p className="mb-1 font-mono text-[10px] text-ink-2">{p.fetched}</p>
                <div
                  className="relative w-full overflow-hidden rounded-t bg-paper-2"
                  style={{ height: `${heightPct}%`, minHeight: "8px" }}
                  title={`${formatDateTime(p.startedAt)} — fetched ${p.fetched}, inserted ${p.inserted} (${(p.durationMs / 1000).toFixed(1)} s)`}
                >
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-emerald-500"
                    style={{ height: `${insertedPct}%` }}
                  />
                  <div className="absolute inset-0 bg-amber-500 opacity-50" />
                </div>
                <p className="mt-1 font-mono text-[9px] text-muted">
                  {new Date(p.startedAt).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </p>
              </div>
            );
          })}
        </div>
        <p className="mt-3 flex items-center gap-3 text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-amber-500 opacity-50" />
            Fetched BOAMP
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />
            Inserted
          </span>
        </p>
      </div>
    </section>
  );
}

function DebugContent({
  row,
  profileNames,
}: {
  row: DebugRow;
  profileNames: Record<string, string>;
}) {
  const payload = row.payload;
  const results = payload?.results ?? [];

  // Agrégats globaux
  let totalFetched = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  const filteredAggregate: Record<string, number> = {};
  for (const r of results) {
    totalFetched += r.fetched ?? 0;
    totalInserted += r.inserted ?? 0;
    totalUpdated += r.updated ?? 0;
    for (const [reason, n] of Object.entries(r.filtered ?? {})) {
      filteredAggregate[reason] = (filteredAggregate[reason] ?? 0) + (n ?? 0);
    }
  }
  const totalFiltered = Object.values(filteredAggregate).reduce((acc, n) => acc + n, 0);

  // Tri des raisons par fréquence décroissante
  const sortedReasons = Object.entries(filteredAggregate).sort((a, b) => b[1] - a[1]);

  return (
    <>
      {/* Métadonnées du run */}
      <section className="mb-6 rounded-lg border border-line bg-paper-2 p-4 text-sm">
        <p className="text-ink">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
            Dernier run OK
          </span>{" "}
          — {formatDateTime(row.started_at)}
          {row.duration_ms !== null && (
            <span className="ml-2 font-mono text-xs text-muted">
              ({(row.duration_ms / 1000).toFixed(1)} s)
            </span>
          )}
        </p>
        {payload?.scrapersDispatched !== undefined && (
          <p className="mt-1 text-xs text-muted">
            {payload.scrapersDispatched} scrapers dispatchés (fire-and-forget, ack via webhook)
          </p>
        )}
      </section>

      {/* KPI cards : panorama fetched → inserted */}
      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Fetched BOAMP" value={formatInt(totalFetched)} />
        <Kpi
          label="Filtered"
          value={formatInt(totalFiltered)}
          sublabel={pct(totalFiltered, totalFetched)}
          colorClass="text-amber-700"
        />
        <Kpi
          label="Inserted"
          value={formatInt(totalInserted)}
          sublabel={pct(totalInserted, totalFetched)}
          colorClass="text-emerald-700"
        />
        <Kpi label="Updated (re-source)" value={formatInt(totalUpdated)} colorClass="text-ink-2" />
      </section>

      {/* Décomposition par raison de filtre */}
      <section className="mb-8">
        <h2 className="mb-3 font-display text-base font-semibold text-ink">
          Pourquoi les records ont été rejetés ?
        </h2>
        {sortedReasons.length === 0 ? (
          <p className="text-sm italic text-muted">
            Aucun filtre rejeté. Tous les records fetchés passent les critères.
          </p>
        ) : (
          <div className="space-y-3">
            {sortedReasons.map(([reason, count]) => {
              const info = reasonLabel(reason);
              const proportion = totalFetched > 0 ? count / totalFetched : 0;
              return (
                <div key={reason} className="rounded-lg border border-line bg-white p-4">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">{info.label}</p>
                    <p className="font-mono text-xs text-muted">
                      {formatInt(count)} record{count > 1 ? "s" : ""} ({pct(count, totalFetched)})
                    </p>
                  </div>
                  {/* Barre de proportion */}
                  <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-paper-2">
                    <div
                      className="h-full bg-amber-500"
                      style={{ width: `${Math.round(proportion * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted">{info.hint}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Détail par profil */}
      <section>
        <h2 className="mb-3 font-display text-base font-semibold text-ink">
          Par profil de recherche
        </h2>
        {results.length === 0 ? (
          <p className="text-sm italic text-muted">
            Aucun profil n&apos;a tourné — vérifie que des profils sont marqués comme actifs.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full text-sm">
              <thead className="bg-paper-2">
                <tr>
                  <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                    Profil
                  </th>
                  <th className="px-3 py-2 text-right font-mono text-[11px] uppercase tracking-wider text-ink-2">
                    Fetched
                  </th>
                  <th className="px-3 py-2 text-right font-mono text-[11px] uppercase tracking-wider text-ink-2">
                    Filtered
                  </th>
                  <th className="px-3 py-2 text-right font-mono text-[11px] uppercase tracking-wider text-ink-2">
                    Inserted
                  </th>
                  <th className="px-3 py-2 text-right font-mono text-[11px] uppercase tracking-wider text-ink-2">
                    Updated
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                    Erreurs
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {results.map((r, idx) => {
                  const profileFiltered = Object.values(r.filtered ?? {}).reduce(
                    (acc, n) => acc + (n ?? 0),
                    0,
                  );
                  return (
                    <tr key={r.profileId ?? `profile-${idx}`}>
                      <td className="px-3 py-2 text-ink">
                        {r.profileId && profileNames[r.profileId] ? (
                          <>
                            {profileNames[r.profileId]}
                            <span className="ml-1 font-mono text-[10px] text-muted">
                              ({r.profileId.slice(0, 8)}…)
                            </span>
                          </>
                        ) : (
                          <span className="font-mono text-[11px] text-muted">
                            {r.profileId ?? `Profil #${idx + 1}`}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[11px] text-ink-2">
                        {formatInt(r.fetched ?? 0)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[11px] text-amber-700">
                        {formatInt(profileFiltered)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[11px] text-emerald-700">
                        {formatInt(r.inserted ?? 0)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[11px] text-ink-2">
                        {formatInt(r.updated ?? 0)}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-muted">
                        {(r.errors?.length ?? 0) > 0 ? `${r.errors!.length} erreur(s)` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Kpi({
  label,
  value,
  sublabel,
  colorClass,
}: {
  label: string;
  value: string;
  sublabel?: string;
  colorClass?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 font-display text-xl font-semibold ${colorClass ?? "text-ink"}`}>
        {value}
      </p>
      {sublabel && <p className="mt-0.5 font-mono text-[10px] text-muted">{sublabel}</p>}
    </div>
  );
}
