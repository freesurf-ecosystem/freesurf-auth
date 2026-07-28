# Cross-Domain Auth Architecture

How a single sign-in on any `*.freesurf.tools` tool propagates to all others.

---

## The Problem

Supabase stores sessions in `localStorage`, which is **per-domain**. Signing in on `auth.freesurf.tools` creates a session there, but `invoices.freesurf.tools` can't see it. Users have to sign in separately on every tool.

## The Solution

A shared cookie on `.freesurf.tools` bridges the gap. When a user signs in anywhere, the access token is stored in a cookie visible to all subdomains. Each tool checks this cookie on load and restores the session into its own `localStorage`.

## Flow

```
User signs in on auth.freesurf.tools (or any tool with auth)
       │
       ▼
Supabase stores session in localStorage (per-domain, as usual)
       +
freesurf-auth.js sets "freesurf_session" cookie on .freesurf.tools
  → document.cookie = "freesurf_session=<token>;domain=.freesurf.tools;path=/;SameSite=Lax"
       │
       ▼
User navigates to invoices.freesurf.tools / links.freesurf.tools / post.freesurf.tools
       │
       ▼
That tool's copy of freesurf-auth.js runs on page load:
  1. Reads "freesurf_session" cookie
  2. Calls supabase.auth.setSession() to restore into localStorage
  3. All existing Supabase.auth calls now work normally
       │
       ▼
User is signed in everywhere — one login, all tools
```

## Sign Out Flow

```
User clicks "Sign out" on any tool
       │
       ▼
clearSharedSession() is called:
  1. supabase.auth.signOut() — clears localStorage session
  2. deleteCookie("freesurf_session") — removes the .freesurf.tools cookie
       │
       ▼
All other tools on next page load: no cookie found → signed out
```

---

## Shared Utility: `freesurf-auth.js`

Location: `js/freesurf-auth.js` in each project's repo.

Depends on `js/freesurf.config.js` for domain/brand values. Uses Supabase JS SDK (loaded dynamically from esm.sh). Three exports:

| Export | Purpose |
|---|---|
| `getSharedSession()` | Check cookie, restore into localStorage, return `{ user, accessToken }` or `null` |
| `setSharedSession()` | Read Supabase session from localStorage, persist to `.freesurf.tools` cookie |
| `clearSharedSession()` | Sign out from Supabase + delete the `.freesurf.tools` cookie |

### Integration pattern for new tools

#### 1. Copy the utilities

```bash
cp shared/freesurf.config.js <new-project>/js/freesurf.config.js
cp shared/freesurf-auth.js <new-project>/js/freesurf-auth.js
```

#### 2. On page load — restore session

```js
import { getSharedSession } from "./freesurf-auth.js";

// Run early, before any API calls that need auth
const session = await getSharedSession();
if (session) {
  // User is signed in — use session.accessToken for API calls
  // Supabase localStorage is also populated, so existing supabase-js code works
}
```

#### 3. After sign-in — persist to cookie

```js
import { setSharedSession } from "./freesurf-auth.js";

// After successful supabase.auth.signInWithPassword() or similar
await setSharedSession();
```

#### 4. On sign-out — clear everywhere

```js
import { clearSharedSession } from "./freesurf-auth.js";

// In sign-out handler
await clearSharedSession();
```

---

## Per-Project Integration Summary

| Project | File(s) | Integration |
|---|---|---|
| **auth.freesurf.tools** | `js/auth.js` | `setSharedSession()` after sign-in, sign-up, and existing session check |
| **invoices.freesurf.tools** | `js/app.js`, `js/auth.js` | `getSharedSession()` on app load; `setSharedSession()` in auth flow; `clearSharedSession()` on sign-out |
| **links.freesurf.tools** | `dashboard/js/app.js` | `getSharedSession()` on load → uses Supabase token as `sessionToken` for Worker API; `clearSharedSession()` on logout |
| **post.freesurf.tools** | `dashboard/js/dashboard.js` | `getSharedSession()` in `refreshAuth()`; `clearSharedSession()` on sign-out |

---

## Cookie Details

| Property | Value |
|---|---|
| Name | `freesurf_session` |
| Domain | `.freesurf.tools` (leading dot = all subdomains) |
| Path | `/` |
| SameSite | `Lax` (allows redirects from auth page) |
| Max Age | 30 days |
| Content | Supabase access token (JWT) |

---

## Supabase Project

All tools share one Supabase project:

- **URL:** `https://jstojewashwoswsskwjk.supabase.co`
- **Auth:** Email + password (with optional email confirmation)
- **JWT Secret:** Used by Workers for server-side validation

---

## Domain Migration

To switch domains (e.g., `freesurf.tools` → `freesurf.to` → `free.surf`):

1. Change `ROOT_DOMAIN` in `shared/freesurf.config.js` and `shared/freesurf.config.ts`
2. Copy updated configs to each project
3. Update Cloudflare DNS records and Worker routes
4. Update Supabase redirect URLs in dashboard
5. Update Google Search Console properties
6. Redeploy all Workers and Pages

---

## Adding a New Tool (checklist)

1. Create the project in its own repo
2. Copy `freesurf.config.js` and `freesurf-auth.js` into the project's `js/` folder
3. Deploy to `<tool>.freesurf.tools` on Cloudflare Pages
4. Add CORS origin to any Worker API that needs it
5. Submit `sitemap.xml` to Google Search Console as a new URL-prefix property
6. Add a "Sign in" link pointing to `https://auth.freesurf.tools/?redirect=https://<tool>.freesurf.tools/`
