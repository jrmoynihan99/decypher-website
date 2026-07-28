# QuickBooks fixtures

Captured response shapes that `parse.ts` is developed and regression-tested
against, so the parser can be built and verified without a live company file.

## Status: synthetic, but validated against real books

These are hand-built rather than captured, so each one can exercise a specific
awkward case on purpose. They have since been checked against a live QuickBooks
company, and one thing that check found is now baked in — see *parent accounts*
below.

Keep them synthetic. The assertions in `scripts/quickbooks-parse-check.mjs` are
tuned to these exact figures, and swapping in a raw capture would replace a
deliberate edge-case suite with whatever one sandbox company happens to contain.

To look at a real response instead, dump one without overwriting anything:

```
npm run qb:introspect          # uses a connected company's stored token
```

If it surfaces a shape these fixtures don't cover, add it here as a new case
rather than replacing the file.

## What each one exercises

**`profit-and-loss-months.json`** — a creator's three-month P&L, deliberately
containing every awkward case the parser has to survive:

| Case | Where |
|---|---|
| Nested sub-accounts (parent Section with children + its own Summary) | `Brand Partnerships` — rule 1: children count, the parent's Summary must not |
| **A parent account with its OWN postings** | `Brand Partnerships` header row carries `4500.00` — see below |
| Parenthesised negative | `Refunds & Chargebacks` |
| Empty-string cells meaning zero | `Equipment`, `Travel`, `Uncategorized Expense` |
| A leaf with **no account id** | `Uncategorized Expense` — must not be dropped |
| Sub-account whose report label differs from its qualified name | `Sponsorships` → `Brand Partnerships:Sponsorships` |
| All nine section groups present, including COGS and Other Income/Expenses | top level |
| An explicit `ColKey=total` column | `Columns` |

**`accounts.json`** — the matching chart of accounts. Note that AdSense,
Sponsorships, Integrations and Affiliate Commissions all carry
`ServiceFeeIncome`: four genuinely different revenue streams that QuickBooks
cannot tell apart. That's not a flaw in the fixture, it's the reason the
category override map exists.

**`profit-and-loss-empty.json`** — `NoReportData`, arriving as HTTP 200. A valid
zero, not a failure. Every newly onboarded client returns this until their first
transaction lands.

## Parent accounts — the case a synthetic fixture nearly hid

When money is booked **directly to a parent account** rather than to one of its
sub-accounts, QuickBooks puts that amount on the section's **Header** row:

```
Header  "Landscaping Services" #45 = 1477.50   ← the parent's own money
  Data    "Fountains and Garden Lighting" = 2246.50
  Data    "Plants and Soil"               = 2351.97
Summary "Total Landscaping Services"      = 6513.97
```

Walking only the children loses that 1477.50 silently, and the headline total
still reads correctly because it comes from QuickBooks' own summary — so the
error hides in the breakdown. The original version of this fixture gave every
parent an empty header, which is precisely the case where the bug is invisible.
It was caught on a real company file by the section-vs-leaves warning.

`Brand Partnerships` now carries `4500.00` of its own, so the suite would fail
if that handling regressed.

## Arithmetic

The figures reconcile exactly — section summaries equal the sum of their leaves,
monthly columns sum to the total column, and
`netIncome = netOperatingIncome + otherIncome − otherExpenses`. The check script
asserts all three, so an edit that breaks the internal consistency of a fixture
fails loudly instead of silently weakening the test.
