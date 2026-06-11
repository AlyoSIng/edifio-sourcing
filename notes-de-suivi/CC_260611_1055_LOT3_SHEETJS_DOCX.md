# CC 2026-06-11 10:55 — Lot 3 migration : exceljs → sheetjs + verdict moteur docx

**Agent** : Alex (dev) · **Branche** : `feat/lot3-sheetjs-docx` (depuis `main` 35b84db) · **Push** : Yann après review.

## Fait

1. **Inventaire** : exceljs réellement utilisé dans UN seul module —
   `src/lib/dossier/references-table-filter.ts` (filtre tableau Excel maître des
   références, chantier R) + son test. L'export CSV « AO du jour »
   (`export-actions.ts`) ne mentionnait exceljs qu'en commentaire (aucun import).
2. **Réécriture** : `references-table-filter.ts` porté de `exceljs@4.4.0` vers
   `xlsx@0.20.3` (tarball CDN SheetJS — version identique au monorepo
   `alyos-suivi-chantier`). Signature publique, colonnes, format de sortie et
   messages d'erreur inchangés. Perte cosmétique unique : en-tête de sortie plus
   en gras (SheetJS CE n'écrit pas les styles). Test 11 scénarios adapté
   (fixtures SheetJS, assertions identiques). `exceljs` retiré du package.json.
3. **Verdict moteur docx Mustache maison** : PORTABLE TEL QUEL, non touché.
   `docx-fill.ts` ne dépend que de `fflate` (zip pur JS, zéro dep transitive).
   ⚠️ `fflate` absent du package.json monorepo → à ajouter en vague 2 (requis de
   toute façon par `zip-compile.ts`). docxtemplater/pizzip du monorepo : non
   nécessaires pour nos modules.

## Validations

- `tsc --noEmit` : 0 erreur
- vitest module : 11/11 verts
- vitest suite complète : 84 fichiers / 1288 tests verts
- `next lint` : 0 warning · `next build` : OK

## Reste à faire

- Review Hugo + push Yann (commits locaux sur `feat/lot3-sheetjs-docx`)
- Vague 2 portage : ajouter `fflate@^0.8.3` au package.json monorepo
