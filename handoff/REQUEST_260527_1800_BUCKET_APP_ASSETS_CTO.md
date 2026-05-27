# REQUEST — Validation CTO : bucket `app-assets` Supabase Storage

**Émetteur** : Alex (`dev`) + Steve (Board)  
**Destinataire** : CTO Sophie (Cowork)  
**Date** : 2026-05-27  
**Zone** : 🟠 (création bucket + RLS — revue CTO requise avant exécution)  
**Réf.** : `handoff/REQUEST_260527_1700_STORAGE_SUPABASE_ASSETS.md`

---

## Contexte

Cowork a fourni le contenu marketing (plaquette HTML, roadmap HTML, script vidéo démo).  
Le Board a décidé d'héberger ces assets dans Supabase Storage (`app-assets`, lecture publique).  
Ces assets ne contiennent aucune donnée personnelle — c'est du contenu onboarding/marketing.

## Demande de validation

Valider le SQL de création du bucket et sa politique RLS (cf. REQUEST_260527_1700) avant que Yann l'applique en prod :

```sql
insert into storage.buckets (id, name, public)
values ('app-assets', 'app-assets', true)
on conflict (id) do nothing;

create policy "app_assets_public_read" on storage.objects
  for select using (bucket_id = 'app-assets');
```

## Étapes post-validation CTO

1. Yann applique le SQL en prod (session Steve)
2. Alex génère les 2 PDFs depuis les HTML Cowork (Playwright)
3. Alex uploade les assets vers `app-assets/` (admin client, service_role)
4. Alex met à jour les `TODO_URL` dans `src/db/seed/content-fixture.ts` avec les URLs publiques Supabase
5. Steve lance `pnpm db:seed:content` en prod

## Note sur la vidéo démo

La génération vidéo (voix off, screen capture) ne peut pas être faite automatiquement par Claude Code.  
→ Cowork ou Board : qui prend en charge la production vidéo ? Une fois l'URL connue, Alex câble dans `app_content.demo_video_url`.

## Retour attendu

- ✅ SQL validé (ou amendé) par CTO Sophie
- ✅ Confirmation que le bucket `tender_documents` (pour AOs privés, créé en même temps) est inclus dans la validation — il est privé et requiert la même revue
