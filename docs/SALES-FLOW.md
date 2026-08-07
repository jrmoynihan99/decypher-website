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
```

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

## Deleting rows

The `×` on a Booked Calls row sets `archived: true`. It is **not** a document
delete, and must not become one.

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

## The leaderboard

Not built — the client has their own design coming. The data is shaped for it:
group `salesCalls` where `isReferral && status counts` by `referrerId`, and use
`partnerPayout()` for dollars or a plain count for volume. `referrerName` is
denormalised onto each row so the aggregation needs no join.

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
| `src/components/portal/sales/SalesFlow.tsx` | the three tabs |
| `src/components/portal/sales/cells.tsx` | editable cell primitives |
| `scripts/sales-backfill.mjs` | Calendly → pipeline |
| `scripts/sales-import-airtable.mjs` | Airtable → pipeline (one-off) |
| `scripts/calendly-webhook.mjs` | subscription management |

Collections: `salesCalls`, `salesReferrers`. Both are Admin-SDK-only;
`firestore.rules` denies all client access and needs no change.
