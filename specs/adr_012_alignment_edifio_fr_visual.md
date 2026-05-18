# ADR-012 — Alignement visuel sur edifio.fr (audit + patterns marketing)

**Statut** : Acté Cowork 2026-05-14
**Date** : 2026-05-14
**Auteurs** : [GRAPHISTE Théo] + [CTO Sophie]
**Contexte** : demande Board *(« la typo et les images/logos doivent respecter la charte d'edifio.fr »)*

---

## Contexte

Le Board a soulevé une suspicion de divergence visuelle entre les maquettes edifio Sourcing et le site live `edifio.fr`. Audit live mené le 2026-05-14 via inspection DOM + CSS computed sur la homepage edifio.fr.

## Résultat de l'audit — bases du DS

**Verdict : aucun écart sur les fondamentaux.**

| Token | tokens.json | edifio.fr live | Match |
|-------|-------------|----------------|-------|
| Background page | `paper #FAF9F6` | `rgb(250, 249, 246)` | ✅ |
| Texte principal | `ink #0F1A2E` | `rgb(15, 26, 46)` | ✅ |
| Accent rouge marque | `alyos-red #FF0033` | `rgb(255, 0, 51)` | ✅ |
| Bordures | `line #E2DFD6` | `rgb(226, 223, 214)` | ✅ |
| Font titres | `Space Grotesk, sans-serif` | idem | ✅ |
| Font body | `Inter, system-ui` | idem | ✅ |
| CTA primary bg | `alyos-red #FF0033` + text white | idem | ✅ |
| CTA primary padding | `11px 20px` | idem | ✅ |
| CTA primary radius | `6px` | idem | ✅ |
| CTA primary font | `14px / 600` | idem | ✅ |
| CTA secondary | outline + border `line` + radius `6px` | idem | ✅ |

→ Le tokens.json initial (Gate 3, source `edifio-design-system.html`) reflète fidèlement la charte live.

## Résultat de l'audit — patterns manquants

Trois patterns marketing edifio.fr **non documentés** dans notre DS (parce que nos maquettes Phase 1 ciblaient l'app interne, pas une landing marketing) :

### Pattern 1 — Pill « eyebrow » rose pâle

Visible sur edifio.fr : `SUITE LOGICIELLE POUR LES MOE`, `NOTRE SUITE`, `DISPONIBLE`, etc. — petits badges au-dessus des sections.

- Background : `#FFE5EA` *(rose pâle, alyos-red à ~10% opacité)*
- Color : `#C8002A` *(rouge un peu plus foncé que `alyos-red`, contraste AA garanti sur ce fond)*
- Font : Space Grotesk / Inter (selon contexte) **700**, **uppercase**, **letter-spacing tracked**
- Padding compact, border-radius full *(forme pilule)*

**Décision** : ajouter ces deux couleurs comme tokens `color.marketing-pill.bg` et `color.marketing-pill.color` dans `tokens.json`.

```css
.pill-eyebrow {
  display: inline-block;
  background: var(--marketing-pill-bg, #FFE5EA);
  color: var(--marketing-pill-color, #C8002A);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  padding: 6px 14px;
  border-radius: 999px;
}
```

### Pattern 2 — H1 marketing format « hero »

Sur edifio.fr, les H1 hero font **52px** avec **letter-spacing -1.5px** et **line-height 1.05**. C'est ce qui donne l'impression de titres « grands et impressionnants ».

Nos maquettes utilisent 32px pour les page-titles d'app interne (`/sourcing/ao-du-jour` etc.) — c'est cohérent pour l'app, mais inadapté pour une page d'accueil ou un écran de connexion.

**Décision** : ajouter token `font.size.marketing-h1: 52px` + `letter-spacing.marketing-h1: -1.5px` dans `tokens.json`.

Et appliquer ce scale aux **pages publiques** d'edifio Sourcing :
- `/` *(page d'accueil avec CTA « Accéder à edifio Sourcing »)*
- `/login`
- `/forbidden`
- `/auth/error` *(nouvelle page à venir cf. ADR-011)*

### Pattern 3 — H1 « split-color » (deux lignes, deuxième en rouge)

Sur edifio.fr :
```html
<h1>
  <span>Le suivi de chantier qui</span><br>
  <span style="color: #FF0033">libère vos vendredis soir.</span>
</h1>
```

Pattern éditorial signature de la marque. Effet « phrase à punchline rouge ».

**Décision** : documenter ce pattern pour la future landing publique edifio Sourcing. Adapter le H1 :

```
<h1>
  De l'avis publié à l'opportunité gagnée,
  <br>
  <span class="text-alyos-red">sans rien tenir à la main.</span>
</h1>
```

*(Cf. `01_CADRAGE_260507_v1_1.pdf` page 3 — version slogan déjà validée Gate 1)*

## Conséquences

### Mise à jour `tokens.json` *(faite dans ce batch)*

- Ajout `color.marketing-pill.bg` et `color.marketing-pill.color`
- Ajout `font.size.marketing-h1` (52px)
- Ajout `letter-spacing.marketing-h1`, `letter-spacing.marketing-h2`, `letter-spacing.wordmark`

### Maquettes existantes — pas de modification nécessaire

Les 12 maquettes Phase 1 *(M1 à M14)* sont **des écrans d'app interne**, pas marketing. Elles peuvent garder leurs tailles typo actuelles.

### Travaux à programmer

| Quand | Quoi |
|-------|------|
| Gate 6 (Alex) | Implémenter classe CSS `.pill-eyebrow` dans `src/styles/globals.css` ou `tailwind.config.ts` |
| Gate 6 (Alex) | Appliquer `.marketing-h1` scale à `/login`, `/forbidden`, `/auth/error` |
| Gate 7 (Théo) | Produire **Maquette M15** — Page d'accueil publique avec pattern hero edifio.fr |
| Gate 9 (Léa) | Vérifier que la page `/about` utilise bien tous ces patterns |

### Pas de régression visuelle

Les nouveaux tokens **s'ajoutent**, ils ne remplacent pas les existants. Aucune régression sur les 14 maquettes actuelles ni sur l'app interne en cours de codage.

## Alternatives rejetées

- **« Refondre tous les écrans en scale marketing »** : non, l'app interne a sa propre logique de densité d'information (Kanban, Side-by-side IA) qui ne supporte pas des titres 52px partout.
- **« Forcer une font différente »** : non, edifio.fr utilise exactement notre stack (Space Grotesk + Inter). Le diagnostic du Board *(« la typo doit respecter edifio.fr »)* était fondé sur une perception, pas sur une vraie divergence technique.

---

*ADR-012 acté. Tokens.json mis à jour. Maquette M15 marketing à produire par Théo en Gate 7 quand le besoin sera concret.*
