/**
 * Moteur Mustache simple pour les templates `.docx`.
 *
 * Décision Steve 2026-06-03 (chantier B+C) : on n'utilise plus pdf-lib pour
 * générer les CERFA DC1/DC2 (résultat trop éloigné du modèle officiel).
 * À la place, l'admin dépose ses propres modèles `.docx` dans la bibliothèque
 * (catégories `dc1`, `dc2`, `pouvoir_mandataire`) avec des balises Mustache
 * embarquées dans le texte Word :
 *
 *   `{{ archi_cabinet }}`, `{{ ao_objet }}`, `{{ alyos_siret }}`, etc.
 *
 * À la validation CERFA, l'app charge le `.docx` source, remplace les balises
 * par les valeurs réelles, sauve un nouveau `.docx` rempli dans Storage et
 * insère un `response_files` `kind='dc1'|'dc2'`. L'archi peut encore
 * l'éditer/imprimer/signer côté Word.
 *
 * Limitations connues :
 *  - Word peut casser une balise `{{archi_cabinet}}` en plusieurs runs XML
 *    (`<w:r><w:t>{{ar</w:t></w:r><w:r><w:t>chi_cabinet}}</w:t></w:r>`) si
 *    Steve a appliqué un format (gras, souligné…) à une lettre au milieu.
 *    On gère ça via un pré-process « merge runs » qui détecte les balises
 *    fragmentées et les recolle dans un seul `<w:t>` avant le find/replace.
 *  - Pas de support des sections `{{#cond}}…{{/cond}}` (loops/conditionnels).
 *    Steve doit garder ses templates plats. Si besoin un jour : passer à
 *    `docxtemplater` (lib dédiée, ~30 Ko).
 *  - Encodage XML : on n'échappe pas les valeurs en HTML/XML (`<`, `&`, `>`)
 *    car les valeurs métier (noms de cabinets, intitulés d'AO) contiennent
 *    rarement ces caractères. Si une valeur sale est passée, on l'échappe
 *    explicitement (`escapeXml`).
 *
 * Pas de dépendance hors fflate (déjà utilisée par zip-compile.ts).
 */

import { unzipSync, zipSync } from "fflate";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Paramètres Mustache : table des substitutions { token → valeur }.
 *
 * Les clés sont les noms de balises sans accolades. Les valeurs sont
 * sérialisées en string via `String(value)`. `null` et `undefined` →
 * chaîne vide (compatible spec Mustache).
 */
export type DocxFillParams = Record<string, string | number | boolean | null | undefined>;

/**
 * Résultat d'un fill — buffer du .docx rempli + métadonnées de diagnostic.
 */
export interface DocxFillResult {
  /** Buffer du .docx rempli — à uploader Storage ou retourner au client. */
  buffer: Uint8Array;
  /** Nombre de substitutions effectuées. Utile pour audit + sanity check. */
  substitutionCount: number;
  /** Liste des balises qui apparaissent dans le template mais sans param fourni. */
  unknownTokens: string[];
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/**
 * Fichiers internes du .docx à scanner pour le find/replace.
 * `document.xml` contient le corps principal ; les headers et footers sont
 * fréquents (en-tête société, n° de page) et doivent être traités aussi.
 */
const TARGET_FILES_RE =
  /^word\/(document\.xml|header\d*\.xml|footer\d*\.xml|footnotes\.xml|endnotes\.xml)$/;

/**
 * Regex de balise Mustache : `{{ token }}` avec espaces optionnels autour.
 * On accepte alphanum + `_` + `.` (notation pointée pour les futures extensions).
 */
const MUSTACHE_RE = /\{\{\s*([a-zA-Z][\w.]*)\s*\}\}/g;

// ---------------------------------------------------------------------------
// Helpers XML
// ---------------------------------------------------------------------------

const XML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/**
 * Échappe une valeur pour l'insérer dans un attribut ou un nœud texte XML.
 * Append-only — l'ordre du replace `&` doit rester premier pour éviter le
 * double-escape (`&` ne doit pas devenir `&amp;amp;`).
 */
export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => XML_ESCAPE_MAP[c] ?? c);
}

// ---------------------------------------------------------------------------
// Pré-process : recoller les balises {{...}} fragmentées par Word
// ---------------------------------------------------------------------------

/**
 * Word peut fragmenter une chaîne `{{archi_cabinet}}` à travers plusieurs
 * éléments `<w:r>` adjacents si l'auteur a appliqué un format ponctuel
 * (souligné sur une lettre, par exemple). Résultat dans le XML :
 *
 *   `<w:r><w:t>{{ar</w:t></w:r><w:r><w:t>chi_cab</w:t></w:r><w:r><w:t>inet}}</w:t></w:r>`
 *
 * Pour rendre le find/replace robuste, on extrait toutes les paires
 * `<w:t>...</w:t>` (les nœuds texte), on concat leur contenu, on cherche les
 * balises Mustache complètes, et si une balise existe dans le texte concaténé
 * mais pas dans une seule `<w:t>`, on aplatit les runs concernés.
 *
 * Implémentation simplifiée et conservatrice : on supprime toute séquence
 * `</w:t>(?:[^<]*<[^>]*>)*<w:t[^>]*>` à l'intérieur d'une balise potentielle
 * `{{...}}`. Limite : on ne touche pas au format Word — toute la balise est
 * recollée dans le run du premier morceau (logique : si Steve a souligné une
 * lettre au milieu d'une balise, ce n'était sûrement pas voulu).
 *
 * Exporté pour tests.
 */
export function mergeFragmentedMustache(xml: string): string {
  // Détecte une ouverture `{{` qui ne se termine pas par `}}` sur le même
  // run, et coupe le bruit XML entre les deux jusqu'au prochain `}}`.
  //
  // Pattern : `\{\{` + (n'importe quoi sans `}}`) + `\}\}`. Au sein de ce
  // match, on supprime les fragments `</w:t>(?:[^<]+<[^>]+>)*<w:t[^>]*>` qui
  // séparent les morceaux.
  //
  // Note : la regex avec `[\s\S]*?` (non-greedy) garantit qu'on ne match
  // pas deux balises à la fois. Le `(?:...)` interne reconstruit le texte.
  const placeholderSpan = /\{\{[\s\S]*?\}\}/g;
  return xml.replace(placeholderSpan, (span) => {
    // Si le span ne contient aucun tag XML : balise propre, rien à faire.
    if (!/<[^>]+>/.test(span)) return span;
    // Sinon, supprime tous les morceaux XML internes (fermetures + ouvertures
    // de runs et nœuds texte) — on recolle le contenu textuel.
    return span.replace(/<[^>]+>/g, "");
  });
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

/**
 * Remplit un template .docx avec les paramètres fournis et retourne le
 * .docx résultant.
 *
 * @param sourceDocx  Buffer du .docx source (chargé depuis Storage).
 * @param params      Table { token → valeur } pour les substitutions.
 *
 * @throws Si le buffer n'est pas un zip valide ou ne contient pas
 *         `word/document.xml` (impossible que ce soit un .docx).
 */
export function fillDocxTemplate(sourceDocx: Uint8Array, params: DocxFillParams): DocxFillResult {
  const files = unzipSync(sourceDocx);

  // Sanity check : tout .docx Open XML contient word/document.xml.
  if (!files["word/document.xml"]) {
    throw new Error(
      "[docx-fill] word/document.xml absent — le fichier n'est pas un .docx Open XML valide",
    );
  }

  let substitutionCount = 0;
  const unknownTokens = new Set<string>();
  const decoder = new TextDecoder("utf-8");
  const encoder = new TextEncoder();

  // Liste des params normalisés en strings prêts pour insertion XML.
  const normalizedParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      normalizedParams[key] = "";
    } else {
      normalizedParams[key] = escapeXml(String(value));
    }
  }

  const replacedFiles: Record<string, Uint8Array> = {};

  for (const [path, content] of Object.entries(files)) {
    if (!TARGET_FILES_RE.test(path)) {
      // Fichier non textuel (images, styles binaires) → on ne touche pas.
      replacedFiles[path] = content;
      continue;
    }

    const xml = decoder.decode(content);
    const merged = mergeFragmentedMustache(xml);

    // Find/replace de toutes les balises présentes.
    const replaced = merged.replace(MUSTACHE_RE, (_match, token: string) => {
      if (Object.prototype.hasOwnProperty.call(normalizedParams, token)) {
        substitutionCount++;
        return normalizedParams[token]!;
      }
      // Balise inconnue → on la garde telle quelle (le template reste lisible
      // et signale visuellement à Steve qu'il manque un mapping) + on l'ajoute
      // à la liste de diagnostic.
      unknownTokens.add(token);
      return _match;
    });

    replacedFiles[path] = encoder.encode(replaced);
  }

  // Ré-emballage avec fflate. Options par défaut OK (DEFLATE, niveau 6).
  const buffer = zipSync(replacedFiles, { level: 6 });

  return {
    buffer,
    substitutionCount,
    unknownTokens: Array.from(unknownTokens).sort(),
  };
}
