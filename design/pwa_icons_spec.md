# Spec des icônes PWA — edifio Sourcing v1.0

**Auteur** : [GRAPHISTE Théo Renard]
**Date** : 2026-05-10
**Usage** : à fournir à [DEV Alex] pour intégration dans `public/icons/`

---

## Source maître

**SVG vectoriel** du logo edifio (pin rouge + intérieur blanc + cercle central rouge), tel que défini dans `edifio-design-system.html` et `tokens.json`.

```svg
<svg viewBox="0 0 20 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M 10 0 C 16 0 20 4 20 10 C 20 17 10 24 10 24 C 10 24 0 17 0 10 C 0 4 4 0 10 0 Z" fill="#FF0033"/>
  <circle cx="10" cy="10" r="4" fill="#FFFFFF"/>
  <circle cx="10" cy="10" r="2" fill="#FF0033"/>
</svg>
```

---

## Déclinaisons à produire

| Format | Tailles à générer | Usage |
|--------|-------------------|-------|
| **PNG transparent** | 72, 96, 128, 144, 152, 192, 384, 512 | manifest.json icons (Android + Chrome) |
| **PNG « maskable »** (safe zone 80 %) | 192, 512 | Android adaptative icons |
| **Apple touch icon PNG** | 180×180 | iOS home screen |
| **Favicon ICO** | 16, 32, 48 combinés | onglet navigateur |
| **Favicon SVG** | vectoriel | onglet (Chrome/Firefox récents) |
| **Splashscreens** | 9 tailles iPhone + 6 tailles iPad | écran de démarrage iOS PWA |
| **Open Graph image** | 1200×630 | partage sur Slack/Teams/email |

---

## Règles de composition

### Icônes carrées (192, 512, etc.)

- Fond **paper #FAF9F6** plein (pas transparent dans les versions maskable)
- Pin edifio centré, occupant **60 % de la hauteur** du canvas
- Marge intérieure (safe zone) **20 % de chaque côté** pour les versions « maskable »

### Apple touch icon (180×180)

- Identique aux maskable, mais coins **droits** (iOS arrondit automatiquement)
- Fond paper plein

### Splashscreens iOS

- Fond **paper #FAF9F6**
- Pin edifio + wordmark `edifio Sourcing` centrés
- Pas de bouton, pas de texte additionnel — iOS impose une image statique

### Open Graph image

- Fond ink #0F1A2E
- Pin edifio (taille 80px) + wordmark blanc `edifio Sourcing` en Space Grotesk 64px
- Petit baseline en bas : `Sourcing AO public BTP + Cotraitance + IA · AlyoS Ingénierie` en muted

---

## Génération recommandée

Avec [DEV Alex] : utiliser **`pwa-asset-generator`** (npm package) sur le SVG source pour générer toutes les déclinaisons en une commande.

```bash
npx pwa-asset-generator design/edifio-pin-source.svg public/icons \
  --background "#FAF9F6" \
  --padding "20%" \
  --opaque true \
  --maskable true \
  --favicon true \
  --type png
```

Générer ensuite manuellement l'Open Graph image (Figma ou design tool) car le rendu typo nécessite du contrôle visuel.

---

## Vérification

Avant merge :
- [ ] Lighthouse PWA score 100 sur Vercel preview
- [ ] Test installation sur iOS Safari (vérifier le splashscreen au lancement)
- [ ] Test installation sur Android Chrome (vérifier l'icône maskable rognée par le launcher)
- [ ] Test desktop Chrome / Edge (vérifier le titre de fenêtre + icône taskbar)

---

*L'asset SVG source `design/edifio-pin-source.svg` sera produit par Théo et committé dans le repo en début Gate 6 par [DEV Alex] via PR.*
