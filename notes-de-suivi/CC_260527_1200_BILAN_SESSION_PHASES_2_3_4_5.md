# Compte-rendu DEV — 27 mai 2026 — 12h00

**Projet :** edifio Sourcing  
**Session :** Gate 6 — Sprint modules superadmin + profil utilisateur (Phases 2 à 5)  
**Participants :** Steve (Board / Ops), Alex (dev), Nadia (dev_tandem), Yann (ps_operator)  
**Statut :** ✅ Tout déployé sur `main` — disponible sur Vercel preview

---

## Ce qui a été livré dans cette session

### Corrections bloquantes (début de session)

| Commit | Problème | Fix |
|--------|----------|-----|
| `e900ac9` | Build Vercel cassé — `./actions` et `./ReplyForm` manquants dans support | Fichiers non-trackés git — `git add` + commit |
| `9d7e674` | CI pgTAP crash `42883 auth.uid() does not exist` | Stub `auth.uid()` ajouté dans `.github/workflows/db-rls.yml` |
| `8f1b266` | Steve (superadmin) bloqué sur toutes les pages admin | `isAdmin()` étendu : retourne `true` pour `admin` ET `superadmin` |

---

### Phase 2 superadmin — `48281af`

**Module News (`/sourcing/superadmin/news`)**
- Créer / publier / dépublier / supprimer des articles
- Publiés → visibles dans `/profil/news` côté utilisateur

**Module Étude de marché (`/sourcing/superadmin/market-study`)**
- Configurer une URL (Notion, Looker Studio, Power BI…)
- Affichage iframe plein écran côté superadmin

**Enrichissement Pappers à l'unité** — `05f795b`
- Bouton "Enrichir depuis Pappers" sur chaque fiche architecte et BE (section Contact)
- Recherche par SIREN direct ou par nom (filtre NAF 711x)
- Met à jour uniquement les champs vides (siren, effectif, CA)

**Déduplication annuaires**
- Bandeau warning auto en haut des pages Architectes + BE quand des doublons existent
- Suppression à l'unité avec confirmation + guard (solicitations en cours)

---

### Phase 3 superadmin — `9c6f3b6`

**Module Plaquette (`/sourcing/superadmin/pitch`)**
- Coller une URL PDF (Google Drive, Dropbox…)
- Affichage `<object PDF>` + lien Télécharger

**Module Roadmap (`/sourcing/superadmin/roadmap`)**
- Même UX — clé `roadmap_pdf_url`

**Module Tests guidés (`/sourcing/superadmin/guided-tests`)**
- CRUD tests : titre + étapes QCM (4 options, bonne réponse) ou questions ouvertes
- Toggle actif/inactif par test
- Suppression avec guard (impossible si des soumissions existent)
- Visualisation soumissions : userId, score, date (chargement lazy)

---

### Bouton Supprimer contacts — `fdabaf6`

- Listes Architectes et Bureaux d'Études : bouton "Supprimer" à côté de "Éditer" (admin uniquement)
- 2 clics (confirmation inline) → hard delete
- Guard : bloqué si sollicitations en cours (`has_active_solicitations`)

---

### Phases 4/5 — Profil utilisateur — `43b6398`

Toutes les pages `/sourcing/profil/*` sont maintenant opérationnelles :

| Page | Fonctionnalité |
|------|----------------|
| `/profil/news` | News publiées + badge "Nouveau" + marquage lu |
| `/profil/support` | Soumettre un ticket + suivre réponses superadmin |
| `/profil/formations` | Grille formations (vidéo/doc/lien) — **attend le contenu** |
| `/profil/guided-tests` | Passer un test QCM, voir son score, re-passer |
| `/profil/faq` | Accordéon FAQ groupé par catégorie — **attend le contenu** |
| `/profil/demo` | Démo vidéo (YouTube embed ou mp4) — **attend l'URL** |

---

## État des migrations en prod (vérifié Supabase MCP)

| Migration | Tables / Objet | Statut prod |
|-----------|----------------|-------------|
| 0009 rls_messaging | message_templates + organization_profiles | ✅ FORCE RLS confirmé |
| 0019 superadmin_module | 9 tables (news_items, support_tickets, guided_tests, app_content…) | ✅ Toutes présentes |

---

## Demande Cowork ouverte

**`handoff/REQUEST_260527_0912_CONTENU_PROFIL_FORMATIONS_FAQ_DEMO.md`**

Cowork doit produire et pousser :
1. 🔴 **URL démo vidéo** — une URL YouTube ou mp4 → `/superadmin` (ou clé `demo_video_url` dans `app_content`)
2. 🟠 **PDF Plaquette** → `/superadmin/pitch` (coller l'URL Google Drive)
3. 🟠 **PDF Roadmap** → `/superadmin/roadmap` (idem)
4. 🟡 **FAQ** — 5 à 10 Q/R par catégorie → saisie via `/superadmin` Phase 5 (en cours)
5. 🟡 **Formations** — titres, URLs, types, durées → idem Phase 5

---

## Ce qui reste à faire

### Phase 5 superadmin (démarrage immédiat possible)
- `/superadmin/formations` — CRUD fiches formation (titre, URL, type, durée, ordre)
- `/superadmin/faq` — CRUD FAQ (question, réponse, catégorie, ordre)
- Ces 2 modules débloquent la saisie du contenu par Cowork via l'interface

### Tâche #15 — Scrapers PLACE + Francmarchés (Fly.io Playwright)
- Code worker déjà écrit (PR #74, 2026-05-26)
- Reste : déployer le container Fly.io + configurer les secrets Vercel
- Tuto complet disponible dans `specs/flyio_scrapers_deploy_v1.html`

---

## Métriques session

| Indicateur | Valeur |
|------------|--------|
| Commits pushés | 8 (`e900ac9` → `6be0f88`) |
| Fichiers créés | ~45 |
| Modules superadmin livrés | 5 (news, market-study, pitch, roadmap, guided-tests) |
| Modules profil utilisateur livrés | 6 (news, support, formations, guided-tests, faq, demo) |
| Server Actions créées | ~20 |
| Migrations vérifiées prod | 2 (0009, 0019) |
| Bugs bloquants résolus | 3 (build Vercel, CI pgTAP, isAdmin superadmin) |

---

*Document généré par Alex (dev) — 2026-05-27 12h00*
