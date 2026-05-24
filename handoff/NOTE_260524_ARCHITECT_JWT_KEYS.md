# NOTE — Génération des clés ARCHITECT_JWT_* (RS256)

**Émetteur** : CTO Sophie (Cowork)
**Destinataires** : Board (génère), Nadia (`dev_tandem`, consomme), Yann (`ps_operator`, .env.example + Vercel)
**Date** : 2026-05-24
**Contexte** : décision Q5 actée — paire de clés RS256 **dédiée** (pas de réutilisation des clés Supabase Auth) pour signer/vérifier le JWT de la page architecte tokenisée `/archi/[token]`. Non documenté dans `setup_api_keys_v1.md` (antérieur au module Tandem) → cette note comble le trou.

## Pourquoi une paire dédiée (rappel décision Q5)
1. Rotation indépendante de Supabase Auth (ne pas invalider les sessions AlyoS).
2. Isolation de risque (compromission d'une clé n'impacte pas l'autre périmètre).
3. Audience claire (`aud=architect`).
4. Pas de coupling au runtime Supabase Auth.

## Génération (Board, en local — la clé privée ne transite par aucun chat/repo)
```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out architect_jwt_private.pem
openssl rsa -pubout -in architect_jwt_private.pem -out architect_jwt_public.pem
```
Encodage base64 mono-ligne (recommandé pour variables d'env) :
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("architect_jwt_private.pem"))
[Convert]::ToBase64String([IO.File]::ReadAllBytes("architect_jwt_public.pem"))
```

## Où poser les valeurs
- `C:\Dev\edifio-sourcing\.env.local` (jamais committé).
- Vercel → Environment Variables → **Production** (paire dédiée) ET **Preview** (2ᵉ paire DISTINCTE — règle d'or : jamais la même clé entre preview et prod).
- `.env.example` : placeholders vides (committés par Yann) :
  ```bash
  # === Architect JWT (module Tandem) ===
  ARCHITECT_JWT_PRIVATE_KEY=
  ARCHITECT_JWT_PUBLIC_KEY=
  ```
- Sauvegarde master dans le password manager.

## À FIGER par Nadia (étape 2)
Le **format exact attendu par le code** : PEM brut avec `\n` échappés, OU base64 mono-ligne décodé au runtime. Nadia tranche et documente dans sa note d'étape 2 + le `.env.example`, pour alignement au caractère près. Tant que ce n'est pas figé, le Board garde les `.pem` bruts dans son password manager.

## Sécurité
- Clé privée : jamais committée, jamais en clair dans un chat/Slack/email.
- En cas de fuite : révocation = régénérer la paire + redéployer (cf. `setup_api_keys_v1.md` §En cas de fuite). Comme `aud=architect` et durée 30 j, l'impact est borné aux tokens architectes émis.
- Entrée à tracer dans `DECISIONS.md` une fois posées.
