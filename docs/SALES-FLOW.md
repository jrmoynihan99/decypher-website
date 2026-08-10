# Sales Flow

The portal's replacement for the client's Airtable **SALES** base
(`appP8cXs7sdicj0E3`). Lives at `/portal/sales-flow`, gated on the `sales-flow`
permission.

---

## The one idea

**Three tabs, one collection.** Booked Calls, Deal Desk and Referrals are
filters over `salesCalls`, not three tables:

| Tab | Filter | What it's for |
|---|---|---|
| Booked Calls | every row | triage: is this a sale? a referral? |
| Deal Desk | `isSales \|\| isReferral` | the money |
| Referrals | `isReferral` | attribution and commission |

Every consequence of that model falls out for free rather than being
implemented: one status field that can't disagree with itself, and one `×` that
removes a row from all three tabs and every total no matter which tab you press
it on.

Airtable models these as three tables and pays for it. A referred deal's status
is typed into `DEAL Desk` **and** into `REFERRALS`, and the two drift: the
import found 187 deals marked `WON Closed` in Deal Desk but 198 rows whose
status is won once the referral table is reconciled in — 11 closed referrals
Deal Desk never recorded. Here there is one status field, edited from whichever
tab you're on. Nothing can disagree with itself.

The client's own data justified the collapse: of 4,532 Booked Calls rows, all
130 flagged `Referral` are also flagged `Sales`. Referral ⊂ Sales.

---

## Where rows come from

```
Calendly ──webhook──▶ /api/calendly/webhook ──▶ salesCalls
         └─backfill──▶ scripts/sales-backfill.mjs ──┘
Airtable ──one-off──▶ scripts/sales-import-airtable.mjs ──▶ (operator fields only)
Operator ──"＋ Add row"──▶ POST /api/portal/sales/calls ──▶ (id prefixed `manual-`)
```

**Manual rows carry a `manual-<uuid>` id, and the prefix is load-bearing.**
Calendly rows are keyed on the invitee UUID and `upsertFromCalendly` addresses
documents by it, so the prefix puts hand-added rows outside that address space
entirely — no sync can adopt, overwrite or resurrect one. `source: "manual"` is
what a *reader* goes by; the prefix is what the machinery goes by, and the two
must not be conflated. The form collects the Calendly-owned identity fields
only; everything on Deal Desk and Referrals is filled in through PATCH like any
other row.

Duplicates are **warned about, not blocked**: a matching email surfaces the rows
it matched with their dates, and a human decides. The same person legitimately
books twice, and a second discovery call six months later is a second row
everywhere else in this system.

Only three Calendly event types count as pipeline. The org runs ~41; the rest
is client delivery (QBO onboarding, tax manager, "Catch up w/OT") and is
dropped at ingestion by `callTypeForEventType`.

| Key | Event | UUID |
|---|---|---|
| `qualified` | Creator Discovery Call 1 📞 | `e1c21fab-…` |
| `unqualified` | Creator Discovery Call 1 ☎️ | `dad6beb5-…` |
| `referral` | Referral Discovery Call 📱 | `58960ea7-…` |

Owned by `EVENT_TYPES` in `src/lib/calendly.ts`. `scripts/_sales-env.mjs`
duplicates them for the plain-node scripts — change both.

---

## Two ownership zones

Every document has a boundary running through it, and it is load-bearing:

- **Calendly-owned** — who booked, when, which event, what they answered.
  Rewritten on every sync. Never edited in the portal.
- **Operator-owned** — the triage checkboxes and every Deal Desk / Referral
  field. Written only by `PATCH /api/portal/sales/calls/[id]`.

`upsertFromCalendly` enforces it structurally: the operator fields simply aren't
in the payload, so `set(..., {merge: true})` can't touch them. That's why the
backfill is safe to re-run at any time. **If you change what that function
writes, re-read its comment first** — getting it wrong means a routine re-sync
silently wipes months of the client's manual work.

---

## The Stats tab

A fourth tab aggregating the same rows the grid edits — computed client-side in
one pass (~800 rows), so it tracks the toolbar's date-range and call-type
filters instantly. Archived rows are always excluded, even when the grid's
"Deleted" view is open. One deliberate exception: the **breakdown table** at the
bottom ignores the date filter — its whole job is the multi-period comparison,
and its header says so.

Design notes that should survive future edits (full detail in `viz.tsx`):

- **No pie charts.** Lead source has ten categories — past the point where
  slices stay comparable, and no ten-colour palette can pass the CVD gates.
  Ranked bars with printed values instead.
- **The palette was validated, not eyeballed**, against the portal's real panel
  surface (#141319) with the dataviz skill's validator. The brand's five accents
  FAIL as a categorical set (ember vs danger measure ΔE 7.5 to *normal* vision),
  which is why magnitude is carried by bar length. The one two-series chart
  (booked vs won by month) uses #d62368 + #29a294 — a pair that passes all six
  checks, but sits in the CVD warn band, so it must keep its legend, direct
  labels and 2px segment gap.
- **Funnel stages wear an ordinal ramp** (#8f1a4d→#d62368→#ff5c96 — one hue,
  monotone lightness), not categorical hues: the stages are ordered.
- Charts are CSS divs, not SVG — the existing portal charts stretch a viewBox
  (`preserveAspectRatio="none"`), which distorts labels; bars don't need SVG.

### Comparing periods

The toolbar's **Compare** selector adds a second window: previous period, same
period last year, or a custom one. The KPI strip grows deltas and a **Period
comparison** table appears under it.

"Previous period" means the previous **calendar** unit for the calendar-anchored
ranges (this/last quarter, YTD, last year) and an equal-length window
immediately before for everything else. The distinction is the whole feature: a
span shift applied to "This quarter" on 15 November gives 17 Aug – 30 Sep, a
45-day window straddling two quarters that answers nothing. Shifting back one
quarter gives 1 Jul – 15 Aug — the same many days into the previous quarter.
Owned by `CALENDAR_SHIFT` in `SalesFlow.tsx`.

A range with an unbounded start (All time, or a custom range with no From) has
no comparable predecessor, so those options disable rather than invent one.

**Rates compare in points, not percent.** "Close rate up 12%" from a base of 40%
is ambiguous — 52% or 44.8%? The rate rows print the point movement.

The breakdown table at the bottom toggles **Years / Quarters** and carries its
own vs-previous column, which is where "how did Q3 go against Q2" gets answered
without touching the toolbar at all.

## Deleting rows

The `×` on a row — **on any of the three tabs** — sets `archived: true`. It is
**not** a document delete, and must not become one.

Deleting from Deal Desk or Referrals removes the row from Booked Calls too, and
from every KPI, because there was only ever one document: the three tabs are
filters, so there is no second copy to fall out of step. That is the same
property the shared status field has, and it comes free from the data model
rather than from any code that propagates anything.

Rows are keyed on the Calendly invitee UUID. A deleted document is recreated by
the next `sales:backfill` run, and by any `invitee.canceled` or reschedule
webhook for the same invitee — so a real delete would appear to work and then
quietly undo itself, which is worse than not offering it. `archived` sits in the
operator-owned zone, which sync is structurally forbidden from touching, so it
survives every re-sync.

Archived rows leave all three tabs *and* every KPI and total — an archived deal
must not sit in closed-won revenue. The toolbar's "Deleted (N)" button switches
to the archived view, where each row offers Restore. Deleting is two clicks
(`×` arms, "Delete?" confirms, disarms itself after 4s) and the banner that
follows offers an immediate undo.

If a row genuinely needs to be gone forever — a test booking, say — delete it in
Calendly first, then archive it here.

## Notes open in a dialog

The Deal Desk notes cell is a preview that opens a real textarea, portalled to
`document.body`. A one-line `<input>` in a grid column shows about six words of
what is actually a paragraph, has nowhere to put a line break, and widening the
column to fix that costs every other column on the row.

Two things it does differently from every other cell here, both deliberate:

- **It commits on Save, not on change.** Prose typed over a minute would
  otherwise fire a write per character, and unlike a dropdown there is no
  natural "done" moment until the editor closes. Escape and the backdrop
  discard.
- **It portals.** The grid's ancestors carry transforms and `will-change`,
  either of which re-roots a `position: fixed` element to that container instead
  of the viewport — the dialog would end up trapped inside a scrolling table
  cell. This has bitten the codebase before (LeadModal).

## Suggestions, not autofill

The client was explicit: don't trust the auto-detected referrer or lead source.

Both Creator Discovery calls ask *"How did you hear about us?"* and the Referral
call asks *"Who Referred you…"*. Those answers are stored verbatim
(`leadSourceRaw`, `referrerRaw`) and mapped to a **suggestion**
(`suggestedLeadSource`) — never written into the editable field. The grid shows
a one-click "↑ Referral" chip while the cell is empty, and the raw answer beside
the referrer picker.

Why it matters: these are free-text-capable multi-selects on a form we don't
control. Airtable's equivalent column has already rotted into **233 distinct
"choices"** because every stray answer became one. Autofill would look
authoritative and be wrong.

The one thing that *is* auto-set is `isSales: true` on every discovery call and
`isReferral: true` on the Referral call — the client asked for exactly that, and
both stay editable forever.

---

## Money

**Whole dollars, not cents.** Every figure in the source base is a whole-dollar
offer or commission (995, 1995, 750, 250); there is no sub-dollar amount in 576
deals. This differs from the QuickBooks collections, which store cents — don't
copy a helper between them.

Commission is **two-sided**: `750/250` means $750 to the partner who sent the
lead plus $250 to the person referred (the bonus the Referral Discovery Call
advertises at booking). The preset only *seeds* the two amounts. It must never
derive a payout at read time, because the live data is full of exceptions — 42
rows carry a preset with $0/$0, and partner amounts of 160, 300, 350 and 500 all
appear filed under the "250" preset.

Payout date is booked + 60 days (`PAYOUT_DELAY_DAYS`), matching Airtable's
formula. A payout is zero unless `DEAL_STATUS_META[status].counts` — so
`won-backed-out` pays nothing, and flipping a status zeroes it everywhere.

---

## Setup

### 1. Backfill history

```bash
npm run sales:backfill -- --since=2024-01-01 --dry   # look first
npm run sales:backfill -- --since=2024-01-01
```

Slow by nature: `/scheduled_events` has no event-type filter, so it pages
through every meeting in the org (~4,800 for two years) and keeps the ~15% that
are sales calls. Idempotent — re-run any time to reconcile.

### 2. Register the webhook

```bash
npm run sales:webhook -- create --url=https://wedecypher.co
```

**The signing key prints once.** Put it in `CALENDLY_WEBHOOK_SIGNING_KEY` in
`.env.local` *and* Vercel, then redeploy. Calendly never shows it again; losing
it means deleting the subscription and making a new one.

The callback must be public HTTPS — localhost is rejected. Test locally by
replaying a captured payload against the route, not with a tunnel.

`npm run sales:webhook -- list` shows **only subscriptions this token created**.
Calendly scopes them per OAuth client, so whatever currently feeds Airtable
(Zapier/Make/native) is invisible here and unaffected. Both can run in parallel
— which is what makes a safe cutover possible.

### 3. Import Airtable (one-off)

Run **after** the backfill. The backfill creates rows carrying real invitee ids,
phones and answers; this layers the manual columns on top by matching on email.
The other order leaves every row an Airtable orphan that the webhook will later
duplicate.

```bash
AIRTABLE_TOKEN=pat... npm run sales:import -- --dry
AIRTABLE_TOKEN=pat... npm run sales:import
```

Token from the environment, not `.env.local` — it's needed once and should not
outlive the migration. **Revoke it at airtable.com/create/tokens afterwards.**

Last run: 402/461 Deal Desk rows and 110/126 referrals matched a Calendly row
(87% each), 115 blank Airtable rows skipped, 75 imported standalone, **zero
unmapped values**.

---

## Filters and why the grid is windowed

The toolbar carries a **date range** (default: year to date) and a **call type**
filter, both applied on every tab. The KPI strip counts the filtered set, so
"Closed won" means *within the current range*.

Only `PAGE` (75) rows are rendered at a time, with Load more / Show all.

Columns are **drag-resizable** from the right edge of any header (double-click a
handle to reset that one; "↔ Reset widths" in the panel header resets the lot).
Widths persist per table in localStorage — the three tabs keep separate sets,
because a "Name" column that's right for triage isn't right for the money view.

Two things in `grid.tsx` that look incidental and aren't:

- **Widths live in CSS custom properties, not React state.** The drag writes
  `--c-<id>` straight onto the wrapper and the `<col>` elements read it; nothing
  re-renders until pointerup. State-per-pointermove re-renders 75 rows and ~900
  form controls per frame, and the drag visibly lags the cursor.
- **There is a trailing unsized `<col>`.** `table-fixed` is what makes a `<col>`
  width authoritative, but a fixed-layout table still stretches to `width: 100%`
  and distributes the slack across the columns — so shrinking one would silently
  widen the others, the opposite of "resize this column". The slack column
  absorbs it, and collapses once the real columns exceed the panel, at which
  point the wrapper scrolls. Every row needs its `<SlackCell />`.

Stored widths are read through `useSyncExternalStore`, not copied into state by
an effect: localStorage *is* external state, and it gets the SSR split right for
free (`getServerSnapshot` returns defaults, so hydration matches).

### The horizontal scrollbar floats, and is hand-drawn

A scroll container's scrollbar sits at the bottom of the *container*. Deal Desk
is thirteen columns and seventy-five rows, so "scroll right" meant scrolling
down past two thousand pixels of table to reach the bar, dragging it, and
scrolling back up.

So the container's own bar is hidden (`.scrollbar-none`) and replaced by a
`position: sticky; bottom: 0` bar that stays at the bottom of the viewport for
as long as any of the table is on screen, and comes to rest under the last row
when you scroll past. It only renders when the columns actually overflow.

**The thumb is a `<div>`, not a real scrollbar, and that is not decoration.**
macOS renders overlay scrollbars that fade out when you stop scrolling — a proxy
built from one would be invisible until you already knew to scroll, which is
exactly the knowledge it exists to supply. Drawing it also means it looks the
same on every platform and can be screenshotted in a headless browser, which a
native scrollbar cannot.

It supports drag, click-to-jump, and it never triggers a React render: the thumb
is positioned by writing `transform` from the container's scroll handler and
from the column-resize handler, the same discipline the widths follow. `sticky`
survives the `overflow-x: clip` on `<html>`/`<body>` — `clip` doesn't create a
scroll container the way `hidden` would, which is the reason that rule is
written the way it is.

This is not cosmetic. Two things made the tab slow at 824 rows:

1. **~9,000 form controls.** Each row carries up to eleven `<select>` /
   `<input>` elements, and switching tabs re-mounted all of them.
2. **A 1.87 MB payload, 60% of it unread.** The raw Calendly `answers` array
   averages ten Q&A pairs per row with long question text. The grid renders
   none of it — everything it needs is already extracted into `leadSourceRaw`,
   `referrerRaw`, `socials` and `revenueBand`. It is now excluded from
   `toRow()`, taking the payload to ~750 KB. It still lives on the document; a
   future detail view should fetch one document rather than shipping every
   answer to every session.

**Filtering and search run over every row, not just rendered ones.** The
pipeline is `scoped` (range + type) → `searched` (query) → `rows` (tab) →
`page` (window), in that order, so a 2024 match is always findable even though
only 75 rows are in the DOM.

Two related traps, both already hit once:

- `saveMany` takes a *patch*, not a field. Applying a commission preset touches
  three fields, and firing three requests raced — each response carries the
  whole server row, so the slowest one overwrote the other two.
- `saveMany` reads `calls` through a ref, not a dependency. As a dependency it
  got a new identity on every keystroke and re-rendered all 75 rows.

## Known rough edges

- **64 referrer records, and some are the same person.** The import creates one
  per distinct spelling and refuses to merge automatically — `MEGHAN` vs
  `MEGHAN LIM`, `TRAN` vs `BAO TRAN`, `MARWA` vs `Marwa Osman`, `NATALIE` vs
  `NATALIE ODELL`, `CHOCTO` vs `CHOCTOPUS`. "Probably the same" is not good
  enough when the output is a commission payout and a public leaderboard. The
  script prints the candidates; merge by hand by adding one name as an `aliases`
  entry on the other and repointing `referrerId`.
- **Every row is `isSales: true`**, so Deal Desk currently mirrors Booked Calls.
  That's the client's stated rule ("technically all of them should be sales
  calls"); the checkbox exists to *exclude* the odd non-sale.
- **`affiliatePage.calendlyEvent` is still a dead field.** Every partner page
  books the same shared `affiliate` event, so per-partner attribution comes from
  the "Who referred you" answer rather than from the event. Wiring that field up
  would make attribution automatic.

---

## The public leaderboard — /leaderboard

A real route at `src/app/(site)/leaderboard/page.tsx` (site chrome included),
static with 5-minute ISR. **No manual entry and no admin view**: it aggregates
`salesCalls` where `isReferral && DEAL_STATUS_META[status].counts`, grouped by
`referrerId` — closing a referral in the portal IS the leaderboard update.
"Race to Hawaii": top 10 ranked by closed count, `HAWAII_THRESHOLD = 10`,
ranks 11+ in a searchable "Creators on the Rise" list, `?me=Name` pre-fills
the search (read client-side — `searchParams` on the server page would
de-static it).

Photos: an explicit `sanityCreatorId` on the referrer doc wins; otherwise a
conservative name/alias match against the Sanity creator roster; otherwise
initials in a gradient ring. The link is set in the portal's referrer manager
(⚙ Options), which also holds the `showOnLeaderboard` toggle — the way to keep
out-of-network/gift-card referrers off the public board.

`lib/sales/leaderboard.ts` is server-only; the client list imports constants
and types from `lib/sales/leaderboard-types.ts`. "leaderboard" is in Sanity's
RESERVED_SLUGS so an editor can't shadow the route.

**It is built on the site's page grammar, not its own** — treat it like any
other template (closest sibling: `CareersTemplate`, since both are "a list of
dossier cards under a header"):

| Piece | What it uses |
|---|---|
| Background | one `NeuralWeb` mesh over header→standings, 200px/280px mask fade, content in `relative z-[1]` |
| Header | `PageHeader` — mono eyebrow, decrypting H1 over a `GlowOrb`, `Readout` with `**$750**` tokens |
| Section heads | `SectionHeading` (`[ 02 // standings ]`, `[ 03 // on the rise ]`) |
| Stats | `StatsGrid` — NumberFlow roll-up + redaction-bar wipe |
| Rows | `LeaderRow` on the JobCard recipe: `rounded-[20px] border-edge bg-panel`, lift, magenta glow shadow, `useSpotlight` cursor spotlight, hover accent hairline |
| Reveal | `SectionReveal` + per-row `Reveal delay={0.1 + Math.min(i * 0.08, 0.5)}` |
| Close | `CtaSection` **outside** the mesh group |

Two things worth not "fixing" later:

- **Rows don't animate their numbers.** The roll-up moment belongs to
  `StatsGrid` at the top, where it reads as one event rather than forty-nine
  competing ones; the reveal stagger carries the motion in the list.
- **`compactMoney()` feeds the stat tiles, not `toLocaleString`.** StatsGrid
  splits values on `/^(\D*)([\d.]+)(.*)$/` and rolls the numeric part from
  zero, so a comma-grouped `"$50,210"` parses as `50` + suffix `",210"` and
  animates through `"$0,210"`. `"$50.2k"` rolls correctly.

Only `RiseList` is client-side (the search). Phone layout: earnings stack under
the referral count and the Hawaii gap renders as `3/10` — the full sentence
wraps at that width, and forcing nowrap ran it under the numbers column.

## Sanity-driven content + creator posts

`/leaderboard` is a **singleton `leaderboardPage`** in Sanity (Pages → Referral
Leaderboard). Two sources, cleanly split:

- **Firestore** owns the standings — who's on the board, closed count,
  earnings. Never editable in Sanity; an editable copy would immediately
  disagree with the portal.
- **Sanity** owns the wrapper — headings, copy, CTA, and the **spotlights**.

Every Sanity field is optional with a code fallback, so the page renders
correctly against an empty dataset. Seed with `npm run leaderboard:seed`
(idempotent — only fills fields still missing, never overwrites edited copy).
No slug and no `pageLink` field: the route is fixed, and that widget exists to
mirror an editable Route field this document deliberately doesn't have.

**Spotlights** attach a social post to a creator's row. Authored by display
name (matched case- and punctuation-insensitively) because the referrer's
Firestore id is invisible to an editor; an unmatched name is simply inert and
starts working the day that creator closes a referral.

**How a post renders.** Two Instagram surfaces, both login-free, both verified
live:

| Surface | Used for | Gotcha |
|---|---|---|
| `/p/<code>/embed/captioned/` | the full post, in the modal | framed in a lazy iframe — **not** the documented `embed.js` blockquote, which is ~100KB of third-party script that mutates the DOM. The endpoint returns 200 and sets no `frame-ancestors`. |
| `/p/<code>/media/?size=m` | the poster thumbnail on the row | **CORP-blocked in the browser** — pointing an `<img>` straight at it fails with `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`, silently, as a blank tile. `/api/leaderboard/poster` makes the same request server-side (CORP binds browsers only) and streams the JPEG back same-origin, cached a day. |

That route is **not a general proxy**: it builds the upstream URL from a
validated short-code against one hard-coded host, so a caller can't supply a
URL and there is no SSRF surface. Keep it that way. It's also why the tile
isn't `next/image` — the upstream is a redirect to a signed, expiring CDN
address, so the optimiser would cache precisely the URL that dies.

**Placement.** A labelled 52px tile ("WATCH" beneath it) in its own row slot
from `sm` up; a text chip beside the name below `sm`, where a row has no spare
width. A row renders both — they're mutually exclusive by breakpoint, and
there is deliberately no combined variant: the first attempt had one that
emitted its own mobile chip, so rows that also placed one showed two.

**Not on the Hawaii cards.** A qualifier keeps their place in the standings
too, where the row already carries the tile; a second, larger copy doubled the
poster and made the card tower over everything near it.

The full iframe is mounted only once the modal opens — 49 always-live
Instagram iframes would be unscrollable. Reels show a poster frame with
hand-off to Instagram (no supported way to play off-platform), hence the
permanent "Open on Instagram" link. A dead poster falls back to the chip;
anything that isn't an Instagram post URL degrades to a plain link-out.

## The Hawaii Club

Creators at or past `HAWAII_THRESHOLD` get their own section **above** the
standings, with portrait cards on a violet accent instead of the magenta row
chrome — the whole page is a race toward this, and a qualifier reading as row
eleven of a list would undersell it.

**Qualifiers stay in the Top 10 as well.** They earned the rank; removing them
would silently promote whoever placed 11th into a top ten they didn't finish
in. The empty state names the closest contender and how far they have to go.

## Editable dropdowns — ⚙ Options

Every dropdown's entries live in Firestore (`salesConfig/options`), edited from
the ⚙ Options button: rename, recolour, reorder (↑↓), and — on the open lists —
retire and add. Two tiers, enforced server-side in `lib/sales/config.ts`:

- **Open** (`leadSource`, `service`, `paymentPlan`, `objection`): full editing.
  New options get a slugged key; **keys are permanent** — the editor edits
  labels, never keys, and "delete" is retire (hidden from new picks, historical
  rows keep rendering theirs). A default key dropped from a submitted config is
  re-appended as retired rather than lost.
- **Closed** (`dealStatus`, `showStatus`, `referralKind`): rename, recolour and
  reorder only. Their keys carry money semantics (`DEAL_STATUS_META.counts`
  decides commissions and the leaderboard), so add/retire is a code change, not
  an edit.

Colour is presentation, so it's editable on both tiers.

The PATCH route validates open-list values against the live config (a freshly
added option saves without a deploy) and closed-list values against the static
unions. An absent config doc means "the defaults" — no seeding step. **A list
absent from a stored document means "never edited" and returns the defaults
verbatim**, which is not the same as an empty one: an empty list run through
`sanitizeList` comes back with every default retired, so adding a new list to
the defaults would otherwise arrive switched off on every install that had
already saved a config.

### Colours

`OptionItem.color` holds a **swatch key from `OPTION_COLORS`, never a raw hex**,
and `sanitizeConfig` drops anything else.

The swatch set exists because these colours do two jobs. In the grid they tint a
control whose label is printed inside it, where almost any colour would do. On
the Stats tab they become the bars, where two adjacent categories separated by
nothing but hue is exactly what a free colour field produces and a colourblind
reader can't resolve. Ten swatches, checked against the panel surface and
against each other; ten is also the ceiling past which a categorical palette
stops being discriminable however it's chosen.

Storing the key rather than the hex means the palette can be retuned without
migrating every config document.

`dealStatus`, `showStatus` and `referralKind` ship with colours seeded from
their existing `*_META` tones, so status reads as colour before anyone opens the
editor. `sanitizeList` re-applies a default colour when a submitted item carries
none — without it, config documents written before colours existed would come
back grey, a visible regression from a change nobody made.

### The objection column

Deal Desk's `objection` records why a deal didn't close. Not from Airtable — the
base has no such column, which is why the client asked for one. An open list
(nothing branches on its keys) seeded with ten reasons including "Other", so an
unclassifiable no still gets recorded rather than left blank.

The Stats tab's **"Why deals don't close"** panel prints how many
decided-and-not-won deals have *no* objection recorded. That number is the point
of the panel — the chart above it is only worth reading once it's small.

The same editor manages **referral partners**: rename (propagates to the
denormalised `referrerName` on every call row in a batch — how ALL-CAPS import
names get fixed everywhere at once), Sanity photo link, public toggle, and
delete (degrades to deactivate when calls reference the partner). No reorder —
the picker is an alphabetical typeahead, so order isn't a property a partner
has.

## Per-tab segment filters

On top of the global date-range and call-type filters: Deal Desk adds Service
and Status; Referrals adds Referred-by and Status. Status is one shared
selection across the two tabs because it's the same field. Booked Calls'
segmentation is the global call-type filter.

---

## Files

| Path | What |
|---|---|
| `src/lib/sales/options.ts` | every dropdown + Calendly answer mapping (isomorphic) |
| `src/lib/sales/types.ts` | wire shapes (client-safe) |
| `src/lib/sales/store.ts` | Firestore, `server-only` |
| `src/lib/calendly.ts` | event types, `listScheduledEvents`, `listInvitees` |
| `src/app/api/portal/sales/**` | list / patch / referrers |
| `src/app/api/calendly/webhook/route.ts` | signed ingestion |
| `src/components/portal/sales/SalesFlow.tsx` | the three tabs, ranges, comparison windows |
| `src/components/portal/sales/grid.tsx` | resizable columns, `GridTable` / `GridCell` / `SlackCell` |
| `src/components/portal/sales/cells.tsx` | editable cell primitives |
| `src/components/portal/sales/AddCallRow.tsx` | the manual-row form |
| `scripts/sales-backfill.mjs` | Calendly → pipeline |
| `scripts/sales-import-airtable.mjs` | Airtable → pipeline (one-off) |
| `scripts/calendly-webhook.mjs` | subscription management |

Collections: `salesCalls`, `salesReferrers`. Both are Admin-SDK-only;
`firestore.rules` denies all client access and needs no change.
