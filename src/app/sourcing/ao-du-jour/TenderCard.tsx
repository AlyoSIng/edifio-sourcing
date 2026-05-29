import type { TenderOfTheDay } from "@/lib/sourcing/queries";

import { BriefGenerator } from "./BriefGenerator";
import { formatAmount, formatDeadline } from "./format";
import { TenderCardActions } from "./TenderCardActions";

/**
 * Formate le type d'avis BOAMP pour l'affichage.
 * Réduit les libellés longs en formes courtes reconnaissables.
 */
function noticeTypeLabel(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("attribution")) return "Attribution";
  if (lower.includes("préinformation") || lower.includes("preinformation")) return "Préinfo";
  if (lower.includes("rectificatif")) return "Rectificatif";
  if (lower.includes("marché") || lower.includes("marche")) return "Avis de marché";
  // Valeur brute tronquée si non reconnue
  return raw.length > 25 ? raw.slice(0, 22) + "…" : raw;
}

/**
 * Carte AO « du jour » — habillage charte edifio (M-A lignes 236-302).
 *
 * Server Component pour le rendu + sous-composant Client `<TenderCardActions />`
 * pour les boutons Sélectionner / Différer / Rejeter / Exclure (PR n°5 + n°6).
 *
 * Pattern visuel :
 *   - Grid 3 colonnes : [score ring 64px] [main] [actions 132px+]
 *   - Score ring SVG inline avec dasharray dynamique (cf. helper plus bas)
 *   - Couleur du ring dérivée du score (≥75 brand-red, 50-74 warn, <50 line-2)
 *   - Brief AO : brief IA actif (tender_briefs) en priorité, sinon brief BOAMP
 *     statique (rawData). Bouton « Générer le brief » toujours disponible.
 *   - Département extrait de rawData, fallback regex code postal dans buyer
 *   - Liens « Consulter l'avis » + « Accéder au DCE / RC » si disponibles
 *   - `matchedKeywords` : mots-clés positifs du profil actif qui matchent le
 *     titre ou l'acheteur de l'AO — affichés en badges emerald sous les meta.
 */
export function TenderCard({
  tender,
  matchedKeywords = [],
}: {
  tender: TenderOfTheDay;
  matchedKeywords?: string[];
}) {
  const mainCpv = tender.cpv[0] ?? "—";
  const platformLabel = tender.platformCode.toUpperCase();
  const scoreNum = tender.score ? Math.round(Number(tender.score)) : null;
  const deadlineLabel = formatDeadline(tender.deadline);
  const daysToDeadline = daysUntil(tender.deadline);
  const deadlineTone = deadlineToneFromDays(daysToDeadline);
  const deadlineBg = deadlineBgFromDays(daysToDeadline);

  // Brief affiché : brief IA actif en priorité, sinon brief BOAMP statique
  const aiBrief = tender.activeBrief;
  const boampBrief = extractBrief(tender.rawData);
  const displayBrief = aiBrief ?? boampBrief;

  return (
    <article className="grid grid-cols-1 gap-4 rounded-md border border-line bg-white p-4 transition hover:shadow-card sm:grid-cols-[64px_1fr_auto] sm:items-start">
      {/* Score ring 64×64 — SVG inline pour ne pas dépendre d'un pack icônes */}
      <ScoreRing score={scoreNum} />

      <div className="min-w-0">
        <h2 className="line-clamp-2 font-display text-base font-semibold leading-snug text-ink">
          {tender.title}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>{tender.buyer}</span>
          <span className="font-mono">CPV {mainCpv}</span>
          <span className="font-mono">Réf. {tender.externalRef}</span>
          {/* Badge département / CP — lu depuis la colonne DB (migration 0020) */}
          {tender.department ? (
            <span className="inline-flex items-center rounded-sm bg-paper-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-2">
              {tender.postalCode ? `${tender.postalCode} · ` : ""}Dept.&nbsp;{tender.department}
            </span>
          ) : (
            <span className="text-[10px] text-muted">CP non précisé</span>
          )}
          {/* Badge type d'avis — affiché si disponible */}
          {tender.noticeType ? (
            <span
              className={[
                "rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
                tender.noticeType.toLowerCase().includes("attribution")
                  ? "bg-gray-100 text-gray-500 line-through"
                  : "bg-blue-50 text-blue-700",
              ].join(" ")}
            >
              {noticeTypeLabel(tender.noticeType)}
            </span>
          ) : null}
          {/* Badge visite de site — visible si visit_date renseigné */}
          {tender.visitDate ? (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-700"
              title={`Visite de site prévue le ${tender.visitDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}`}
            >
              Visite
            </span>
          ) : null}
          {/* Badge exclusivité */}
          {tender.isExclusive ? (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
              title="AO avec clause d'exclusivité"
            >
              Exclusif
            </span>
          ) : null}
          <span
            className="rounded-xs bg-paper-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-2"
            aria-label="Plateforme source"
          >
            {platformLabel}
          </span>
        </div>

        {/* Badges mots-clés matchés — mots-clés positifs du profil actif présents dans titre/acheteur */}
        {matchedKeywords.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {matchedKeywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200"
              >
                ✓ {kw}
              </span>
            ))}
          </div>
        ) : null}

        {/* Brief AO — IA actif si disponible (avec badge), sinon BOAMP statique */}
        {displayBrief ? (
          <div className="mt-2">
            <p className="line-clamp-3 text-xs text-ink-2">{displayBrief}</p>
            {aiBrief ? (
              <span className="mt-0.5 inline-flex items-center rounded-full bg-violet-50 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-violet-600">
                IA
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Bouton Générer le brief (Client Component discret) */}
        <BriefGenerator tenderId={tender.id} hasBrief={aiBrief !== null} />

        <p className="mt-2 text-xs text-ink-2">
          Estimation <span className="font-medium">{formatAmount(tender.amount)}</span>
        </p>

        {/* Liens vers l'avis source et le DCE si disponibles */}
        {(tender.sourceUrl ?? tender.dceUrl) ? (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
            {tender.sourceUrl ? (
              <a
                href={tender.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-red underline-offset-2 hover:underline"
              >
                Consulter l&apos;avis ↗
              </a>
            ) : null}
            {tender.dceUrl ? (
              <a
                href={tender.dceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-red underline-offset-2 hover:underline"
              >
                Accéder au DCE / RC ↗
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col items-stretch gap-1.5 sm:min-w-[140px]">
        {/* Badge deadline coloré : rouge <7j, orange 7-15j, vert >15j */}
        <span
          className={`inline-flex items-center justify-end rounded-sm px-1.5 py-0.5 text-right font-mono text-base font-bold ${deadlineBg} ${deadlineTone}`}
          aria-label={`Date limite de remise des offres : ${deadlineLabel}`}
        >
          {daysToDeadline !== null ? `J-${daysToDeadline}` : deadlineLabel}
        </span>
        <TenderCardActions
          tenderId={tender.id}
          tenderTitle={tender.title}
          tenderAmount={formatAmount(tender.amount)}
          tenderDeadline={deadlineLabel}
          tenderScore={scoreNum}
          isExcluded={!!tender.excludedAt}
        />
      </div>
    </article>
  );
}

/**
 * Score ring SVG — circonférence visuelle proportionnelle au score / 100.
 *
 * Détails techniques :
 *   - Cercle de rayon 28 (diamètre 56) dans un viewBox 64×64
 *   - Circonférence ≈ 175.9 (= 2 × π × 28)
 *   - `strokeDashoffset` = circumference × (1 - score / 100)
 *   - Couleur du ring : brand-red ≥ 75, warn 50-74, line-2 < 50
 *   - Le texte du score est centré, mono-style, lisible WCAG AA
 *
 * Score `null` (cas pathologique seed) → ring vide + libellé « — ».
 */
function ScoreRing({ score }: { score: number | null }) {
  const circumference = 175.9;
  const safeScore = score === null ? 0 : Math.max(0, Math.min(100, score));
  const dashOffset = circumference * (1 - safeScore / 100);
  const strokeColor =
    score === null
      ? "var(--line-2)"
      : score >= 75
        ? "var(--brand-red)"
        : score >= 50
          ? "var(--status-warn)"
          : "var(--line-2)";

  return (
    <div
      className="relative grid h-16 w-16 place-items-center"
      role="img"
      aria-label={`Score de pertinence ${score ?? "indisponible"} sur 100`}
    >
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle cx="32" cy="32" r="28" fill="none" stroke="var(--paper-3)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          stroke={strokeColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span className="font-display text-[19px] font-bold text-ink">
        {score === null ? "—" : score}
      </span>
    </div>
  );
}

/**
 * Calcule le nombre de jours entre aujourd'hui et la deadline. `null` si pas
 * de deadline ou déjà passée.
 */
function daysUntil(deadline: Date | null): number | null {
  if (!deadline) return null;
  const diffMs = deadline.getTime() - Date.now();
  if (diffMs < 0) return null;
  return Math.ceil(diffMs / (24 * 3600 * 1000));
}

/**
 * Couleur du texte deadline selon l'urgence (spec Board) :
 *   - < 7 jours  → rouge brand-red
 *   - ≤ 15 jours → orange
 *   - > 15 jours → vert
 *   - null       → muted
 */
function deadlineToneFromDays(days: number | null): string {
  if (days === null) return "text-muted";
  if (days < 7) return "text-[#c8002a] font-semibold";
  if (days <= 15) return "text-[#d97706]";
  return "text-[#16a34a]";
}

/**
 * Couleur de fond du badge deadline selon l'urgence (spec Board) :
 *   - < 7 jours  → bg-red-50
 *   - ≤ 15 jours → bg-amber-50
 *   - > 15 jours → bg-green-50
 *   - null       → fond transparent
 */
function deadlineBgFromDays(days: number | null): string {
  if (days === null) return "";
  if (days < 7) return "bg-red-50";
  if (days <= 15) return "bg-amber-50";
  return "bg-green-50";
}

/**
 * Extrait un brief court (≤ 320 chars) depuis le rawData BOAMP.
 *
 * Priorité de champs : description > objet > libelle.
 * Tronque à 317 chars + « … » si le texte est trop long.
 * Retourne `null` si aucun champ exploitable.
 */
function extractBrief(rawData: TenderOfTheDay["rawData"]): string | null {
  if (!rawData?.record) return null;
  const rec = rawData.record as Record<string, unknown>;
  const text =
    (typeof rec.description === "string" ? rec.description : null) ??
    (typeof rec.objet === "string" ? rec.objet : null) ??
    (typeof rec.libelle === "string" ? rec.libelle : null);
  if (!text) return null;
  return text.length > 320 ? text.slice(0, 317) + "…" : text;
}
