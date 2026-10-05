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

- **Flow.** The client's final return goes to
  `POST /api/portal/tax-recap/extract` (one request; Vercel's ~4.5MB body
  cap; `maxDuration = 300` because a long print is a minute-plus of model
  time). Before it is sent, the browser prepares it
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
- **Identity never leaves the browser.** The prepared copy is images only:
  each kept page is rendered, the 1040 header band, Schedule C's business
  name box, every run carrying a name/address token learned from them, and
  every SSN/EIN/account/email/phone/date pattern are painted black, and the
  JPEGs are assembled into a new PDF with no text layer. The page text sent
  for the cross-check is scrubbed the same way. The client's name is read
  locally off the 1040 to fill the client field. A scan can't be redacted
  (nothing to find it by) and goes as printed, flagged on the review list.
  Details in the field map's "What leaves the browser".
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
- **The before column is computed, not read.** `src/lib/tax-recap/derive.ts`
  takes the return's numbers, sets every write-off to zero, and recalculates
  against the year's tax tables. It first has to reproduce the return's own
  tax from those tables to the dollar; if it can't (a credit it doesn't
  model, itemizing, a state or year without a card) it refuses with the line
  named, and the builder offers two ways through: type the before column, or
  add a before print and have that read instead. Computed cells are tagged
  "derived" in the grid, the notes go on the "Things to look at" list, and
  the saved recap carries `derivedBefore` instead of a before extraction.
- **S corporations (2026-09-25).** When the 1040 carries K-1 income, the
  corporation's 1120-S goes in the same drop; the browser tells the two
  apart by their pages (`detectReturnKind`), reads the 1120-S with its own
  field list (`ENTITY_FIELDS`, `extractEntityReturn`, `kind=entity` on the
  extract route) and shares the redaction tokens between the files. The
  before zeros every deduction on the 1120-S — salary, retirement plan and
  PTE election included — the way the CPA's prints do; the recap gains a
  "State S-corp tax & PTET" row and an "S-corp (PTET)" filing line; the doc
  stores `entityBefore` / `entityAfter` / `extraction.entity`. The engine
  also splits the savings by strategy (`attributeStrategies`: a waterfall
  from the before to the after, summing exactly) and estimates the SE tax
  the S corporation avoided; both live on the doc as `analysis` and print
  on the client page. Details and the verified numbers in the field map's
  "S corporation clients".
- **Tax Tables** (`/portal/tax-recap/tables`, the "Tax tables" button in the
  Tax Recap page header) holds
  everything the engine multiplies by, per tax year: the federal figures and
  one card per state. A state card is data, not code — where its income
  starts, add-backs, deduction, exemption as credit or deduction, brackets,
  tax-table rounding, surtax, city tax, a nonresident form that prorates the
  California way — interpreted by derive.ts, so a state is added on the
  page, never deployed. Seeds ship in
  `src/lib/tax-recap/tables.ts` (2025: federal, California 540, the
  no-income-tax states); a saved year lives in Firestore `taxTables/<year>`
  (`src/lib/tax-recap/tables-store.ts`) and replaces the seed; `loadTables()`
  hands the merged set to the builder page. Validation blocks saving anything
  the engine couldn't compute with, and the proof panel re-derives every
  saved recap whose before was read from a real print, live as the draft is
  edited, so a wrong number shows next to the client it would have got wrong.
  `npm run recap:check` proves the seeds from a script. The federal card
  also carries the Form 8995-A limits and phase-in range, the child tax
  credit and the net investment income tax; a state card carries the
  dependent exemption and, for S corporations, the entity's own rate, a
  flat or receipts-tiered minimum, the elective tax's brackets and how the
  owner gets it back (nonrefundable credit, refundable credit, or
  exclusion). Every state is seeded for 2023, 2024, 2025 and 2026
  (`src/lib/tax-recap/seeds-2025-states.ts` plus the per-year overrides in
  `seeds-state-years.ts`; federal cards for all four years in tables.ts):
  2025's California and New Jersey are proven on client returns; the rest
  carry their published figures, `proven: false`, and a note on what to
  verify and what the model can't express there (a "proven on a real
  return" switch on the page records it once a client has gone through).
  A state whose figures for a year weren't at hand — every indexed state
  for 2026 — is carried from 2025 with a "CARRIED FROM 2025" note.
  Unproven or carried is safe because the engine refuses a card that
  doesn't reproduce the return's own tax. A stored card that predates a
  field takes the seed's value for it (`sanitizeYearCard(raw,
  seedFor(year))`).
- **Store.** `taxRecaps` in Firestore via `src/lib/tax-recap/store.ts`: the
  reviewed numbers, strategies, next steps, and the raw extraction as an audit
  trail. **Never the PDFs** — they hold SSNs and bank details. `savings` is
  denormalised for the list (and, later, the marketing aggregate).
- **Client page.** `/recap/<token>` — outside the `(site)` group (no marketing
  nav), `force-dynamic`, `noindex`, `no-store` (next.config). Token is 144
  random bits; a revoked recap 404s identically to a bad token. Print → the
  canvas layers drop out and cards don't split.
- **The seal.** The page opens sealed (`components/recap/RecapHero`): a
  scrambled "Maya, you saved $31,045" and a lock, and the client presses and
  holds to decypher it — the ring fills, the headline decrypts in step
  (`scrambleCells` in lib/decrypt), the cipher glyphs on screen are pulled
  into the hand, and at 100% it bursts. The decyphered headline then stays
  as the page's hero (the lock gives way to the before figure)
  and the rest of the recap mounts below it in the home page's language:
  full-bleed sections, a decrypting heading each (`SectionHeading`), frosted
  panels. Letting go early winds it back. It has a sound (`reveal-sound.ts`,
  synthesised — a charge that climbs with the hold, a latch, the burst): on
  by default with a mouse, off on touch devices, and the speaker toggle in
  the hero remembers a choice in `localStorage` (`dcy-recap-sound`). Nothing
  else is remembered, so every fresh load is sealed again (the footer's
  "replay" is just a reload).
  `?open` renders it all open — use it from the portal to check numbers. The
  handout is the PDF route; browser print of the scroll page isn't supported
  (below-the-fold sections reveal on scroll).
- **The sandwich (2026-10-05).** The hero shows only the before. Below it:
  Before (full screen, red) → total savings → After (the same layout, teal),
  then savings by strategy, taxes due (owed − paid = due), strategy and next
  steps; the PDF follows the same order on five pages. The bar on both sides
  is cents of every dollar brought in, both over the BEFORE return's total
  income so the after's bar is shorter by exactly the savings
  (`centsPerDollar`, shared with the video so the three never disagree). The before
  doesn't claim the dependents (`analysis.kids.inBefore`, engine v8):
  `computeRecap` adds their before-side worth to the federal and state rows
  and they're the strategy split's first line, so before − after is the
  savings. Recaps saved earlier keep their numbers until re-saved.
- **The DeCyphered video (2026-10-05).** A 1080×1920 MP4 for the client's
  Instagram story, from an advisor's kit ported into `src/lib/decyphered/`
  (`buildRecap` + `config` are his number rules; `fromRecap` maps a recap
  in; `scenes.ts` is his template redrawn on a canvas; `encode.ts` encodes it
  with the browser's WebCodecs via mediabunny). **Nothing renders on a
  server:** every save in the builder calls `POST /api/portal/tax-recap/<id>/video`
  (the figures as saved, a hash, signed upload URLs; `current: true` when the
  stored video already matches), the staff member's Chrome renders both cuts
  (dollars / percentages only, ~25s), PUTs them to the private default
  bucket (`taxRecaps/<id>/<cut>.mp4`; bucket CORS allows signed PUT/GET), and
  `PUT …/video` records `video {hash, variants}` on the doc. The client gets
  it at `/recap/<token>/video/<cut>` (302 to an hour-long signed URL), a
  "Post your DeCyphered" section at the bottom of the page (Web Share with
  the file on phones → Instagram → Story; QR to `/recap/<token>/share` on
  desktop) and a QR card on the PDF's last page. A recap whose numbers moved
  since its video hashes differently and isn't offered until re-saved.
  Deleting a recap deletes its videos. Incentive: tag @we.decypher, get a
  $50 Visa — fulfilled by hand from the Instagram mention; nothing tracks it.
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
