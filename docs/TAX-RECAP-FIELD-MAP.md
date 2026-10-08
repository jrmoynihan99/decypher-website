# Tax Recap — field map

Reverse-engineered from one sole-prop pairing: tax year 2025, single filer, no W-2, Texas resident with a California part-year return (Form 540NR). "Before" is the income-only ProSeries print (`ZERO WRITEOFFS`), "After" is the final return. The sample values are included so every row can be checked against the forms line by line. Then checked against two more pairings (a CA Form 540 filer and a New Jersey filer) — see "What three pairings showed" at the end.

**Implementation:** this table is `RETURN_FIELDS` in `src/lib/tax-recap/schema.ts`; the formulas are `src/lib/tax-recap/compute.ts`; the extraction prompt in `src/lib/tax-recap/extract.ts` is written from the "Per-return extract" section. Change the map here and there together. The two open questions marked *decided* below were resolved in code as described and are one-line changes if Josiel wants the other reading. Later sections add what each new kind of return taught the tool: the derivation engine, S corporations, every state, other years, the Weinstein return, partnerships and LLCs, and rental real estate with real estate professional status.

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
| Cost of goods sold (Sch C) | Sch C line 4 — a write-off, zeroed with the expenses (Weinstein: 19,763) | — | — |
| Wages paid (Sch C) | Sch C line 26 — with depreciation, decides whether the QBI limit over the threshold is zero | — | — |
| Depreciation (Sch C) | Sch C line 13 | — | — |
| Qualified dividends | 1040 line 3a — taxed by the capital gains worksheet (Weinstein: 1,317) | — | — |
| Capital gain or (loss) | 1040 line 7 | — | — |
| QBI loss carryforward | Form 8995 line 3, as a positive number (Weinstein: 21,039) | — | — |
| Other taxes (line 23) | 1040 line 23 — printed 0 means no SE tax, even with no Schedule SE in the print | — | — |
| Other payments (line 31) | 1040 line 31 (= Schedule 3 line 15): extension payment, excess Social Security — inside line 32 but a payment, not a credit (Weinstein: 9,115) | — | — |
| State adjustments to federal AGI | CA 540 line 16 − line 14 (Schedule CA line 27, column C − column B), carried across (Weinstein: +4,150, an HSA add-back) | — | — |
| State total tax | 540NR line 74 | 848 | 336 |
| State payments | 540NR line 88 | — | — |
| State amount owed | 540NR line 121 | 848 | 336 |
| State refund | 540NR line 125 | — | — |
| State interest + penalties | 540NR lines 122 + 123 | 38 | — |
| State total due | 540NR line 124 (= FTB 8879 line 2) | 886 | 336 |
| State-source income | Nonresident returns only: Schedule CA (540NR) line 10, column E | 16,334 | 16,334 |
| Partnership income (K-1) | Schedule E page 2, the partnership rows: ordinary income plus guaranteed payments (Singh: 163,173 / 241,298) | — | — |
| Rental income or (loss) | Schedule E line 26 as deducted (Carpenter: −79,519) | — | — |
| Rental profits / losses | Schedule E line 21, the profit properties and the loss properties added up separately (Carpenter: 0 / 79,519) | — | — |
| Rents received | Schedule E line 23a, every rental property's rents, printed on the first Schedule E page 1 (Carpenter: 111,643) | — | — |
| Rental expenses | Schedule E line 23e, every property's expenses with depreciation (Carpenter: 191,162); 23a − 23e must equal the properties' net | — | — |
| Prior years' unallowed passive losses | Form 8582 line 1c + 2c (Carpenter: 9,847) | — | — |
| Real estate professional rentals | Schedule E line 43 — nonzero when REPS is claimed (Carpenter: −79,519) | — | — |
| Net long-term capital gain | Schedule D line 15 (Carpenter: 19 of the 46 on line 7) | — | — |
| SEP, SIMPLE and qualified plans | Schedule 1 line 16 — reduces QBI and the health insurance cap; off on the before (Carpenter: 3,000) | — | — |
| IRA deduction | Schedule 1 line 20 — off on the before (Carpenter: 2,500) | — | — |
| HSA deduction | Schedule 1 line 13, not a payroll HSA — off on the before, with a state's add-back of it | — | — |
| Itemized deductions | Schedule A line 17, read whenever the print has a Schedule A (Carpenter: 45,683; Singh: 23,598 under the standard deduction) | — | — |
| State and local taxes paid / deducted | Schedule A lines 5d / 5e (Carpenter: 19,963 / 19,963) | — | — |
| Medical expenses | Schedule A line 1 (both: 0) | — | — |
| State deduction taken | CA 540 line 18 — the state's own itemized deductions when they beat its standard deduction (Singh: 21,973) | — | — |
| W-2 wages, taxpayer / spouse | Box 1 of each person's W-2s added up — from the W-2 copies, or a state wage schedule that lists each W-2 with whose it is (Massachusetts Schedule INC; Brandt: 15,000 / 57,000) | — | — |
| W-2 wages from the business, taxpayer / spouse | The part of each person's W-2s the client's own S corporation or partnership paid. The browser finds those W-2s by EIN in the unredacted text and tells the reader which pages they are on; the reader never sees the EIN (Brandt: 15,000 the officer's, 57,000 the spouse's on the payroll) | — | — |
| Claimed as someone's dependent | 1040 line 12a checkbox → the dependent's limited standard deduction (earned income + $450, at least $1,350 in 2025) | — | — |
| Children / other dependents | Schedule 8812 lines 4 and 6: line 19 is 2,200 per child plus 500 per other dependent, phased out together (Brandt: 2 and 1 → 4,900) | — | — |
| State Social Security / Medicare deduction | Massachusetts Form 1 lines 11a + 11b: 7.65% of each person's wages up to $2,000 per person (Brandt: 1,148 + 2,000) | — | — |
| Owner's section 179 deduction (K-1) | Schedule K-1 (1120-S) box 11, which Schedule E column (j) nets off box 1 (Luciano: 67,578 − 4,126 = 63,452 on Schedule 1); zeroed on the before with the write-offs | — | — |
| State-source income, Maryland | Form 505NR line 8 (the Maryland income); the 505NR scales the 15% deduction and the exemptions by its share of federal AGI, the resident tax by the share of taxable income, and adds the 2.25% special nonresident tax (Luciano: 564 + 270 = 834) | — | — |

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
- Sch C line 31 = line 29 − line 30; line 29 = line 7 − line 28; line 7 = line 1 − line 4 (cost of goods sold) when there are no returns or other income
- Schedule 1 line 3 = Sch C line 31
- 1040 line 31 ≤ line 32 (line 32 includes it); the recap's refundable credits are line 32 − line 31
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

**Garbled pages are kept, not matched (added 2026-10-01).** The mojibake isn't limited to Schedule SE: on Weinstein's 2024 print it covers both Schedule C copies, Form 8995 and every FTB form (540 sides 1–6, Schedule CA, FTB 5805, the FTB 8879s). The page renders perfectly; the font behind the labels just maps its glyphs to control characters and symbols, while the filled-in values are in ProSeries' data font and come through intact. Matching such a page on wording is impossible, and dropping it was the bug: the filter sent ten pages with no Schedule C on them and the engine reported "Gross receipts, Business net income, Self-employment tax weren't read". `isGarbledText` in `pages.ts` judges a page by its characters (8% or more garbage among the non-space characters; clean pages run under 1%, garbled ones 25–70%) and `selectPages` keeps any such page. Two trims then take the print from 34 pages back to 22 without losing a line: a page whose text layer is identical to an earlier kept page is skipped (ProSeries attaches a second copy of the whole federal return behind the California one — seven pages here), and a garbled page with no filled-in amount in the data fonts is skipped (the blank FTB 5805 annualization sides, Schedule CA side 2, the 540 signature page, FTB 5805 side 1 — five pages). "Amount" means four or more digits in a data font that isn't an SSN, EIN, phone or bank number, so the FTB's three-digit form code on every page doesn't keep a page alive. `pdf-prepare.ts` counts them, since it can see the fonts, and hands the counts to `selectPages`; with no data font identified, every garbled page is sent.

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

**The engine refuses unless it can prove itself.** Before deriving anything it re-runs the return from its own inputs and compares to the lines Claude read — SE tax, adjustments, deduction, QBI, taxable income, income tax, the child tax credit, net investment income tax, federal total, state total, and for an S corporation the entity's tax — each within $2. Any miss names the line and the likely cause, and the builder offers to take the before column typed or from a before print. Refused outright: refundable credits on line 32 (net of line 31), a Schedule C with returns or other income on line 6, anything but the plain standard deduction, a sole proprietor's before-income over the QBI threshold when the Schedule C pays wages or claims depreciation, any state or year without a card. Since 2026-10-01 cost of goods sold on a Schedule C, qualified dividends and long-term gains, a QBI loss carryforward, and a state's own adjustments to federal AGI are modeled rather than refused — see "The Weinstein return" below. Since 2026-09-25 the engine also models Form 8995-A above the threshold (when its lines were read), the nonrefundable child tax credit (the number of children is the smallest count that reproduces line 19), the child-care credit as read (gated on earned income), Form 8960 on "other income", and the S corporation shape (next section). The same proof runs on the Tax Tables page against every saved recap whose before was read from a real print, live as a card is edited: a wrong number shows as "off" next to the client, with both figures.

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

**Not modeled (refused with the line named):** a second business or K-1, a loss year, more than one shareholder where the K-1 doesn't reconcile to item G, the QBI phase-in range on the before for a specified service business, a state without an S corporation card, a W-2 from another employer. (Capital gains and qualified dividends have been modeled since the Weinstein return; partnerships since the Singh return — next sections.)

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

**A garbled page gets a third pass (added 2026-10-01).** The patterns and tokens still work on it — the values are readable, so the SSN, name, address, phone, date of birth and bank numbers are all still caught — but the Schedule C business-name box is found by its printed label, which on such a page is unreadable, so the LLC name would have gone through. Rather than trust any wording on the page, every run set in a *data font* that contains two or more letters is painted out. The data fonts are whichever fonts the SSN or one of the identity tokens was printed in anywhere in the document (ProSeries uses one for the federal values, one for the FTB values); the labels are in the broken font and are left alone, and the numbers stay. The page text sent for the cross-check is rebuilt from the unpainted runs. The review list says which pages went this way. If no data font could be identified, the warning says the page went as printed.

## The Weinstein return (added 2026-10-01)

A 2024 return a friend of Jason's dropped in: single, California resident, $185,261 of W-2 wages and a content-creation Schedule C with $95,015 of receipts written down to $0 by $19,763 of cost of goods sold, $60,172 of expenses and $15,080 of home office (another $10,444 of home office carried forward on Form 8829, and a $21,039 QBI loss carryforward on Form 8995). Exactly the tool's case, and it hit six things at once. In the order the engine would have met them:

1. **The page filter dropped Schedule C** (garbled text layer, above). Fixed in `pages.ts`; the filter now sends 34 of the 52 pages.
2. **No Schedule SE in the print.** Net profit is $0, so ProSeries printed no Schedule 1, 2 or SE, and the engine's required list read a blank SE tax as "not read". `impliedLines` in `derive.ts` takes SE tax as $0 when line 23 prints 0, or when the Schedule C profit is under the $400 floor, and says so in the notes.
3. **Cost of goods sold on the Schedule C.** The sole-prop identity is now gross − COGS − expenses − home office = net; COGS is zeroed on the before with the expenses and counted in the bookkeeping step of the split.
4. **Qualified dividends.** Line 16 is $34,379, not the $34,497 the brackets give on $172,728, because $1,317 of dividends is taxed at 15%. `taxOnIncome` runs the Qualified Dividends and Capital Gain Tax Worksheet (ordinary slice by the table, the preferential slice at 0% / 15% / 20% by where it sits, the smaller of that and the plain tax), and the QBI limit takes the net capital gain out of taxable income (Form 8995 line 12). The 0% and top-rate thresholds are a new `capitalGains` block on the federal card (Rev. Procs. 2022-38, 2023-34, 2024-40, 2025-32; the Tax Tables page edits them). Line 7 is taken whole as long-term gain; a Schedule D with short-term gains or 28% / unrecaptured §1250 gain still fails the line 16 proof and refuses.
5. **Over the QBI threshold on the before.** Taxable income before QBI is $266,470 against the $191,950 single threshold, and the after return has no Form 8995-A to read the wage and property limits from. The gate now reads Schedule C lines 26 (wages) and 13 (depreciation): both blank means the limits are zero and the deduction is whatever the phase-in leaves (here $0), with a note that earlier Section 179 property would add 2.5% of its basis; anything on either line still refuses.
6. **Line 32 wasn't a refundable credit.** The $9,115 there is an $8,000 extension payment plus $1,115 of excess Social Security (line 31). The engine compared it to the $0 of refundable credits it computes and would have refused. Line 31 is now read, netted out of line 32 for the credit check and for the recap's Federal Taxes, and kept in the payments on both sides.
7. **California's HSA add-back.** CA AGI is $191,478 = federal $187,328 + $4,150 of employer HSA contributions (Schedule CA line 1a column C). Without it the 540 proof misses by $386. The net of Schedule CA columns B and C is read as `stateAdjustments` and carried across, like the federal carried adjustments.

With all seven in, the after return proves on every line and the before derives: federal $66,657 (tax $63,376 by the worksheet, SE Medicare only since the wages exceed the wage base, $657 of additional Medicare, $79 of NIIT), California $22,494 (the $149 exemption credit phased down to $59 on federal AGI), savings $41,086 split $35,649 bookkeeping / $5,437 home office. `npm run recap:check` carries the case with every figure checked by hand, plus the same return with the Schedule C lines blanked, which has to refuse on "Gross receipts, Business net income" and nothing else.

**The refusal box now shows its evidence.** The reader's notes and the "couldn't verify" line for the after return, and how many of the return's pages were sent, appear under the engine's reasons — the two things that tell "this return has no Schedule C" from "the model never saw the Schedule C".

## Partnerships and LLCs (added 2026-10-01)

Reverse-engineered from the Singh & Saini / YouTwoTV LLC pairing: a married couple filing jointly in California who are the two 50% members of an LLC taxed as a partnership. Four prints: the final 1065 (42 pages: Form 1065 — whose page 1 has the garbled text layer — Schedule K, two K-1s, California Form 568 with its Schedule K-1 (568)s), the final 1040 (44 pages: two Schedule SEs, two Forms 7206, Form 8995, Schedule A, California 540 and Schedule CA), and a zero-write-off print of each. Samples in `Downloads\For Jason part 3`. The Canva recap for this client reads $59,481 before; the CPA who sent the returns said his own before print (what the engine proves against) comes out higher because he zeroes the health insurance too — it reads $70,037 with the LLC's $800, and the engine reproduces it line for line.

**Two after returns in one drop, as for an S corporation.** The 1065 is told apart by its K-1s ("Schedule K-1 (Form 1065)", "Partner's Share of Income") since its own first page can't be read; `detectEntityForm` in `pages.ts` says which form, the reader confirms it (`returnForm` on the entity extract), and the engine uses it to settle which Schedule E line the reader put the K-1 income on. The same `ENTITY_FIELDS` serve both forms; the 1065 lines are named beside the 1120-S ones.

**What "before" means for a partnership.** Every deduction on the 1065 at zero — here $20,494 of interest, $57,631 of other expenses, and the $8,290 of guaranteed payments that are the partners' health premiums (K-1 box 13 code M, Schedule K line 13e) — so each K-1 is that partner's share of the gross receipts and there are no guaranteed payments, hence no self-employed health insurance deduction. The LLC's own California bill doesn't move: the $800 annual tax both sides, and the LLC fee is on total income (Schedule IW), which the write-offs don't touch.

Per-entity extract, the 1065 lines:

| Field | Source | After | Before (print) |
|---|---|---|---|
| Gross receipts | 1065 line 1a | 241,298 | 241,298 |
| Total income | line 8 | 241,298 | 241,298 |
| Guaranteed payments | line 10 | 8,290 | — |
| Other deductions | line 21 | 57,631 | — |
| Total deductions | line 22 | 86,415 | — |
| Ordinary business income | line 23 | 154,883 | 241,298 |
| Owner's / spouse's ordinary income | K-1 box 1, each | 77,441 / 77,442 | 120,649 / 120,649 |
| Owner's / spouse's guaranteed payments | K-1 box 4c, each | 4,145 / 4,145 | — |
| Ownership % | K-1 item J, each | 50 / 50 | 50 / 50 |
| Distributions | K-1 box 19 code A, both | 95,222 | 95,222 |
| State total income (fee base) | Form 568 line 1 | 241,298 | 241,298 |
| State entity tax | 568 lines 2 + 3 (fee + annual tax) | 800 | 800 |

What the 1040 side needed, and how the engine does it (`derive.ts`, shape `partnership`):

- **Each partner has their own Schedule SE** on their ordinary share plus guaranteed payments, with their own wage base, and the deduction is the sum of each schedule's rounded half (Singh: 5,764 + 5,764 = 11,528 on the after; 8,524 + 8,524 = 17,048 on the before — 34,094 ÷ 2 would be a dollar off). Shares are the K-1s' item J percentages (or box 1 over line 23), and `allocate` gives the last partner the rounding so the K-1s add up to line 23.
- **Form 7206 per partner**: the premiums (Form 7206 line 1, both forms added up by the reader) are split by the guaranteed payments and capped at each partner's share less their own SE deduction.
- **QBI per partner** is the ordinary share less the part of the SE deduction that belongs to it — the guaranteed payments carry the rest — and the health insurance deduction is not taken off (Rev. Rul. 91-26 puts it on the guaranteed payments). Checked against the printed Form 8995: 71,970 + 71,971 after, 112,125 + 112,125 before.
- **Pass-through Schedule Cs.** The 1040 carries two Schedule Cs (5,095 and 9,856 of receipts, each netted to $0 by the same amount of "other expenses", described as "income issued to SSN picked up on partnership return"). The reader is told to leave such a Schedule C out, and the engine drops one that nets to zero alongside a K-1 anyway, with a note — otherwise it would read as a second business and its receipts would become before income.
- **Recap rows.** Business net income is the partnership income (163,173 / 241,298, which is what the Canva shows). The entity row reads "LLC tax & fee" (800 both sides); the filing page's third row "LLC / partnership". Savings by strategy: business write-offs (30,285), health insurance through the partnership (1,455).

**The state's partnership card** (`partnership` on a state card; Tax Tables page → "Rules · partnerships and LLCs"): a form, a flat annual tax, and the fee tiers by total income. California is seeded and proven ($800; $0 under $250,000, $900, $2,500, $6,000, $11,790 from $5,000,000). No other state is seeded — their partnership returns (New Jersey's $150-per-owner filing fee, Texas's franchise report, New York's filing fee) weren't at hand — so a partner's return in any other state is refused with the card named until the rules are typed in. The elective pass-through entity tax is the S corporation rule (`entity.pte`), which a partnership shares; YouTwoTV didn't elect it, so that path is unproven.

**Verified** (`npm run recap:check`): from the two after returns alone the engine reproduces both before prints to the dollar — federal 57,851 (tax 23,757, SE 34,094), California 11,386 (tax 11,692 on 202,307 of taxable income, the 21,973 of California itemized deductions carried), the LLC's 800 — savings 31,740. A copy of the return with the K-1 income read on the S corporation line derives the same, reconciled by the 1065.

## Rental real estate and real estate professional status (added 2026-10-01)

The Carpenter return (after only, `Downloads\For Jason part 3`, 43 pages, Texas so no state): married filing jointly, the client's content-creation Schedule C ($491,948 of receipts, $70,821 of expenses, $8,868 of home office), the spouse's $129,731 W-2, and four rental properties losing $79,519 this year that the spouse, a real estate professional, deducts in full as nonpassive (Schedule E line 43; Form 8582 carries only $9,847 of earlier passive losses, still suspended at $536,295 of modified AGI). Also a Schedule A ($45,683: $19,963 of taxes, $25,720 of mortgage interest), two children, a $3,000 SEP, a $2,500 IRA, $137 of qualified dividends and $46 of gains ($19 long-term). The question it came with: what the liability would have been had the spouse not claimed REPS.

Seven things the engine had to learn, each proven on the after return before anything is derived:

1. **Whose W-2 it is.** The Schedule C filer's Social Security wage base is used up by their *own* wages; the spouse's $129,731 doesn't touch it. The printed SE tax ($32,877, the full wage base) says which, so on a joint return the engine tries both readings and takes the one that reproduces the line, with a note. The additional Medicare tax still counts every W-2 on the return.
2. **Form 8582.** `Rental` inputs (the profit properties, the loss properties, prior unallowed losses, whether REPS is claimed, whether the rentals count as QBI): a real estate professional's rentals are nonpassive and deducted whole; anyone else's net loss is allowed up to the special allowance — $25,000 less half of modified AGI over $100,000, on the federal card as `passiveAllowance` — and the rest suspended. Modified AGI is AGI without the rentals, the SE deduction and the retirement plan deduction (the printed $536,295 reproduces).
3. **Rentals as QBI.** This return lists the four rentals on Form 8995, so their loss comes off the Schedule C's QBI (310,393 = 389,912 − 79,519). Whether a return does that is the preparer's call, so the engine tries it both ways and keeps the one that reproduces line 13.
4. **Net investment income tax** counts the rentals' net as deducted, the way the software files it (−79,519 wipes out the $213 of dividends and gains on the after; $8 of tax on the before).
5. **Schedule A** travels with the return and is re-figured at each income: the SALT cap (the 2025 Act's $40,000, phased down by 30% of modified AGI over $500,000 to a $10,000 floor — on the federal card as `salt`, with the flat $10,000 for 2023–24 and $40,400/$505,000 for 2026) and the medical floor; the rest is fixed. The larger of that and the standard deduction is taken. The before's AGI of $595,978 cuts the cap to $11,207, so the total falls to $36,927 but still beats $31,500.
6. **The SEP deduction** (Schedule 1 line 16) is its own line now: carried across, taken off the business's QBI (389,912 = 412,259 − 16,439 − 2,908 − 3,000) and off the Form 7206 cap.
7. **Schedule D.** Only the long-term net is preferential: $137 of qualified dividends plus the $19 on Schedule D line 15, which is what gives the printed $64,898 ($64,908 with the whole $46).

The before follows the tax team's convention (decided 2026-10-02, see the last section): Schedule C write-offs at zero, the rental expenses at zero too, REPS off. It comes to **federal $211,483** against $96,419 as filed: the properties net their $111,643 of rents, less $9,847 of earlier suspended losses, so $101,796 of passive rental income ($102,009 of other income with the dividends and gains, $723,688 of gross income — both as on the team's Canva), SE tax 35,011 on the whole profit, additional Medicare 3,006, NIIT 3,876, no QBI deduction, the child tax credit phased out, tax 170,790 by the worksheet. Savings **$115,064**, split write-offs 26,948 / home office 3,374 / rental expenses 47,819 / real estate professional status 36,923. (Before the convention was settled the engine kept the rental expenses: before $171,556, savings $75,137.)

**The REPS question.** The status is the last step of the split, so the total it starts from is exactly the year without it, everything else as filed: **$133,342** (rentals suspended, AGI $517,356, the Schedule A unchanged at $45,683 since the cap is still $34,793 there, QBI phased down to $17,879 inside the range, tax 99,313 on $453,794, no child tax credit, $8 of NIIT). The step's note on the recap says so. Checked by hand in `npm run recap:check`.

Not modeled, refused with the line named: rental losses on a married-filing-separately return; a state that phases its itemized deductions down on income when the before's AGI crosses the threshold (California's $504,411 joint); a before over the QBI threshold when the Schedule C or 1065 pays W-2 wages. The rentals' $313-of-depreciation caveat above is a note, not a refusal.

## Open questions for Josiel

1. **State Taxes basis** — *decided in code, confirm.* The before column shows 886, which is 540NR line 124 (total due, including the 38 underpayment penalty). The federal column uses line 24 (total tax before payments). Built as: State Taxes = 540NR line 74 (848), Penalties = 540NR lines 122 + 123 plus 1040 line 38 (38). Same total, and the Penalties row gets used. Also matters for clients with state withholding, where line 124 would understate their state tax. (`sideSummary` in compute.ts.)
2. **"2025 Income" on the agenda page** — *decided in code, confirm.* Gross receipts (Sch C line 1) or before-net-income? Identical here. Built as gross receipts plus W-2 wages. (`currentYearIncome` in compute.ts.)
3. **"2024 Income."** Not on either return. Options: type it in, upload last year's return as an optional third PDF, or pull it from last year's recap record once the tool has run a season.
4. **Strategy list.** Free text, or a pick-list with standard wording (bookkeeping, S-Corp, Solo 401k / SEP, estimated payments, ...)?
5. **Print set.** Can before and after be printed with the same form set? The 8879s should always be included. And export from ProSeries rather than scanning: a scan reads fine but nothing can be cross-checked, and a redaction box on a scan hides the line under it (Mahony's line 38).
7. ~~**The 70% column.**~~ Resolved: not wanted. The recap is before and after only.
6. **Redaction.** The after PDF's black boxes sit on top of the page; the text layer still contains the SSN, date of birth, email, and bank routing/account numbers (FTB 8455). ProSeries can zero the SSN at print time, as the before PDF shows (000-00-0000). The tool should never store the raw PDFs.

## What the kids saved (added 2026-10-02)

Asked for by the site owner: on a return with dependents, show how much they're worth. `kidsValue` in `derive.ts` re-runs the before and the after with the scenario switch `noKids`, everything else as filed: no child tax credit, no child-care credit, single instead of head of household (or qualifying surviving spouse), no state dependent exemptions, and a state deduction that was only the head-of-household standard deduction becomes the single one. The difference on each side is `analysis.kids` (`{dependents, before, after, note}`), shown in the builder, as its own section on the client page ("What your kids saved you") and at the top of the PDF's last page. It is never added to the savings: the kids are on both returns.

Shown only when the return claims dependents and they change the tax. Not shown when the return has a premium tax credit that depends on household size (below 400% of the poverty line, or any credit allowed), since the poverty line for a smaller household isn't on the tables.

Verified by hand in `npm run recap:check`: Carpenter $3,700 after (child tax credit $2,500 + child-care credit $1,200), $1,200 before (the child tax credit has phased out). Wilson $5,095 after (head of household instead of single $4,495 + child-care credit $600; California stays $0 under the PTE credit), $11,121 before (federal $4,652 + California $6,469, with no salary there is no child-care credit). Every other sample return shows nothing.

## Rental expenses on the before (decided 2026-10-02)

The question to the tax team: on the zero-write-off before, do rental property costs (Schedule E: mortgage interest, depreciation, repairs, property tax, insurance) count as write-offs found, like Schedule C expenses? **Answer: yes.** The engine now zeroes them: a scenario switch `rentalExpenses` in `derive.ts`, off on the before, so every property nets its rents (Schedule E line 23a, new field `rentalRents`; line 23e, `rentalExpenses`, has to agree with the properties' net or the engine refuses). Earlier years' suspended losses still come off on Form 8582. The split gets a step "Bookkeeping: rental expenses", ahead of real estate professional status, so the REPS answer ($133,342 without it, everything else as filed) is unchanged.

Carpenter now matches the team's Canva on every income line ($102,009 of other income, $723,688 of gross income). The engine's before is $211,483 against the Canva's $203,879. The $7,604 between them is the QBI deduction their software gave the rentals on the before (about $21,725 at the 35% bracket). Over the threshold that deduction is capped at 2.5% of the properties' original cost (UBIA), which no line of the after return prints, so the engine takes it as $0 and says so in a note, with how much is at stake (up to $20,359 of deduction, about $7,126 of tax). Modeling it would need the property cost from ProSeries' Form 8995-A on a before print, typed in by the reviewer.

## Retirement, HSA and health insurance on the before (decided 2026-10-05)

The tax team's rule: what the client saves into a SEP or solo 401(k), an IRA or an HSA (Schedule 1 lines 16, 20 and 13), and a sole proprietor's self-employed health insurance deduction (line 17), are things DeCypher set up or caught, so the before doesn't claim them. The CPA's before prints kept them; the engine now leaves them off (engine v9). In `derive.ts` the `retirement` scenario switch covers the SEP, IRA and HSA for every shape (for an S corporation it already covered the solo 401(k)), and `healthInsurance` now covers the sole proprietor too (it already covered a partnership's guaranteed payments; an S corporation's runs through the salary). Each shows as its own line in the savings split: "Retirement contributions" (or "Retirement and HSA contributions") and "Self-employed health insurance". A state that adds the HSA back (California's Schedule CA) loses that add-back with it. Other adjustments, such as student loan interest, still carry over as filed. Payroll HSAs (W-2 box 12 code W) aren't on Schedule 1 and aren't touched.

The child credits come off the before through the dependents (engine v8, built by another session the same day): the before claims no dependents at all, so no child tax credit, no childcare credit and no head of household, and they come back as the first line of the split, "Claiming your dependents".

Effect on the samples, checked by hand in `npm run recap:check`:

| Return | Before (as derived) | Savings as derived | Headline (dependents off the before) |
|---|---|---|---|
| Carpenter | 214,426 (was 211,483) | 118,007 | 119,207 |
| Mahony | federal 15,228, New Jersey 3,029 (print 15,150 / 2,979) | 12,045 (print-based 11,917) | 12,045 |

Carpenter's adjustments drop to the half SE tax alone (17,506), AGI 706,182, taxable 670,462, tax 173,733. Mahony loses the  health insurance deduction: AGI 64,174, QBI 9,685, tax 4,409; New Jersey's medical deduction falls from 1,464 to 607 and its tax rises by 50. The proof script marks those lines "convention" beside the CPA print's figures. A test with a ,000 Schedule 1 HSA on Inha's return, added back by California, has to come out at Inha's real before exactly, and does.