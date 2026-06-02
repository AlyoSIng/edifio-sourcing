/**
 * Génération de PDF téléchargeables pour les CERFA DC1 et DC2.
 *
 * Pourquoi un PDF custom plutôt qu'un remplissage des form fields officiels :
 *   - Les CERFA n°12156 (DC1) et n°13911 (DC2) téléchargeables sur le site
 *     economie.gouv.fr ont des form fields parfois mal nommés / mal positionnés,
 *     ce qui rend l'écriture programmatique fragile.
 *   - L'utilisateur final (acheteur public) ne refuse pas un PDF lisible
 *     contenant les mêmes informations, structuré en clé→valeur.
 *   - Le mémoire technique étant séparé, on n'a pas besoin du rendu exact du
 *     formulaire — on a besoin d'un document propre, signable, qui porte
 *     l'identité visuelle edifio.
 *
 * Layout (A4 portrait, 595 × 842 pt) :
 *   - En-tête rouge brand avec le titre du CERFA
 *   - Sous-titre : objet du marché + acheteur (+ mandataire si Tandem)
 *   - Séparateur fin
 *   - Liste verticale label → valeur, paginée automatiquement
 *   - Footer en bas de la dernière page : date génération + org
 *
 * Module pur (aucune dépendance BDD / Storage) — 100 % testable en Vitest.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

/** Snapshot minimal de l'archi mandataire (Tandem multi-archi). */
export interface CerfaPdfArchitect {
  cabinet: string;
}

/** Snapshot minimal du BE cotraitant (Lot B — Cotraitance BE). */
export interface CerfaPdfBe {
  cabinet: string;
}

/**
 * Entrée pour générer un PDF CERFA — snapshot complet des données à imprimer.
 *
 * Aucune référence à la BDD : ce contrat est figé pour faciliter la testabilité.
 * L'appelant (Server Action `validateCerfa`) est responsable de charger les
 * données et de transformer la liste de `CerfaField` en `fields` ci-dessous.
 */
export interface CerfaPdfInput {
  /** Type de CERFA : DC1 (lettre de candidature) ou DC2 (déclaration). */
  kind: "dc1" | "dc2";
  /** Titre de l'AO (objet du marché). */
  tenderTitle: string;
  /** Nom de l'acheteur public (pouvoir adjudicateur). */
  tenderBuyer: string;
  /** Nom de l'organisation utilisatrice (AlyoS Ingénierie au MVP). */
  organizationName: string;
  /**
   * Snapshot de l'archi sélectionné en mandataire (Phase 3 Tandem multi-archi).
   * Null pour Solo / Tandem sans archi sélectionné — dans ce cas, l'organisation
   * AlyoS est mandataire.
   */
  selectedArchitect?: CerfaPdfArchitect | null;
  /**
   * Snapshot du BE cotraitant pour lequel ce DC2 est préparé (Lot B —
   * Cotraitance BE). Null pour le DC1 ou pour un DC2 standard (AlyoS).
   * Affiché comme « Candidat (BE cotraitant) : <cabinet> » dans l'en-tête PDF.
   */
  selectedBe?: CerfaPdfBe | null;
  /**
   * Liste ordonnée des champs à imprimer, dans l'ordre d'affichage UI.
   * `label` doit être en français (libellé court humain).
   * `value` peut être vide — sera remplacé par "—" dans le rendu.
   */
  fields: Array<{
    id: string;
    label: string;
    value: string;
    source: "tender_data" | "company_data" | "a_completer";
  }>;
  /** Horodatage de la génération (affiché dans le footer). */
  generatedAt: Date;
}

// ---------------------------------------------------------------------------
// Constantes de layout
// ---------------------------------------------------------------------------

/** Largeur d'une page A4 en points PDF. */
const PAGE_WIDTH = 595;
/** Hauteur d'une page A4 en points PDF. */
const PAGE_HEIGHT = 842;
/** Marge gauche (et largeur de bloc utile pour le wrap). */
const MARGIN_LEFT = 50;
/** Marge droite. */
const MARGIN_RIGHT = 50;
/** Y de départ en haut de page. */
const TOP_Y = 800;
/** Y minimum avant saut de page. */
const MIN_Y_BEFORE_BREAK = 100;
/** Largeur cible (en chars) pour le wrap des valeurs. */
const VALUE_WRAP_CHARS = 90;

/** Couleur brand edifio (rouge ~ #d90033) pour le titre. */
const BRAND_RED = rgb(0.85, 0, 0.2);
/** Gris foncé pour les sous-titres. */
const SUBTITLE_GREY = rgb(0.2, 0.2, 0.2);
/** Gris clair pour le séparateur. */
const SEPARATOR_GREY = rgb(0.7, 0.7, 0.7);
/** Gris pour le footer. */
const FOOTER_GREY = rgb(0.5, 0.5, 0.5);
/** Noir pour les valeurs. */
const BLACK = rgb(0, 0, 0);
/** Gris ardoise pour les labels. */
const LABEL_GREY = rgb(0.1, 0.1, 0.1);

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/**
 * Découpe un texte en lignes ne dépassant pas `maxChars` caractères,
 * en coupant prioritairement sur les espaces (word-wrap simple).
 *
 * Si un mot est plus long que `maxChars`, il sort tel quel sur sa ligne
 * (les PDF tronquent à droite, mais aucun mot CERFA n'atteint cette taille
 * en pratique : adresses, téléphones, raisons sociales restent < 90 chars).
 */
export function wrapText(text: string, maxChars: number): string[] {
  if (text.length === 0) return [""];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length > maxChars && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

/**
 * Nettoie une chaîne de caractères pour Helvetica (WinAnsi encoding).
 *
 * StandardFonts.Helvetica embarqué par pdf-lib ne supporte que WinAnsi
 * (équivalent CP1252). Les caractères Unicode hors de cette table (emojis,
 * idéogrammes, exposants exotiques) font crasher `drawText`. On remplace
 * proactivement les caractères usuels qu'on peut croiser dans nos fixtures
 * AO (apostrophe typographique, guillemets français, tirets longs, NBSP)
 * par leurs équivalents ASCII. Les autres caractères hors WinAnsi sont
 * remplacés par '?' en filet de sécurité.
 *
 * Note : ces remplacements ne sont pas idéaux esthétiquement (« → ") mais
 * garantissent qu'aucun PDF n'échoue en prod. Pour le MVP interne AlyoS,
 * c'est acceptable. Une amélioration future consisterait à embarquer une
 * font TTF compatible UTF-8 (ex. Inter en mode subset).
 */
function sanitizeForHelvetica(text: string): string {
  return (
    text
      .replace(/’/g, "'") // apostrophe typographique → ASCII
      .replace(/‘/g, "'")
      .replace(/“/g, '"') // guillemets anglais
      .replace(/”/g, '"')
      .replace(/«/g, '"') // guillemets français «
      .replace(/»/g, '"')
      .replace(/–/g, "-") // tiret demi-cadratin
      .replace(/—/g, "-") // tiret cadratin
      .replace(/…/g, "...") // points de suspension
      .replace(/ /g, " ") // NBSP
      .replace(/ /g, " ") // NBSP étroit
      // eslint-disable-next-line no-control-regex
      .replace(/[^\x00-\xFF]/g, "?")
  ); // tout ce qui sort de Latin-1 → '?'
}

/** Libellé humain du type de CERFA pour le titre du PDF. */
function cerfaTitle(kind: "dc1" | "dc2"): string {
  return kind === "dc1"
    ? "DC1 - Lettre de candidature (CERFA n°12156)"
    : "DC2 - Déclaration du candidat (CERFA n°13911)";
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Génère un PDF formaté à partir d'un snapshot CERFA et retourne ses bytes.
 *
 * Le PDF est paginé automatiquement : dès que le curseur Y descend sous
 * `MIN_Y_BEFORE_BREAK`, une nouvelle page A4 est créée.
 *
 * @param input Snapshot complet des données à imprimer.
 * @returns Bytes du PDF prêts à être uploadés (Uint8Array).
 */
export async function generateCerfaPdf(input: CerfaPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = TOP_Y;

  // -----------------------------------------------------------------------
  // 1. En-tête : titre du CERFA en rouge brand
  // -----------------------------------------------------------------------
  page.drawText(sanitizeForHelvetica(cerfaTitle(input.kind)), {
    x: MARGIN_LEFT,
    y,
    size: 14,
    font: fontBold,
    color: BRAND_RED,
  });
  y -= 25;

  // -----------------------------------------------------------------------
  // 2. Sous-titres : AO + acheteur + mandataire éventuel
  // -----------------------------------------------------------------------
  page.drawText(sanitizeForHelvetica(`AO : ${input.tenderTitle}`), {
    x: MARGIN_LEFT,
    y,
    size: 10,
    font,
    color: SUBTITLE_GREY,
  });
  y -= 15;
  page.drawText(sanitizeForHelvetica(`Acheteur : ${input.tenderBuyer}`), {
    x: MARGIN_LEFT,
    y,
    size: 10,
    font,
    color: SUBTITLE_GREY,
  });
  y -= 15;
  if (input.selectedArchitect) {
    page.drawText(sanitizeForHelvetica(`Mandataire : ${input.selectedArchitect.cabinet}`), {
      x: MARGIN_LEFT,
      y,
      size: 10,
      font: fontBold,
      color: BLACK,
    });
    y -= 15;
  }
  if (input.selectedBe) {
    page.drawText(sanitizeForHelvetica(`Candidat (BE cotraitant) : ${input.selectedBe.cabinet}`), {
      x: MARGIN_LEFT,
      y,
      size: 10,
      font: fontBold,
      color: BLACK,
    });
    y -= 15;
  }
  y -= 10;

  // -----------------------------------------------------------------------
  // 3. Séparateur horizontal
  // -----------------------------------------------------------------------
  page.drawLine({
    start: { x: MARGIN_LEFT, y },
    end: { x: PAGE_WIDTH - MARGIN_RIGHT, y },
    thickness: 0.5,
    color: SEPARATOR_GREY,
  });
  y -= 20;

  // -----------------------------------------------------------------------
  // 4. Liste verticale label → valeur, paginée
  // -----------------------------------------------------------------------
  for (const f of input.fields) {
    // Saut de page si on dépasse la zone utile (on garde une marge pour le footer)
    if (y < MIN_Y_BEFORE_BREAK) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = TOP_Y;
    }

    // Label en gras petit
    page.drawText(sanitizeForHelvetica(f.label), {
      x: MARGIN_LEFT,
      y,
      size: 9,
      font: fontBold,
      color: LABEL_GREY,
    });
    y -= 12;

    // Valeur en regular, avec wrap si trop long
    const valueRaw = f.value.trim().length > 0 ? f.value : "—";
    const lines = wrapText(sanitizeForHelvetica(valueRaw), VALUE_WRAP_CHARS);
    for (const line of lines) {
      // Nouvelle page si on dépasse en plein milieu d'un bloc valeur multi-ligne
      if (y < MIN_Y_BEFORE_BREAK) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = TOP_Y;
      }
      page.drawText(line, {
        x: MARGIN_LEFT,
        y,
        size: 10,
        font,
        color: BLACK,
      });
      y -= 12;
    }
    y -= 8;
  }

  // -----------------------------------------------------------------------
  // 5. Footer (bas de la dernière page créée)
  // -----------------------------------------------------------------------
  drawFooter(page, font, input.organizationName, input.generatedAt);

  return await doc.save();
}

/**
 * Écrit la ligne de pied de page sur la page courante.
 *
 * Séparé pour faciliter la lecture et un éventuel test ciblé. La position
 * Y est fixe en bas (30 pt depuis le bas), indépendamment du curseur Y
 * courant — on accepte un léger chevauchement si la page est très dense
 * (cas non observé dans nos fixtures DC1/DC2 actuelles).
 */
function drawFooter(page: PDFPage, font: PDFFont, orgName: string, generatedAt: Date): void {
  const formatted = generatedAt.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const text = sanitizeForHelvetica(
    `Document généré le ${formatted} via edifio Sourcing — ${orgName}`,
  );
  page.drawText(text, {
    x: MARGIN_LEFT,
    y: 30,
    size: 7,
    font,
    color: FOOTER_GREY,
  });
}
