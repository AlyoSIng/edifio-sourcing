# REQUEST — Open Graph image landing edifio Sourcing

**Date** : 2026-05-22
**Émetteur** : Alex (`dev`) via Claude Code, sur instruction Board (B3)
**Destinataire** : Graphiste Théo (Cowork)
**Urgence** : 🟢 non bloquante (placeholder OK en attendant)
**PR associée** : `feat/refonte-landing-public-pages` (landing M15 implémentée)

## Contexte

La landing publique edifio Sourcing (`/`) a été refondue selon M15 (commit de cette PR). Le metadata Open Graph est câblé dans `src/app/layout.tsx` :

```ts
openGraph: {
  title: "edifio Sourcing",
  description: "AO publics, du sourcing au pli",
  type: "website",
  locale: "fr_FR",
  images: [{ url: "/og-image-placeholder.png", width: 1200, height: 630, alt: "edifio Sourcing" }],
}
```

L'image `public/og-image-placeholder.png` **n'existe pas encore**. À fournir par Théo.

## Demande

Production d'une image OG `public/og-image-landing.png` (à renommer ultérieurement si besoin) :

- **Dimensions** : 1200×630 px (standard Twitter Card large + Open Graph)
- **Format** : PNG (poids < 200 KB recommandé pour performance partage)
- **Palette DS** : `--paper` `#FAF9F6` (fond) + `--ink` `#0F1A2E` (typo) + `--brand-red` `#FF0033` (accent)
- **Polices** : Space Grotesk (titre) + Inter (sous-titre)
- **Contenu suggéré** :
  - Logo edifio en haut à gauche
  - Titre central : « edifio Sourcing »
  - Sous-titre : « AO publics, du sourcing au pli » (tagline validée Board 2026-05-10)
  - Petite signature en bas : « par AlyoS Ingénierie »
- **Style** : aligné M15 marketing (pill eyebrow + ton produit), pas trop chargé (lecture mobile)

## Référence

- Tagline Board : `DECISIONS.md` entrée 2026-05-10 « Tagline produit edifio Sourcing »
- Patterns marketing edifio : `specs/adr_012_audit_visuel_edifio_fr.md` (si existe)
- Maquette M15 implémentée : `design/maquettes/maquettes_v3_landing.html`

## Suite

1. Théo dépose le fichier dans `/public/og-image-landing.png`
2. Yann commit dans une PR séparée (`chore(landing): pose og image landing`)
3. Met à jour `src/app/layout.tsx` : `url: "/og-image-landing.png"` (au lieu de `placeholder`)
4. Optionnel : test via https://www.opengraph.xyz ou Twitter Card Validator

Pas urgent — placeholder cosmétique fonctionnel en attendant.
