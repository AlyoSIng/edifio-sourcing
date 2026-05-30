"use client";

/**
 * DemoViewer — lecteur vidéo de démonstration (Client Component).
 *
 * Détecte si l'URL est YouTube (youtube.com/watch ou youtu.be) pour
 * extraire l'ID et rendre un <iframe> embed. Sinon, rend un <video>
 * natif ou un lien direct.
 *
 * Hauteur : 55vh pour maximiser la lisibilité sur desktop.
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

interface DemoViewerProps {
  url: string;
}

function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    // youtube.com/watch?v=ID
    if (parsed.hostname.includes("youtube.com") && parsed.searchParams.has("v")) {
      return parsed.searchParams.get("v");
    }
    // youtu.be/ID
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1).split("?")[0] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

export function DemoViewer({ url }: DemoViewerProps) {
  const youtubeId = extractYouTubeId(url);

  if (youtubeId) {
    return (
      <div className="overflow-hidden rounded-md border border-line shadow-sm">
        <iframe
          src={`https://www.youtube.com/embed/${youtubeId}`}
          title="Démonstration edifio Sourcing"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="w-full"
          style={{ height: "55vh" }}
        />
      </div>
    );
  }

  // Détecte les extensions vidéo courantes
  const isVideoFile = /\.(mp4|webm|ogg)(\?|$)/i.test(url);

  if (isVideoFile) {
    return (
      <div className="overflow-hidden rounded-md border border-line shadow-sm">
        <video
          src={url}
          controls
          className="w-full rounded"
          style={{ height: "55vh" }}
          title="Démonstration edifio Sourcing"
        >
          Votre navigateur ne supporte pas la lecture vidéo.{" "}
          <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
            Télécharger la vidéo
          </a>
          .
        </video>
      </div>
    );
  }

  // Lien direct pour les autres formats
  return (
    <div className="rounded-md border border-line bg-paper-2 px-6 py-10 text-center">
      <p className="mb-4 text-sm text-muted">La démo est disponible via le lien suivant :</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800"
      >
        Regarder la démo
      </a>
    </div>
  );
}
