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

### Shipping a new tab

Grandfathering only covers docs with **no** `permissions` field. Every account
created through the Staff page has an explicit array, so a key added to
`PERMISSION_KEYS` arrives switched **off** for all of them. Backfill it:

```bash
npm run portal:grant -- <permission-key> --dry   # see who'd change
npm run portal:grant -- <permission-key>
```

Idempotent, and it deliberately skips docs with no `permissions` field — writing
an array there would opt them out of grandfathering for the *next* tab. Run it
after the deploy, not before: until the new key is in the deployed
`PERMISSION_KEYS`, an admin editing anyone's access from the Staff page PATCHes
the array back without it.

## Tools Hub

`/portal/tools-hub` — a directory of every piece of software the team uses,
grouped by department. Read gate `tools-hub`; the catalog is **admin-write
only**, because it's one document the whole team renders from.

- Catalog: `toolsHub/catalog` in Firestore, via `src/lib/tools-hub/store.ts`.
  Absent means "the shipped defaults" in `src/lib/tools-hub/catalog.ts`, so the
  doc only exists once an admin saves, and an un-edited install still picks up
  changes made in code. `sanitizeCatalog` runs on read as well as write — every
  URL is parsed, not pattern-matched, since these all become `href`s.
- A tool CAN be deleted outright, unlike a sales dropdown option: nothing
  historical is written in a tool id.
- Per-user department show/hide and section collapse are localStorage
  (`toolshub:prefs:v1:<uid>`), stored as deviations from "everything shown" so a
  department added later isn't hidden from people who set prefs today.
- Search deliberately spans departments the pills have switched off; a matching
  hidden department surfaces with a `hidden` marker on its header.
- Logos: drop an SVG in `public/logos/` and point a tool's Logo URL at it.
  Without one, the card shows the vendor's monogram over a tint of its accent.
- **Known placeholders in the seeded list**, ported as the client wrote them —
  `https://taxgpt.internal/`, `https://timeoff.decypher.internal/` and the
  `notion.so/decypher/*-sop` links don't resolve. Fix them in Edit tools.

## Tax Recap

`/portal/tax-recap` — turns a client's before/after ProSeries returns into a
shareable recap page. Gate `receipts` — the key string belongs to the Receipt
Analyzer placeholder this tool replaced in the same sidebar slot, kept so every
existing grant carried over with no backfill (`/portal/receipts` redirects
here). No admin tier, because building a recap is writing one and everyone with
the tab is the tax team.

- **Flow.** Two PDFs (before = income only, after = final) go to
  `POST /api/portal/tax-recap/extract`, one request each (Vercel's ~4.5MB body
  cap; `maxDuration = 300` because a long print is a minute-plus of model
  time). Before either is sent, the browser prepares it
  (`src/components/portal/tax-recap/pdf-prepare.ts`): pdfjs pulls the per-page
  text, `src/lib/tax-recap/pages.ts` picks the pages that carry the lines the
  recap reads, and pdf-lib builds a copy of just those. A PDF still over
  ~3.5MB — a scanned client copy runs 15-20MB and can't be trimmed — is staged
  in 750KiB pieces via `POST /api/portal/tax-recap/upload`
  (`taxRecapUploads`, `src/lib/tax-recap/uploads.ts`; owner-checked, deleted
  the moment the read finishes, stale ones swept after two hours) and the
  extract route takes the `uploadId` instead of the file. A scan has no text
  layer, so it reads fine but nothing can be cross-checked; the builder says
  so.
- **Page trimming is where the cost and the clock go.** A client copy is
  25-45 pages and about a dozen carry anything the recap reads; the rest is
  cover letters, vouchers, W-2 copies, K-1s and worksheets, all billed and
  none read. Measured across the three sample pairings, trimming cut input
  tokens 53% and brought the slowest text-based read from 65s to 42s. Two
  rules in `pages.ts` keep it safe: anchors are the field map's own printed
  wording rather than form names, and every bail-out sends the whole
  document. **Exclusions match the page header only** — a form names other
  forms constantly, and whole-page matching dropped Schedule C, 1040 page 2
  and both New Jersey pages over incidental references. The browser sends a
  `pageMap` so cited page numbers are translated back to the real return
  before the reviewer sees them.
  The server hands the rendered PDF to Claude (`claude-opus-5`, structured
  outputs against the schema in `src/lib/tax-recap/extract.ts`), then checks
  every number it reports against the text of the page it cited
  (`src/lib/tax-recap/verify.ts`). Staff review the grid — each cell shows its
  page and whether it was found — fix anything, and save.
- **Math lives in code.** `src/lib/tax-recap/compute.ts` derives every recap
  figure from the reviewed numbers and runs the arithmetic identities the
  forms must satisfy (line 24 = 16 + SE tax, Schedule C, before/after gross
  receipts equal, …). The model never adds anything up. The line map it
  follows is `docs/TAX-RECAP-FIELD-MAP.md`.
- **Store.** `taxRecaps` in Firestore via `src/lib/tax-recap/store.ts`: the
  reviewed numbers, strategies, next steps, and the raw extraction as an audit
  trail. **Never the PDFs** — they hold SSNs and bank details. `savings` is
  denormalised for the list (and, later, the marketing aggregate).
- **Client page.** `/recap/<token>` — outside the `(site)` group (no marketing
  nav), `force-dynamic`, `noindex`, `no-store` (next.config). Token is 144
  random bits; a revoked recap 404s identically to a bad token. Print → the
  canvas layers drop out and cards don't split.
- **Env.** `ANTHROPIC_API_KEY`. Unset means "Read both returns" returns a
  clear 400; nothing else is affected. `AI_MODEL` (optional) picks the model,
  default `claude-opus-5`; the server log line `[tax-recap] read … with
  <model>: N in / N out, N unverified` is the per-read cost and quality trail.
- **Inputs.** Client name, tax year and state are read off the returns and
  shown prefilled at review; only prior-year income is typed (it's on last
  year's return, not these).
- **Shipping.** Nothing to grant: it rides the `receipts` key staff already
  hold. A new hire gets it from the Staff page like any other tab.

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

`toolsHub/catalog` — `departments: {id, label}[]`, `tools: ToolEntry[]`,
`updatedAt`, `updatedBy`. One document, written whole. Absent = shipped
defaults.

`taxRecaps/{id}` — `token`, `revoked`, `clientName`, `taxYear`,
`priorYearIncome`, `stateCode`, `before` / `after` (`ReturnNumbers`),
`strategies`, `nextSteps`, `extraction` (`{before, after}` raw reads with
page + verified per value), `savings` (denormalised), `createdAt/By`,
`updatedAt/By`. Schema in `src/lib/tax-recap/schema.ts`.
