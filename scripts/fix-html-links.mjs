#!/usr/bin/env node
/**
 * Script JETABLE — fix des erreurs ESLint @next/next/no-html-link-for-pages
 * post-codemod Next 15. Convertit <a href="/sourcing/..."> → <Link href="...">
 * sur les 6 fichiers staged.
 *
 * Steve 2026-06-08 — Lot 1 migration vers Next 15.
 */

import { readFileSync, writeFileSync } from "node:fs";

const FILES = [
  "src/app/sourcing/entreprises/[id]/page.tsx",
  "src/app/sourcing/entreprises/page.tsx",
  "src/app/sourcing/entreprises/nouveau/page.tsx",
  "src/app/sourcing/entreprises/nouveau/CompanyCreateForm.tsx",
  "src/app/sourcing/bureaux-etudes/[id]/page.tsx",
  "src/app/sourcing/bureaux-etudes/page.tsx",
  "src/app/sourcing/bureaux-etudes/nouveau/page.tsx",
  "src/app/sourcing/bureaux-etudes/nouveau/BECreateForm.tsx",
  "src/app/sourcing/architectes/[id]/page.tsx",
  "src/app/sourcing/architectes/page.tsx",
  "src/app/sourcing/architectes/nouveau/page.tsx",
  "src/app/sourcing/architectes/nouveau/ArchitectCreateForm.tsx",
];

const IMPORT_LINE = `import Link from "next/link";\n`;

function fixFile(path) {
  let content = readFileSync(path, "utf-8");
  let changes = 0;

  // 1. Add import Link if missing
  if (!content.includes(`from "next/link"`)) {
    // Insert after the first import block — find first blank line after imports
    const lines = content.split("\n");
    let insertIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("import ")) {
        insertIdx = i + 1;
      } else if (insertIdx >= 0 && lines[i].trim() === "") {
        // First blank line after last import
        break;
      }
    }
    if (insertIdx > 0) {
      lines.splice(insertIdx, 0, `import Link from "next/link";`);
      content = lines.join("\n");
      changes++;
    }
  }

  // 2. Replace <a href="/sourcing/...">...</a> with <Link href="/sourcing/...">...</Link>
  // Strategy: replace each <a ...href="/sourcing/..." ...> matched, then find the matching </a>
  // We use a regex that captures a SINGLE <a> opening tag with /sourcing href.
  // The closing </a> is then replaced ONLY for the matched <a>.
  // To stay safe, we do this iteratively, one match at a time.
  while (true) {
    const openMatch = content.match(/<a\s+([^>]*\bhref="\/sourcing\/[^"]*"[^>]*)>/);
    if (!openMatch) break;

    const openTag = openMatch[0];
    const attrs = openMatch[1];
    const openStart = openMatch.index;
    const openEnd = openStart + openTag.length;

    // Find matching </a> by counting depth (in case of nested <a>, which shouldn't happen but be safe)
    let depth = 1;
    let i = openEnd;
    while (i < content.length && depth > 0) {
      const nextOpen = content.indexOf("<a", i);
      const nextClose = content.indexOf("</a>", i);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        // ensure it's an opening <a> tag (not e.g. <article>)
        const charAfter = content[nextOpen + 2];
        if (charAfter === " " || charAfter === ">") {
          depth++;
          i = nextOpen + 2;
        } else {
          i = nextOpen + 2;
        }
      } else {
        depth--;
        if (depth === 0) {
          // Replace this </a> with </Link>
          content =
            content.slice(0, openStart) +
            `<Link ${attrs}>` +
            content.slice(openEnd, nextClose) +
            `</Link>` +
            content.slice(nextClose + 4);
          changes++;
          break;
        }
        i = nextClose + 4;
      }
    }
  }

  if (changes > 0) {
    writeFileSync(path, content, "utf-8");
    console.log(`✓ ${path} : ${changes} changes`);
  } else {
    console.log(`- ${path} : no change`);
  }
}

for (const f of FILES) {
  try {
    fixFile(f);
  } catch (err) {
    console.error(`✖ ${f} : ${err.message}`);
  }
}
