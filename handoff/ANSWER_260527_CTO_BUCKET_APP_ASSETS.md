# ANSWER CTO — Validation bucket `app-assets` (réponse à REQUEST_260527_1800)

**Émetteur** : Sophie (CTO) — via Board Cowork
**Pour** : Alex (`dev`), Yann (`ps_operator`)
**Date** : 2026-05-27
**Zone** : 🟠 → tranchée CTO

---

## 1. Bucket `app-assets` — ✅ VALIDÉ (public read), avec 2 durcissements

Le bucket est **validé** : assets marketing/onboarding sans donnée personnelle → lecture publique acceptable.
J'ajoute deux garde-fous **avant** application :

```sql
-- bucket public, AVEC limite de taille et types MIME restreints
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-assets', 'app-assets', true,
  52428800,                                  -- 50 Mo / objet (couvre une vidéo démo courte)
  array['application/pdf','video/mp4','image/png','image/jpeg','image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- lecture publique sur ce bucket uniquement
create policy "app_assets_public_read" on storage.objects
  for select using (bucket_id = 'app-assets');
```

**Règles** :
1. **Aucune politique d'écriture publique.** Les uploads se font **exclusivement via le client
   `service_role`** (admin, côté serveur), qui bypass RLS. Ne créez **pas** de policy INSERT/UPDATE/DELETE
   pour `anon`/`authenticated` sur ce bucket.
2. **Contenu strictement non personnel** : plaquette, roadmap, vidéo démo. Jamais de PII (architectes,
   utilisateurs). La vidéo démo doit utiliser des **données de démo/seed** (RGPD — cf. REQUEST_1700).

## 2. Bucket `tender_documents` — ⛔ NON validé en l'état (réserve)

Vous l'avez ajouté à la demande, mais **sans son SQL de policy**. Je ne signe pas à l'aveugle un bucket
qui contient des **documents d'appels d'offres** (potentiellement sensibles).

Conditions **non négociables** pour ce bucket :
- **`public = false`** (jamais public).
- **RLS org-scopée** : accès filtré par `organization_id = current_organization_id()`, **FORCE RLS**
  (cohérent avec `be-docs` / `cotraitant-docs` et l'arbitrage `ANSWER_260527_CTO_RLS_FORCE_EDGE.md`).
- **Accès via URLs signées** (expiration courte, ex. 60 min), jamais d'URL publique.

→ **Postez le SQL exact** (création + policies) de `tender_documents` dans un addendum ; je le valide
ensuite. Tant que ce SQL n'est pas relu, **n'appliquez que `app-assets`**.

## 3. Étapes validées (app-assets uniquement)
1. Yann applique le SQL `app-assets` ci-dessus en prod (session Steve). Entrée `DECISIONS.md`.
2. Alex rend les 2 PDF (Playwright) depuis `design/copy/plaquette_*.html` et `roadmap_*.html`.
3. Alex uploade via `service_role` sous `pitch/`, `roadmap/`, `demo/`.
4. Alex met à jour les `TODO_URL` de `content-fixture.ts` avec les URLs publiques.
5. Steve lance `pnpm db:seed:content` en prod.

## 4. Vidéo démo — production non automatisable
Confirmé : Claude Code ne génère pas la vidéo. **Le Board prend en charge l'enregistrement**
(capture écran + voix off) à partir de `design/copy/script_video_demo_v1.md`, ou délègue à un dev en
manuel. Une fois l'URL Supabase connue → `app_content.demo_video_url`.
