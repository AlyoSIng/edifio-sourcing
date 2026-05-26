/**
 * Système d'icônes SVG edifio Sourcing.
 *
 * Calqué sur edifio Suivi (`AppIcons.tsx` — version référence).
 *
 * Guidelines de style :
 *   - viewBox 24×24 strict
 *   - strokeWidth 2px, strokeLinecap + strokeLinejoin = "round"
 *   - fill="none", stroke="currentColor" (sauf fills explicites ci-dessous)
 *   - Toutes les icônes héritent de `currentColor` → colorisation via CSS
 *   - La prop `size` contrôle width + height (défaut : 20)
 *   - `aria-hidden` par défaut (les appelants fournissent le contexte textuel)
 *
 * Icônes supplémentaires propres à edifio Sourcing :
 *   - `handshake` — cotraitance / mode Tandem
 *   - `sliders`   — profil de recherche / filtres pondérés
 *   - `ao`        — appel d'offres (document + loupe)
 *
 * Utilisation :
 * ```tsx
 * import { Icon } from '@/components/icons/AppIcons';
 * <Icon name="building" size={20} aria-hidden />
 * ```
 */

import type { SVGProps } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IconName =
  // Navigation générale
  | "home"
  | "arrow-left"
  | "arrow-right"
  | "arrow-up"
  | "arrow-down"
  | "chevron-left"
  | "chevron-right"
  | "chevron-up"
  | "chevron-down"
  | "external-link"
  | "menu"
  | "x"
  | "search"
  // Actions
  | "plus"
  | "minus"
  | "edit"
  | "trash"
  | "copy"
  | "download"
  | "upload"
  | "refresh"
  | "save"
  | "send"
  | "check"
  | "check-circle"
  | "x-circle"
  | "info"
  | "alert-triangle"
  | "alert-circle"
  // Contenu / documents
  | "file"
  | "file-text"
  | "folder"
  | "folder-open"
  | "clipboard"
  | "link"
  | "paperclip"
  // Communication
  | "mail"
  | "bell"
  | "message-circle"
  | "phone"
  // Utilisateurs / organisations
  | "user"
  | "users"
  | "user-plus"
  | "building"
  | "briefcase"
  // Navigation app
  | "settings"
  | "sliders"
  | "filter"
  | "sort-asc"
  | "sort-desc"
  | "grid"
  | "list"
  | "eye"
  | "eye-off"
  // Temps / calendrier
  | "clock"
  | "calendar"
  | "timer"
  // Statuts / états
  | "bookmark"
  | "bookmark-filled"
  | "star"
  | "star-filled"
  | "tag"
  | "flag"
  // Interface
  | "loader"
  | "lock"
  | "unlock"
  | "key"
  | "logout"
  | "login"
  | "shield"
  | "zap"
  | "cpu"
  | "database"
  | "server"
  | "globe"
  | "map-pin"
  | "euro"
  // edifio Sourcing — icônes métier
  | "handshake"
  | "ao"
  // Tandem / contacts — nouvelles (feat/nav-email-v3)
  | "layers"
  | "compass"
  | "hard-hat";

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  /** Taille en pixels (width = height). Défaut : 20. */
  size?: number;
}

// ---------------------------------------------------------------------------
// Paths SVG — viewBox 24×24, stroke 2px round, fill none sauf mention
// ---------------------------------------------------------------------------

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  // ── Navigation générale ──────────────────────────────────────────────────
  home: <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />,

  "arrow-left": <path d="M19 12H5m0 0 7-7m-7 7 7 7" />,

  "arrow-right": <path d="M5 12h14m0 0-7-7m7 7-7 7" />,

  "arrow-up": <path d="M12 19V5m0 0-7 7m7-7 7 7" />,

  "arrow-down": <path d="M12 5v14m0 0 7-7m-7 7-7-7" />,

  "chevron-left": <path d="M15 18l-6-6 6-6" />,

  "chevron-right": <path d="M9 18l6-6-6-6" />,

  "chevron-up": <path d="M18 15l-6-6-6 6" />,

  "chevron-down": <path d="M6 9l6 6 6-6" />,

  "external-link": (
    <>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </>
  ),

  menu: (
    <>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </>
  ),

  x: <path d="M18 6 6 18M6 6l12 12" />,

  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>
  ),

  // ── Actions ──────────────────────────────────────────────────────────────
  plus: <path d="M12 5v14M5 12h14" />,

  minus: <path d="M5 12h14" />,

  edit: (
    <>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </>
  ),

  trash: (
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </>
  ),

  copy: (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),

  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </>
  ),

  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </>
  ),

  refresh: (
    <>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </>
  ),

  save: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </>
  ),

  send: (
    <>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </>
  ),

  check: <polyline points="20 6 9 17 4 12" />,

  "check-circle": (
    <>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </>
  ),

  "x-circle": (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </>
  ),

  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </>
  ),

  "alert-triangle": (
    <>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),

  "alert-circle": (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </>
  ),

  // ── Contenu / documents ──────────────────────────────────────────────────
  file: (
    <>
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </>
  ),

  "file-text": (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </>
  ),

  folder: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,

  "folder-open": (
    <>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1" />
      <path d="M2 10h20" />
    </>
  ),

  clipboard: (
    <>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </>
  ),

  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),

  paperclip: (
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  ),

  // ── Communication ────────────────────────────────────────────────────────
  mail: (
    <>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </>
  ),

  bell: (
    <>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </>
  ),

  "message-circle": (
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  ),

  phone: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.36 12 19.79 19.79 0 0 1 1.28 3.38a2 2 0 0 1 2-2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  ),

  // ── Utilisateurs / organisations ─────────────────────────────────────────
  user: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),

  users: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),

  "user-plus": (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </>
  ),

  building: (
    <>
      <rect x="2" y="7" width="20" height="15" rx="1" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <line x1="6" y1="11" x2="6" y2="11" strokeWidth="2.5" />
      <line x1="10" y1="11" x2="10" y2="11" strokeWidth="2.5" />
      <line x1="14" y1="11" x2="14" y2="11" strokeWidth="2.5" />
      <line x1="18" y1="11" x2="18" y2="11" strokeWidth="2.5" />
      <line x1="6" y1="15" x2="6" y2="15" strokeWidth="2.5" />
      <line x1="18" y1="15" x2="18" y2="15" strokeWidth="2.5" />
    </>
  ),

  briefcase: (
    <>
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </>
  ),

  // ── Navigation app ───────────────────────────────────────────────────────
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),

  /**
   * Sliders — profil de recherche / filtres pondérés.
   * Trois lignes horizontales avec des curseurs positionnés à des
   * hauteurs différentes pour figurer des critères pondérables.
   * Les cercles ont fill="currentColor" pour les rendre visibles.
   */
  sliders: (
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="8" cy="6" r="2" fill="currentColor" />
      <circle cx="16" cy="12" r="2" fill="currentColor" />
      <circle cx="10" cy="18" r="2" fill="currentColor" />
    </>
  ),

  filter: <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />,

  "sort-asc": (
    <>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="15" y2="12" />
      <line x1="3" y1="18" x2="9" y2="18" />
    </>
  ),

  "sort-desc": (
    <>
      <line x1="3" y1="6" x2="9" y2="6" />
      <line x1="3" y1="12" x2="15" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </>
  ),

  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </>
  ),

  list: (
    <>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </>
  ),

  eye: (
    <>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),

  "eye-off": (
    <>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </>
  ),

  // ── Temps / calendrier ───────────────────────────────────────────────────
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>
  ),

  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),

  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2" />
      <path d="M5 3l-2 2M19 3l2 2M9 3h6" />
    </>
  ),

  // ── Statuts / états ──────────────────────────────────────────────────────
  bookmark: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,

  "bookmark-filled": (
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill="currentColor" />
  ),

  star: (
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  ),

  "star-filled": (
    <polygon
      points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
      fill="currentColor"
    />
  ),

  tag: <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />,

  flag: (
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </>
  ),

  // ── Interface ────────────────────────────────────────────────────────────
  loader: (
    <>
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </>
  ),

  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),

  unlock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </>
  ),

  key: (
    <>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </>
  ),

  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>
  ),

  login: (
    <>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </>
  ),

  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,

  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,

  cpu: (
    <>
      <rect x="9" y="9" width="6" height="6" />
      <rect x="2" y="2" width="20" height="20" rx="2" ry="2" />
      <line x1="9" y1="2" x2="9" y2="6" />
      <line x1="15" y1="2" x2="15" y2="6" />
      <line x1="9" y1="18" x2="9" y2="22" />
      <line x1="15" y1="18" x2="15" y2="22" />
      <line x1="2" y1="9" x2="6" y2="9" />
      <line x1="2" y1="15" x2="6" y2="15" />
      <line x1="18" y1="9" x2="22" y2="9" />
      <line x1="18" y1="15" x2="22" y2="15" />
    </>
  ),

  database: (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </>
  ),

  server: (
    <>
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </>
  ),

  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ),

  "map-pin": (
    <>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),

  euro: (
    <>
      <path d="M4 10h10" />
      <path d="M4 14h10" />
      <path d="M16 6a6 6 0 1 0 0 12" />
    </>
  ),

  // ── edifio Sourcing — icônes métier ──────────────────────────────────────

  /**
   * Handshake — cotraitance / mode Tandem.
   * Une prise de mains illustrant la collaboration entre deux entreprises.
   */
  handshake: (
    <>
      <path d="M5 12.5c0 .5.2 1 .6 1.4l4.4 4.4c.8.8 2 .8 2.8 0l6.6-6.6c.4-.4.6-.9.6-1.4V7a2 2 0 0 0-2-2h-3.4c-.5 0-1 .2-1.4.6L9.8 9H7a2 2 0 0 0-2 2v1.5Z" />
      <path d="M9.5 15.5 8 17" />
    </>
  ),

  /**
   * AO — Appel d'offres.
   * Document avec coins repliés et loupe superposée, évoquant l'analyse d'un RC.
   * Le strokeWidth de la ligne loupe est renforcé à 2.5 pour la lisibilité.
   */
  ao: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <circle cx="10" cy="14" r="2.5" />
      <line x1="12" y1="16" x2="15" y2="19" strokeWidth="2.5" />
    </>
  ),

  /**
   * Layers — conception/réalisation (stack de couches).
   * Deux polygones superposés décalés évoquant un empilement de niveaux.
   */
  layers: (
    <>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 12 12 17 22 12" />
      <polyline points="2 17 12 22 22 17" />
    </>
  ),

  /**
   * Compass — bureaux d'études (boussole).
   * Cercle avec aiguille diagonale bisectée, symbole classique de précision.
   */
  compass: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
    </>
  ),

  /**
   * Hard-hat — entreprises/majors (casque de chantier).
   * Forme de casque avec bord plat et bande centrale.
   */
  "hard-hat": (
    <>
      <path d="M2 18h20v2H2z" />
      <path d="M4 18v-3a8 8 0 0 1 16 0v3" />
      <path d="M12 6v6" />
    </>
  ),
};

// ---------------------------------------------------------------------------
// Composant Icon
// ---------------------------------------------------------------------------

/**
 * Composant d'icône universel edifio Sourcing.
 *
 * @example
 * // Navigation sidebar
 * <Icon name="ao" size={20} aria-hidden />
 *
 * @example
 * // Icône avec texte accessible (aria-label sur le SVG)
 * <Icon name="handshake" size={24} aria-label="Cotraitance Tandem" />
 *
 * @example
 * // Colorisation via classe Tailwind parente
 * <span className="text-brand-red">
 *   <Icon name="bell" size={16} aria-hidden />
 * </span>
 */
export function Icon({ name, size = 20, className, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={(props["aria-hidden"] ?? props["aria-label"]) ? undefined : true}
      {...props}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
