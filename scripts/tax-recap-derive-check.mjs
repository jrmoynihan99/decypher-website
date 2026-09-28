/**
 * Prove the Tax Recap derivation engine against a known before/after pair.
 *
 *   npm run recap:check
 *
 * Feeds the engine the AFTER return's numbers exactly as the extraction
 * reads them, and compares the derived BEFORE against the CPA's real
 * "ZERO WRITEOFFS" print, line by line, to the dollar. Then checks that the
 * returns the engine must NOT derive are refused for the right reason.
 *
 * Run it after loading a new year's card into lib/tax-recap/tables.ts — a
 * mistyped bracket shows up here, not on a client's recap. To add a pairing,
 * copy the block below with the numbers off both PDFs.
 *
 * Runs on plain Node (24+): `--import ./scripts/lib/resolve-ts.mjs` lets it
 * load the app's TypeScript without a build.
 */
import { attributeStrategies, deriveBefore, entityTax } from "../src/lib/tax-recap/derive.ts";
import { computeRecap } from "../src/lib/tax-recap/compute.ts";
import { emptyEntityNumbers, emptyNumbers } from "../src/lib/tax-recap/schema.ts";
import { cardFor, validateYearCard } from "../src/lib/tax-recap/tables.ts";

const numbers = (v) => ({ ...emptyNumbers(), ...v });
const entityNumbers = (v) => ({ ...emptyEntityNumbers(), ...v });

/* ── Voloshchakevych 2025, single, CA Form 540 ─────────────────────────────
   AFTER: "1040 Individual 2025 Tax Return (final output)".
   BEFORE: "1040_inha_voloshchakevych_new(ZERO WRITEOFFS)".               */
const PAIRINGS = [
  {
    name: "Voloshchakevych 2025 (single, CA 540)",
    meta: { taxYear: 2025, filingStatus: "Single", stateCode: "CA", stateForm: "540" },
    after: numbers({
      businessNetIncome: 77900,
      totalIncome: 77900,
      agi: 72396,
      qbiDeduction: 11329,
      taxableIncome: 45317,
      incomeTax: 5201,
      seTax: 11007,
      federalTotalTax: 16208,
      federalPayments: 9600,
      federalAmountOwed: 6608,
      grossReceipts: 160960,
      totalExpenses: 62840,
      homeOffice: 20220,
      stateTotalTax: 2567,
      statePayments: 738,
      stateAmountOwed: 1829,
      stateTotalDue: 1829,
    }),
    before: numbers({
      businessNetIncome: 160960,
      totalIncome: 160960,
      agi: 149588,
      qbiDeduction: 26768,
      taxableIncome: 107070,
      incomeTax: 18544,
      seTax: 22743,
      federalTotalTax: 41287,
      federalPayments: 9600,
      federalAmountOwed: 31687,
      grossReceipts: 160960,
      stateTotalTax: 9667,
      statePayments: 738,
      stateAmountOwed: 8929,
      stateTotalDue: 8929,
    }),
    /** The Canva recap's headline. */
    savings: 32179,
  },

  /* ── Chiu 2025, single, Texas resident with California-source income (540NR) ──
     AFTER: "Prosper Chiu - 2025 1040 INDIVIDUAL TAX RETURN(FINAL)".
     BEFORE: "1040_prosper_chiu(ZERO WRITEOFFS)". The before print also carries a
     $38 California underpayment penalty (FTB 5805), which can't be derived, so
     the engine's before is $38 short of the Canva recap's $19,108.              */
  {
    name: "Chiu 2025 (single, TX resident, CA 540NR)",
    meta: { taxYear: 2025, filingStatus: "Single", stateCode: "CA", stateForm: "540NR" },
    after: numbers({
      businessNetIncome: 55719,
      totalIncome: 55719,
      agi: 51782,
      qbiDeduction: 7206,
      taxableIncome: 28826,
      incomeTax: 3221,
      seTax: 7873,
      federalTotalTax: 11094,
      federalPayments: 1600,
      federalAmountOwed: 9494,
      grossReceipts: 123038,
      totalExpenses: 60751,
      homeOffice: 6568,
      stateTotalTax: 336,
      stateAmountOwed: 336,
      stateTotalDue: 336,
      stateSourceIncome: 16334,
    }),
    before: numbers({
      businessNetIncome: 123038,
      totalIncome: 123038,
      agi: 114345,
      qbiDeduction: 19719,
      taxableIncome: 78876,
      incomeTax: 12267,
      seTax: 17385,
      federalTotalTax: 29652,
      federalPayments: 1600,
      federalAmountOwed: 28052,
      grossReceipts: 123038,
      stateTotalTax: 848,
      stateAmountOwed: 848,
      stateTotalDue: 848,
      stateSourceIncome: 16334,
    }),
    savings: 19070,
  },

  /* ── Mahony 2025, single, New Jersey, marketplace coverage six months ──────
     AFTER: "William Mahony - 2025 1040 INDIVIDUAL TAX RETURN(final output)" (a scan).
     BEFORE: "1040_william_mahony_ (ZERO WRITEOFFS)25i_FC". Both prints carry Form
     8962 and Form 7206. The before print's penalties (503 federal, 125 NJ)
     can't be derived; the engine carries the after's (224, 28) as a floor, so
     the lines that include a penalty are expected per the engine here.       */
  {
    name: "Mahony 2025 (single, NJ-1040, Form 8962)",
    meta: { taxYear: 2025, filingStatus: "Single", stateCode: "NJ", stateForm: "NJ-1040" },
    after: numbers({
      businessNetIncome: 35715,
      totalIncome: 35715,
      agi: 31583,
      qbiDeduction: 3167,
      taxableIncome: 12666,
      incomeTax: 1283,
      seTax: 5047,
      federalTotalTax: 6330,
      federalPayments: 966,
      federalRefundableCredits: 966,
      federalAmountOwed: 5588,
      federalPenalty: 224,
      grossReceipts: 69861,
      totalExpenses: 30987,
      homeOffice: 3159,
      // NJ "Total Tax Due" 876 less the 28 underpayment interest, as extraction unbundles it
      stateTotalTax: 848,
      stateAmountOwed: 848,
      statePenalty: 28,
      stateTotalDue: 876,
      sehiDeduction: 857,
      sehiPaid: 857,
      ptcFamilySize: 1,
      ptcPovertyLine: 15060,
      ptcMonths: 6,
      ptcPremiums: 2004,
      ptcSlcsp: 2286,
      ptcAdvance: 948,
      ptcAllowed: 1914,
      ptcNet: 966,
      stateBusinessIncome: 34456,
      stateExemptions: 1000,
      stateMedical: 857,
      stateTaxOnIncome: 500,
      stateSharedResponsibility: 348,
      uninsuredMonths: 6,
    }),
    before: numbers({
      businessNetIncome: 69861,
      totalIncome: 69861,
      agi: 63317,
      qbiDeduction: 9513,
      taxableIncome: 38054,
      incomeTax: 4331,
      seTax: 9871,
      additionalTaxes: 948,
      federalTotalTax: 15150,
      federalPayments: 0,
      federalPenalty: 224,
      federalAmountOwed: 15374, // print: 15,653 with its own 503 penalty
      grossReceipts: 69861,
      sehiDeduction: 857,
      sehiPaid: 857,
      ptcFamilySize: 1,
      ptcPovertyLine: 15060,
      ptcMonths: 6,
      ptcPremiums: 2004,
      ptcSlcsp: 2286,
      ptcAdvance: 948,
      ptcAllowed: 0,
      ptcRepayment: 948,
      stateTotalTax: 2979,
      statePenalty: 28,
      stateAmountOwed: 2979,
      stateTotalDue: 3007, // print: 3,104 with its own 125 penalty
      stateBusinessIncome: 69861,
      stateExemptions: 1000,
      stateMedical: 1464,
      stateTaxOnIncome: 2230,
      stateSharedResponsibility: 749,
      uninsuredMonths: 6,
    }),
    // Canva: 12,293 with the print's penalties; 376 less with the after's carried
    savings: 11917,
  },

  /* ── Wilson / LaLaNation89 Inc. 2025, head of household, CA 540 + CA 100S ──
     An S corporation shareholder: two after returns (the 1040 and the
     1120-S), two before prints ("1040_jaquala_wilson(FOR JASON)" and
     "1120s_lalanation89_inc(ZERO WRITEOFFS)"). The before zeros every
     deduction on the 1120-S — cost of goods sold, the owner's salary, the
     Solo 401(k), the health insurance — and has no PTE election. The Canva
     recap folds the shareholder's CA tax into the S-corp row and reads
     $347,227 before; the prints give $347,422 (its before is $195 off the
     print). Its "S-corp savings" of $35,140 is hand-computed; the engine's
     estimate is $36,587 (Schedule SE + additional Medicare on the K-1).  */
  {
    name: "Wilson 2025 (head of household, CA 540, S corporation on CA 100S)",
    meta: { taxYear: 2025, filingStatus: "Head of household", stateCode: "CA", stateForm: "540" },
    after: numbers({
      w2Income: 53471,
      scorpIncome: 471624,
      totalIncome: 522095,
      agi: 515124,
      dependentCount: 1,
      qbiDeduction: 31558,
      qbiIncome: 386732,
      qbiW2Wages: 63116,
      taxableIncome: 459941,
      incomeTax: 128788,
      additionalTaxes: 3520,
      childCareCredit: 600,
      nonrefundableCredits: 600,
      federalTotalTax: 131708,
      federalPayments: 3376,
      federalWithholding: 3376,
      federalAmountOwed: 128332,
      sehiDeduction: 6971,
      sehiPaid: 6971,
      medicareWages: 70000,
      ptcFamilySize: 2,
      ptcPovertyLine: 20440,
      ptcMonths: 12,
      ptcPremiums: 10284,
      ptcSlcsp: 8888,
      ptcAdvance: 3520,
      ptcAllowed: 0,
      ptcRepayment: 3520,
      stateTotalTax: 0,
      statePayments: 1168,
      stateWithholding: 368,
      stateRefund: 1168,
      stateTaxOnIncome: 41256,
      stateExemptionCredits: 145,
      statePteCreditAvailable: 47609,
      statePteCredit: 41111,
    }),
    entity: entityNumbers({
      grossReceipts: 836958,
      cogs: 46141,
      totalIncome: 790817,
      officerComp: 76971,
      wages: 46026,
      taxesLicenses: 21423,
      pension: 17500,
      otherDeductions: 155835,
      totalDeductions: 319193,
      ordinaryIncome: 471624,
      k1Ordinary: 471624,
      ownershipPct: 100,
      distributions: 123886,
      stateNetIncome: 511924,
      stateAddBack: 40300,
      stateTax: 7679,
      pteTax: 47609,
      stateTotalTax: 7679,
      statePayments: 7679,
      stateAmountDue: 0,
    }),
    before: numbers({
      scorpIncome: 836958,
      totalIncome: 833958,
      agi: 833958,
      dependentCount: 1,
      qbiDeduction: null,
      // The before print's Form 8995-A line 2: ProSeries scales the QBI with the K-1
      qbiIncome: 686306,
      taxableIncome: 810333,
      incomeTax: 255105,
      additionalTaxes: 3520,
      federalTotalTax: 258625,
      federalPayments: 0,
      federalAmountOwed: 258625,
      ptcFamilySize: 2,
      ptcPovertyLine: 20440,
      ptcMonths: 12,
      ptcPremiums: 10284,
      ptcSlcsp: 8888,
      ptcAdvance: 3520,
      ptcAllowed: 0,
      ptcRepayment: 3520,
      stateTotalTax: 76243,
      stateTaxOnIncome: 76243,
      stateExemptionCredits: 0,
      statePayments: 800,
      stateAmountOwed: 75443,
      stateTotalDue: 75443,
    }),
    entityBefore: entityNumbers({
      grossReceipts: 836958,
      totalIncome: 836958,
      totalDeductions: 0,
      ordinaryIncome: 836958,
      k1Ordinary: 836958,
      ownershipPct: 100,
      distributions: 123886,
      stateNetIncome: 836958,
      stateTax: 12554,
      stateTotalTax: 12554,
      // Carried from the after; the CPA's before print zeroes the estimates too (due 12,554)
      statePayments: 7679,
      stateAmountDue: 4875,
    }),
    // before 258,625 + 76,243 + 12,554 = 347,422; after 131,708 + 0 + 55,288 = 186,996
    savings: 160426,
    scorpSavings: 36587,
  },
];

/* ── Returns the engine must refuse, and the word its reason has to carry ── */
const inha = PAIRINGS[0];
const REFUSALS = [
  {
    name: "a state form the card doesn't list",
    meta: { ...inha.meta, stateForm: "540X" },
    after: inha.after,
    expect: /isn't the resident Form 540 or the nonresident Form 540NR/,
  },
  {
    name: "nonresident return without the state-source line read",
    meta: { ...inha.meta, stateForm: "540NR" },
    after: inha.after,
    expect: /State-source income .* wasn't read/,
  },
  {
    name: "refundable credit on line 32",
    meta: inha.meta,
    after: { ...inha.after, federalRefundableCredits: 966, federalPayments: 10566 },
    expect: /refundable/i,
  },
  {
    name: "itemized deductions",
    meta: inha.meta,
    after: { ...inha.after, taxableIncome: 40000, incomeTax: 4563 },
    expect: /standard deduction/i,
  },
  {
    // Every state is seeded, so the "no card" path needs a code that isn't one.
    name: "state without tables (PR)",
    meta: { ...inha.meta, stateCode: "PR", stateForm: "482" },
    after: inha.after,
    expect: /PR isn't on the 2025 tax tables/,
  },
  {
    // 2023–2026 are seeded now; a year outside them has no card.
    name: "year without tables (2019)",
    meta: { ...inha.meta, taxYear: 2019 },
    after: inha.after,
    expect: /No tax tables/,
  },
  {
    // A 2025 return run against the 2024 card: the brackets don't reproduce its tax.
    name: "a return run against the wrong year's tables",
    meta: { ...inha.meta, taxYear: 2024 },
    after: inha.after,
    expect: /the 2024 tables give/,
  },
  {
    name: "income tax that doesn't match the brackets (capital gains)",
    meta: inha.meta,
    after: { ...inha.after, incomeTax: 4800, federalTotalTax: 15807 },
    expect: /Income tax .* reads \$4,800/,
  },
  {
    name: "before income over the QBI threshold",
    meta: inha.meta,
    after: {
      ...inha.after,
      grossReceipts: 300000,
      totalExpenses: 201880,
      homeOffice: 20220,
    },
    expect: /over the 2025 single threshold/,
  },
];

let failed = 0;
const money = (v) => (v === null ? "—" : `$${v.toLocaleString("en-US")}`);

for (const p of PAIRINGS) {
  console.log(`\n${p.name}`);
  const entity = p.entity ?? null;
  const r = deriveBefore(p.after, p.meta, undefined, entity);
  if (!r.ok) {
    failed++;
    console.log("  REFUSED:\n   - " + r.reasons.join("\n   - "));
    continue;
  }
  console.log("  " + "line".padEnd(26) + "derived".padStart(10) + "CPA print".padStart(11) + "  ");
  for (const key of Object.keys(p.before)) {
    const want = p.before[key];
    const got = r.before[key];
    const ok = want === got;
    if (!ok) failed++;
    console.log(
      "  " + key.padEnd(26) + money(got).padStart(10) + money(want).padStart(11) + (ok ? "  ok" : "  MISMATCH"),
    );
  }
  if (p.entityBefore) {
    console.log("  1120-S before:");
    for (const key of Object.keys(p.entityBefore)) {
      const want = p.entityBefore[key];
      const got = r.entityBefore?.[key] ?? null;
      const ok = want === got;
      if (!ok) failed++;
      console.log(
        "  " + key.padEnd(26) + money(got).padStart(10) + money(want).padStart(11) + (ok ? "  ok" : "  MISMATCH"),
      );
    }
  }
  const savings = computeRecap({
    before: r.before,
    after: p.after,
    priorYearIncome: null,
    entityBefore: r.entityBefore,
    entityAfter: entity,
  }).savings;
  const ok = savings === p.savings;
  if (!ok) failed++;
  console.log(`  savings ${money(savings)} vs recap ${money(p.savings)} ${ok ? "ok" : "MISMATCH"}`);
  console.log("  notes:\n   - " + r.derived.notes.join("\n   - "));

  // The strategy split has to add up to the headline exactly.
  const analysis = attributeStrategies(p.after, p.meta, undefined, entity);
  if (!analysis) {
    failed++;
    console.log("  attribution: NONE (engine refused)");
  } else {
    const sum = analysis.attribution.reduce((s, a) => s + a.savings, 0);
    const sumOk = sum === savings;
    if (!sumOk) failed++;
    console.log(`  by strategy (${sumOk ? "adds up" : "DOES NOT ADD UP"}):`);
    for (const a of analysis.attribution) console.log(`   - ${a.label.padEnd(44)} ${money(a.savings).padStart(10)}`);
    if (p.scorpSavings !== undefined) {
      const got = analysis.scorpSavings?.amount ?? null;
      const scOk = got === p.scorpSavings;
      if (!scOk) failed++;
      console.log(`  S-corp SE tax avoided ${money(got)} vs expected ${money(p.scorpSavings)} ${scOk ? "ok" : "MISMATCH"}`);
    }
  }
}

/* ── Returns that derive with a note: an ordinary adjustment carried across ── */
{
  console.log("\nCarried adjustments");
  // Inha's after with a $10,000 SEP on Schedule 1: AGI, QBI limit, taxable
  // income and tax all move accordingly; the before keeps the $10,000.
  const r = deriveBefore(
    { ...inha.after, agi: 62396, qbiDeduction: 9329, taxableIncome: 37317, incomeTax: 4241, federalTotalTax: 15248, federalAmountOwed: 5648, stateTotalTax: 1784, stateAmountOwed: 1046, stateTotalDue: 1046 },
    inha.meta,
  );
  const ok = r.ok && r.before.agi === 139588 && r.derived.notes.some((s) => /carried over unchanged/.test(s));
  if (!ok) failed++;
  console.log(`  ${ok ? "ok" : "WRONG"}  $10,000 SEP carried: before AGI ${r.ok ? money(r.before.agi) : "refused: " + r.reasons.join(" | ")}`);
}

/* ── The S corporation cards on their own: the corporation's tax and elective tax ──
   California is proven on LaLaNation89's prints; New Jersey's figures are the
   Division of Taxation's published minimum-tax tiers and BAIT schedule, not
   yet proven on a real return.                                                */
{
  console.log("\nS corporation cards");
  const y = cardFor(2025);
  const cases = [
    ["CA after: 511,924 net / 836,958 receipts, electing", "CA", 511924, 836958, true, 7679, 47609],
    ["CA before: 836,958 net, no election", "CA", 836958, 836958, false, 12554, 0],
    ["CA tiny: 20,000 net → $800 minimum", "CA", 20000, 30000, false, 800, 0],
    ["NJ: 511,924 net / 836,958 receipts, BAIT", "NJ", 511924, 836958, true, 1125, 31265],
    ["NJ: 80,000 net / 80,000 receipts, no BAIT", "NJ", 80000, 80000, false, 375, 0],
    ["NJ: 1,200,000 net / 2,000,000 receipts, BAIT", "NJ", 1200000, 2000000, true, 1500, 84888],
  ];
  for (const [name, code, net, receipts, electing, wantTax, wantPte] of cases) {
    const t = entityTax(y.states[code], net, receipts, electing);
    const ok = t.franchise === wantTax && t.pte === wantPte;
    if (!ok) failed++;
    console.log(`  ${ok ? "ok   " : "WRONG"} ${name}: tax ${money(t.franchise)} (want ${money(wantTax)}), PTE ${money(t.pte)} (want ${money(wantPte)})`);
  }
}

/* ── Every seeded state card has to pass the editor's validation (bracket
   order, percentages, minimum-tax tiers); a typo here would block the whole
   year's tables from saving.                                               */
{
  console.log("\nSeeded cards by year");
  for (const year of [2023, 2024, 2025, 2026]) {
    const y = cardFor(year);
    if (!y) {
      failed++;
      console.log(`  ${year}: MISSING`);
      continue;
    }
    const problems = validateYearCard(y);
    if (problems.length) {
      failed++;
      console.log(`  ${year} INVALID:\n   - ` + problems.join("\n   - "));
    }
    const codes = Object.keys(y.states).sort();
    const taxed = codes.filter((c) => y.states[c].incomeTax);
    const withEntity = taxed.filter((c) => y.states[c].entity);
    const withPte = withEntity.filter((c) => y.states[c].entity?.pte);
    const proven = taxed.filter((c) => y.states[c].proven);
    const carried = taxed.filter((c) => /^CARRIED FROM/.test(y.states[c].note));
    console.log(
      `  ${year}: ${problems.length ? "INVALID" : "valid"} — ${codes.length} jurisdictions, ${taxed.length} with an income tax, ${withEntity.length} with S corporation rules, ${withPte.length} with a PTE election; proven: ${proven.length ? proven.join(", ") : "none"}; carried from 2025: ${carried.length}`,
    );
    if (codes.length !== 51) {
      failed++;
      console.log(`  WRONG: expected 51 jurisdictions, found ${codes.length}`);
    }
  }

  // The federal schedules, by hand: tax on $50,000 of taxable income, single.
  const tax = (rows, income) => {
    let t = 0, floor = 0;
    for (const { upTo, rate } of rows) {
      if (income <= floor) break;
      const cap = upTo ?? Infinity;
      t += (Math.min(income, cap) - floor) * rate;
      floor = cap;
    }
    return Math.round(t);
  };
  // 2025: 10% × 11,925 + 12% × 36,550 + 22% × 1,525 = 5,914.
  const want = { 2023: 6308, 2024: 6053, 2025: 5914, 2026: 5752 };
  for (const [year, expected] of Object.entries(want)) {
    const got = tax(cardFor(Number(year)).federal.brackets.single, 50000);
    const ok = got === expected;
    if (!ok) failed++;
    console.log(`  ${ok ? "ok   " : "WRONG"} federal ${year}, single, $50,000 taxable → ${money(got)} (want ${money(expected)})`);
  }
}

console.log("\nRefusals");
for (const c of REFUSALS) {
  const r = deriveBefore(c.after, c.meta);
  const ok = !r.ok && r.reasons.some((s) => c.expect.test(s));
  if (!ok) failed++;
  console.log(`  ${ok ? "ok" : "WRONG"}  ${c.name}`);
  if (!r.ok) for (const s of r.reasons) console.log(`         → ${s}`);
  else console.log("         → derived when it should have refused");
}

console.log(failed ? `\n${failed} problem(s)` : "\nAll good");
process.exit(failed ? 1 : 0);
