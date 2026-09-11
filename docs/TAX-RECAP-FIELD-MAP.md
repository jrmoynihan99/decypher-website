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

## Open questions for Josiel

1. **State Taxes basis** — *decided in code, confirm.* The before column shows 886, which is 540NR line 124 (total due, including the 38 underpayment penalty). The federal column uses line 24 (total tax before payments). Built as: State Taxes = 540NR line 74 (848), Penalties = 540NR lines 122 + 123 plus 1040 line 38 (38). Same total, and the Penalties row gets used. Also matters for clients with state withholding, where line 124 would understate their state tax. (`sideSummary` in compute.ts.)
2. **"2025 Income" on the agenda page** — *decided in code, confirm.* Gross receipts (Sch C line 1) or before-net-income? Identical here. Built as gross receipts plus W-2 wages. (`currentYearIncome` in compute.ts.)
3. **"2024 Income."** Not on either return. Options: type it in, upload last year's return as an optional third PDF, or pull it from last year's recap record once the tool has run a season.
4. **Strategy list.** Free text, or a pick-list with standard wording (bookkeeping, S-Corp, Solo 401k / SEP, estimated payments, ...)?
5. **Print set.** Can before and after be printed with the same form set? The 8879s should always be included. And export from ProSeries rather than scanning: a scan reads fine but nothing can be cross-checked, and a redaction box on a scan hides the line under it (Mahony's line 38).
7. ~~**The 70% column.**~~ Resolved: not wanted. The recap is before and after only.
6. **Redaction.** The after PDF's black boxes sit on top of the page; the text layer still contains the SSN, date of birth, email, and bank routing/account numbers (FTB 8455). ProSeries can zero the SSN at print time, as the before PDF shows (000-00-0000). The tool should never store the raw PDFs.
