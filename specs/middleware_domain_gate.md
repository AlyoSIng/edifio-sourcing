# Spec — Middleware de domaine `@alyosingenierie.fr`

**Auteur** : [CTO Sophie Vasseur]
**Date** : 2026-05-10
**Version** : 1.0
**Statut** : Spec figée — à implémenter par [DEV Alex] en début de Gate 6
**Contrainte Board** : pas de route protégée déployée avant que ce middleware soit mergé sur `main` ET testé sur preview Vercel.

---

## 1. Objectif

Bloquer l'accès à `/sourcing/*` et à toutes les routes protégées d'edifio Sourcing pour tout utilisateur dont l'email Supabase ne se termine pas par `@alyosingenierie.fr`.

C'est l'unique mécanisme de restriction d'accès au MVP. **Sa désactivation est interdite** (cf. `CLAUDE.md` — Limites strictes).

---

## 2. Matrice de comportement

| Cas | Email session | Route demandée | Comportement attendu |
|---|---|---|---|
| C1 — Anonyme + route publique | aucune | `/`, `/about`, `/login` | 200 — page servie normalement |
| C2 — Anonyme + route protégée | aucune | `/sourcing/*`, `/api/protected/*` | 307 redirect vers `/login?next=<path>` |
| C3 — Auth Alyos + route protégée | `alice@alyosingenierie.fr` | `/sourcing/*` | 200 — accès accordé, audit log `access_attempt` succès |
| C4 — Auth NON Alyos + route protégée | `bob@gmail.com` | `/sourcing/*` | 403 — page d'erreur, audit log `access_attempt` refusé, session **invalidée immédiatement** |
| C5 — Auth Alyos + route publique | `alice@alyosingenierie.fr` | `/`, `/about` | 200 — affichage normal, lien « Accéder à edifio Sourcing » visible |
| C6 — Auth Alyos + route API protégée | `alice@alyosingenierie.fr` | `POST /api/tenders/select` | 200 (logique métier) ou erreur métier ; jamais 403 |
| C7 — Auth NON Alyos + route API protégée | `bob@gmail.com` | `POST /api/tenders/select` | 403 JSON `{"error":"forbidden_domain"}`, session invalidée |
| C8 — Session expirée | n'importe | route protégée | 307 redirect vers `/login?next=<path>` après refresh token raté |
| C9 — Tampering JWT | claims modifiés côté client | route protégée | Supabase Auth rejette → traité comme C2 (anonyme) |
| C10 — Domaine cousin (alyosingenierie.com) | `alice@alyosingenierie.com` | route protégée | 403 — pas d'égalité stricte sur le TLD `.fr` |
| C11 — Casse | `ALICE@AlyosIngenierie.FR` | route protégée | 200 — normalisation en lowercase obligatoire avant comparaison |
| C12 — Sous-domaine | `alice@dev.alyosingenierie.fr` | route protégée | 403 — match strict sur `@alyosingenierie.fr` (pas `@*.alyosingenierie.fr`) |

---

## 3. Implementation Next.js 14 — skeleton

### 3.1. `middleware.ts` à la racine du repo

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

const ALLOWED_DOMAIN = '@alyosingenierie.fr'
const PUBLIC_ROUTES = ['/', '/about', '/login', '/auth/callback', '/forbidden']
const PROTECTED_PREFIX = '/sourcing'
const PROTECTED_API_PREFIX = '/api/protected'

export const config = {
  // Exclure assets et favicon du middleware
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2)$).*)'],
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Routes publiques : pas de vérification
  if (PUBLIC_ROUTES.includes(pathname)) return NextResponse.next()

  // Pages d'erreur ne doivent jamais entrer dans la logique du middleware
  if (pathname.startsWith('/forbidden')) return NextResponse.next()

  // Vérifier si la route nécessite auth
  const isProtected = pathname.startsWith(PROTECTED_PREFIX)
    || pathname.startsWith(PROTECTED_API_PREFIX)

  if (!isProtected) return NextResponse.next()

  // Récupérer la session via Supabase SSR
  const res = NextResponse.next()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Cas C2 / C8 — pas de session
  if (!user) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Normalisation casse + vérification stricte du domaine
  const email = (user.email ?? '').toLowerCase()
  const isAllowed = email.endsWith(ALLOWED_DOMAIN)

  // Audit log (côté API call ; ici on déclenche le log via fetch fire-and-forget)
  // En production, utiliser une queue ou Edge Function dédiée
  void logAccessAttempt({
    email,
    pathname,
    allowed: isAllowed,
    ip: req.ip ?? req.headers.get('x-forwarded-for') ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
  })

  if (!isAllowed) {
    // Invalider la session immédiatement
    await supabase.auth.signOut()

    // API : réponse JSON 403
    if (pathname.startsWith(PROTECTED_API_PREFIX)) {
      return new NextResponse(
        JSON.stringify({ error: 'forbidden_domain', message: 'Accès réservé aux membres AlyoS Ingénierie.' }),
        { status: 403, headers: { 'content-type': 'application/json' } }
      )
    }
    // UI : page dédiée 403
    return NextResponse.redirect(new URL('/forbidden', req.url))
  }

  return res
}

async function logAccessAttempt(payload: {
  email: string
  pathname: string
  allowed: boolean
  ip: string | null
  userAgent: string | null
}) {
  // À implémenter : appel Supabase Edge Function ou direct via service_role côté server
  // qui INSERT dans audit_logs (action = 'access_attempt')
}
```

### 3.2. Page `app/forbidden/page.tsx`

UI dédiée pour le cas C4 / C7 : message clair, pas de lien retour vers `/sourcing/*` (l'utilisateur n'y a pas droit), seul lien vers `/`.

```tsx
export default function Forbidden() {
  return (
    <main className="...">
      <h1>Accès réservé</h1>
      <p>
        edifio Sourcing est un outil interne réservé aux membres
        <strong> AlyoS Ingénierie</strong> (adresse email en
        <code> @alyosingenierie.fr</code>).
      </p>
      <p>Si tu penses qu'il s'agit d'une erreur, contacte l'équipe IT.</p>
      <a href="/">← Retour à l'accueil</a>
    </main>
  )
}
```

---

## 4. Tests E2E à fournir (BLOQUANT Gate 6)

Playwright. Fichier : `e2e/middleware-domain.spec.ts`.

```ts
test('un utilisateur @gmail.com est rejeté sur /sourcing/*', async ({ page }) => {
  await signInWith(page, 'bob@gmail.com')
  await page.goto('/sourcing/ao-du-jour')
  await expect(page).toHaveURL(/\/forbidden/)
})

test('un utilisateur @alyosingenierie.fr accède à /sourcing/*', async ({ page }) => {
  await signInWith(page, 'alice@alyosingenierie.fr')
  await page.goto('/sourcing/ao-du-jour')
  await expect(page).toHaveURL(/\/sourcing\/ao-du-jour/)
})

test('un utilisateur anonyme est redirigé vers /login', async ({ page }) => {
  await page.goto('/sourcing/ao-du-jour')
  await expect(page).toHaveURL(/\/login\?next=/)
})

test('casse insensitive : ALICE@AlyosIngenierie.FR fonctionne', async ({ page }) => {
  await signInWith(page, 'ALICE@AlyosIngenierie.FR')
  await page.goto('/sourcing/ao-du-jour')
  await expect(page).toHaveURL(/\/sourcing\/ao-du-jour/)
})

test('domaine cousin alyosingenierie.com rejeté', async ({ page }) => {
  await signInWith(page, 'alice@alyosingenierie.com')
  await page.goto('/sourcing/ao-du-jour')
  await expect(page).toHaveURL(/\/forbidden/)
})

test('sous-domaine dev.alyosingenierie.fr rejeté', async ({ page }) => {
  await signInWith(page, 'alice@dev.alyosingenierie.fr')
  await page.goto('/sourcing/ao-du-jour')
  await expect(page).toHaveURL(/\/forbidden/)
})

test('appel API protégée hors domaine renvoie 403 JSON', async ({ request }) => {
  const r = await request.post('/api/protected/tenders/select', {
    data: { tender_id: 'xxx' },
    headers: { cookie: await getCookieFor('bob@gmail.com') },
  })
  expect(r.status()).toBe(403)
  expect(await r.json()).toEqual(expect.objectContaining({ error: 'forbidden_domain' }))
})
```

---

## 5. Test CI bloquant *(à intégrer GitHub Actions)*

Job dédié dans `.github/workflows/ci.yml` :

```yaml
- name: Verify middleware presence
  run: |
    test -f middleware.ts || (echo "::error::middleware.ts MISSING — REJECTED" && exit 1)
    grep -q "@alyosingenierie.fr" middleware.ts || (echo "::error::domain check MISSING in middleware" && exit 1)
- name: Run middleware E2E tests
  run: pnpm test:e2e -- middleware-domain.spec.ts
```

Si l'un des deux échoue, le merge est bloqué. La CI doit refuser que `main` parte sans middleware actif.

---

## 6. Audit log — événement `access_attempt`

Chaque passage dans le middleware (autorisé OU refusé) génère un événement dans `audit_logs`.

```json
{
  "action": "access_attempt",
  "actor_email": "alice@alyosingenierie.fr",
  "data": {
    "pathname": "/sourcing/ao-du-jour",
    "allowed": true,
    "ip": "82.123.45.67",
    "user_agent": "Mozilla/5.0 ..."
  }
}
```

Rétention : 5 ans (cf. politique audit log Gate 5).

---

## 7. Edge cases à valider explicitement par [DEV Alex] avant merge

1. Refresh token expiré → comportement strict identique à anonyme (C8).
2. Cookies Supabase corrompus → traité comme anonyme.
3. Header `cookie` manuellement forgé côté API → Supabase Auth fait la vérif RS256, donc rejet automatique.
4. Navigation client-side (Next.js Link) après bascule hors-domaine → vérification SSR re-déclenchée.
5. WebSocket Supabase Realtime → le canal doit hériter du contrôle d'accès (RLS Postgres) — pas besoin du middleware, mais le RLS doit être strict.

---

## 8. Risques résiduels

- **Confiance dans `user.email`** : Supabase Auth garantit que l'email a été vérifié au login (magic-link envoyé → click → token signé). Pas d'usurpation possible côté JWT.
- **Email mutable** : un compte Supabase peut changer son email après création. Si un user @alyos passe à @gmail, sa session courante est encore valide jusqu'au prochain refresh. **Solution** : forcer un re-login lors d'un changement d'email Supabase (à implémenter Gate 6).
- **Email avec alias `+`** : `alice+test@alyosingenierie.fr` est accepté (endsWith match). C'est OK, le domaine est le critère.

---

*Spec figée. Toute modification du middleware (paramètres, comportement, exceptions) passe par une PR validée [CTO Sophie] + remontée Board.*
