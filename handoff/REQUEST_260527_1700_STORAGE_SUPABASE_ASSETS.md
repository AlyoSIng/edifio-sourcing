# REQUEST — Héberger les assets espace user dans Supabase Storage

**Émetteur** : CEO Marc + CTO Sophie (Cowork)
**Destinataires** : Alex (`dev`), Yann (`ps_operator`)
**Date** : 2026-05-27
**Décision Board** : héberger **dans Supabase Storage** (et non Google Drive) la **vidéo de démo**,
le **PDF de la plaquette** et le **PDF de la roadmap**.
**Zone** : 🟠 (création bucket + RLS = revue CTO) puis 🟢 (upload + câblage).

---

## Pourquoi côté devs

Cowork ne peut pas réaliser ces étapes : pas d'outil de rendu PDF ni d'upload binaire vers
Storage depuis l'environnement Cowork. Les **sources** sont fournies par Cowork (HTML +
script vidéo) ; le **rendu, l'upload et le câblage** sont à faire côté Claude Code.

## Sources fournies par Cowork (dans `design/copy/`)
- `plaquette_commerciale_edifio_sourcing.html` → à rendre en **PDF**.
- `roadmap_produit_edifio_sourcing.html` → à rendre en **PDF**.
- `script_video_demo_v1.md` → script + spec pour **générer la vidéo** (voix off, déroulé, contrainte RGPD).

## Étapes demandées

### 1. Bucket Storage `app-assets` (public read)
Ces 3 assets sont du **contenu marketing/onboarding sans donnée personnelle** → lecture publique
acceptable. (Les coffres `be-docs` / `cotraitant-docs` restent **privés** — ne pas toucher.)

Exemple de création (SQL, à appliquer après revue CTO) :
```sql
insert into storage.buckets (id, name, public)
values ('app-assets', 'app-assets', true)
on conflict (id) do nothing;

-- lecture publique
create policy "app_assets_public_read" on storage.objects
  for select using (bucket_id = 'app-assets');
-- écriture réservée au service_role / admin (upload côté serveur)
```

### 2. Rendu PDF
Rendre les 2 HTML en PDF (puppeteer/playwright déjà dans la stack, ou équivalent). Noms cibles :
- `pitch/plaquette_edifio_sourcing.pdf`
- `roadmap/roadmap_edifio_sourcing.pdf`

### 3. Vidéo démo
Générer la vidéo depuis `script_video_demo_v1.md` (≤ 4 min, 1080p, voix off FR, sous-titres).
**RGPD bloquant** : aucune donnée perso réelle d'architecte à l'écran → données de démo/seed ou flou.
Nom cible : `demo/edifio_sourcing_demo.mp4`.

### 4. Câblage `app_content`
Renseigner les clés avec les **URLs publiques Supabase** des objets uploadés :
```
https://<project>.supabase.co/storage/v1/object/public/app-assets/pitch/plaquette_edifio_sourcing.pdf
https://<project>.supabase.co/storage/v1/object/public/app-assets/roadmap/roadmap_edifio_sourcing.pdf
https://<project>.supabase.co/storage/v1/object/public/app-assets/demo/edifio_sourcing_demo.mp4
```
→ `app_content.pitch_pdf_url`, `roadmap_pdf_url`, `demo_video_url`.
Ces valeurs **remplacent les `TODO_URL`** de `src/db/seed/content-fixture.ts`.

## Sécurité / rappels
- Bucket public **uniquement** pour ces 3 assets marketing ; jamais de PII.
- Vérifier qu'aucune donnée perso n'apparaît dans la vidéo.
- Migration bucket via process habituel + revue CTO ; tracer dans `DECISIONS.md`.

## Retour attendu
Les 3 URLs publiques finales, à confirmer au Board.
