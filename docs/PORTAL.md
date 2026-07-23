# Staff portal

Invite-only staff area at `/portal`, backed by Firebase Auth + Firestore.

## Why not Sanity accounts

The Sanity dataset is **public-read** — `src/sanity/client.ts` fetches with
`useCdn: true` and no token, which is what lets the marketing site render.
Anything in that dataset is queryable by anyone holding the project ID, and the
project ID ships to the browser in `NEXT_PUBLIC_SANITY_PROJECT_ID`. A staff
document type would publish the roster and everyone's email address. Making the
dataset private would break the public site, so identity lives in Firebase and
Sanity stays content-only.

## How access works

There is no signup route. An account only exists if an admin creates one, and
Firebase authenticating someone is **not** sufficient — `POST /api/portal/session`
also requires a `users/{uid}` record before it will mint a cookie. So even an
account that somehow appears in the Firebase project can't get in.

Sign-in is a two-step handshake:

1. The browser exchanges email + password for a Firebase ID token
   (`src/lib/firebase/client.ts` — the client SDK's only job).
2. `POST /api/portal/session` verifies that token, checks the staff record, and
   mints a 5-day **httpOnly session cookie**. The client SDK is then signed out.

The cookie is the credential from that point on. It's httpOnly, so XSS can't
read it, and there's no refresh token left in `localStorage`.

## Where the gate actually is

| Layer | Checks | Trusted? |
|---|---|---|
| `src/proxy.ts` | cookie *exists* | **No** — redirect UX only |
| `src/app/portal/(app)/layout.tsx` | `requireSession()` | Yes |
| each `/api/portal/*` route | its own `guard()` | Yes |

`src/proxy.ts` (Next 16's rename of `middleware.ts`) never validates anything —
forging `dcy_session=anything` gets you past it and straight into a server-side
verify that rejects you. Route handlers are reachable directly over HTTP, so
each one re-checks rather than trusting the page that called it.

Two deliberate costs in `src/lib/firebase/session.ts`:

- **Role lives in Firestore, not a custom claim.** Claims get frozen into the
  session cookie at mint time, so demoting an admin wouldn't take effect for up
  to 5 days. A Firestore read is one round-trip and always current.
- **`verifySessionCookie(cookie, true)`** — the `checkRevoked` flag costs a
  round-trip and is what makes suspending someone take effect *now*.

Both are cached per-request with React's `cache()`.

## Setup

1. Firebase console: create a project, enable **Authentication → Email/Password**,
   create a **Firestore** database in production mode.
2. Register a web app; copy the config into the `NEXT_PUBLIC_FIREBASE_*` vars.
3. **Project settings → Service accounts → Generate new private key**; copy
   `project_id`, `client_email`, `private_key` into the `FIREBASE_*` vars.
   See `.env.example` — the PEM must be quoted with literal `\n`.
4. Paste `firestore.rules` into **Firestore → Rules → Publish**. It denies all
   client access by design: every read/write goes through the Admin SDK, which
   bypasses rules entirely, so the browser needs no direct access at all.
5. Make yourself an admin:
   ```
   npm run portal:admin -- you@decypher.com "Your Name"
   ```
   Prints a set-password link. This exists because `/portal/admin/users` is
   itself admin-only — after the first admin, use the UI.

### Vercel

Add every var except `SANITY_API_WRITE_TOKEN`. `package.json` pins
`"engines": { "node": "22.x" }` — required, because `firebase-admin@14` declares
`node >= 22` and Next 16 alone would be satisfied by Node 20.

Add the deployed domain under **Authentication → Settings → Authorized domains**,
or invite links will fail in production.

## Adding staff

`/portal/admin/users` → Add staff member. The server creates a Firebase account
with **no password** and generates a one-time set-password link, handed back for
you to send. An admin never sees anyone's password and there's no temporary
credential to leak in a chat log. Links expire; **Re-invite** issues a new one.

Admins can't demote, suspend or delete themselves — that could leave the portal
with no admin and no way in but the CLI. The UI hides those controls and the API
rejects them.

## Tab permissions

Each sidebar tab is a permission key (`src/lib/permissions.ts` — the single
isomorphic source of truth). Grants are picked per staff member at invite time
and edited later from the same Staff page (**Access** on the row). Semantics:

- **Admins hold every key**, always — the checkboxes don't apply to them.
- A `users/{uid}` doc **without** a `permissions` field predates the feature and
  is grandfathered to full access, so shipping the feature locked nobody out.
  New accounts always store the array explicitly.
- An explicit array means exactly that set; `[]` is a valid "no tabs" state.

`getSession()` resolves the grants once (admin/legacy → all keys), so consumers
just call `session.permissions.includes(key)`. The sidebar and dashboard filter
on it as tidiness; the real gates are `requirePermission(key)` on every tool
page and the same check inside `/api/portal/leads` + `/api/portal/applications`.
Grant changes take effect on the user's next request — no re-invite, no new
cookie — because permissions live in Firestore, not in the session cookie, same
as `role`.

## Inbox tabs

**Leads** (`/portal/leads`) reads `leadMagnetLeads` via `listLeads()` in
`src/lib/lead-store.ts`; **Applications** (`/portal/applications`) reads
`jobApplications` via `listApplications()` in `src/lib/application-store.ts`.
Both show the same fields and qualification flags their Slack messages carry
(#leads / #recruiting) — the portal is the copy that can't scroll away. Reads
are capped at the newest 200 and go through the Admin SDK server-side; nothing
opens the collections to the browser.

## Data model

`users/{uid}` — `email`, `displayName`, `role: "admin" | "staff"`, `disabled`,
`permissions: PermissionKey[]` (absent on pre-permissions docs = full access),
`createdAt`, `createdBy`. Authoritative for access; the Firebase Auth record is
only the password store.
