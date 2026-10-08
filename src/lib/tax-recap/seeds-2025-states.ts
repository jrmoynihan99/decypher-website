import type { Bracket, ByStatus, EntityRules, StateCard } from "./tables";

/**
 * 2025 cards for every income-tax state the sample pairings didn't cover
 * (California and New Jersey live in tables.ts; the nine no-tax states are
 * generated there).
 *
 * Each card is the state's 2025 published figures as best known — rate
 * schedules, standard deductions, exemptions, the S corporation's own tax
 * and elective tax — and every one starts `proven: false`. That is the
 * deal: an unproven card is strictly better than no card, because with no
 * card the engine refuses outright, and with one it still refuses unless
 * it reproduces the client's own printed tax to the dollar first. A wrong
 * figure shows up as a refusal naming the line, on the Tax Tables page
 * and in the builder, and gets corrected there. Once a client of the state
 * has gone through cleanly, the page's "proven on a real return" switch
 * records it.
 *
 * Each note says where the figures came from, which ones to check first
 * ("verify"), and what the engine's state model can't express for that
 * state — a federal-tax deduction, a sliding standard deduction, a county
 * tax that varies, a business-income deduction. Those are the states
 * where the first client will most likely get a refusal and a typed before.
 *
 * Kept as plain data so the Tax Tables page can override any of it without
 * a deploy; nothing here is code the engine depends on.
 */

type Rows = [number | null, number][];
const b = (rows: Rows): Bracket[] => rows.map(([upTo, rate]) => ({ upTo, rate }));
const by = <T,>(single: T, mfj: T, hoh: T = single, mfs: T = single, qss: T = mfj): ByStatus<T> => ({
  single,
  mfj,
  hoh,
  mfs,
  qss,
});
/** The same schedule with every threshold multiplied (joint filers doubled, separate halved). */
const scale = (rows: Rows, factor: number): Rows =>
  rows.map(([upTo, rate]) => [upTo === null ? null : Math.round(upTo * factor), rate]);
const brackets = (single: Rows, mfj: Rows = scale(single, 2), hoh: Rows = single, mfs: Rows = single): ByStatus<Bracket[]> =>
  by(b(single), b(mfj), b(hoh), b(mfs), b(mfj));
const flat = (rate: number) => brackets([[null, rate]], [[null, rate]]);
const ONE = by(1, 2, 1, 1, 2);
const NONE: StateCard["exemption"] = { kind: "none", amount: 0, count: ONE, dependentAmount: 0, phaseOut: null };
const pte = (rate: number, credit: NonNullable<EntityRules["pte"]>["credit"]): EntityRules["pte"] => ({
  brackets: b([[null, rate]]),
  credit,
});
const entity = (form: string, minimum: number, p: EntityRules["pte"], rate = 0): EntityRules => ({
  form,
  rate,
  minimum: [{ below: null, amount: minimum }],
  pte: p,
});

function card(name: string, partial: Partial<StateCard>): StateCard {
  return {
    name,
    incomeTax: true,
    form: "",
    base: "federalAgi",
    addBackSeDeduction: false,
    addBackQbi: false,
    deduction: { kind: "none" },
    exemption: NONE,
    brackets: flat(0),
    taxTable: null,
    surtax: null,
    local: null,
    nonresident: null,
    medical: null,
    sharedResponsibility: null,
    wageDeduction: null,
    dependentFiler: null,
    entity: null,
    // No state's partnership return (filing fees, franchise taxes) is
    // seeded here: a partner's return is refused until the rules are typed
    // in on the Tax Tables page and proven on a client.
    partnership: null,
    proven: false,
    note: "",
    ...partial,
  };
}

export const STATES_2025: Record<string, StateCard> = {
  AL: card("Alabama", {
    form: "40",
    brackets: brackets([[500, 0.02], [3000, 0.04], [null, 0.05]], [[1000, 0.02], [6000, 0.04], [null, 0.05]]),
    deduction: { kind: "standard", amount: by(3000, 8500, 5200, 4250, 8500) },
    exemption: { kind: "deduction", amount: 1500, count: by(1, 2, 1, 1, 2), dependentAmount: 1000, phaseOut: null },
    entity: entity("20S", 0, pte(0.05, "refundable")),
    note: "Form 40, 2025. Standard deduction and dependent exemption are the maximums; Alabama phases both down with AGI (standard deduction from $26,000; dependent exemption $1,000 → $500 → $300 above $50,000 / $100,000). NOT MODELED: the full deduction for federal income tax paid, so expect a refusal on Alabama tax and a typed before. Electing PTE tax 5% (verify refundable). Business privilege tax minimum not charged below $100 due.",
  }),

  AZ: card("Arizona", {
    form: "140",
    brackets: flat(0.025),
    deduction: { kind: "federal" },
    exemption: { kind: "credit", amount: 0, count: ONE, dependentAmount: 100, phaseOut: null },
    entity: entity("120S", 50, pte(0.025, "nonrefundable")),
    note: "Form 140, 2025: 2.5% flat, the federal standard deduction. Dependent tax credit $100 per dependent under 17 ($25 for 17 and over — modeled as $100). Not modeled: the 33% standard-deduction increase for charitable gifts. S corporation minimum $50; PTE tax 2.5%, nonrefundable credit with a five-year carryforward.",
  }),

  AR: card("Arkansas", {
    form: "AR1000F",
    brackets: brackets([[4500, 0.02], [9100, 0.04], [null, 0.039]], [[4500, 0.02], [9100, 0.04], [null, 0.039]]),
    deduction: { kind: "standard", amount: by(2410, 4820, 2410, 2410, 4820) },
    exemption: { kind: "credit", amount: 29, count: ONE, dependentAmount: 29, phaseOut: null },
    entity: entity("AR1100S", 150, pte(0.039, "nonrefundable")),
    note: "AR1000F, 2025: top rate 3.9% (Act 1 of 2024); the schedule's 4% middle step to $9,100 is real. Standard deduction and $29 personal credit: verify the 2025 indexing. Arkansas taxes each spouse's income separately on a joint return, which the engine doesn't do. Franchise tax $150; PTE tax 3.9% (verify credit treatment).",
  }),

  CO: card("Colorado", {
    form: "DR 0104",
    base: "federalTaxableIncome",
    brackets: flat(0.044),
    entity: entity("DR 0106", 0, pte(0.044, "refundable")),
    note: "DR 0104, 2025: starts from federal taxable income at 4.4% (verify — TABOR refunds have set a temporary 4.25% in some years). Not modeled: the QBI add-back for AGI over $500,000 / $1,000,000. PTE tax 4.4%, refundable credit.",
  }),

  CT: card("Connecticut", {
    form: "CT-1040",
    brackets: brackets(
      [[10000, 0.02], [50000, 0.045], [100000, 0.055], [200000, 0.06], [250000, 0.065], [500000, 0.069], [null, 0.0699]],
      [[20000, 0.02], [100000, 0.045], [200000, 0.055], [400000, 0.06], [500000, 0.065], [1000000, 0.069], [null, 0.0699]],
      [[16000, 0.02], [80000, 0.045], [160000, 0.055], [320000, 0.06], [400000, 0.065], [800000, 0.069], [null, 0.0699]],
    ),
    exemption: { kind: "deduction", amount: 15000, count: by(1, 1.6, 1.2667, 0.8, 1.6), dependentAmount: 0, phaseOut: null },
    entity: entity("CT-1065/CT-1120SI", 0, pte(0.0699, "refundable")),
    note: "CT-1040, 2025 schedule. Personal exemption $15,000 / $24,000 / $19,000 / $12,000 expressed as multiples of $15,000. NOT MODELED: the exemption phase-out ($1,000 per $1,000 of AGI over $30,000 single), the personal tax credit, and the benefit recapture, so most returns will refuse on Connecticut tax. PE tax 6.99% (elective from 2024) with a credit of 93.01% of the tax — the engine gives 100%, so the credit line will mismatch.",
  }),

  DC: card("District of Columbia", {
    form: "D-40",
    brackets: brackets(
      [[10000, 0.04], [40000, 0.06], [60000, 0.065], [250000, 0.085], [500000, 0.0925], [1000000, 0.0975], [null, 0.1075]],
      [[10000, 0.04], [40000, 0.06], [60000, 0.065], [250000, 0.085], [500000, 0.0925], [1000000, 0.0975], [null, 0.1075]],
    ),
    deduction: { kind: "federal" },
    entity: { form: "D-20", rate: 0.0825, minimum: [{ below: 1000000, amount: 250 }, { below: null, amount: 1000 }], pte: null },
    note: "D-40, 2025: federal standard deduction. DC does not recognize S corporation status — the corporation pays the 8.25% franchise tax ($250 minimum, $1,000 above $1M of receipts) and the shareholder's treatment is not modeled; expect refusals on S corporation clients. No PTE election.",
  }),

  DE: card("Delaware", {
    form: "200-01",
    brackets: brackets(
      [[2000, 0], [5000, 0.022], [10000, 0.039], [20000, 0.048], [25000, 0.052], [60000, 0.0555], [null, 0.066]],
      [[2000, 0], [5000, 0.022], [10000, 0.039], [20000, 0.048], [25000, 0.052], [60000, 0.0555], [null, 0.066]],
    ),
    deduction: { kind: "standard", amount: by(3250, 6500, 3250, 3250, 6500) },
    exemption: { kind: "credit", amount: 110, count: ONE, dependentAmount: 110, phaseOut: null },
    entity: entity("1100S", 175, null),
    note: "Form 200-01, 2025: the same schedule for every status, $110 personal credit per exemption. Delaware S corporations pay no income tax; the $175 is the franchise tax minimum (verify — it depends on shares). No PTE election.",
  }),

  GA: card("Georgia", {
    form: "500",
    brackets: flat(0.0519),
    deduction: { kind: "standard", amount: by(12000, 24000, 12000, 12000, 24000) },
    exemption: { kind: "deduction", amount: 0, count: ONE, dependentAmount: 4000, phaseOut: null },
    entity: entity("600S", 0, pte(0.0519, "exclusion")),
    note: "Form 500, 2025: 5.19% flat (HB 111, retroactive to January 1, 2025), standard deduction $12,000 / $24,000 (verify head of household), $4,000 per dependent. Electing S corporations pay 5.19% and the shareholder leaves the income off the Georgia return. Net worth tax (by net worth, $0 up to $100,000) not modeled.",
  }),

  HI: card("Hawaii", {
    form: "N-11",
    brackets: brackets(
      [[2400, 0.014], [4800, 0.032], [9600, 0.055], [14400, 0.064], [19200, 0.068], [24000, 0.072], [36000, 0.076], [48000, 0.079], [150000, 0.0825], [175000, 0.09], [200000, 0.1], [null, 0.11]],
      [[4800, 0.014], [9600, 0.032], [19200, 0.055], [28800, 0.064], [38400, 0.068], [48000, 0.072], [72000, 0.076], [96000, 0.079], [300000, 0.0825], [350000, 0.09], [400000, 0.1], [null, 0.11]],
      [[3600, 0.014], [7200, 0.032], [14400, 0.055], [21600, 0.064], [28800, 0.068], [36000, 0.072], [54000, 0.076], [72000, 0.079], [225000, 0.0825], [262500, 0.09], [300000, 0.1], [null, 0.11]],
    ),
    deduction: { kind: "standard", amount: by(4400, 8800, 6424, 4400, 8800) },
    exemption: { kind: "deduction", amount: 1144, count: ONE, dependentAmount: 1144, phaseOut: null },
    entity: entity("N-35", 0, pte(0.11, "nonrefundable")),
    note: "Form N-11, 2025: standard deduction raised by Act 46 (2024) to $4,400 / $8,800 / $6,424; $1,144 personal exemption. PTE tax at the top rate (11% from 2025 — verify) with a nonrefundable credit. The tax table under $100,000 isn't modeled (schedule math; expect a few dollars off).",
  }),

  IA: card("Iowa", {
    form: "IA 1040",
    base: "federalTaxableIncome",
    brackets: flat(0.038),
    entity: entity("IA 1120S", 0, pte(0.038, "nonrefundable")),
    note: "IA 1040, 2025: 3.8% flat (SF 2442), starting from federal taxable income with the federal standard deduction inside it (verify the starting point on the 2025 form). PTE tax 3.8% (verify credit treatment).",
  }),

  ID: card("Idaho", {
    form: "40",
    brackets: flat(0.053),
    deduction: { kind: "federal" },
    entity: entity("41S", 20, pte(0.053, "nonrefundable")),
    note: "Form 40, 2025: 5.3% flat (HB 40) on federal AGI less the federal standard deduction (Idaho doesn't allow the QBI deduction). NOT MODELED: the grocery credit ($155 per person, claimed against the tax), so Idaho total tax will read low by that — type it or expect a refusal. S corporation minimum $20 (permanent building fund); affected business entity tax 5.3% (verify credit).",
  }),

  IL: card("Illinois", {
    form: "IL-1040",
    brackets: flat(0.0495),
    exemption: { kind: "deduction", amount: 2850, count: ONE, dependentAmount: 2850, phaseOut: null },
    entity: entity("IL-1120-ST", 0, pte(0.0495, "nonrefundable"), 0.015),
    note: "IL-1040, 2025: 4.95% flat on federal AGI, $2,850 exemption per person (verify 2025 amount; disallowed entirely above $250,000 / $500,000 of AGI — a cliff the engine doesn't model). S corporations pay the 1.5% replacement tax; PTE tax 4.95% (verify whether the credit is refundable).",
  }),

  IN: card("Indiana", {
    form: "IT-40",
    brackets: flat(0.03),
    exemption: { kind: "deduction", amount: 1000, count: ONE, dependentAmount: 1000, phaseOut: null },
    entity: entity("IT-20S", 0, pte(0.03, "refundable")),
    note: "IT-40, 2025: 3.0% flat, $1,000 exemptions (children get $1,500 more — not modeled). NOT MODELED: the county income tax every Indiana return carries (0.5%–3%, by county), so expect a refusal on Indiana total tax; add the county rate as a city tax on this card for a given client. PTE tax 3% (verify refundable).",
  }),

  KS: card("Kansas", {
    form: "K-40",
    brackets: brackets([[23000, 0.052], [null, 0.0558]], [[46000, 0.052], [null, 0.0558]]),
    deduction: { kind: "standard", amount: by(3605, 8240, 6180, 3605, 8240) },
    exemption: { kind: "deduction", amount: 9160, count: by(1, 2, 1, 1, 2), dependentAmount: 2320, phaseOut: null },
    entity: entity("K-120S", 0, pte(0.0558, "nonrefundable")),
    note: "K-40, 2025 (SB 1, 2024 special session): two brackets, standard deduction $3,605 / $8,240 / $6,180, personal exemption $9,160 ($18,320 joint) plus $2,320 per dependent. PTE (SALT parity) tax 5.58% (verify credit treatment).",
  }),

  KY: card("Kentucky", {
    form: "740",
    brackets: flat(0.04),
    deduction: { kind: "standard", amount: by(3270, 6540, 3270, 3270, 6540) },
    entity: entity("PTE", 175, pte(0.04, "nonrefundable")),
    note: "Form 740, 2025: 4% flat, standard deduction $3,270 (verify; each spouse gets one on a combined return). Limited liability entity tax minimum $175 (the gross-receipts measure isn't modeled). PTE tax 4% (verify credit treatment).",
  }),

  LA: card("Louisiana", {
    form: "IT-540",
    brackets: flat(0.03),
    deduction: { kind: "standard", amount: by(12500, 25000, 12500, 12500, 25000) },
    exemption: { kind: "deduction", amount: 0, count: ONE, dependentAmount: 1000, phaseOut: null },
    entity: entity("CIFT-620", 0, pte(0.03, "exclusion")),
    note: "IT-540, 2025: 3% flat and a $12,500 / $25,000 standard deduction (Act 11 of 2024; verify head of household). $1,000 per dependent (verify). Electing PTEs pay at the individual rate and the shareholder excludes the income. The 2025 franchise tax (repealed for 2026) isn't modeled.",
  }),

  MA: card("Massachusetts", {
    form: "1",
    base: "stateGrossIncome",
    addBackSeDeduction: true,
    brackets: flat(0.05),
    surtax: { rate: 0.04, above: 1083150 },
    exemption: { kind: "deduction", amount: 4400, count: by(1, 2, 1.5455, 1, 2), dependentAmount: 1000, phaseOut: null },
    // Lines 11a/11b: Social Security and Medicare tax paid on wages (7.65%),
    // up to $2,000 per person. Checked on the Brandt return: $15,000 and
    // $57,000 of wages give $1,148 and $2,000.
    wageDeduction: { rate: 0.0765, cap: 2000 },
    entity: entity("355S", 456, pte(0.05, "refundable")),
    note: "Form 1, 2025: 5% on Part B income (interest and dividends at 5% too) plus the 4% surtax over $1,083,150. Personal exemption $4,400 / $8,800 / $6,800 (as multiples of $4,400) and $1,000 per dependent. The FICA deduction (lines 11a/11b, 7.65% of each person's wages up to $2,000) is modeled; the SE-tax half of it, the rental deduction, Part A/C income at 8.5%/12% and the refundable $440 Child and Family credit (a payment on the recap) are not. S corporation Form 355S: the $456 minimum excise (the income measure applies only above $6M of receipts; the net-worth measure isn't modeled). PTE excise 5% with a credit of 90% — the engine gives 100%, so the credit line will mismatch.",
  }),

  MD: card("Maryland", {
    form: "502",
    brackets: brackets(
      [[1000, 0.02], [2000, 0.03], [3000, 0.04], [100000, 0.0475], [125000, 0.05], [150000, 0.0525], [250000, 0.055], [500000, 0.0575], [1000000, 0.0625], [null, 0.065]],
      [[1000, 0.02], [2000, 0.03], [3000, 0.04], [150000, 0.0475], [175000, 0.05], [225000, 0.0525], [300000, 0.055], [500000, 0.0575], [1000000, 0.0625], [null, 0.065]],
      [[1000, 0.02], [2000, 0.03], [3000, 0.04], [150000, 0.0475], [175000, 0.05], [225000, 0.0525], [300000, 0.055], [500000, 0.0575], [1000000, 0.0625], [null, 0.065]],
    ),
    // 15% of Maryland adjusted gross income between $1,800 and $2,700
    // ($3,650–$5,450 joint / head of household). On a nonresident's 505NR
    // the 15% is of the Maryland-source income (Luciano: $12,384 → $1,858).
    deduction: { kind: "percent", rate: 0.15, min: by(1800, 3650, 3650, 1800, 3650), max: by(2700, 5450, 5450, 2700, 5450) },
    // $3,200 per exemption, stepping down with federal AGI: 3,200 to
    // $100,000 ($150,000 joint), then 1,600, then 800, then 0 at $150,000
    // ($200,000). Modeled as 1,600 off per $25,000 step, which lands on
    // 3,200 / 1,600 / 0 — right except in the $125,000–$150,000 band
    // ($175,000–$200,000 joint), where Maryland gives $800 and this gives 0.
    exemption: {
      kind: "deduction",
      amount: 3200,
      count: ONE,
      dependentAmount: 3200,
      phaseOut: { threshold: by(100000, 150000, 150000, 100000, 150000), step: by(25000, 25000, 25000, 25000, 25000), reduce: 1600 },
    },
    // Form 505 with 505NR: the deduction and exemptions scaled by the
    // Maryland share of federal AGI, the resident tax scaled by the share
    // of taxable income left, plus the 2.25% special nonresident tax in
    // place of the county tax. Checked on Luciano's 2024 return ($564 + $270).
    nonresident: { form: "505", method: "maryland", specialRate: 0.0225 },
    entity: entity("510", 0, pte(0.08, "refundable")),
    note: "Form 502, 2025, including the new 6.25% and 6.5% brackets over $500,000 and $1,000,000. Standard deduction 15% of Maryland AGI between $1,800 and $2,700 ($3,650–$5,450 joint/HOH). $3,200 exemptions stepping down above $100,000 of federal AGI ($150,000 joint); the $800 band ($125,000–$150,000) comes out as $0. Nonresident Form 505/505NR modeled with the 2.25% special nonresident tax (proven on a 2024 client). NOT MODELED for residents: the county tax (2.25%–3.2%) on every Form 502, so expect a refusal on a resident's Maryland total tax; add the county's rate as a city tax for a given client. PTE tax 8% on resident members' shares, refundable.",
  }),

  ME: card("Maine", {
    form: "1040ME",
    brackets: brackets(
      [[26800, 0.058], [63450, 0.0675], [null, 0.0715]],
      [[53600, 0.058], [126900, 0.0675], [null, 0.0715]],
      [[40200, 0.058], [95150, 0.0675], [null, 0.0715]],
    ),
    deduction: { kind: "federal" },
    exemption: { kind: "deduction", amount: 5150, count: ONE, dependentAmount: 0, phaseOut: null },
    entity: entity("1120S-ME", 0, null),
    note: "1040ME, 2025 (verify the indexed brackets): federal standard deduction and a $5,150 personal exemption, both phased out above $100,000 single (not modeled). The $300 dependent exemption tax credit isn't modeled. Maine has no PTE election.",
  }),

  MI: card("Michigan", {
    form: "MI-1040",
    brackets: flat(0.0425),
    exemption: { kind: "deduction", amount: 5800, count: ONE, dependentAmount: 5800, phaseOut: null },
    entity: entity("4891", 0, pte(0.0425, "refundable")),
    note: "MI-1040, 2025: 4.25% flat, $5,800 exemption per person (verify the 2025 amount). City income taxes (Detroit 2.4%, others 1%) are not modeled — add as a city tax for a given client. Flow-through entity tax 4.25%, refundable credit.",
  }),

  MN: card("Minnesota", {
    form: "M1",
    brackets: brackets(
      [[32570, 0.0535], [106990, 0.068], [198630, 0.0785], [null, 0.0985]],
      [[47620, 0.0535], [189180, 0.068], [330410, 0.0785], [null, 0.0985]],
      [[40100, 0.0535], [161130, 0.068], [264050, 0.0785], [null, 0.0985]],
      [[23810, 0.0535], [94590, 0.068], [165205, 0.0785], [null, 0.0985]],
    ),
    deduction: { kind: "standard", amount: by(14950, 29900, 22500, 14950, 29900) },
    exemption: { kind: "deduction", amount: 0, count: ONE, dependentAmount: 5200, phaseOut: null },
    entity: entity("M8", 0, pte(0.0985, "refundable")),
    note: "Form M1, 2025 (verify the indexed brackets and deduction): starts from federal AGI with Minnesota's own standard deduction and a $5,200 dependent exemption, both reduced at high income (not modeled). PTE tax 9.85%, refundable credit. The S corporation minimum fee (by Minnesota property, payroll and sales) isn't modeled.",
  }),

  MO: card("Missouri", {
    form: "MO-1040",
    brackets: brackets(
      [[1313, 0], [2626, 0.02], [3939, 0.025], [5252, 0.03], [6565, 0.035], [7878, 0.04], [9191, 0.045], [null, 0.047]],
      [[1313, 0], [2626, 0.02], [3939, 0.025], [5252, 0.03], [6565, 0.035], [7878, 0.04], [9191, 0.045], [null, 0.047]],
    ),
    deduction: { kind: "federal" },
    entity: entity("MO-1120S", 0, pte(0.047, "nonrefundable")),
    note: "MO-1040, 2025: top rate 4.7% (verify the indexed steps; the same schedule for every status, each spouse separately on a combined return — not modeled). NOT MODELED: the deduction for federal income tax paid (up to $5,000 / $10,000, phased by AGI), so most returns will refuse on Missouri tax. PTE tax 4.7% (verify credit treatment).",
  }),

  MS: card("Mississippi", {
    form: "80-105",
    brackets: brackets([[10000, 0], [null, 0.044]], [[10000, 0], [null, 0.044]]),
    deduction: { kind: "standard", amount: by(2300, 4600, 3400, 2300, 4600) },
    exemption: { kind: "deduction", amount: 6000, count: by(1, 2, 1.3333, 1, 2), dependentAmount: 1500, phaseOut: null },
    entity: entity("84-105", 25, pte(0.044, "refundable")),
    note: "Form 80-105, 2025: 4.4% over the first $10,000. Exemptions $6,000 / $12,000 / $8,000 (as multiples of $6,000) plus $1,500 per dependent. Electing PTEs pay at the individual rates (seeded flat 4.4%); verify whether the credit is refundable. Franchise tax minimum $25 (phasing out).",
  }),

  MT: card("Montana", {
    form: "2",
    base: "federalTaxableIncome",
    brackets: brackets([[21100, 0.047], [null, 0.059]], [[42200, 0.047], [null, 0.059]], [[31650, 0.047], [null, 0.059]]),
    entity: entity("CLT-4S", 0, pte(0.059, "nonrefundable")),
    note: "Form 2, 2025: two brackets on federal taxable income (verify the indexed thresholds, head of household especially). PTE tax 5.9% (verify credit treatment).",
  }),

  NC: card("North Carolina", {
    form: "D-400",
    brackets: flat(0.0425),
    deduction: { kind: "standard", amount: by(12750, 25500, 19125, 12750, 25500) },
    entity: entity("CD-401S", 200, pte(0.0425, "refundable")),
    note: "D-400, 2025: 4.25% flat. NOT MODELED: the child deduction ($500–$3,000 per child by AGI), so returns with children will refuse on North Carolina tax. Franchise tax minimum $200 (the net-worth measure isn't modeled). Taxed PTE at 4.25% (verify whether the credit is refundable).",
  }),

  ND: card("North Dakota", {
    form: "ND-1",
    base: "federalTaxableIncome",
    brackets: brackets(
      [[48475, 0], [244825, 0.0195], [null, 0.025]],
      [[80975, 0], [297150, 0.0195], [null, 0.025]],
      [[64950, 0], [271025, 0.0195], [null, 0.025]],
      [[40488, 0], [148575, 0.0195], [null, 0.025]],
    ),
    entity: entity("60", 0, null),
    note: "ND-1, 2025: 0% / 1.95% / 2.5% on federal taxable income (verify the indexed thresholds). No PTE election.",
  }),

  NE: card("Nebraska", {
    form: "1040N",
    brackets: brackets(
      [[3700, 0.0246], [22170, 0.0351], [35730, 0.0501], [null, 0.052]],
      [[7390, 0.0246], [44340, 0.0351], [71460, 0.0501], [null, 0.052]],
      [[6900, 0.0246], [35480, 0.0351], [52980, 0.0501], [null, 0.052]],
    ),
    deduction: { kind: "standard", amount: by(8350, 16700, 12250, 8350, 16700) },
    exemption: { kind: "credit", amount: 166, count: ONE, dependentAmount: 166, phaseOut: null },
    entity: entity("1120-SN", 0, pte(0.052, "refundable")),
    note: "1040N, 2025: top rate 5.2% (verify the indexed brackets, standard deduction and the $166 personal exemption credit). PTE tax 5.2%, refundable credit (LB 754).",
  }),

  NM: card("New Mexico", {
    form: "PIT-1",
    brackets: brackets(
      [[5500, 0.015], [16500, 0.032], [33500, 0.043], [66500, 0.047], [210000, 0.049], [null, 0.059]],
      [[8000, 0.015], [25000, 0.032], [50000, 0.043], [100000, 0.047], [315000, 0.049], [null, 0.059]],
      [[8000, 0.015], [25000, 0.032], [50000, 0.043], [100000, 0.047], [315000, 0.049], [null, 0.059]],
      [[4000, 0.015], [12500, 0.032], [25000, 0.043], [50000, 0.047], [157500, 0.049], [null, 0.059]],
    ),
    deduction: { kind: "federal" },
    exemption: { kind: "deduction", amount: 0, count: ONE, dependentAmount: 4000, phaseOut: null },
    entity: entity("S-Corp", 50, pte(0.059, "refundable")),
    note: "PIT-1, 2025: the new six-bracket schedule (HB 252), federal standard deduction, $4,000 per dependent (verify which dependents qualify). Franchise tax $50; entity-level tax election 5.9% (verify credit treatment).",
  }),

  NY: card("New York", {
    form: "IT-201",
    brackets: brackets(
      [[8500, 0.04], [11700, 0.045], [13900, 0.0525], [80650, 0.055], [215400, 0.06], [1077550, 0.0685], [5000000, 0.0965], [25000000, 0.103], [null, 0.109]],
      [[17150, 0.04], [23600, 0.045], [27900, 0.0525], [161550, 0.055], [323200, 0.06], [2155350, 0.0685], [5000000, 0.0965], [25000000, 0.103], [null, 0.109]],
      [[12800, 0.04], [17650, 0.045], [20900, 0.0525], [107650, 0.055], [269300, 0.06], [1616450, 0.0685], [5000000, 0.0965], [25000000, 0.103], [null, 0.109]],
    ),
    deduction: { kind: "standard", amount: by(8000, 16050, 11200, 8000, 16050) },
    exemption: { kind: "deduction", amount: 0, count: ONE, dependentAmount: 1000, phaseOut: null },
    entity: {
      form: "CT-3-S",
      rate: 0,
      minimum: [
        { below: 100001, amount: 25 },
        { below: 250001, amount: 50 },
        { below: 500001, amount: 175 },
        { below: 1000001, amount: 300 },
        { below: 5000001, amount: 1000 },
        { below: 25000001, amount: 3000 },
        { below: null, amount: 4500 },
      ],
      pte: { brackets: b([[2000000, 0.0685], [5000000, 0.0965], [25000000, 0.103], [null, 0.109]]), credit: "refundable" },
    },
    note: "IT-201, 2025: standard deduction $8,000 / $16,050 / $11,200, $1,000 per dependent. NOT MODELED: the tax benefit recapture above $107,650 of AGI (the higher rates phase in on all income), so higher earners will refuse on New York tax; New York City residents' city tax (add it as a city tax for a given client); Yonkers. S corporation fixed dollar minimum by New York receipts ($25 to $4,500); PTET brackets 6.85% to $2M, 9.65% to $5M, 10.3% to $25M, 10.9% over, refundable credit (IT-653).",
  }),

  OH: card("Ohio", {
    form: "IT 1040",
    brackets: brackets([[26050, 0], [100000, 0.0275], [null, 0.035]], [[26050, 0], [100000, 0.0275], [null, 0.035]]),
    exemption: { kind: "deduction", amount: 2400, count: ONE, dependentAmount: 2400, phaseOut: null },
    entity: entity("IT 4738", 0, pte(0.035, "refundable")),
    note: "IT 1040, 2025: 0% to $26,050, 2.75% to $100,000, 3.5% over. Exemptions $2,400 (drops to $2,150 / $1,900 at higher income — not modeled). NOT MODELED: the business income deduction (the first $250,000 of Schedule C / K-1 income deducted, the rest taxed at a flat 3%), which every business owner's return uses, and school district income taxes — expect a refusal and a typed before. PTE tax 3.5% (IT 4738), refundable credit.",
  }),

  OK: card("Oklahoma", {
    form: "511",
    brackets: brackets(
      [[1000, 0.0025], [2500, 0.0075], [3750, 0.0175], [4900, 0.0275], [7200, 0.0375], [null, 0.0475]],
      [[2000, 0.0025], [5000, 0.0075], [7500, 0.0175], [9800, 0.0275], [12200, 0.0375], [null, 0.0475]],
      [[2000, 0.0025], [5000, 0.0075], [7500, 0.0175], [9800, 0.0275], [12200, 0.0375], [null, 0.0475]],
    ),
    deduction: { kind: "standard", amount: by(6350, 12700, 9350, 6350, 12700) },
    exemption: { kind: "deduction", amount: 1000, count: ONE, dependentAmount: 1000, phaseOut: null },
    entity: entity("512-S", 0, pte(0.0475, "exclusion")),
    note: "Form 511, 2025: head of household uses the joint schedule; standard deduction $6,350 / $12,700 / $9,350; $1,000 exemptions. Electing PTEs pay 4.75% and the shareholder excludes the income. Franchise tax repealed.",
  }),

  OR: card("Oregon", {
    form: "OR-40",
    brackets: brackets(
      [[4400, 0.0475], [11050, 0.0675], [125000, 0.0875], [null, 0.099]],
      [[8800, 0.0475], [22100, 0.0675], [250000, 0.0875], [null, 0.099]],
      [[8800, 0.0475], [22100, 0.0675], [250000, 0.0875], [null, 0.099]],
    ),
    deduction: { kind: "standard", amount: by(2800, 5600, 4500, 2800, 5600) },
    exemption: { kind: "credit", amount: 256, count: ONE, dependentAmount: 256, phaseOut: null },
    entity: { form: "OR-20-S", rate: 0, minimum: [{ below: null, amount: 150 }], pte: { brackets: b([[250000, 0.09], [null, 0.099]]), credit: "refundable" } },
    note: "OR-40, 2025 (verify the indexed brackets, standard deduction and the $256 exemption credit, which cuts off above $100,000 / $200,000 of AGI). NOT MODELED: the federal tax subtraction (up to $8,250, phased out from $125,000 / $250,000 of AGI), so lower-income returns will refuse on Oregon tax. S corporation minimum excise $150; PTE-E tax 9% to $250,000 and 9.9% over, refundable credit.",
  }),

  PA: card("Pennsylvania", {
    form: "PA-40",
    base: "stateGrossIncome",
    addBackSeDeduction: true,
    brackets: flat(0.0307),
    entity: entity("PA-20S/PA-65", 0, null),
    note: "PA-40, 2025: 3.07% flat on gross income, no deductions or exemptions (the SE-tax deduction is not allowed). Local earned income tax is on a separate return and doesn't affect the PA-40. Tax forgiveness for low incomes isn't modeled. No entity-level tax and no PTE election.",
  }),

  RI: card("Rhode Island", {
    form: "RI-1040",
    brackets: brackets([[79900, 0.0375], [181650, 0.0475], [null, 0.0599]], [[79900, 0.0375], [181650, 0.0475], [null, 0.0599]]),
    deduction: { kind: "standard", amount: by(10900, 21800, 16350, 10900, 21800) },
    exemption: { kind: "deduction", amount: 5100, count: ONE, dependentAmount: 5100, phaseOut: null },
    entity: entity("RI-1120S", 400, pte(0.0599, "nonrefundable")),
    note: "RI-1040, 2025 (verify the indexed brackets, deduction and $5,100 exemption; the same brackets for every status). The deduction and exemptions phase out above $260,000 (not modeled). S corporation minimum $400; PTE tax 5.99% (verify credit treatment).",
  }),

  SC: card("South Carolina", {
    form: "SC1040",
    base: "federalTaxableIncome",
    brackets: brackets([[3560, 0], [17830, 0.03], [null, 0.062]], [[3560, 0], [17830, 0.03], [null, 0.062]]),
    exemption: { kind: "deduction", amount: 0, count: ONE, dependentAmount: 4930, phaseOut: null },
    entity: entity("SC1120S", 25, pte(0.03, "exclusion")),
    note: "SC1040, 2025: 0% / 3% / 6.2% on federal taxable income (verify the indexed brackets and the $4,930 dependent exemption). Active trade or business income can be taxed at the entity at 3% with the owner excluding it (I-435). License fee $25 plus 0.1% of capital (the capital measure isn't modeled).",
  }),

  UT: card("Utah", {
    form: "TC-40",
    brackets: flat(0.045),
    entity: entity("TC-20S", 100, pte(0.045, "refundable")),
    note: "TC-40, 2025: 4.5% flat (HB 106). NOT MODELED: the taxpayer tax credit (6% of the federal deduction plus $2,046 per dependent, phased out), so expect Utah total tax to mismatch by that credit. S corporation minimum $100; PTE tax 4.5%, refundable credit.",
  }),

  VA: card("Virginia", {
    form: "760",
    brackets: brackets([[3000, 0.02], [5000, 0.03], [17000, 0.05], [null, 0.0575]], [[3000, 0.02], [5000, 0.03], [17000, 0.05], [null, 0.0575]]),
    deduction: { kind: "standard", amount: by(8750, 17500, 8750, 8750, 17500) },
    exemption: { kind: "deduction", amount: 930, count: ONE, dependentAmount: 930, phaseOut: null },
    entity: entity("502", 0, pte(0.0575, "refundable")),
    note: "Form 760, 2025: the same schedule for every status, standard deduction $8,750 / $17,500, $930 exemptions. PTET 5.75%, refundable credit. No entity-level tax on S corporations.",
  }),

  VT: card("Vermont", {
    form: "IN-111",
    brackets: brackets(
      [[49250, 0.0335], [119300, 0.066], [248850, 0.076], [null, 0.0875]],
      [[82200, 0.0335], [198700, 0.066], [302850, 0.076], [null, 0.0875]],
      [[66000, 0.0335], [170450, 0.066], [276050, 0.076], [null, 0.0875]],
      [[41100, 0.0335], [99350, 0.066], [151425, 0.076], [null, 0.0875]],
    ),
    deduction: { kind: "standard", amount: by(7600, 15250, 11400, 7600, 15250) },
    exemption: { kind: "deduction", amount: 5250, count: ONE, dependentAmount: 5250, phaseOut: null },
    entity: entity("BI-471", 250, null),
    note: "IN-111, 2025: the 2024 schedule indexed by about 2.8% — VERIFY every threshold, the standard deduction and the exemption against the 2025 rate schedule (the 2024 figures are on the 2024 card). S corporation minimum $250. PTE election not seeded (verify Vermont's 2025 rules and add the rate here if it applies).",
  }),

  WI: card("Wisconsin", {
    form: "1",
    brackets: brackets(
      [[14680, 0.035], [50480, 0.044], [323290, 0.053], [null, 0.0765]],
      [[19580, 0.035], [67300, 0.044], [431060, 0.053], [null, 0.0765]],
      [[14680, 0.035], [50480, 0.044], [323290, 0.053], [null, 0.0765]],
      [[9790, 0.035], [33650, 0.044], [215530, 0.053], [null, 0.0765]],
    ),
    deduction: { kind: "standard", amount: by(13930, 25890, 17990, 12300, 25890) },
    exemption: { kind: "deduction", amount: 700, count: ONE, dependentAmount: 700, phaseOut: null },
    entity: entity("5S", 0, pte(0.0765, "exclusion")),
    note: "Form 1, 2025: the 2025–27 budget (Act 15) widened the 4.4% bracket to $50,480 single / $67,300 joint from 2025 (verify the other indexed edges). NOT MODELED: the sliding standard deduction — seeded at its maximum, but it shrinks with income and is gone by about $138,000 single, so most returns will refuse on Wisconsin tax; type the deduction's actual amount for a client, or the before. $700 exemptions. Electing S corporations pay 7.65% and the shareholder excludes the income.",
  }),

  WV: card("West Virginia", {
    form: "IT-140",
    brackets: brackets(
      [[10000, 0.0222], [25000, 0.0296], [40000, 0.0333], [60000, 0.0444], [null, 0.0482]],
      [[10000, 0.0222], [25000, 0.0296], [40000, 0.0333], [60000, 0.0444], [null, 0.0482]],
      [[10000, 0.0222], [25000, 0.0296], [40000, 0.0333], [60000, 0.0444], [null, 0.0482]],
      [[5000, 0.0222], [12500, 0.0296], [20000, 0.0333], [30000, 0.0444], [null, 0.0482]],
    ),
    exemption: { kind: "deduction", amount: 2000, count: ONE, dependentAmount: 2000, phaseOut: null },
    entity: entity("SPF-100", 0, pte(0.0482, "refundable")),
    note: "IT-140, 2025: the rates after the 2025 4% cut (2.22% to 4.82% — verify), $2,000 exemptions, no standard deduction. PTE tax at the top rate 4.82% (verify credit treatment).",
  }),
};
