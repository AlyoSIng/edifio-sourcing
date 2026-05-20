# REQUEST — Brief visuel logo `edifio` + livraison asset source SVG manquant

**Date** : 2026-05-20 11:00
**De** : Steve (Board) via Alex (dev)
**Pour** : Théo (Graphiste), CC Marc (CEO), Steve (Board), Léa (CMO)
**Référence** : `src/components/EdifioLogo.tsx` + `design/pwa_icons_spec.md` (+ `design/pwa_manifest_v1.json`)
**Échéance souhaitée** : non bloquante au sens dev (le composant React rend déjà quelque chose), mais à clore **avant Gate 7** (custom domain `sourcing.alyosingenierie.fr`) — au-delà, le favicon / les icons PWA seront visibles publiquement et figés dans le manifest installable
**Priorité** : moyenne (P1) — pas de blocker MVP, mais bloque la propreté brand de la première install PWA

## Contexte

Le pivot du 2026-05-10 a stabilisé la marque : `edifio` en lowercase strict, composition « edifio Sourcing », fratrie `edifio Suivi` / `edifio AO` / `edifio ACT` / `edifio Sourcing`, éditeur `AlyoS Ingénierie` (S majuscule final). Le footer applicatif (`© AlyoS Ingénierie {year} — Outil interne`) est conforme côté code (cf. `CLAUDE.md` §Identité de marque).

Le composant `src/components/EdifioLogo.tsx` rend actuellement un **inline SVG** : pin noir + cercle rouge `#FF0033` + wordmark « edifio ». Il est consommé sur 4 routes publiques + protégées : `/`, `/login`, `/about`, `/forbidden`. Aucun brief visuel signé par Théo + Léa + Marc n'a été versionné dans `/design/` à ce jour — le rendu actuel est une **interprétation dev** datant du bootstrap Gate 6.

En parallèle, `design/pwa_icons_spec.md` documente une source vector `design/edifio-pin-source.svg` qui **n'a jamais été committée** dans le repo. Conséquence côté PWA : le manifest `design/pwa_manifest_v1.json` référence `/icons/icon-72.png` … `/icons/icon-512.png` + `apple-touch-icon.png` + `favicon.svg` qui n'existent pas dans `public/`. Toute installation PWA renvoie aujourd'hui un fallback Next.js par défaut.

## Problème #1 — Rendu visuel actuel non validé Board

Steve a flagué que « le logo n'est toujours pas bon ». Le rendu inline SVG du composant React ne reflète probablement pas le brief Théo final — il a été produit côté dev sans aller-retour graphiste. À ce stade il manque le brief signé Théo (vision graphique) + Léa (cohérence brand / CMO) + Marc (validation finale).

**Ce qu'on demande à Théo** : fournir le brief visuel définitif, idéalement dans `design/brief_logo_edifio_v1.md`, incluant a minima :

- Palette : code hex précis du rouge (le `#FF0033` actuel est-il le bon ? préciser le noir : `#000000` strict ou un quasi-noir type `#0A0A0A` ?), version monochrome (full noir / full blanc) pour usages restreints.
- Typo : police du wordmark « edifio » (famille, graisse, tracking, vectorisation glyphes au build pour éviter dépendance fonts.googleapis — cf. règle self-host Gate 5).
- Proportions : ratio pin / wordmark, espacement, exclusion zone autour du logo.
- Variants : (1) logo isolé (pin seul, pour favicon / app icon), (2) logo accompagné du wordmark `edifio` (header public), (3) variante fond clair, (4) variante fond foncé.
- Composition « edifio Sourcing » : règle de cohabitation wordmark `edifio` + suffixe `Sourcing` (typo, graisse, séparation visuelle ?).

## Problème #2 — Asset source SVG manquant + dérivés PWA non générés

`design/pwa_icons_spec.md` attend `design/edifio-pin-source.svg` comme **source unique** pour générer le favicon multi-résolutions + les icons PWA. Ce fichier n'a jamais été livré.

**Ce qu'on demande à Théo** :

1. **Commit `design/edifio-pin-source.svg`** : vector source propre, viewBox normalisé, layers nommés (`pin`, `dot`, `wordmark` si inclus), fonts vectorisées (paths, pas de `<text>` dépendant d'une font système), aucune ref à `fonts.googleapis.com`.
2. **Livraison des dérivés PNG** dans `public/icons/icon-{72,96,128,144,152,192,384,512}.png` (résolutions standard manifest PWA, cf. `design/pwa_manifest_v1.json`).
3. **Livraison `public/favicon.svg`** (SVG aplati, optimisé `svgo`, < 4 KB cible).
4. **Livraison `public/apple-touch-icon.png`** 180x180, fond opaque (iOS n'aime pas la transparence sur l'app icon).

**Ordre logique** : si le rendu visuel doit changer (Problème #1), traiter d'abord le brief, **puis** livrer un asset cohérent avec le brief signé. Pas de livraison d'asset PWA sur un rendu non validé.

## Sortie attendue

Une réponse Cowork dans `/handoff/RESPONSE_AAMMJJ_HHMM_LOGO_EDIFIO_BRIEF.md` qui tranche :

- Confirmation ou modification du rendu visuel actuel (couleurs hex, forme du pin, typo wordmark, variants fond clair / foncé / mono).
- Brief visuel committé dans `design/brief_logo_edifio_v1.md` (signé Théo + Léa + Marc).
- Commit direct des assets dans `design/edifio-pin-source.svg` + `public/icons/icon-*.png` + `public/favicon.svg` + `public/apple-touch-icon.png` — **ou** indication d'une branche dédiée Théo si préférence (ex. `chore/brand-logo-assets`) que Steve pourra rebaser sur `feat/sourcing-mvp`.

Après réception, Steve ouvrira PR `chore(brand): mise à jour logo + assets PWA` côté dev pour synchroniser le composant `src/components/EdifioLogo.tsx` avec le brief signé et brancher le manifest PWA sur les nouveaux assets.

## Hors scope de ce handoff

- Custom domain `sourcing.alyosingenierie.fr` — sujet Gate 7, traité séparément.
- Animations / motion design du logo (hover, transitions, loader animé) — Phase 2.
- Refonte graphique des autres modules fratrie (`edifio Suivi`, `edifio AO`, `edifio ACT`) — chaque module pilote sa propre déclinaison.

## Garde-fous

- Pas de commit / push côté Alex sur ce handoff : Yann (`ps_operator`) reprendra pour committer + push sur `feat/sourcing-mvp` (convention handoff Cowork).
- Aucune modification d'`EdifioLogo.tsx` ni de `design/pwa_icons_spec.md` côté dev tant que le brief Théo n'est pas signé — c'est Théo qui pilote le sujet brand, dev ne fait qu'intégrer.
