#!/usr/bin/env node
/**
 * Script JETABLE — propage `await` devant `createSupabaseServerClient()`
 * sur tous les call sites identifiés par typecheck (146 sites).
 *
 * Steve 2026-06-08 — Lot 1.5 fix Alex (sub-agent dev) qui avait omis la
 * propagation après refactor du helper en async.
 *
 * Pattern matché : `createSupabaseServerClient()` non précédé de `await `.
 *
 * Limites :
 *  - Suppose que toutes les fonctions parentes sont déjà async (cas dans
 *    Sourcing : tous les Server Components, Server Actions, Route Handlers
 *    sont async by design).
 *  - Si une erreur typecheck reste après run, fix manuel.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// Find all files with `createSupabaseServerClient()` not already preceded by await
const grepCmd =
  'grep -rln "createSupabaseServerClient" src/ --include="*.ts" --include="*.tsx"';
const filesRaw = execSync(grepCmd, { encoding: "utf-8" });
const files = filesRaw
  .trim()
  .split(/\r?\n/)
  .filter((f) => f && !f.includes("src/lib/supabase/server.ts"));

let totalChanges = 0;
let touchedFiles = 0;

for (const path of files) {
  let content = readFileSync(path, "utf-8");
  // Match `createSupabaseServerClient()` NOT preceded by `await `
  // Use negative lookbehind: (?<!await )createSupabaseServerClient\(\)
  const before = content;
  content = content.replace(
    /(?<!await )createSupabaseServerClient\(\)/g,
    "await createSupabaseServerClient()",
  );
  if (content !== before) {
    const matches = (before.match(/(?<!await )createSupabaseServerClient\(\)/g) || []).length;
    writeFileSync(path, content, "utf-8");
    totalChanges += matches;
    touchedFiles++;
    console.log(`✓ ${path} : ${matches} changes`);
  }
}

console.log(`\nTotal : ${totalChanges} await ajoutés dans ${touchedFiles} fichiers`);
