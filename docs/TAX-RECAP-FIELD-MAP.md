# Tax Recap — field map

Reverse-engineered from one sole-prop pairing: tax year 2025, single filer, no W-2, Texas resident with a California part-year return (Form 540NR). "Before" is the income-only ProSeries print (`ZERO WRITEOFFS`), "After" is the final return. The sample values are included so every row can be checked against the forms line by line. Then checked against two more pairings (a CA Form 540 filer and a New Jersey filer) — see "What three pairings showed" at the end.

**Implementation:** this table is `RETURN_FIELDS` in `src/lib/tax-recap/schema.ts`; the formulas are `src/lib/tax-recap/compute.ts`; the extraction prompt in `src/lib/tax-recap/extract.ts` is written from the "Per-return extract" section. Change the map here and there together. The two open questions marked *decided* below were resolved in code as described and are one-line changes if Josiel wants the other reading.

## What the recap contains

Six pages. Only pages 2–5 carry data.

| Page | Section | Data source |
|---|---|---|
| 1 | Cover | tax year |
| 2 | Agenda | current-year income, prior-year income |
| 3 | Tax Summary — "0% Bookkeeping" | BEFORE return |
| 4 | Tax Summary — "100% Bookkeeping" | AFTER return, plus before total and savings |
| 5 | Taxes Due/Refund at Filing, Improvements / Tax Strategy | AFTER return payments, free-text strategy list |
| 6 | Next Steps | static links |

## Per-return extract

Same schema for before and after. Federal lines are Form 1040 (2025 layout) unless noted.

| Field | Source | Before | After |
|---|---|---|---|
| W-2 income | 1040 line 1z | — | — |
| Business net income | Schedule 1 line 3 (= Sch C line 31) | 123,038 | 55,719 |
| Total income | 1040 line 9 | 123,038 | 55,719 |
| AGI | 1040 line 11a (= Form 8879 line 1) | 114,345 | 51,782 |
| QBI deduction | 1040 line 13a | 19,719 | 7,206 |
| Taxable income | 1040 line 15 | 78,876 | 28,826 |
| Income tax | 1040 line 16 | 12,267 | 3,221 |
| SE tax | Schedule 2 line 4 (= Sch SE line 12) | 17,385 | 7,873 |
| Federal total tax | 1040 line 24 (= Form 8879 line 2) | 29,652 | 11,094 |
| Federal payments + credits | 1040 line 33 (includes line 32) | 1,600 | 1,600 |
| Refundable credits | 1040 line 32 (net PTC, ACTC, EIC) | — | — |
| Federal refund | 1040 line 35a | — | — |
| Federal amount owed | 1040 line 37 | 28,052 | 9,494 |
| Federal est. tax penalty | 1040 line 38 | — | — |
| Gross receipts | Sch C line 1 | 123,038 | 123,038 |
| Total expenses | Sch C line 28 | — | 60,751 |
| Home office | Sch C line 30 (Form 8829 line 36) | — | 6,568 |
| State total tax | 540NR line 74 | 848 | 336 |
| State payments | 540NR line 88 | — | — |
| State amount owed | 540NR line 121 | 848 | 336 |
| State refund | 540NR line 125 | — | — |
| State interest + penalties | 540NR lines 122 + 123 | 38 | — |
| State total due | 540NR line 124 (= FTB 8879 line 2) | 886 | 336 |
| State-source income | Nonresident returns only: Schedule CA (540NR) line 10, column E | 16,334 | 16,334 |

Notes on sources:

- The federal **Form 8879** (e-file signature authorization) is a one-page summary: AGI, total tax, withholding, refund, amount owed. The CA **FTB 8879** has CA AGI, amount owed, refund. Both are in both print sets and are almost certainly where the Canva numbers were typed from.
- Schedule SE has a broken text layer in the before PDF (labels are mojibake, numbers survive) and no label text at all in the after PDF. Extraction must read the rendered page, not the text layer alone.
- The before print is a full client copy (cover letter, filing instructions, 1040-ES and 540-ES vouchers, Form 8962, FTB 5805), 43 pages. The after print is 28 pages with a different form set. The mapped lines exist in both.

## Recap fields (derived)

Pages 3 and 4, one column each:

| Recap label | Formula | Before | After |
|---|---|---|---|
| W-2 Income | w2Income | — | — |
| Business Net Income | businessNetIncome | 123,038 | 55,719 |
| Other Income (Loss) | totalIncome − w2Income − businessNetIncome | — | — |
| Gross Income | totalIncome | 123,038 | 55,719 |
| Federal Taxes | federalTotalTax − federalRefundableCredits | 29,652 | 11,094 |
| State Taxes | stateTotalTax, penalties unbundled (*open question 1*) | 848 | 336 |
| Penalties | federalPenalty + statePenalty (*open question 1*) | 38 | — |
| Total Taxes Owed | Federal + State + Penalties | 30,538 | 11,430 |

Page 4 footer:

| Label | Formula | Value |
|---|---|---|
| Before DeCypher BK + Strategies | before.totalTaxes | 30,538 |
| TOTAL TAX SAVINGS | before.totalTaxes − after.totalTaxes | 19,108 |

Page 5, after return only:

| Row | Owed | Paid | Refund (Due) |
|---|---|---|---|
| Federal | due + paid → 11,094 | line 33 − line 32 → 1,600 | line 37 → 9,494 (line 35a if refund) |
| State | due + paid → 336 | line 88 → 0 | line 124 → 336 (line 125 if refund) |
| Total | | | 9,830 |

"Owed" is the whole year's bill — what's due now plus what was already sent in — which is how all three recaps read (Mahony: owed 5,588 = due 5,588 incl. the 224 penalty, paid 0). "Paid" is withholding and estimates only; a refundable credit lowers the tax figure instead.

Page 2:

| Label | Source | Value |
|---|---|---|
| 2025 Income | Sch C line 1 + W-2 (*open question 2*) | 123,038 |
| 2024 Income | **not in either PDF** — prior-year return | 20,013 |

Page 5 strategy list: free text. In this sample the three items are recommendations for next year, not strategies applied on this return.

## Not needed: per-strategy attribution

The recap does not split savings by strategy. It shows one total and a free-text list. So the counterfactual problem raised on the call does not apply to this template.

What *is* available exactly, from the forms, with no counterfactual:

| Breakdown | Formula | Value |
|---|---|---|
| Deductions found | before.businessNetIncome − after.businessNetIncome | 67,319 |
| SE tax saved | before.seTax − after.seTax | 9,512 |
| Federal income tax saved | before.incomeTax − after.incomeTax | 9,046 |
| State saved | before.stateTotalDue − after.stateTotalDue | 550 |
| Total | | 19,108 |

These reconcile to the headline savings to the dollar and could be added to the template.

## Validation identities

Run after extraction. Any failure flags the pair for review.

Within a return:

- 1040 line 24 = line 22 + line 23
- 1040 line 23 = Schedule 2 line 21; Schedule 2 line 4 = Schedule SE line 12
- 1040 line 15 = line 11b − line 14 (floor 0)
- 1040 line 37 = line 24 − line 33 when positive; line 34 = line 33 − line 24 otherwise
- Sch C line 31 = line 29 − line 30; line 29 = line 7 − line 28
- Schedule 1 line 3 = Sch C line 31
- 540NR line 124 = line 121 + line 122 + line 123

Across before and after (the same ProSeries file, income untouched):

- Sch C line 1 equal
- 1040 line 1z equal
- 1040 line 26 (estimated payments) equal
- Filing status equal
- Every extracted value must literally appear in the pdfjs text of the page cited for it

## Minimal page set

Six pages per return carry everything above: Form 8879, 1040 page 1, 1040 page 2, Schedule 1 page 1, Schedule C page 1, 540NR sides 3 and 5. Schedule 2, Schedule SE, and Form 8829 add the cross-checks.

**This is now automated.** `src/lib/tax-recap/pages.ts` picks the pages before sending, keyed on the printed line wording in the table above, and lands on 10-13 pages of a 26-43 page print. Keep the two in step: an anchor there is a line here. Note that Schedule SE is deliberately not an anchor — its text layer is mojibake on these prints — so self-employment tax is taken from Schedule 2 line 4, which is the same figure.

## What three pairings showed

Run through the real extraction (2026-09-11, `claude-sonnet-5`) and compared to the Canva recaps:

| Pairing | State | Result |
|---|---|---|
| Chiu | TX resident, CA 540NR | every figure matches, all 40 lines verified against page text |
| Voloshchakevych | CA 540 | every figure matches, all lines verified |
| Mahony | NJ-1040; the after return is a 27-page **scan** | matches except the federal penalty on line 38, which sits under a redaction box on the scan (224 — the validator names the gap) |

Three conventions came out of Mahony's recap and are now in code:

- **Refundable credits.** Line 33 (966) was entirely a refundable credit (line 32), not a payment. The recap shows Federal Taxes 5,364 = line 24 − line 32 and Paid 0. So Federal Taxes = line 24 − line 32, Paid = line 33 − line 32.
- **NJ bundles the penalty into "Total Tax Due".** The recap's State Taxes (2,979 / 848) are that line minus the underpayment penalty (125 / 28), which lives on the Penalties row with the federal one (503 + 125 = 628; 224 + 28 = 252). `unbundleStatePenalty` in extract.ts proves the case from the arithmetic (total due = tax − payments only if the tax already carries the penalty) and takes it out, with a note. The NJ shared responsibility payment stays inside State Taxes, as it does on the recap.
- **The "70% Bookkeeping" column.** Two of the three recaps carry a middle column whose income side is exactly 70% of the deductions found. **Deliberately not in the tool** — Jason confirmed (2026-09-11) the recap is before and after only.

Reads took 15–65s per return on Sonnet at roughly 75–115k input tokens for a text-based print (a scan is cheaper on input, ~45k, but can't be cross-checked). A scanned print is 15–20MB and goes up in pieces (docs/PORTAL.md → Tax Recap).

## Deriving the before from the after

Added 2026-09-25. The builder takes one PDF, the client's final return; `src/lib/tax-recap/derive.ts` computes the before column from it. A "ZERO WRITEOFFS" print is the same ProSeries file with every Schedule C expense and the home office deleted and recalculated — same income, payments and filing status — so for a plain sole-prop return it is a function of the return's own lines plus the year's tax tables.

**Tables and rules are both data.** The Tax Tables page (`/portal/tax-recap/tables`) holds a card per year: the federal figures (brackets, standard deduction, tax-table rounding, SE rates, wage base, additional Medicare and QBI thresholds) and a card per state describing its rules as choices the engine interprets — starting point (federal AGI or taxable income), add-backs (SE deduction, QBI), deduction (own standard / federal / none), exemption (none / credit / deduction, with an optional AGI phase-out), brackets, tax-table rounding, surtax, city tax. Seeds ship in `src/lib/tax-recap/tables.ts`; a saved year lives in Firestore and overrides the seed. A new year is a copy of the last with the published figures typed in; a new state is a card filled in on the page. Nothing state-specific is in code. The 2025 seed covers federal, California Form 540 and the nine no-income-tax states; every other state is added on the page and proven there.

**The engine refuses unless it can prove itself.** Before deriving anything it re-runs the return from its own inputs and compares to the lines Claude read — SE tax, adjustments, deduction, QBI, taxable income, income tax, the child tax credit, net investment income tax, federal total, state total, and for an S corporation the entity's tax — each within $2. Any miss names the line and the likely cause, and the builder offers to take the before column typed or from a before print. Refused outright: refundable credits on line 32, Schedule C with COGS/returns/other income, anything but the plain standard deduction, a sole proprietor's before-income over the QBI threshold, any state or year without a card. Since 2026-09-25 the engine also models Form 8995-A above the threshold (when its lines were read), the nonrefundable child tax credit (the number of children is the smallest count that reproduces line 19), the child-care credit as read (gated on earned income), Form 8960 on "other income", and the S corporation shape (next section). The same proof runs on the Tax Tables page against every saved recap whose before was read from a real print, live as a card is edited: a wrong number shows as "off" next to the client, with both figures.

**Nonresident and part-year returns (added 2026-09-25).** A state card can name its nonresident form (California: 540NR); the engine then follows the 540NR line by line: tax as if resident on all income (line 31), state AGI = state-source income less the adjustments' share (32), state taxable income less the standard deduction's share (35), the resident rate to four decimals (36), the prorated tax (37), the exemption credit prorated by the taxable-income share (38–39). State-source income is read from Schedule CA (540NR) line 10 column E and is a fixed dollar amount — Chiu's is $16,334 on both prints — so it doesn't move when the write-offs come off. `pages.ts` keeps the Schedule CA (540NR) sides and 540NR side 2 on their own wording, since they carry no closing total. Proven on Chiu's pairing: before $848, after $336, every federal line too.

**Ordinary adjustments carry across.** Schedule 1 deductions other than the SE tax deduction (student loan interest, health insurance, an HSA, a SEP) stay on the before at the after's amount, with a note, because the CPA's before prints keep them (Mahony's before keeps his $857 health insurance and a $751 adjustment). Only the SE deduction is recomputed.

**What it cannot derive.** Underpayment penalties (Form 2210 needs prior-year tax and payment dates). The after return's penalty is carried across as a floor; the note says so. Chiu's before print carries a $38 California penalty the after doesn't, so his derived recap reads $19,070 against the Canva's $19,108.

**Mahony is a Premium Tax Credit case, not a credit-table case.** His $966 on line 32 is a net premium tax credit (Form 8962: marketplace coverage six months, family size 1, 401% of the poverty line on the before, so the before *repays* $948 of advance credit while the after *receives* $966), computed iteratively against the self-employed health insurance deduction (Form 7206, $857). New Jersey adds a property-tax deduction from rent ($1,464), a shared-responsibility payment for the uninsured months ($749 = 2.5% of income over $10,000 × 6/12) and its own tax table. Every input is on the return, but modeling it means Form 8962's applicable-figure table and repayment limits, the 7206 iteration, and three NJ rules. Left for its own build; the engine refuses on the refundable credit and says so.

**Conventions that had to be exact.** QBI is net profit less the SE deduction (§1.199A-3), which is what the after print does; the before print (a later ProSeries revision) didn't subtract it, invisible here because the income limit binds, but a W-2 + Schedule C client could show a small difference (noted on the recap). IRS tax table under $100k: $50 rows priced at the midpoint. FTB tax table under $100k: $100 rows centred on the hundreds (51–150, 151–250 …), priced at that hundred — a plain midpoint was $4 off on Inha's after return.

**Verified** (`scripts/tax-recap-derive-check.mjs`, and through the real portal on 2026-09-25): Voloshchakevych's after return alone reproduces every line of the CPA's before print and the recap's $32,179 — federal 41,287, CA 9,667, owed 31,687 / 8,929. Chiu's after alone is refused with "CA Form 540NR isn't supported". The stored recap records `derivedBefore` (engine version + notes) in place of a before extraction.

## S corporation clients (added 2026-09-25)

Reverse-engineered from the LaLaNation89 Inc. / Wilson pairing: a head-of-household California filer whose business is an S corporation. Four prints: the final 1120-S (52 pages: Form 1120-S, California Form 100S, a Georgia 600S with no tax), the final 1040 (44 pages: Form 1040, Schedule E page 2, Form 8995-A, Form 2441, Form 8960, Form 8962, Form 7206, California 540, FTB 3804-CR), and a zero-write-off print of each. Samples in `Downloads\FOR JASON PART2`.

**Two after returns go in one drop.** The browser tells them apart by their own pages (`detectReturnKind` in `pages.ts`: "U.S. Income Tax Return for an S Corporation" vs "U.S. Individual Income Tax Return"), reads each with its own instructions (`extractReturn` / `extractEntityReturn` in `extract.ts`), and paints the words learned from either out of both — the corporation's name off the 1120-S is painted out of the 1040's Schedule E, the owner's name off the 1040 out of the K-1.

**What "before" means for an S corporation.** The CPA's zero-write-off prints zero *everything* on the 1120-S: cost of goods sold, the owner's salary, the other wages, the Solo 401(k), the health insurance, the state taxes. The K-1 becomes the gross receipts. On the 1040 the W-2 disappears (and with it the withholding), the QBI deduction goes to zero (over the threshold with no W-2 wages), the self-employed health insurance deduction goes (no wages to run the premiums through), the child-care credit goes (no earned income). There is no PTE election on the before, so the shareholder pays the state tax on the 540 and the corporation owes only the franchise tax. Neither side has SE tax, which is why the "S-corp savings" is a separate figure (below).

Per-entity extract (`ENTITY_FIELDS` in `schema.ts`):

| Field | Source | After | Before (print) |
|---|---|---|---|
| Gross receipts | 1120-S line 1a | 836,958 | 836,958 |
| Cost of goods sold | line 2 | 46,141 | — |
| Total income | line 6 | 790,817 | 836,958 |
| Compensation of officers | line 7 | 76,971 | — |
| Salaries and wages | line 8 | 46,026 | — |
| Taxes and licenses | line 12 | 21,423 | — |
| Pension plans | line 17 | 17,500 | — |
| Other deductions | line 20 | 155,835 | — |
| Total deductions | line 21 | 319,193 | — |
| Ordinary business income | line 22 | 471,624 | 836,958 |
| Shareholder's ordinary income | K-1 box 1 | 471,624 | 836,958 |
| Ownership % | K-1 item G | 100 | 100 |
| Distributions | K-1 box 16 D | 123,886 | — |
| State net income | 100S line 20 | 511,924 | 836,958 |
| State taxes added back | 100S line 2 | 40,300 | — |
| State S corporation tax | 100S line 21 (1.5%, $800 minimum) | 7,679 | 12,554 |
| PTE elective tax | 100S line 29 / Form 3804 (not on this print; taken from the 1040's FTB 3804-CR line 3) | 47,609 | — |

New 1040 lines for the shape: S corporation income (Schedule 1 line 5 = Schedule E page 2 line 41: 471,624 / 836,958), Form 8995-A lines 2 and 4 (386,732 of QBI against 63,116 of W-2 wages → 50% limit = the printed 31,558; the before print scales the QBI with the K-1 to 686,306 and the wages are 0), Medicare wages from the S corporation (Form 7206 line 11: 70,000 — the officer's 76,971 is that plus 6,971 of health insurance; box 1 is 76,971 less the 23,500 deferral = 53,471), the child-care credit (Schedule 3 line 2: 600), the dependents count (1), the 540's exemption credits after phase-out (line 32: 145 = the $153 personal credit gone and the $475 dependent credit down to 145, each on its own), and the PTE credit (FTB 3804-CR: 47,609 available, 41,111 claimed, 6,498 carried forward). Withholding (1040 line 25d: 3,376; 540 line 71: 368) is read so it can leave with the W-2.

**Recap rows.** Business net income is the K-1. A new row, "State S-corp tax & PTET", carries the corporation's own state tax (1.5% + the elective tax): 55,288 after, 12,554 before. State taxes stays the shareholder's own 540 tax: 0 after (the PTE credit covers it), 76,243 before. The Canva recap folded the two into one row and reads 88,602 before where the prints give 88,797; the tool follows the prints. The filing page gains an "S-corp (PTET)" line: 55,288 owed, paid with the election, 0 due.

**Verified** (`npm run recap:check`): from the two after returns alone the engine reproduces both before prints to the dollar — federal 258,625 (tax 255,105 + the 3,520 advance credit repaid), California 76,243, payments 0 and 800, the corporation's 12,554 — and the before's Form 8995-A line 2 (686,306). Savings 160,426 against the Canva's 160,231 (the $195 above).

**Savings by strategy.** `attributeStrategies` in `derive.ts` walks from the before to the after switching one strategy on at a time and re-running everything — the 1120-S, the K-1, the 1040, the 540, the 100S — so the steps sum to the headline exactly. Order: business write-offs (cost of goods sold and every 1120-S deduction other than the owner's pay, the retirement plan and the state taxes deducted), the owner's salary (the W-2, the health insurance deduction, the W-2 wages that unlock the QBI deduction, the child-care credit), the Solo 401(k) (the deferral out of the W-2 and the employer contribution), the PTE election (the federal deduction for the state tax, the entity's elective tax, the shareholder's credit). Wilson: 113,744 / 15,959 / 18,884 / 11,839. For a sole proprietor: write-offs, then the home office. The order is printed on the recap because it matters: the first step gets the top bracket.

**S-corp savings.** The Canva's "S-CORP TAX SAVINGS: $35,140" is described as "estimated self-employment tax avoided through the S-Corp structure" and matches no formula on the returns (Schedule SE on the K-1 is 34,467; with the additional Medicare tax 36,587; on the K-1 plus the salary, less the FICA paid, 28,578; the returns carry no Schedule SE at all). The engine reports **36,587**: Schedule SE on the K-1 ordinary income as if it were Schedule C profit, with the whole wage base (a sole proprietor has no W-2), plus the 0.9% additional Medicare tax over the threshold. Gross of the payroll tax the corporation paid on the salary, since as a sole proprietor that pay would have carried SE tax too. It sits outside the before/after — both are S corporation returns — and is added on top, as the Canva does: "Bookkeeping + strategies" + "S-corp" = "Total tax savings". Josiel to confirm the convention.

**Not modeled (refused with the line named):** a second business or K-1, a loss year, more than one shareholder where the K-1 doesn't reconcile to item G, capital gains or qualified dividends in the tax, the QBI phase-in range on the before for a specified service business, a state without an S corporation card, a W-2 from another employer.

**The state's S corporation card** (`entity` on a state card; Tax Tables page → "Rules · S corporations"): a rate on the corporation's net income, a minimum tax that is flat or tiered by gross receipts, and the elective pass-through entity tax as brackets on the entity's income plus how it comes back to the owner — a nonrefundable credit inside the state's total (California), a refundable credit claimed with the payments (New Jersey, New York), or the income left off the owner's return (Georgia). A refundable credit is read into its own field, `statePteCreditRefundable` (NJ-1040 line 63), and the recap nets it out of State Taxes and out of the payments the way it does the federal refundable credits; the printed total (NJ-1040 line 54) stays gross. The shareholder's credit is their ownership share of the entity's tax.

Seeded for 2025: **California** (1.5%, $800, 9.3% nonrefundable — proven on LaLaNation89) and **New Jersey** (no income rate; minimum $375 / $562.50 / $750 / $1,125 / $1,500 by gross receipts under $100k / $250k / $500k / $1M / over, per the Division of Taxation's CBT overview; BAIT at 5.675% to $250,000, 6.52% to $1,000,000, 10.9% over, refundable, per the Division's BAIT page — the 9.12% tier was dropped for 2022 on). The New Jersey figures are statutory and **not yet proven on a real NJ S corporation pairing**; the engine refuses if a return's own CBT-100S tax or BAIT doesn't reproduce, and the shareholder's line 22 (net pro rata share of S corporation income) is read into `stateBusinessIncome` for the NJ gross-income base. `npm run recap:check` exercises both cards' arithmetic.

## Every state is seeded (added 2026-09-25, later)

Jason's call: an unproven card is strictly better than none, because without a card the engine refuses outright and with one it still refuses unless it reproduces the client's own printed tax first — so a wrong figure surfaces as a refusal naming the line, never as a wrong recap. `src/lib/tax-recap/seeds-2025-states.ts` holds the 2025 cards for the 39 income-tax states and DC that the samples didn't cover (California and New Jersey stay in `tables.ts`, the nine no-tax states are generated). Each card carries `proven: false` and a `note` saying where its figures came from, which to verify first, and what the engine's state model can't express there — the states where the first client will most likely get a refusal and a typed before:

- **A deduction for federal income tax paid**: Alabama (in full), Missouri (capped), Oregon (the federal tax subtraction). Also Idaho's grocery credit and Utah's taxpayer tax credit.
- **A local tax on every return** the card can't hold because it varies by county: Indiana, Maryland (the state's own schedule is seeded; the county rate is added as a city tax for a given client). New York City and Michigan cities the same way.
- **Income-based deductions the model doesn't shape**: Wisconsin's sliding standard deduction, Maryland's 15%-of-AGI deduction, Ohio's business income deduction (the first $250,000 of business income deducted, the rest at 3% — every Ohio business owner), North Carolina's child deduction, Connecticut's exemption phase-out and recapture, Massachusetts's FICA deduction.
- **Credits the state gives at a different share**: Connecticut's PE tax credit is 93.01% and Massachusetts's PTE credit is 90%; the engine gives 100%, so those lines mismatch.
- **Entity rules that don't fit rate-plus-minimum**: DC taxes S corporations as C corporations; New Hampshire's business profits tax and Tennessee's excise tax hit S corporations in states with no personal income tax (not modeled — those cards say "no income tax" and the entity is skipped).

The Tax Tables page shows "Seeded, not yet proven on a client" on such a card, with a switch to flip once a client of that state has gone through cleanly, and the review list's derived notes say when an unproven card was used. `npm run recap:check` validates every seeded card the way the editor does (bracket order, percentages, minimum tiers) and counts them, so a typo can't block the year from saving.

## Tax years 2023, 2024 and 2026 (added 2026-09-28)

Four years are seeded. The federal cards are the published ones: Rev. Proc. 2022-38 (2023), 2023-34 (2024), 2024-40 plus the 2025 Act (2025) and 2025-32 (2026), with the year's wage base, QBI threshold (and the 2026 Act's wider $75,000 / $150,000 phase-in range), child tax credit ($2,000 through 2024, $2,200 from 2025) and premium tax credit table. **2026's Form 8962 reverts** to the pre-2021 schedule because the enhanced credit expired after 2025: applicable figure 2.1% to 9.96% and no credit at or above 400% of the poverty line (the card's cap figure of 100% produces that); if Congress restores it, copy the 2025 PTC block over. The 2023 and 2024 repayment caps are the year's ($350/$900/$1,500 and $375/$975/$1,625 single).

State cards for the other years live in `src/lib/tax-recap/seeds-state-years.ts` as overrides on the 2025 cards, and fall into three kinds — the card's note says which:

- **The year's own figures**: California 2023 and 2024 (FTB schedules, deductions, credits and thresholds), the flat-rate states' year-by-year rates (Georgia 5.75% graduated → 5.49% → 5.19% → 5.09%; Kentucky 4.5 → 4.0 → 4.0 → 3.5%; Indiana, Idaho, Mississippi, North Carolina, Utah, Colorado's 4.25% TABOR year, Iowa's path to 3.8%, Louisiana's move to 3% for 2025, Ohio's to a flat 2.75% for 2026, Nebraska's stepping top rate, Arkansas), and the 2023/2024 indexed schedules known for Minnesota, Wisconsin, Oregon, Maine, Rhode Island, Vermont, Missouri, North Dakota, Kansas, Maryland, Montana (2023 was a different structure), New Mexico, South Carolina, West Virginia, Connecticut (3%/5% lower rates in 2023), Michigan, Illinois, Hawaii, Virginia.
- **Unindexed, so the 2025 card applies**: New Jersey, New York, Pennsylvania, Illinois' rate, Oklahoma, Delaware, DC, Virginia's brackets, Arizona.
- **Carried from 2025 with a "CARRIED FROM 2025" note**: every indexed state for 2026 (their 2026 schedules aren't published until late 2026), and a few 2023/2024 states whose indexed figures weren't at hand. A carried card can't produce a wrong recap — the engine refuses when the year's tax doesn't reproduce — but it will refuse until the figures are typed in on the page.

Every year card starts unproven except 2025's California and New Jersey. `npm run recap:check` validates all four years, counts the carried cards, and checks each federal schedule on a $50,000 single taxable income (6,308 / 6,053 / 5,915 / 5,752).

## What leaves the browser

Added 2026-09-25. `pdf-prepare.ts` renders only the kept pages, paints out the identity, and sends an images-only PDF (no text layer), so the model reads pages with no name, SSN, address, business name, bank numbers, email, phone or date of birth on them. Two passes: the 1040's header band (between "Your first name" and "Foreign country name") and Schedule C's "Business name" box are painted whole and their values become tokens painted out wherever else they appear (the 8879, Form 8995, every state page, the 540's four-letter name code); then patterns — SSNs in the three ways ProSeries prints them, EINs, 9+ digit runs, emails, phones, dates. The page text sent for the cross-check is scrubbed with the same tokens. The client's name is read locally off the 1040 and fills the client field; the model never sees it. A scan has no text to find any of this in and goes as printed, with a warning on the review list. Checked on Inha's and Chiu's prints page by page (43 and 40 boxes; every number intact; both read and derived correctly afterwards).

## Open questions for Josiel

1. **State Taxes basis** — *decided in code, confirm.* The before column shows 886, which is 540NR line 124 (total due, including the 38 underpayment penalty). The federal column uses line 24 (total tax before payments). Built as: State Taxes = 540NR line 74 (848), Penalties = 540NR lines 122 + 123 plus 1040 line 38 (38). Same total, and the Penalties row gets used. Also matters for clients with state withholding, where line 124 would understate their state tax. (`sideSummary` in compute.ts.)
2. **"2025 Income" on the agenda page** — *decided in code, confirm.* Gross receipts (Sch C line 1) or before-net-income? Identical here. Built as gross receipts plus W-2 wages. (`currentYearIncome` in compute.ts.)
3. **"2024 Income."** Not on either return. Options: type it in, upload last year's return as an optional third PDF, or pull it from last year's recap record once the tool has run a season.
4. **Strategy list.** Free text, or a pick-list with standard wording (bookkeeping, S-Corp, Solo 401k / SEP, estimated payments, ...)?
5. **Print set.** Can before and after be printed with the same form set? The 8879s should always be included. And export from ProSeries rather than scanning: a scan reads fine but nothing can be cross-checked, and a redaction box on a scan hides the line under it (Mahony's line 38).
7. ~~**The 70% column.**~~ Resolved: not wanted. The recap is before and after only.
6. **Redaction.** The after PDF's black boxes sit on top of the page; the text layer still contains the SSN, date of birth, email, and bank routing/account numbers (FTB 8455). ProSeries can zero the SSN at print time, as the before PDF shows (000-00-0000). The tool should never store the raw PDFs.
