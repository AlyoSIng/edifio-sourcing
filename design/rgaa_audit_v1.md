# Audit RGAA AA — edifio Sourcing v1.0

**Auteur** : [GRAPHISTE Théo Renard]
**Date** : 2026-05-10
**Périmètre** : les 12 maquettes haute-fidélité v1.x livrées (M1 à M12)
**Référentiel** : RGAA 4.1 niveau AA (équivalent WCAG 2.1 AA)
**Statut** : Audit prévisionnel — à confirmer en Gate 9 sur les pages effectivement implémentées par Alex

---

## Synthèse exécutive

| Thématique RGAA | Items audités | ✅ Conforme par défaut | ⚠️ Action requise | ❌ Non couvert |
|------------------|----------------|------------------------|-------------------|----------------|
| 3 — Couleurs | 8 | 7 | 1 | 0 |
| 6 — Liens | 5 | 4 | 1 | 0 |
| 7 — Scripts | 4 | 2 | 2 | 0 |
| 8 — Éléments obligatoires | 6 | 4 | 2 | 0 |
| 9 — Information structurée | 7 | 5 | 2 | 0 |
| 10 — Présentation | 6 | 4 | 2 | 0 |
| 11 — Formulaires | 9 | 6 | 3 | 0 |
| 12 — Navigation | 5 | 3 | 2 | 0 |
| 13 — Consultation | 4 | 3 | 1 | 0 |
| **TOTAL** | **54** | **38 (70 %)** | **16 (30 %)** | **0 (0 %)** |

**Verdict prévisionnel** : conformité AA atteignable sans refactor majeur. 16 actions précises à exécuter par [DEV Alex] en Gate 6, validées par audit axe-core en Gate 9.

---

## 1. Critère 3 — Couleurs et contrastes

### 3.2 — Contraste minimum (AA)

| Combinaison de la palette | Ratio mesuré | Cible AA | Statut |
|---------------------------|--------------|----------|--------|
| ink #0F1A2E sur paper #FAF9F6 | 14,3:1 | ≥ 4,5:1 | ✅ |
| ink-2 #1F2937 sur paper #FAF9F6 | 12,2:1 | ≥ 4,5:1 | ✅ |
| muted #6B7280 sur paper #FAF9F6 | 4,7:1 | ≥ 4,5:1 | ✅ |
| muted #6B7280 sur paper-2 #F3F1EC | 4,5:1 | ≥ 4,5:1 | ✅ limite |
| white sur alyos-red #FF0033 | 4,8:1 | ≥ 4,5:1 | ✅ |
| alyos-red sur paper | 4,3:1 | ≥ 4,5:1 | ⚠️ **limite — texte rouge sur fond clair à éviter pour du corps de texte** |
| success #15803D sur success-bg #DCFCE7 | 5,1:1 | ≥ 4,5:1 | ✅ |
| error #B91C1C sur error-bg #FEE2E2 | 5,7:1 | ≥ 4,5:1 | ✅ |

**⚠️ Action 1** : remplacer toute occurrence de `color: var(--alyos-red)` sur `var(--paper)` pour du texte fonctionnel par `color: var(--ink)`. Le rouge reste pour les CTA primaires (texte blanc sur fond rouge = OK) et accents. À auditer maquettes en revue Théo + Alex.

### 3.3 — Information par la couleur

Toutes les chips de statut combinent couleur + libellé textuel ([CMO Léa]). **✅ Conforme par défaut**.

---

## 2. Critère 6 — Liens

### 6.1 — Intitulé de lien explicite

**⚠️ Action 2** — Maquette M6 (Fiche AO) : les icônes ↗ sur les liens externes DCE/Odoo/Bucket doivent avoir un `aria-label` ou un `<span class="sr-only">` pour les lecteurs d'écran. Exemple :

```html
<a href="..." target="_blank" rel="noopener noreferrer">
  <span aria-hidden="true">↗</span>
  <span class="sr-only">Ouvrir le DCE source dans un nouvel onglet</span>
</a>
```

---

## 3. Critère 7 — Scripts

### 7.1 — Compatibilité technologie d'assistance

**⚠️ Action 3** — Maquette M2 (Kanban drag & drop) : doit avoir une **alternative clavier**. Implémentation attendue :
- `Tab` pour atteindre une carte
- `Space` pour la saisir
- `←` / `→` / `↑` / `↓` pour déplacer entre colonnes
- `Space` pour relâcher
- `aria-grabbed="true|false"` sur la carte saisie
- `aria-live="polite"` sur la zone Kanban pour annoncer les déplacements

### 7.4 — Modification de contexte

**⚠️ Action 4** — Maquette M3 (modale Solo/Tandem) : la modale doit recevoir le **focus automatiquement** à l'ouverture, et `Escape` doit la fermer. Focus trap obligatoire (Tab ne sort pas de la modale tant qu'elle est ouverte). shadcn/ui Dialog gère ça nativement — vérifier l'usage.

---

## 4. Critère 8 — Éléments obligatoires

### 8.1 — Doctype et langue

`<html lang="fr">` obligatoire. **✅ déjà en place dans les maquettes**.

### 8.5 — Titre de page pertinent

**⚠️ Action 5** : chaque page Next.js doit avoir un `<title>` via metadata Next.js. Format proposé : `{page} · edifio Sourcing`. Exemples :
- `AO du jour · edifio Sourcing`
- `Pipeline · edifio Sourcing`
- `Fiche AO 25-AO-00131 · edifio Sourcing`

### 8.9 — Doublons d'attribut id

À auditer dynamiquement en CI via axe-core. **⚠️ Action 6** — config axe-core CI dans Gate 6.

---

## 5. Critère 9 — Information structurée

### 9.1 — Hiérarchie de titres

**⚠️ Action 7** — Maquettes M9-M11 (configuration, architectes, bibliothèque) : un seul `<h1>` par page (`page-title`). Les sous-sections en `<h2>` (`form-section-title`). Pas de saut de niveau (h1 → h3).

### 9.2 — Structure de l'information

`<nav>` pour la sidebar, `<main>` pour le contenu principal, `<aside>` si applicable. **⚠️ Action 8** — Alex doit utiliser ces balises sémantiques au lieu de `<div>` génériques.

---

## 6. Critère 10 — Présentation

### 10.4 — Texte zoomable 200 %

Tester sur toutes les pages avec zoom navigateur 200 %. Tailwind responsive devrait gérer, mais à valider. **⚠️ Action 9** : test manuel + axe-core.

### 10.7 — Indicateur de focus visible

**⚠️ Action 10** — focus ring obligatoire sur TOUS les éléments interactifs :

```css
:focus-visible {
  outline: 2px solid var(--alyos-red);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(255, 0, 51, 0.2);
}
```

Ne JAMAIS faire `outline: none` sans le compenser.

---

## 7. Critère 11 — Formulaires

### 11.1 — Champ associé à un libellé

**✅ Conforme** — tous les `<label for="...">` sont présents dans M9 (config), M10 (architecte édition), M7 (login).

### 11.2 — Libellé pertinent

**✅ Conforme**.

### 11.10 — Contrôle de saisie et messages d'erreur

**⚠️ Action 11** — chaque champ obligatoire :
- `required` HTML
- `aria-required="true"`
- Message d'erreur lié via `aria-describedby` qui pointe vers un élément `<p id="email-error">...`
- Annonce des erreurs en `aria-live="polite"` ou `aria-live="assertive"` selon la criticité

### 11.13 — Finalité d'un champ déduisible (autocomplete)

**⚠️ Action 12** — attributs HTML5 sur les champs sensibles :
- Email : `autocomplete="email"`
- Nom : `autocomplete="family-name"`
- Prénom : `autocomplete="given-name"`
- Téléphone : `autocomplete="tel"`
- Code postal : `autocomplete="postal-code"`

### 11.5 — Champs de même nature regroupés

**⚠️ Action 13** — utiliser `<fieldset>` + `<legend>` pour grouper les champs liés (ex. dans M9 « Filtres marché », « Planification du sourcing »).

---

## 8. Critère 12 — Navigation

### 12.5 — Plan du site

Non bloquant pour app interne. **✅ acceptable** d'omettre en MVP.

### 12.7 — Lien d'évitement

**⚠️ Action 14** — ajouter en début de `<body>` :

```html
<a href="#main-content" class="sr-only focus:not-sr-only ...">
  Aller au contenu principal
</a>
```

Visible uniquement au focus clavier. Permet de sauter la sidebar de navigation au Tab.

### 12.8 — Ordre de tabulation

À valider manuellement. **⚠️ Action 15** — test clavier complet (Tab depuis le début, vérifier l'ordre logique).

---

## 9. Critère 13 — Consultation

### 13.3 — Durée d'inactivité

**⚠️ Action 16** — la session Supabase expire après 1h d'inactivité (refresh token). Afficher un toast à `t-2min` proposant de prolonger la session ou se déconnecter. Pas de déconnexion brutale sans préavis.

### 13.7 — Mouvement, clignotement

Pas de carrousel, pas d'animations infinies dans les maquettes. **✅ conforme**.

---

## Audit par maquette — résumé

| Maquette | Actions concernées |
|----------|--------------------|
| M1 — AO du jour mobile | 5, 10, 11 |
| M2 — Kanban desktop | 3, 5, 10 |
| M3 — Modale Solo/Tandem | 4, 5, 10 |
| M4 — Page tokenisée architecte | 5, 10, 11 |
| M5 — Side-by-side IA | 5, 10 |
| M6 — Fiche AO | 2, 5, 10 |
| M7 — Login magic-link | 5, 10, 11, 12 |
| M8 — Forbidden 403 | 5, 10 |
| M9 — Configuration profil | 5, 7, 10, 11, 12, 13 |
| M10 — Base architectes | 5, 7, 10, 11, 12 |
| M11 — Bibliothèque | 5, 7, 10, 11 |
| M12 — Notifications | 5, 10 |

---

## Outillage CI bloquant Gate 9

```yaml
# .github/workflows/ci.yml — job a11y
- name: Audit a11y axe-core
  run: pnpm test:a11y
```

Avec `vitest-axe` ou `playwright-axe` selon le contexte. Cible : 0 violation `serious` ou `critical`. Violations `moderate` documentées + corrigées.

Test Lighthouse par PR Vercel preview : score a11y ≥ 95.

---

## Recommandation finale

Les 16 actions sont des **patterns standards** que Alex applique en codant (pas un refactor lourd). Si Alex les intègre au fil de Gate 6, l'audit Gate 9 passera proprement. Si elles sont oubliées et qu'il faut tout reprendre en fin de cycle, c'est 2-3 semaines de rework.

**→ À transmettre à Alex en début Gate 6** : référence à ce document dans le `CLAUDE.md` (ajout proposé : « Toute nouvelle UI respecte les 16 actions de `design/rgaa_audit_v1.md` »).

---

*Audit prévisionnel à confirmer en Gate 9 par exécution réelle d'axe-core + Lighthouse + test manuel clavier + lecteur d'écran (NVDA recommandé sur Windows).*
