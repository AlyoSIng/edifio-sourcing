# REQUEST — Contenu profil utilisateur : Formations, FAQ, Démo, Plaquette, Roadmap

**Date** : 2026-05-27  
**De** : Alex (dev) → Board Cowork  
**Priorité** : Normale — débloque les modules profil utilisateur en prod  
**Contexte** : Les pages `/sourcing/profil/formations`, `/profil/faq`, `/profil/demo` sont
implémentées et déployées. La base de données est prête (tables `formations`, `faq_items`,
`app_content`). Il manque uniquement le **contenu** pour les alimenter.

---

## Ce qu'on attend de Cowork

### 1. Formations (table `formations`)

Pour chaque fiche de formation, fournir :

| Champ | Type | Exemple |
|-------|------|---------|
| `title` | Texte (max 300 car.) | "Prendre en main edifio Sourcing" |
| `description` | Texte libre | "Découvrez les fondamentaux de l'outil en 10 min." |
| `url` | URL | Lien YouTube, Google Drive, Notion… |
| `type` | `video` / `doc` / `external` | `video` |
| `duration_min` | Entier (minutes) | `10` |
| `display_order` | Entier (ordre d'affichage) | `1`, `2`, `3`… |

**Format de rendu** : tableau Markdown ou fichier CSV joint au commit, ou directement
saisi via l'interface superadmin une fois `/superadmin/formations` déployé (Phase 5 en cours).

---

### 2. FAQ (table `faq_items`)

Pour chaque entrée FAQ, fournir :

| Champ | Type | Exemple |
|-------|------|---------|
| `question` | Texte (max 500 car.) | "Comment inviter un collaborateur ?" |
| `answer` | Texte libre | "Rendez-vous dans Admin > Utilisateurs > Créer un compte…" |
| `category` | Texte libre | `general` / `sourcing` / `tandem` / `compte` |
| `display_order` | Entier | `1`, `2`… |

**Suggestion de catégories** : `general`, `sourcing`, `tandem`, `compte`, `facturation`

---

### 3. Démo vidéo (clé `app_content.demo_video_url`)

Une seule URL — peut être :
- Lien YouTube (embed automatique)
- Fichier `.mp4` hébergé (Google Drive direct, Vimeo…)
- Lien externe (affiché comme lien de téléchargement)

→ Coller l'URL dans le superadmin : `/sourcing/superadmin` (module à créer pour demo — 
ou directement via `/profil/demo` qui lit la clé `demo_video_url`).

---

### 4. Plaquette commerciale (clé `app_content.pitch_pdf_url`)

PDF de la plaquette commerciale edifio Sourcing.  
→ Héberger le PDF (Google Drive "partager → lien public" ou Dropbox) et coller l'URL
dans le superadmin : `/sourcing/superadmin/pitch`.

---

### 5. Roadmap produit (clé `app_content.roadmap_pdf_url`)

PDF de la roadmap produit edifio Sourcing.  
→ Même procédure → `/sourcing/superadmin/roadmap`.

---

## Comment pousser le contenu

### Option A — Via l'interface superadmin (recommandé)

Une fois connecté avec le rôle `superadmin` (Steve — `steissier@alyosingenierie.fr`) :

1. **Plaquette** → `/sourcing/superadmin/pitch` → coller l'URL du PDF
2. **Roadmap** → `/sourcing/superadmin/roadmap` → coller l'URL du PDF
3. **News** → `/sourcing/superadmin/news` → créer et publier des articles
4. **Étude marché** → `/sourcing/superadmin/market-study` → coller l'URL du tableau de bord
5. **Formations + FAQ** → disponibles après déploiement Phase 5 (en cours aujourd'hui)

### Option B — Via un fichier fixture committé

Créer `src/db/seed/content-fixture.ts` avec les données et ouvrir une PR vers `main`.
Format attendu :

```typescript
// formations
export const FORMATIONS_FIXTURE = [
  {
    title: "...",
    description: "...",
    url: "https://...",
    type: "video" as const,
    durationMin: 10,
    isActive: true,
    displayOrder: 1,
  },
];

// faq_items
export const FAQ_FIXTURE = [
  {
    question: "...",
    answer: "...",
    category: "general",
    isActive: true,
    displayOrder: 1,
  },
];

// app_content
export const APP_CONTENT_FIXTURE = [
  { key: "demo_video_url", contentUrl: "https://..." },
  { key: "pitch_pdf_url", contentUrl: "https://..." },
  { key: "roadmap_pdf_url", contentUrl: "https://..." },
];
```

Alex pourra insérer le tout en prod via un script dédié.

---

## État actuel des pages utilisateur

| Page | Statut |
|------|--------|
| `/profil/news` | ✅ Opérationnel — alimenté depuis `/superadmin/news` |
| `/profil/support` | ✅ Opérationnel — tickets visibles dans `/superadmin/support` |
| `/profil/formations` | ✅ Rendu prêt — **attend le contenu** |
| `/profil/guided-tests` | ✅ Opérationnel — alimenté depuis `/superadmin/guided-tests` |
| `/profil/faq` | ✅ Rendu prêt — **attend le contenu** |
| `/profil/demo` | ✅ Rendu prêt — **attend l'URL `demo_video_url`** |

---

## Priorité de décrochage

1. 🔴 **Démo vidéo** — une seule URL, impact fort sur l'onboarding
2. 🟠 **Plaquette + Roadmap** — PDF déjà produits ? Les coller maintenant dans le superadmin
3. 🟡 **FAQ** — 5 à 10 questions suffisent pour le MVP
4. 🟡 **Formations** — au moins 1 vidéo pour valider le parcours

---

*Demande postée par Alex (dev) — 2026-05-27 09h12*
