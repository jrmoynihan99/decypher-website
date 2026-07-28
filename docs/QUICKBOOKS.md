# QuickBooks integration — Creator Finances

The **Creator Finances** portal tab shows each client's profit & loss pulled
straight from their own QuickBooks Online company file, plus the roll-up and
per-client average across the whole book.

Every client's books are a **separate QuickBooks company file**, so every client
is a separate OAuth connection with its own credentials. There is no firm-level
API that enumerates an accountant's clients — connecting one company at a time
is Intuit's rule, not a shortcut we took.

---

## Setting it up (once)

### 1. Create the Intuit app

developer.intuit.com → **Dashboard** → *Create an app* → **QuickBooks Online and
Payments**. Scope: `com.intuit.quickbooks.accounting` only.

### 2. Register the redirect URIs

App → **Keys & credentials** → *Redirect URIs*. Add both:

```
http://localhost:3000/api/portal/quickbooks/callback
https://<production-domain>/api/portal/quickbooks/callback
```

Intuit permits plain `http` for `localhost` only. **Vercel previews cannot
connect companies** — their origin is a different random hostname each deploy
and can't be pre-registered. Previews can read existing connections fine.

### 3. Start the production app assessment now

Sandbox keys work immediately. **Production keys require Intuit's app assessment
questionnaire to be submitted and approved**, and approval is not instant — it
gates access to real client data, so start it in parallel with development
rather than at the end.

### 4. Fill in the environment

See the QuickBooks block in `.env.example`. The one to be careful with is
`QUICKBOOKS_TOKEN_KEY`: it encrypts every client's OAuth tokens at rest, and
losing or rotating it means reconnecting all ~150 companies by hand. It belongs
in the same "don't touch casually" bucket as `FIREBASE_PRIVATE_KEY`.

### 5. Deploy the scheduler

Scheduling lives in **Firebase Cloud Functions**, not Vercel cron. See
[Scheduling](#scheduling) below for why and how to deploy it.

---

## Onboarding a client

Entirely self-serve from the Creator Finances tab. No config, no deploy, no
developer.

1. **Add a client** → Intuit's company picker. Because the firm signs in with a
   QuickBooks Online **Accountant** login, every client book they have access to
   is already in that list.
2. Pick the company, approve.
3. The callback fills in company name, legal name, currency and fiscal year
   start from the API — nothing is typed by hand.
4. The dashboard fires the first sync on arrival, so figures appear in seconds
   rather than after the overnight cron.
5. The **category mapping** tab flags that client's unmapped income accounts.
   Roughly ten accounts, five minutes, once. See below for why this matters.

About 20 seconds per client. The same button is the fix for a revoked
connection, so *reconnect* and *onboard* are one code path.

### What still needs a human, ever

- **The one-time connect**, per company. Intuit has no bulk-connect.
- **A client revoking access** (or cancelling QuickBooks, or removing the firm
  from their books). That row shows a **Reconnect** button.
- **Nothing else.** Token rotation, expiry and the 24-hour refresh cycle are
  invisible.

---

## How it stays alive

Access tokens last 60 minutes. Refresh tokens **rotate** — Intuit hands back a
new one roughly daily and force-expires the old one — and die **~101 days after
their last use**.

That last number is why there are two jobs rather than one:

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/quickbooks-keepalive` | every 6h | Rotates every live connection's refresh token. Cheap: one small POST per company, ~30s for 150. |
| `/api/cron/quickbooks-sync` | hourly | Pulls each client's P&L into the cache. |

Folding them together is the trap: a report pass that runs out of time before
reaching the last companies would also stop refreshing *their* tokens, quietly
turning a latency problem into 150 dead connections a quarter later.

**If the keepalive stops running for over 101 days, every connection dies at
once and all of them need reconnecting by hand.** Nothing else in this system
has that property, which is why the dashboard surfaces "last synced" prominently.

Both routes are safe to call at any frequency. The keepalive skips anything
rotated in the last five hours; the sync stops cleanly at its time budget and
the queue's oldest-synced-first ordering resumes it. So an over-eager scheduler
wastes a request, not a connection.

## Scheduling

Cloud Functions, in `functions/` — **not** Vercel cron. The numbers decide it:

|  | Vercel Hobby | Vercel Pro | Cloud Scheduler |
|---|---|---|---|
| Function duration | 60s | 300s (up to 800s) | n/a — calls the route |
| Cron cadence | once per day, ±1h | per minute | per minute |
| Cost | free | $20/mo | 3 jobs free, then $0.10/job/mo |

On Hobby, one daily 60-second run syncs roughly 15 of 150 clients — the queue
never drains. Cloud Scheduler removes the cadence limit, and running the sync
**hourly** makes the 60s ceiling irrelevant: each short run resumes where the
last stopped.

The functions are deliberately thin — they authenticate and call
`/api/cron/*`, nothing more. Porting the sync logic into them would escape
Vercel's execution limit entirely, at the cost of a second deploy pipeline, a
duplicate set of credentials and two copies of the parser to keep in step. Not
worth it at this scale.

### Deploying it

Requires the **Blaze** plan on the Firebase project (pay-as-you-go; effectively
$0 at this volume, but it needs a billing account).

```bash
cd functions
cp .env.example .env          # set SITE_URL to the production domain
firebase functions:secrets:set CRON_SECRET   # same value as in Vercel
firebase deploy --only functions
```

`SITE_URL` must be the **production** deployment. A preview URL changes on every
deploy, so the schedule would silently stop hitting anything.

On Vercel Hobby, also set `CRON_BUDGET_MS=45000` in the Vercel environment so
the sync stops itself before the platform kills it mid-company.

```bash
firebase functions:log --only quickbooksSync
```

---

## How the data works

### One report call per client per night

`GET /reports/ProfitAndLoss?summarize_column_by=Months` over a window wide
enough to contain every period in the selector (start of the previous fiscal
year through this month).

A P&L is made entirely of **flows**, so any sub-period — year to date, last
quarter, last month — is an **exact** sum of the relevant month columns, not an
estimate. Switching periods in the UI is arithmetic on cached data and makes
**zero** API calls.

What that does *not* cover: a different accounting basis (accrual is not a
function of cash) and months outside the window. Only Accrual is synced today;
cash basis has its own snapshot id, so enabling it later is a flag, not a
migration.

**Volume at 150 clients:** ~300 report + account calls a night, ~600 keepalive
rotations a day. Against Intuit's 200 reports/minute cap and the 500,000
monthly read credits on the free Builder tier, that's about 2%. Cost and rate
limits are not constraints at this scale; the caching is for latency and
connection health.

### Why the category mapping tab exists

Cross-client aggregation can't sum raw account names — one client's "Software",
the next one's "Subscriptions & Tools" and a third's "SaaS" are the same
expense. So accounts normalise onto a shared vocabulary via Intuit's
`AccountSubType`, a closed enum that means the same thing in every company file.

**That works well for expenses and barely at all for income.** QuickBooks has no
subtype that distinguishes AdSense from a brand deal from merch — they all land
in `ServiceFeeIncome` or `SalesOfProductIncome`. So:

- **Per-client revenue streams keep their raw account names.** "YouTube AdSense"
  is the answer the firm wants; normalising it away destroys the feature.
- **The aggregate's income breakdown is driven by the override map**, which is
  why the mapping tab is part of onboarding rather than an advanced setting.

Two scopes: per-account (this client's "YT Money" is platform revenue) and
per-subtype (`DuesSubscriptions` is software, for everyone). The global scope is
what stops onboarding from being the same decision made 150 times.

Nothing is ever dropped — an unmatched account lands in **Uncategorised** and
stays visible. A silently dropped line would make the categories stop summing to
the section total while the headline figure still looked right.

### Totals follow QuickBooks

Section totals come from QuickBooks' own summary rows, never from summing the
leaf accounts. They occasionally disagree, because QuickBooks surfaces unapplied
and uncategorised amounts that aren't leaf rows. When they do, QuickBooks wins
and the difference is recorded in the row's **warnings** — our headline figure
has to reconcile against what the client sees in their own books.

Money is integer **cents** end to end, divided by 100 exactly once at the
formatter. Summing 150 clients in floats produces totals ending `.8899999999`.

---

## Files

| Path | What |
|---|---|
| `src/lib/quickbooks/types.ts` | Every shape the UI sees. Isomorphic. |
| `src/lib/quickbooks/categories.ts` | Canonical categories + the subtype map. Isomorphic. |
| `src/lib/quickbooks/periods.ts` | Period definitions and month arithmetic. Pure. |
| `src/lib/quickbooks/parse.ts` | Report tree → our shape, and period slicing. Pure. |
| `src/lib/quickbooks/aggregate.ts` | Total and average, per currency. Pure. |
| `src/lib/quickbooks/oauth.ts` | The OAuth 2.0 protocol against Intuit. |
| `src/lib/quickbooks/connections.ts` | Token store, encryption, the refresh lease. |
| `src/lib/quickbooks/client.ts` | The Accounting API transport. |
| `src/lib/quickbooks/accounts.ts` | Chart of accounts cache (24h, self-healing). |
| `src/lib/quickbooks/overrides.ts` | The firm's category map. |
| `src/lib/quickbooks/snapshots.ts` | Report cache + the dashboard read. |
| `src/lib/quickbooks/sync.ts` | Orchestration: `syncRealm`, `syncAll`, `keepAlive`. |
| `functions/src/index.ts` | The two scheduled triggers. Thin — they just call the routes. |

Firestore collections: `quickbooksConnections/{realmId}`,
`quickbooksAccounts/{realmId}`, `quickbooksSnapshots/{realmId}__{basis}`,
`quickbooksCategoryOverrides/{realmId}` plus a `_global` document.
`firestore.rules` already denies all client access; no rules change was needed.

The sync query needs one composite index on
(`environment`, `status`, `lastSyncAt`). Firestore prints the create link the
first time the cron runs.

---

## Working on it

```bash
npm run qb:check        # parser regression suite — 93 assertions, no network
npm run qb:introspect   # dump a real company's shapes (needs a playground token)
```

`qb:introspect` wants a short-lived access token and realm id from
[Intuit's OAuth Playground](https://developer.intuit.com/app/developer/playground)
in `.env.local` as `QUICKBOOKS_ACCESS_TOKEN` / `QUICKBOOKS_REALM_ID`. It's
GET-only and never prints a token.

**The fixtures in `src/lib/quickbooks/__fixtures__/` are synthetic** — they were
hand-built to the documented shape because there was no developer app yet.
Replace them with real captures as soon as sandbox credentials exist:

```bash
node scripts/quickbooks-introspect.mjs --write-fixtures
npm run qb:check
```

Anything the synthetic fixtures got wrong about the real response surfaces there
rather than in production.

### The acceptance test

Connect a sandbox company, hit **Sync now**, and confirm the dashboard's totals
match the same P&L rendered in the QuickBooks UI for the same dates and basis.
That reconciliation is the test that matters — everything else is a proxy for it.

### Triggering a cron by hand

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<domain>/api/cron/quickbooks-sync
```

Returns 200 as long as the *run* completed; individual company failures are
recorded on their own rows and reported in the body. A non-2xx means the cron
itself is broken, which is what makes Vercel's cron alerting worth anything.

If a run hits its time budget it stops cleanly and logs how many companies were
left. Nothing is lost — the sync queue is ordered oldest-synced-first, so the
next run resumes exactly there.
