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
import { readFileSync } from "node:fs";
import { attributeStrategies, deriveBefore, entityTax } from "../src/lib/tax-recap/derive.ts";
import { computeRecap } from "../src/lib/tax-recap/compute.ts";
import { emptyEntityNumbers, emptyNumbers, emptyStateNumbers } from "../src/lib/tax-recap/schema.ts";
import { cardFor, validateYearCard } from "../src/lib/tax-recap/tables.ts";

const numbers = (v) => ({ ...emptyNumbers(), ...v });
const entityNumbers = (v) => ({ ...emptyEntityNumbers(), ...v });

/* ── Client A 2025, single, CA Form 540 ─────────────────────────────
   AFTER: "1040 Individual 2025 Tax Return (final output)".
   BEFORE: "1040_client_a_new(ZERO WRITEOFFS)".               */
const PAIRINGS = [
  {
    name: "Client A 2025 (single, CA 540)",
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
      otherTaxes: 22743,
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

  /* ── Client B 2025, single, Texas resident with California-source income (540NR) ──
     AFTER: "Client B - 2025 1040 INDIVIDUAL TAX RETURN(FINAL)".
     BEFORE: "1040_client_b(ZERO WRITEOFFS)". The before print also carries a
     $38 California underpayment penalty (FTB 5805), which can't be derived, so
     the engine's before is $38 short of the Canva recap's $19,108.              */
  {
    name: "Client B 2025 (single, TX resident, CA 540NR)",
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
      otherTaxes: 17385,
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

  /* ── Client C 2025, single, New Jersey, marketplace coverage six months ──────
     AFTER: "Client C - 2025 1040 INDIVIDUAL TAX RETURN(final output)" (a scan).
     BEFORE: "1040_client_c_ (ZERO WRITEOFFS)25i_FC". Both prints carry Form
     8962 and Form 7206. The before print's penalties (503 federal, 125 NJ)
     can't be derived; the engine carries the after's (224, 28) as a floor, so
     the lines that include a penalty are expected per the engine here.       */
  {
    name: "Client C 2025 (single, NJ-1040, Form 8962)",
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
      otherTaxes: 9871,
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
    // The tax team's call (2026-10-05): the $857 self-employed health
    // insurance deduction is DeCypher's, so the before doesn't claim it and
    // parts from the CPA's print. By hand: AGI 63,317 + 857 = 64,174;
    // taxable before QBI 48,424, QBI income-limited at 20% = 9,685; taxable
    // 38,739, tax from the $50 row at 38,725 = 4,409 (+78); the advance is
    // still repaid in full (948, over 400% either way). New Jersey: the SEHI
    // leaves its medical deduction (1,464 → 607), +857 of taxable income at
    // 5.525% → +50 by its table (2,230 → 2,280). Savings +128.
    convention: {
      before: {
        agi: 64174,
        qbiDeduction: 9685,
        taxableIncome: 38739,
        incomeTax: 4409,
        federalTotalTax: 15228,
        federalAmountOwed: 15452,
        sehiDeduction: null,
        sehiPaid: null,
        stateMedical: 607,
        stateTaxOnIncome: 2280,
        stateTotalTax: 3029,
        stateAmountOwed: 3029,
        stateTotalDue: 3057,
      },
      savings: 12045,
    },
  },

  /* ── Client D / Business D Inc. 2025, head of household, CA 540 + CA 100S ──
     An S corporation shareholder: two after returns (the 1040 and the
     1120-S), two before prints ("1040_client_d(FOR JASON)" and
     "1120s_business_d_inc(ZERO WRITEOFFS)"). The before zeros every
     deduction on the 1120-S — cost of goods sold, the owner's salary, the
     Solo 401(k), the health insurance — and has no PTE election. The Canva
     recap folds the shareholder's CA tax into the S-corp row and reads
     $347,227 before; the prints give $347,422 (its before is $195 off the
     print). Its "S-corp savings" of $35,140 is hand-computed; the engine's
     estimate is $36,587 (Schedule SE + additional Medicare on the K-1).  */
  {
    name: "Client D 2025 (head of household, CA 540, S corporation on CA 100S)",
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
    // The one dependent, by hand from the card's brackets. After: single
    // instead of head of household on 515,124 of AGI (standard deduction
    // 15,750 not 23,625) is 133,283 vs 128,788 = 4,495, plus the $600
    // child-care credit; California stays $0 under the PTE credit. Before
    // (no salary, no PTE): federal 259,757 vs 255,105 = 4,652, California
    // 82,712 vs 76,243 = 6,469.
    // The client's before doesn't claim the dependent: those two figures go
    // onto its federal and state rows.
    kids: { after: 5095, before: 11121, inBefore: { federal: 4652, state: 6469 } },
  },

  /* ── Client E / Business E LLC 2025, married filing jointly, CA 540 + CA 568 ──
     A two-member LLC taxed as a partnership, both spouses partners at 50%.
     AFTER: "Client E - 2025 1040 INDIVIDUAL TAX RETURN(Final
     output)" + "Business E LLC - 2025 1065 PARTNERSHIP TAX RETURN(final output)".
     BEFORE: "client_e(ZERO WRITEOFFS)" + "1065_business_e(ZERO WRITEOFFS)".
     The 1065 deducts $20,494 of interest and $57,631 of other expenses, plus
     $8,290 of guaranteed payments that are the partners' health premiums
     (K-1 box 13 code M), deducted again on the 1040 as self-employed health
     insurance. Each spouse has their own Schedule SE and Form 7206. The 1040
     also carries two Schedule Cs that net to $0 — 1099 income issued under
     the owners' SSNs and picked up on the 1065 — which the engine leaves out.
     California: the return itemizes on the 540 ($21,973: the property tax
     and mortgage interest without the federal cap, less the state income
     tax) while taking the federal standard deduction; the LLC owes the $800
     annual tax and no fee ($241,298 of total income is under $250,000).
     The CPA's before print zeroes the guaranteed payments too, so the before
     has no health insurance deduction (the Canva recap for this client kept
     it and reads $59,481 before; the prints give $70,037).                */
  {
    name: "Client E 2025 (married filing jointly, CA 540, two-member LLC on CA 568)",
    meta: { taxYear: 2025, filingStatus: "Married filing jointly", stateCode: "CA", stateForm: "540", entityForm: "1065" },
    after: numbers({
      partnershipIncome: 163173,
      totalIncome: 163203,
      agi: 143385,
      qbiDeduction: 22377,
      taxableIncome: 89508,
      incomeTax: 10266,
      seTax: 23056,
      otherTaxes: 23056,
      federalTotalTax: 33322,
      federalAmountOwed: 33322,
      // the two pass-through Schedule Cs: 5,095 + 9,856 of receipts, the same in other expenses
      grossReceipts: 14951,
      totalExpenses: 14951,
      businessNetIncome: 0,
      sehiDeduction: 8290,
      sehiPaid: 8290,
      itemizedDeductions: 23598,
      saltPaid: 9421,
      saltDeducted: 9421,
      medicalExpenses: 0,
      stateTotalTax: 4175,
      stateAmountOwed: 4175,
      stateTotalDue: 4175,
      stateTaxOnIncome: 4481,
      stateExemptionCredits: 306,
      stateDeduction: 21973,
    }),
    entity: entityNumbers({
      grossReceipts: 241298,
      totalIncome: 241298,
      guaranteedPayments: 8290,
      otherDeductions: 57631,
      totalDeductions: 86415,
      ordinaryIncome: 154883,
      k1Ordinary: 77441,
      k1Guaranteed: 4145,
      ownershipPct: 50,
      k1Ordinary2: 77442,
      k1Guaranteed2: 4145,
      ownershipPct2: 50,
      distributions: 95222,
      stateGrossIncome: 241298,
      stateTax: 800,
      stateTotalTax: 800,
      statePayments: 800,
      stateAmountDue: 0,
    }),
    before: numbers({
      partnershipIncome: 241298,
      totalIncome: 241328,
      agi: 224280,
      qbiDeduction: 38556,
      taxableIncome: 154224,
      incomeTax: 23757,
      seTax: 34094,
      otherTaxes: 34094,
      federalTotalTax: 57851,
      federalPayments: 0,
      federalAmountOwed: 57851,
      businessNetIncome: null,
      sehiDeduction: null,
      sehiPaid: null,
      itemizedDeductions: 23598,
      saltPaid: 9421,
      saltDeducted: 9421,
      medicalExpenses: 0,
      stateTotalTax: 11386,
      stateAmountOwed: 11386,
      stateTotalDue: 11386,
      stateTaxOnIncome: 11692,
      stateExemptionCredits: 306,
      stateDeduction: 21973,
    }),
    entityBefore: entityNumbers({
      grossReceipts: 241298,
      totalIncome: 241298,
      guaranteedPayments: null,
      totalDeductions: 0,
      ordinaryIncome: 241298,
      k1Ordinary: 120649,
      k1Guaranteed: null,
      ownershipPct: 50,
      k1Ordinary2: 120649,
      k1Guaranteed2: null,
      ownershipPct2: 50,
      distributions: 95222,
      stateGrossIncome: 241298,
      stateTax: 800,
      stateTotalTax: 800,
      statePayments: 800,
      stateAmountDue: 0,
    }),
    // before 57,851 + 11,386 + 800 = 70,037; after 33,322 + 4,175 + 800 = 38,297
    savings: 31740,
  },
];

/* ── Client H / Business H LLC 2025, married filing jointly, MA Form 1 + MA 355S ──
   AFTER only ("Client H - 2025 1040 INDIVIDUAL TAX RETURN_FINAL" and
   "Business H LLC - 2025 S-CORP 1120S TAX RETURN_FINAL"). No before print.
   The return that broke the engine four ways at once (2026-10-08):
    - two W-2s, both from the corporation: the owner's $15,000 of officer pay
      and the spouse's $57,000 of salary inside line 8 — the engine assumed
      the only W-2 was the officer's;
    - line 19 is $4,900: two children at $2,200 and one other dependent at
      $500 (the daughter is 19), which no count of children alone gives;
    - an S corporation under the QBI threshold files Form 8995, whose QBI is
      the K-1 itself ($180,200 → $36,040);
    - Massachusetts deducts 7.65% of each person's wages up to $2,000
      (lines 11a/11b: $1,148 and $2,000), so whose W-2 is whose matters.
   Also: Form 8962 with monthly rows (10 months), a $2 NIIT on $61 of
   interest, two pass-through Schedule Cs the reader leaves out, and a
   first-year 355S paying only the $456 minimum. The W-2 lines below are
   what the reader reports once the browser points it at Schedule INC. */
const CLIENT_H = {
  meta: { taxYear: 2025, filingStatus: "Married filing jointly", stateCode: "MA", stateForm: "1", entityForm: "1120-S" },
  after: numbers({
    w2Income: 72000,
    w2Taxpayer: 15000,
    w2Spouse: 57000,
    w2TaxpayerEntity: 15000,
    w2SpouseEntity: 57000,
    scorpIncome: 180200,
    totalIncome: 252261,
    agi: 252261,
    dependentCount: 3,
    qualifyingChildren: 2,
    otherDependents: 1,
    qbiDeduction: 36040,
    taxableIncome: 184721,
    incomeTax: 30467,
    additionalTaxes: 9586,
    childTaxCredit: 4900,
    niit: 2,
    otherTaxes: 2,
    federalTotalTax: 35155,
    federalPayments: 17294,
    federalWithholding: 17294,
    federalAmountOwed: 18529,
    federalPenalty: 668,
    ptcFamilySize: 5,
    ptcPovertyLine: 36580,
    ptcMonths: 10,
    ptcPremiums: 17554,
    ptcSlcsp: 15804,
    ptcAdvance: 9586,
    ptcAllowed: 0,
    ptcRepayment: 9586,
    stateTotalTax: 11866,
    statePayments: 6699, // 6,259 withheld + the 440 refundable Child and Family credit
    stateWithholding: 6259,
    stateAmountOwed: 5167,
    statePenalty: 104,
    stateTotalDue: 5271,
    stateTaxOnIncome: 11866,
    stateExemptions: 11800,
    stateWageDeduction: 3148,
  }),
  entity: entityNumbers({
    grossReceipts: 767198,
    cogs: 274422,
    totalIncome: 492776,
    officerComp: 15000,
    wages: 145391,
    taxesLicenses: 18199,
    otherDeductions: 101564,
    totalDeductions: 312576,
    ordinaryIncome: 180200,
    k1Ordinary: 180200,
    ownershipPct: 100,
    distributions: 167057,
    stateNetIncome: 0, // 355S line 5: no income measure under $6M of receipts
    stateTax: 456,
    stateTotalTax: 456,
    statePayments: 456,
    stateAmountDue: 0,
  }),
};

/* ── Client B 2024, single, Texas resident, CA 540NR — someone else's dependent ──
   AFTER only ("Client B 2024 Tax Returns", 46 pages, every FTB page and
   the Schedule C with a garbled text layer). Line 12a is checked, so the
   standard deduction is the dependent's: earned income $843 + $322 (no SE
   deduction under the $400 floor) + $450 = $1,615 on both the 1040 and the
   540NR, with no California personal exemption credit. Form 8995 gives $65
   ($64 on the $322 plus $1 on $5 of REIT dividends the engine doesn't read;
   inside the $2 tolerance). Qualified dividends $634 and a $13,679 long-term
   gain go through the worksheet; the $40,290 of gains is otherwise ordinary
   income here. The after reproduces: tax $3,041, California $1,080 on all
   $43,288 of income as California-source.

   The before, by hand: Schedule C $20,013 of receipts, SE earnings 18,482 →
   2,292 + 536 = 2,828, half 1,414; AGI 61,565; earned income 19,442 + 450
   is over the regular $14,600, which applies; QBI 20% × 18,599 = 3,720;
   taxable 43,245, of which 14,313 preferential inside the 0% bracket:
   tax on the 28,932 ordinary slice from the $50 row at 28,925 = 3,239.
   Federal total 3,239 + 2,828 = 6,067.                                      */
const CLIENT_B_2024 = {
  meta: { taxYear: 2024, filingStatus: "Single", stateCode: "CA", stateForm: "540NR" },
  after: numbers({
    w2Income: 843,
    w2Taxpayer: 843,
    qualifiedDividends: 634,
    capitalGain: 40290,
    capitalGainLongTerm: 13679,
    businessNetIncome: 322,
    totalIncome: 43288,
    agi: 43288,
    dependentOfAnother: 1,
    qbiDeduction: 65,
    taxableIncome: 41608,
    incomeTax: 3041,
    otherTaxes: 0,
    federalTotalTax: 3041,
    federalAmountOwed: 3067,
    federalPenalty: 26,
    grossReceipts: 20013,
    totalExpenses: 19691,
    homeOffice: 0,
    stateTotalTax: 1080,
    stateAmountOwed: 1080,
    stateTotalDue: 1080,
    stateSourceIncome: 43288,
    stateTaxOnIncome: 1080,
    stateExemptionCredits: 0,
    stateDeduction: 1615,
  }),
};

/* ── Client I / Business I LLC 2024, single, Texas resident, Maryland Form 505 (nonresident) ──
   AFTER only ("Client I - 2024 1040 INDIVIDUAL TAX RETURN_FINAL" and
   "Business I, LLC - 2024 S-CORP 1120S TAX RETURN_FINAL"). Three things
   the engine didn't model (2026-10-08):
    - a $12,384 W-2 from another employer beside the $31,500 of officer pay,
      with no W-2 copies in the print — the 505NR shows it is the Maryland-
      source wages; the reviewer types the officer's $31,500;
    - the K-1's $4,126 section 179 deduction (box 11), which Schedule E
      column (j) nets off the $67,578 to the $63,452 Schedule 1 carries;
    - Maryland's nonresident 505NR: deduction 15% of the Maryland income
      ($1,858) and the $1,600 exemption each × 0.115363, taxable 11,985,
      the $4,850 resident tax × 0.116305 = $564, plus 2.25% = $270: $834.
   Before, by hand: K-1 437,030, AGI 449,426 with the outside W-2, taxable
   434,826 past the QBI range (no deduction), tax 1,160 + 4,266 + 11,742.5
   + 21,942 + 16,568 + 35% × 191,101 = 122,564. Maryland: line 1 446,726
   (exemption phased to 0), tax 24,072; factor 0.027555 → deduction 51,
   taxable 12,333; share 0.027607 → 665, special 277: 942.                 */
const CLIENT_I = {
  meta: { taxYear: 2024, filingStatus: "Single", stateCode: "MD", stateForm: "505", entityForm: "1120-S" },
  after: numbers({
    w2Income: 43884,
    w2Taxpayer: 43884,
    w2TaxpayerEntity: 31500,
    scorpIncome: 63452,
    totalIncome: 107348,
    agi: 107348,
    qbiDeduction: 12690,
    taxableIncome: 80058,
    incomeTax: 12670,
    federalTotalTax: 12670,
    federalPayments: 2457,
    federalWithholding: 2457,
    federalAmountOwed: 10253,
    federalPenalty: 40,
    stateTotalTax: 834,
    statePayments: 789,
    stateWithholding: 789,
    stateAmountOwed: 45,
    stateTotalDue: 45,
    stateSourceIncome: 12384,
    stateTaxOnIncome: 564,
    stateExemptions: 1600,
    stateDeduction: 2700,
  }),
  entity: entityNumbers({
    grossReceipts: 437030,
    cogs: 63211,
    totalIncome: 373819,
    officerComp: 31500,
    wages: 4500,
    taxesLicenses: 3201,
    otherDeductions: 247935,
    totalDeductions: 306241,
    ordinaryIncome: 67578,
    k1Ordinary: 67578,
    k1Section179: 4126,
    ownershipPct: 100,
    distributions: 66589,
  }),
};

/* ── Returns the engine must refuse, and the word its reason has to carry ── */
const clientA = PAIRINGS[0];
const clientE = PAIRINGS[4];
const REFUSALS = [
  {
    name: "Client I 2024 (derives: outside W-2 kept, K-1 section 179 zeroed, Maryland 505NR reproduced)",
    meta: CLIENT_I.meta,
    after: CLIENT_I.after,
    entity: CLIENT_I.entity,
    expect: null,
    federal: 122564,
    state: 942,
    assert: (r) =>
      r.before.w2Income === 12384 &&
      r.before.scorpIncome === 437030 &&
      r.before.taxableIncome === 434826 &&
      r.before.qbiDeduction === null &&
      r.before.stateTaxOnIncome === 665 &&
      r.before.medicareWages === null &&
      r.entityBefore?.k1Section179 === null &&
      r.entityBefore?.k1Ordinary === 437030 &&
      r.derived.notes.some((s) => /\$4,126 section 179/.test(s)),
  },
  {
    // The reader took Schedule E column (k) for the S corporation income
    // (gross of the section 179): reconciled by the K-1, same before.
    name: "Client I with Schedule E read gross of the section 179 (derives, reconciled)",
    meta: CLIENT_I.meta,
    after: { ...CLIENT_I.after, scorpIncome: 67578 },
    entity: CLIENT_I.entity,
    expect: null,
    federal: 122564,
    assert: (r) => r.derived.notes.some((s) => /section 179 deduction \(column \(j\)\) nets it/.test(s)),
  },
  {
    // The officer's W-2 not placed (engine v11): the $12,384 beyond the
    // officer's pay is taken as another employer's and kept — the same
    // before as with the line typed — and the note says how to correct it.
    name: "Client I without the officer's W-2 line typed (derives, the $12,384 taken as another employer's)",
    meta: CLIENT_I.meta,
    after: { ...CLIENT_I.after, w2TaxpayerEntity: null },
    entity: CLIENT_I.entity,
    expect: null,
    federal: 122564,
    state: 942,
    verified: true,
    assert: (r) => r.before.w2Income === 12384 && r.derived.notes.some((s) => /\$12,384 is taken as wages from another employer/.test(s)),
  },
  {
    // Maryland's 505NR needs the Maryland income; without it, says so.
    name: "Client I without the Maryland income read (refuses, naming 505NR line 8)",
    meta: CLIENT_I.meta,
    after: { ...CLIENT_I.after, stateSourceIncome: null },
    entity: CLIENT_I.entity,
    expect: /Form 505NR line 8/,
  },
  {
    name: "Client B 2024 as someone's dependent (derives: the dependent's deduction on both returns, no CA personal credit)",
    meta: CLIENT_B_2024.meta,
    after: CLIENT_B_2024.after,
    expect: null,
    federal: 6067,
    assert: (r) =>
      r.before.seTax === 2828 &&
      r.before.agi === 61565 &&
      r.before.qbiDeduction === 3720 &&
      r.before.taxableIncome === 43245 &&
      r.before.incomeTax === 3239 &&
      r.before.stateExemptionCredits === 0 &&
      r.derived.notes.some((s) => /Someone else claims the filer/.test(s)),
  },
  {
    // The same return with line 12a not read (engine v11): the $1,615
    // deduction is $12,985 under the standard one, carried across as it
    // is — so the before keeps a $1,615 deduction instead of the $14,600 a
    // dependent with $19,442 of earned income gets, and taxable income is
    // 61,565 − 1,615 − 3,720 of QBI = 56,230. Projected, with the line
    // named and line 12a among the reasons.
    name: "Client B 2024 with line 12a unread (derives projected, the deduction carried)",
    meta: CLIENT_B_2024.meta,
    after: { ...CLIENT_B_2024.after, dependentOfAnother: null },
    expect: null,
    verified: false,
    assert: (r) =>
      r.before.taxableIncome === 56230 &&
      r.derived.proof.residuals.some((m) => /deduction/i.test(m.line) && m.read === 1615 && m.computed === 14600) &&
      r.derived.notes.some((s) => /a filer someone else claims \(line 12a, not read\)/.test(s)),
  },
  {
    // Without any W-2 lines (engine v11): the $57,000 beyond the officer's
    // pay is taken as the taxpayer's from another employer and kept on the
    // before. Wrong for this return (it's the spouse's, from the business)
    // — which is what the note is for — and Massachusetts says so too: the
    // per-person FICA deduction on one person's $72,000 is $2,000, not the
    // $3,148 printed, so the state carries a line and the recap is
    // projected, not verified.
    name: "Client H without the W-2 lines read (derives projected, the $57,000 kept, the note naming the lines to type)",
    meta: CLIENT_H.meta,
    after: { ...CLIENT_H.after, w2Taxpayer: null, w2Spouse: null, w2TaxpayerEntity: null, w2SpouseEntity: null },
    entity: CLIENT_H.entity,
    expect: null,
    verified: false,
    assert: (r) =>
      r.before.w2Income === 57000 &&
      r.derived.notes.some((s) => /\$57,000 is taken as wages from another employer/.test(s) && /W-2 wages from the business.*recompute the before column/.test(s)) &&
      r.derived.proof.residuals.some((m) => /Social Security \/ Medicare deduction/.test(m.line) && m.read === 3148 && m.computed === 2000),
  },
  {
    // Whose they are but not who paid them: the $57,000 is the spouse's,
    // taken as another employer's — the same before as the "from another
    // employer" case below, and verified, since each person's FICA
    // deduction then comes out as printed.
    name: "Client H with whose W-2s read but not who paid them (derives verified, the spouse's $57,000 kept)",
    meta: CLIENT_H.meta,
    after: { ...CLIENT_H.after, w2TaxpayerEntity: null, w2SpouseEntity: null },
    entity: CLIENT_H.entity,
    expect: null,
    federal: 226971,
    verified: true,
    assert: (r) =>
      r.before.w2Income === 57000 &&
      r.before.w2Spouse === 57000 &&
      r.before.w2Taxpayer === null &&
      r.derived.notes.some((s) => /\$15,000 the taxpayer's, \$57,000 the spouse's/.test(s)),
  },
  {
    // The spouse's W-2 from another employer: it stays on the before, with
    // its own Massachusetts FICA deduction, and the officer's leaves.
    name: "Client H with the spouse's W-2 from another employer (derives, W-2 kept)",
    meta: CLIENT_H.meta,
    after: { ...CLIENT_H.after, w2SpouseEntity: null },
    entity: CLIENT_H.entity,
    expect: null,
    assert: (r) =>
      r.before.w2Income === 57000 &&
      r.before.w2Spouse === 57000 &&
      r.before.w2Taxpayer === null &&
      r.before.stateWageDeduction === 2000 &&
      r.before.federalWithholding === 13691 && // 17,294 less the officer's 3,603 (15,000 / 72,000 of it): the spouse's share stays
      r.derived.notes.some((s) => /from another employer stay/.test(s)),
  },
  {
    // Schedule 8812's counts misread (three children): they don't give
    // $4,900, so the mix is inferred instead — two children, one other.
    name: "Client H with the dependent counts misread (derives, inferred)",
    meta: CLIENT_H.meta,
    after: { ...CLIENT_H.after, qualifyingChildren: 3, otherDependents: null },
    entity: CLIENT_H.entity,
    expect: null,
    federal: 206198,
  },
  {
    // The Massachusetts FICA line not read: the engine figures it per person
    // from the W-2 lines and the return still reproduces.
    name: "Client H without lines 11a/11b read (derives, unchanged)",
    meta: CLIENT_H.meta,
    after: { ...CLIENT_H.after, stateWageDeduction: null },
    entity: CLIENT_H.entity,
    expect: null,
    federal: 206198,
    state: 37773,
  },
  {
    // Someone can claim the filer: the dependent's deduction is earned income
    // + $450, which on Client A's $72,396 is capped at the regular $15,750 — the
    // federal side reproduces and the before doesn't move (Texas, so no
    // state side to disagree).
    name: "Client A as someone's dependent, no state (derives, unchanged: the limited deduction is capped at the regular one)",
    meta: { ...clientA.meta, stateCode: "TX", stateForm: null },
    after: { ...clientA.after, dependentOfAnother: 1, stateTotalTax: null, statePayments: null, stateAmountOwed: null, stateTotalDue: null },
    expect: null,
    federal: 41287,
  },
  {
    // The same on her real California return, which claims the $153
    // personal credit a dependent can't: the card says so, and (engine
    // v11) carries the $153 across as a California line rather than refuse.
    name: "Client A as someone's dependent on her California return (derives projected: the $153 personal credit carried)",
    meta: clientA.meta,
    after: { ...clientA.after, dependentOfAnother: 1 },
    expect: null,
    federal: 41287,
    verified: false,
    // Her after return has no exemption-credit line read, so the $153 shows
    // on the California total: printed 2,567 against 2,720 without the credit.
    assert: (r) => r.derived.proof.residuals.some((m) => /California total tax/.test(m.line) && m.read === 2567 && m.computed === 2720),
  },
  {
    // Earned income small enough for the limit to bite: Client A with $1,000
    // of profit has a $1,350 deduction against $929 of AGI. Until engine
    // v12 the "deduction" was taken as AGI less taxable income ($929) and
    // carried as a $421 gap; but taxable income printed as $0 is a floor —
    // any deduction of $929 or more prints the same — so nothing is carried
    // for the deduction (the same flaw put −$15,214 on one client's before).
    // Still projected: Client A's California lines don't fit these numbers.
    name: "a dependent filer whose taxable income is $0 (the deduction isn't carried: $0 is a floor)",
    meta: clientA.meta,
    // (A Schedule C with an expense: one with none is only ever a payroll cleanup beside an S corporation.)
    after: { ...clientA.after, dependentOfAnother: 1, businessNetIncome: 1000, grossReceipts: 1200, totalExpenses: 200, homeOffice: 0, totalIncome: 1000, agi: 929, seTax: 141, taxableIncome: 0, incomeTax: 0, qbiDeduction: 0, federalTotalTax: 141 },
    expect: null,
    verified: false,
    assert: (r) => !r.derived.proof.residuals.some((m) => /deduction/i.test(m.line)),
  },
  {
    // The tax team's test (2026-10-22): a Schedule C with no expenses is only
    // ever filed for an S corporation's payroll cleanup. With no corporation
    // on the return it's a misread line 28, and the engine says so.
    name: "a Schedule C with receipts and no expenses, no S corporation",
    meta: clientA.meta,
    after: { ...clientA.after, totalExpenses: 0, homeOffice: 0, grossReceipts: clientA.after.businessNetIncome },
    expect: /payroll cleanup/,
  },
  {
    name: "a partner's return without the 1065",
    meta: clientE.meta,
    after: clientE.after,
    expect: /add the partnership's 1065/,
  },
  {
    // New York's card is seeded with no partnership rules. What the LLC
    // pays its state is a fee on its receipts, the same on both sides, so
    // it's carried across as read rather than refused (engine v13).
    name: "a partnership in a state with no partnership rules (NY): its own tax carried as read",
    meta: { ...clientE.meta, stateCode: "NY", stateForm: "IT-201" },
    after: clientE.after,
    entity: clientE.entity,
    expect: null,
    assert: (r) =>
      r.derived.notes.some((s) => /no partnership rules[^]*carried across as read/.test(s)) &&
      r.entityBefore.stateTax === clientE.entity.stateTax,
  },
  {
    // The reader put the Schedule E total on the S corporation line; the
    // entity's form says it's a partnership, so the engine moves it over.
    name: "partnership income read as S corporation income (reconciled by the 1065, derives)",
    meta: clientE.meta,
    after: { ...clientE.after, scorpIncome: clientE.after.partnershipIncome, partnershipIncome: null },
    entity: clientE.entity,
    expect: null,
  },
  {
    // A fast read's two misreads on Client A (2026-10-01): Form 8995's QBI put
    // on the 8995-A line, and the estimated payments put on line 31 with
    // line 32 blank. Both are set aside; the before must not move.
    name: "Client A with Form 8995's QBI and the estimated payments misread (derives, unchanged)",
    meta: clientA.meta,
    after: { ...clientA.after, qbiIncome: 72396, otherPayments: 9600 },
    expect: null,
    federal: 41287,
  },
  {
    // A fast read of Client B (2026-10-01): "state adjustments" worked out from
    // the nonresident column (−36,602, printed nowhere), the standard
    // deduction read as itemized, AGI read as 8995-A QBI. All three set
    // aside; the before must not move.
    name: "Client B with three misreads (derives, unchanged)",
    meta: { ...PAIRINGS[1].meta, unverified: ["stateAdjustments"] },
    after: { ...PAIRINGS[1].after, stateAdjustments: -36602, itemizedDeductions: 15750, qbiIncome: 51782 },
    expect: null,
    federal: 29652,
    state: 848,
  },
  {
    // Sonnet 5.5 at low effort (2026-10-01): the 540NR's line 31 (tax on
    // all income, 1,301) read for line 37 (the California share, 381).
    // Either proves the card.
    name: "Client B with line 31's tax on all income read for line 37 (derives, unchanged)",
    meta: PAIRINGS[1].meta,
    after: { ...PAIRINGS[1].after, stateTaxOnIncome: 1301 },
    expect: null,
    federal: 29652,
    state: 848,
  },
  {
    // A tax on income that is neither line: the line is recorded and the
    // recap is projected; the total still reproduces, so the before's
    // California tax is unchanged.
    name: "Client B with a state tax on income that's neither line (derives projected, the line recorded)",
    meta: PAIRINGS[1].meta,
    after: { ...PAIRINGS[1].after, stateTaxOnIncome: 900 },
    expect: null,
    federal: 29652,
    state: 848,
    verified: false,
    assert: (r) => r.derived.proof.residuals.some((m) => /California tax on income/.test(m.line) && m.read === 900),
  },
  {
    // The same bad state line, but found on the page: not set aside. The
    // California total then misses and the difference is carried across,
    // so the recap says projected and names the total.
    name: "Client B with a bad state adjustment the page does carry (derives projected, California total carried)",
    meta: PAIRINGS[1].meta,
    after: { ...PAIRINGS[1].after, stateAdjustments: -36602 },
    expect: null,
    federal: 29652,
    verified: false,
    assert: (r) => r.derived.proof.residuals.some((m) => /California total tax/.test(m.line) && m.read === 336),
  },
  {
    // A fast read of Client E (2026-10-01): one partner's Schedule E row read
    // as S corporation income, the other's as partnership income.
    name: "partnership rows split across the S corporation and partnership lines (derives, unchanged)",
    meta: clientE.meta,
    after: { ...clientE.after, scorpIncome: 81586, partnershipIncome: 81587 },
    entity: clientE.entity,
    expect: null,
    federal: 57851,
  },
  {
    // The next fast read of Client E: Schedule E's total (line 41) put on the
    // rental line as well. Set aside; no rental note on the recap.
    name: "the K-1 income repeated on the rental line (derives, unchanged, no rental note)",
    meta: clientE.meta,
    after: { ...clientE.after, rentalIncome: 163173 },
    entity: clientE.entity,
    expect: null,
    federal: 57851,
    state: 11386,
    noNote: /Rental losses/,
  },
  {
    // A second K-1 the 1065 doesn't account for still refuses.
    name: "a partner's return with income beyond the 1065's K-1s (refuses)",
    meta: clientE.meta,
    after: { ...clientE.after, scorpIncome: 20000 },
    entity: clientE.entity,
    expect: /doesn't match the K-1s/,
  },
  {
    // Schedule E page 2 never reached the reader (the page filter once
    // dropped it): the refusal must name the K-1 line, not ask for the
    // Schedule C a partner's return doesn't have.
    name: "a partner's return with the K-1 income unread",
    meta: clientE.meta,
    after: { ...clientE.after, partnershipIncome: null },
    entity: clientE.entity,
    expect: /weren't read from the after return: Partnership income/,
  },
  {
    // Form 541 is California's fiduciary return. (This fixture used 540X
    // until engine v12, which reads an amended form as the form it amends.)
    name: "a state form the card doesn't list",
    meta: { ...clientA.meta, stateForm: "541" },
    after: clientA.after,
    expect: /isn't the resident Form 540 or the nonresident Form 540NR/,
  },
  {
    name: "nonresident return without the state-source line read",
    meta: { ...clientA.meta, stateForm: "540NR" },
    after: clientA.after,
    expect: /State-source income .* wasn't read/,
  },
  {
    // A refundable credit the engine doesn't compute (an earned income
    // credit, say): carried across to the before as it is, so the before's
    // Federal Taxes are $966 lower than Client A's print and the recap says so.
    name: "refundable credit on line 32 (derives projected, the $966 carried)",
    meta: clientA.meta,
    after: { ...clientA.after, federalRefundableCredits: 966, federalPayments: 10566 },
    expect: null,
    federal: 41287,
    verified: false,
    assert: (r) =>
      r.before.federalRefundableCredits === 966 &&
      r.derived.proof.residuals.some((m) => /Refundable credits/.test(m.line) && m.read === 966 && m.computed === 0),
  },
  {
    // A deduction that isn't the standard one with no Schedule A read:
    // the $5,317 beyond it (21,067 − 15,750) is carried, and so is the tax
    // worksheet gap on line 16.
    name: "itemized deductions, Schedule A unread (derives projected, the deduction carried)",
    meta: clientA.meta,
    after: { ...clientA.after, taxableIncome: 40000, incomeTax: 4563 },
    expect: null,
    verified: false,
    assert: (r) =>
      r.derived.proof.residuals.some((m) => /deduction/i.test(m.line) && m.read === 21067 && m.computed === 15750) &&
      r.derived.notes.some((s) => /Schedule A wasn't read/.test(s)),
  },
  {
    // Every state is seeded, so the "no card" path needs a code that isn't one.
    name: "state without tables (PR)",
    meta: { ...clientA.meta, stateCode: "PR", stateForm: "482" },
    after: clientA.after,
    expect: /PR isn't on the 2025 tax tables/,
  },
  {
    // 2023–2026 are seeded now; a year outside them has no card.
    name: "year without tables (2019)",
    meta: { ...clientA.meta, taxYear: 2019 },
    after: clientA.after,
    expect: /No tax tables/,
  },
  {
    // A 2025 return run against the 2024 card: the brackets don't reproduce
    // its tax. The engine no longer refuses — it carries the gap and says
    // projected, naming income tax — which is why the Tax Tables page
    // reports carried lines on a known pairing as the card's fault.
    name: "a return run against the wrong year's tables (derives projected, naming income tax)",
    meta: { ...clientA.meta, taxYear: 2024 },
    after: clientA.after,
    expect: null,
    verified: false,
    assert: (r) =>
      r.derived.proof.residuals.some((m) => /Income tax/.test(m.line)) &&
      r.derived.notes.some((s) => /the 2024 tables give/.test(s)),
  },
  {
    name: "income tax that doesn't match the brackets (derives projected, the $401 gap carried)",
    meta: clientA.meta,
    after: { ...clientA.after, incomeTax: 4800, federalTotalTax: 15807 },
    expect: null,
    verified: false,
    // The before's tax is its own bracket figure less the same $401.
    assert: (r) =>
      r.derived.proof.residuals.some((m) => /Income tax/.test(m.line) && m.read === 4800 && m.computed === 5201) &&
      r.before.incomeTax === 18544 - 401,
  },
  {
    // With wages on the Schedule C: on the before they're a write-off,
    // gone with the rest, so the wage limit is zero there and the engine
    // derives (engine v11); the wages count at the split's steps where the
    // write-offs are on. Verified: the after is Client A's own return.
    name: "before income over the QBI threshold, with wages on the Schedule C (derives, limit zero on the before)",
    meta: clientA.meta,
    after: {
      ...clientA.after,
      grossReceipts: 300000,
      totalExpenses: 201880,
      homeOffice: 20220,
      schCWages: 24000,
    },
    expect: null,
    verified: true,
    assert: (r) =>
      r.before.qbiDeduction === null &&
      r.derived.notes.some((s) => /over the 2025 single threshold/.test(s) && /\$24,000 of wages Schedule C does pay count toward the limit/.test(s)),
  },
];

let failed = 0;
const money = (v) => (v === null || v === undefined ? "—" : `$${v.toLocaleString("en-US")}`);
const has = (v) => typeof v === "number" && isFinite(v);

for (const p of PAIRINGS) {
  console.log(`\n${p.name}`);
  const entity = p.entity ?? null;
  const r = deriveBefore(p.after, p.meta, undefined, entity);
  if (!r.ok) {
    failed++;
    console.log("  REFUSED:\n   - " + r.reasons.join("\n   - "));
    continue;
  }
  // A real pairing has to reproduce outright: a line carried here means
  // the card is wrong, not the return.
  if (!r.derived.proof.verified) {
    failed++;
    console.log("  NOT VERIFIED — lines carried:\n   - " + r.derived.proof.residuals.map((m) => `${m.line}: read ${money(m.read)}, tables ${money(m.computed)}`).join("\n   - "));
  }
  console.log("  " + "line".padEnd(26) + "derived".padStart(10) + "CPA print".padStart(11) + "  ");
  // A line the engine's convention moves off the CPA's print on purpose
  // (`convention.before`, with its by-hand working beside the pairing).
  const convention = p.convention?.before ?? {};
  for (const key of Object.keys(p.before)) {
    const moved = key in convention;
    const want = moved ? convention[key] : p.before[key];
    const got = r.before[key];
    const ok = want === got;
    if (!ok) failed++;
    console.log(
      "  " + key.padEnd(26) + money(got).padStart(10) + money(want).padStart(11) + (ok ? "  ok" : "  MISMATCH") +
        (moved ? `  (convention; print ${money(p.before[key])})` : ""),
    );
  }
  if (p.entityBefore) {
    console.log(`  ${p.meta.entityForm ?? "1120-S"} before:`);
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
  const wantSavings = p.convention?.savings ?? p.savings;
  const ok = savings === wantSavings;
  if (!ok) failed++;
  console.log(
    `  savings ${money(savings)} vs ${p.convention ? `expected ${money(wantSavings)} (recap ${money(p.savings)} before the convention)` : `recap ${money(p.savings)}`} ${ok ? "ok" : "MISMATCH"}`,
  );
  console.log("  notes:\n   - " + r.derived.notes.join("\n   - "));

  // The strategy split has to add up to the headline exactly — the
  // client's headline, whose before doesn't claim the dependents.
  const analysis = attributeStrategies(p.after, p.meta, undefined, entity);
  if (!analysis) {
    failed++;
    console.log("  attribution: NONE (engine refused)");
  } else {
    const headline = computeRecap({
      before: r.before,
      after: p.after,
      priorYearIncome: null,
      entityBefore: r.entityBefore,
      entityAfter: entity,
      analysis,
    }).savings;
    const sum = analysis.attribution.reduce((s, a) => s + a.savings, 0);
    const sumOk = sum === headline && headline === savings + (analysis.kids?.inBefore ? analysis.kids.before : 0);
    if (!sumOk) failed++;
    console.log(`  by strategy (${sumOk ? "adds up" : "DOES NOT ADD UP"} to ${money(headline)}):`);
    for (const a of analysis.attribution) console.log(`   - ${a.label.padEnd(44)} ${money(a.savings).padStart(10)}`);
    if (p.scorpSavings !== undefined) {
      const got = analysis.scorpSavings?.amount ?? null;
      const scOk = got === p.scorpSavings;
      if (!scOk) failed++;
      console.log(`  S-corp SE tax avoided ${money(got)} vs expected ${money(p.scorpSavings)} ${scOk ? "ok" : "MISMATCH"}`);
    }
    // What the dependents are worth: only on a return that claims them.
    const kids = analysis.kids;
    const kidsOk =
      p.kids === undefined
        ? kids === null
        : kids !== null &&
          kids.after === p.kids.after &&
          kids.before === p.kids.before &&
          (!p.kids.inBefore || (kids.inBefore?.federal === p.kids.inBefore.federal && kids.inBefore?.state === p.kids.inBefore.state));
    if (!kidsOk) failed++;
    console.log(
      `  kids: ${kids ? `after ${money(kids.after)}, before ${money(kids.before)} (${kids.note})` : "none"}${
        p.kids === undefined ? (kidsOk ? "" : " — EXPECTED NONE") : ` vs expected after ${money(p.kids.after)}, before ${money(p.kids.before)} ${kidsOk ? "ok" : "MISMATCH"}`
      }`,
    );
  }
}

/* ── Returns that derive with a note: an ordinary adjustment carried across ── */
{
  console.log("\nCarried adjustments");
  // Client A's after with a $10,000 SEP on Schedule 1: AGI, QBI limit, taxable
  // income and tax all move accordingly; the before keeps the $10,000.
  const r = deriveBefore(
    { ...clientA.after, agi: 62396, qbiDeduction: 9329, taxableIncome: 37317, incomeTax: 4241, federalTotalTax: 15248, federalAmountOwed: 5648, stateTotalTax: 1784, stateAmountOwed: 1046, stateTotalDue: 1046 },
    clientA.meta,
  );
  const ok = r.ok && r.before.agi === 139588 && r.derived.notes.some((s) => /carried over unchanged/.test(s));
  if (!ok) failed++;
  console.log(`  ${ok ? "ok" : "WRONG"}  $10,000 SEP carried: before AGI ${r.ok ? money(r.before.agi) : "refused: " + r.reasons.join(" | ")}`);
}

/* ── An HSA on Schedule 1 is DeCypher's (the tax team's call, 2026-10-05) ──
   Client A's after with a $4,000 HSA deduction (line 13), which California adds
   back on Schedule CA. After: AGI 68,396, QBI income-limited at 20% of
   52,646 = 10,529, taxable 42,117, tax from the $50 row at 42,125 = 4,817,
   total 15,824; California's AGI is unchanged by the add-back, so its tax
   is too. The before leaves the HSA off and its add-back with it: it has to
   be Client A's before exactly, 41,287 federal and 9,667 California.          */
{
  console.log("\nHSA on Schedule 1, added back by California");
  const r = deriveBefore(
    {
      ...clientA.after,
      agi: 68396,
      qbiDeduction: 10529,
      taxableIncome: 42117,
      incomeTax: 4817,
      federalTotalTax: 15824,
      federalAmountOwed: 6224,
      hsaDeduction: 4000,
      stateAdjustments: 4000,
    },
    clientA.meta,
  );
  const ok = r.ok && r.before.federalTotalTax === 41287 && r.before.stateTotalTax === 9667 && r.before.agi === 149588;
  if (!ok) failed++;
  console.log(
    `  ${ok ? "ok" : "WRONG"}  before federal ${r.ok ? money(r.before.federalTotalTax) : "refused: " + r.reasons.join(" | ")}${r.ok ? `, California ${money(r.before.stateTotalTax)}, AGI ${money(r.before.agi)}` : ""} (want 41,287 / 9,667 / 149,588)`,
  );
}

/* ── Client G 2024: W-2 plus a Schedule C written down to $0, CA 540 ──────
   AFTER only ("2024 Tax Return Client G", a 52-page ProSeries
   print whose Schedule C and FTB pages carry a garbled text layer). No
   before print exists; the figures below are the engine's, checked by hand:
   Schedule SE with no Social Security portion (W-2 wages over the 2024 wage
   base) and Medicare on the profit, the 0.9% additional Medicare tax over
   $200,000, the qualified dividends at 15% by the worksheet, the QBI
   deduction capped at zero over the threshold (no wages, no depreciation),
   NIIT on the dividends, line 31's extension payment and excess Social
   Security kept as payments, and the HSA add-back carried on the
   California side with the exemption credit phased down on FEDERAL AGI
   (Form 540 line 13: $281,070 is 15 steps of $2,500 over $244,857, so
   $90 off the $149 credit).                                             */
{
  console.log("\nClient G 2024 (single, W-2 + Schedule C at $0, CA 540)");
  const meta = { taxYear: 2024, filingStatus: "Single", stateCode: "CA", stateForm: "540" };
  const after = numbers({
    w2Income: 185261,
    qualifiedDividends: 1317,
    businessNetIncome: 0,
    totalIncome: 187328,
    agi: 187328,
    qbiDeduction: 0,
    qbiLossCarryforward: 21039,
    taxableIncome: 172728,
    incomeTax: 34379,
    otherTaxes: 0,
    federalTotalTax: 34379,
    federalPayments: 37727,
    federalWithholding: 28612,
    federalRefundableCredits: 9115,
    otherPayments: 9115,
    federalRefund: 0,
    federalPenalty: 61,
    grossReceipts: 95015,
    cogs: 19763,
    totalExpenses: 60172,
    homeOffice: 15080,
    stateTotalTax: 13686,
    statePayments: 12675,
    stateWithholding: 11675,
    stateAmountOwed: 1011,
    statePenalty: 36,
    stateTotalDue: 1047,
    stateTaxOnIncome: 13835,
    stateExemptionCredits: 149,
    stateAdjustments: 4150,
  });
  const want = {
    businessNetIncome: 95015,
    totalIncome: 282343,
    agi: 281070,
    qbiDeduction: null,
    taxableIncome: 266470,
    incomeTax: 63376,
    seTax: 2545,
    otherTaxes: 3281,
    niit: 79,
    federalTotalTax: 66657,
    federalPayments: 37727,
    federalRefundableCredits: 9115,
    otherPayments: 9115,
    federalAmountOwed: 28991,
    grossReceipts: 95015,
    cogs: null,
    totalExpenses: null,
    homeOffice: null,
    stateAdjustments: 4150,
    stateTaxOnIncome: 22553,
    stateExemptionCredits: 59,
    stateTotalTax: 22494,
    stateAmountOwed: 9819,
    stateTotalDue: 9855,
  };
  const r = deriveBefore(after, meta);
  if (!r.ok) {
    failed++;
    console.log("  REFUSED:\n   - " + r.reasons.join("\n   - "));
  } else {
    console.log("  " + "line".padEnd(26) + "derived".padStart(10) + "by hand".padStart(11));
    for (const [key, w] of Object.entries(want)) {
      const got = r.before[key];
      const ok = got === w;
      if (!ok) failed++;
      console.log("  " + key.padEnd(26) + money(got).padStart(10) + money(w).padStart(11) + (ok ? "  ok" : "  MISMATCH"));
    }
    // before 66,657 + 22,494 + 97 of penalties = 89,248; after 34,379 + 13,686 + 97 = 48,162
    const savings = computeRecap({ before: r.before, after, priorYearIncome: null }).savings;
    const ok = savings === 41086;
    if (!ok) failed++;
    console.log(`  savings ${money(savings)} vs by hand $41,086 ${ok ? "ok" : "MISMATCH"}`);
    console.log("  notes:\n   - " + r.derived.notes.join("\n   - "));
    const analysis = attributeStrategies(after, meta);
    // No dependents, so the client's headline is the savings above.
    const headline = computeRecap({ before: r.before, after, priorYearIncome: null, analysis }).savings;
    const sum = analysis ? analysis.attribution.reduce((s, a) => s + a.savings, 0) : NaN;
    const sumOk = sum === savings && headline === savings;
    if (!sumOk) failed++;
    console.log(`  by strategy (${sumOk ? "adds up" : "DOES NOT ADD UP"}):`);
    for (const a of analysis?.attribution ?? []) console.log(`   - ${a.label.padEnd(44)} ${money(a.savings).padStart(10)}`);
  }

  // The same return as the extraction saw it before this fix — no Schedule
  // C lines at all — has to refuse on those lines, not on anything else.
  const blind = { ...after, grossReceipts: null, cogs: null, totalExpenses: null, homeOffice: null, businessNetIncome: null };
  const rb = deriveBefore(blind, meta);
  const blindOk = !rb.ok && rb.reasons.length === 1 && /weren't read from the after return: Gross receipts, Business net income$/.test(rb.reasons[0]);
  if (!blindOk) failed++;
  console.log(`  ${blindOk ? "ok" : "WRONG"}  without the Schedule C: ${rb.ok ? "derived" : rb.reasons.join(" | ")}`);
}

/* ── Client F 2025: married filing jointly, Texas (no state return), a Schedule C,
   four rental properties and real estate professional status ─────────────────
   AFTER only ("Client F - 2025 1040 INDIVIDUAL TAX RETURN(real
   estate client)"). No before print exists; the figures below are the engine's,
   checked by hand. The W-2 ($129,731) is the spouse's, so the Schedule C filer's
   whole Social Security wage base is used (the printed SE tax, $32,877, only
   reproduces that way). The four rentals lose $79,519 this year and are
   nonpassive under REPS; $9,847 of earlier passive losses stay suspended. The
   return itemizes ($45,683: $19,963 of taxes, $25,720 of mortgage interest)
   and treats the rentals as QBI (Form 8995 lists them).

   The before follows the tax team's convention (answered 2026-10-02): rental
   costs are write-offs found, zeroed like the Schedule C's, and REPS is off.
   By hand: the properties net their $111,643 of rents, less $9,847 of
   earlier suspended losses = $101,796 of passive income; other income
   $102,009 with the $213 of dividends and gains, total income 723,688 (the
   team's Canva shows the same 102,009 and 723,688). SE tax on $491,948 with
   the full wage base 35,011, half 17,506; adjustments 17,506 + 2,908 SEHI +
   3,000 SEP + 2,500 IRA = 25,914, AGI 697,774. SALT cap at the 10,000 floor,
   itemized 35,720 > 31,500. Taxable 662,054, no QBI deduction (over the
   phase-in range; the Schedule C pays no wages and the rentals' property
   cost isn't on the return — see the note). Tax by the worksheet: 501,050
   at the 35% bracket start = 114,462, + 35% × 160,848 = 56,296.80, + the
   $156 preferential at 20% (taxable over 600,050) = 31.20 → 170,790. Other
   taxes 35,011 + 3,006 additional Medicare + 3,876 NIIT (3.8% of 102,009)
   = 41,893. Less the 1,200 child-care credit (child tax credit phased out):
   211,483. The team's Canva says 203,879: the $7,604 between is the QBI
   deduction their software gave the before (≈ $21,725 at 35%), figured
   from property cost the after return doesn't print.                      */
{
  console.log("\nClient F 2025 (married filing jointly, no state, Schedule C + rentals under REPS)");
  const meta = { taxYear: 2025, filingStatus: "Married filing jointly", stateCode: null, stateForm: null };
  const after = numbers({
    w2Income: 129731,
    qualifiedDividends: 137,
    capitalGain: 46,
    capitalGainLongTerm: 19,
    businessNetIncome: 412259,
    rentalIncome: -79519,
    rentalLosses: 79519,
    // Schedule E lines 23a and 23e: 111,643 of rents less 191,162 of expenses = −79,519
    rentalRents: 111643,
    rentalExpenses: 191162,
    passivePriorUnallowed: 9847,
    rentalReps: -79519,
    totalIncome: 462684,
    agi: 437837,
    dependentCount: 2,
    qbiDeduction: 62079,
    sepDeduction: 3000,
    iraDeduction: 2500, // Schedule 1 line 20 (the page shows it on line 20, not student loan interest)
    itemizedDeductions: 45683,
    saltPaid: 19963,
    saltDeducted: 19963,
    medicalExpenses: 0,
    taxableIncome: 330075,
    incomeTax: 64898,
    seTax: 32877,
    otherTaxes: 35221,
    childTaxCredit: 2500,
    childCareCredit: 1200,
    nonrefundableCredits: 1200,
    federalTotalTax: 96419,
    federalPayments: 95156,
    federalWithholding: 19656,
    federalAmountOwed: 1263,
    grossReceipts: 491948,
    totalExpenses: 70821,
    homeOffice: 8868,
    schCDepreciation: 313,
    sehiDeduction: 2908,
    sehiPaid: 2908,
  });
  const want = {
    w2Income: 129731,
    businessNetIncome: 491948,
    rentalIncome: 101796,
    rentalRents: 111643,
    rentalExpenses: null,
    rentalLosses: null,
    rentalReps: null,
    totalIncome: 723688,
    // The tax team's call (2026-10-05): the SEP (3,000), IRA (2,500) and
    // health insurance (2,908) deductions are DeCypher's, so off on the
    // before: adjustments are the half SE tax alone, 17,506.
    agi: 706182,
    qbiDeduction: null,
    sepDeduction: null,
    iraDeduction: null,
    itemizedDeductions: 35720,
    saltDeducted: 10000,
    // 706,182 − 35,720. Tax: 114,462 + 35% × (670,306 − 501,050) = 59,239.60
    // → 173,702 on the ordinary slice + 31 on the $156 at 20% = 173,733.
    taxableIncome: 670462,
    incomeTax: 173733,
    seTax: 35011,
    otherTaxes: 41893,
    childTaxCredit: null,
    childCareCredit: 1200,
    niit: 3876,
    // 173,733 + 41,893 − 1,200 (the before as derived still claims the kids;
    // the recap's before adds their 1,200 back, see the headline below).
    federalTotalTax: 214426,
    federalPayments: 95156,
    federalAmountOwed: 119270,
    sehiDeduction: null,
  };
  const r = deriveBefore(after, meta);
  if (!r.ok) {
    failed++;
    console.log("  REFUSED:\n   - " + r.reasons.join("\n   - "));
  } else {
    console.log("  " + "line".padEnd(26) + "derived".padStart(10) + "by hand".padStart(11));
    for (const [key, w] of Object.entries(want)) {
      const got = r.before[key];
      const ok = got === w;
      if (!ok) failed++;
      console.log("  " + key.padEnd(26) + money(got).padStart(10) + money(w).padStart(11) + (ok ? "  ok" : "  MISMATCH"));
    }
    // before 171,556; after 96,419
    const savings = computeRecap({ before: r.before, after, priorYearIncome: null }).savings;
    // 214,426 − 96,419. The team's Canva: 107,460 (its before keeps the SEP,
    // IRA and health insurance, and has the QBI deduction on the rentals the
    // return can't show the property cost for).
    const ok = savings === 118007;
    if (!ok) failed++;
    console.log(`  savings ${money(savings)} vs by hand $118,007 (team's Canva $107,460) ${ok ? "ok" : "MISMATCH"}`);
    // By hand, at that point in the walk (Schedule C write-offs and home
    // office on; SEP, IRA, health insurance and REPS off): the rentals go
    // from +101,796 of passive income to a suspended loss. AGI 627,560 →
    // 525,764; the SALT cap rises off its 10,000 floor (itemized 35,720 →
    // 45,683); taxable 591,840 → 480,081 less 11,494 of QBI inside the
    // phase-in range = 468,587; tax 146,207 → 104,047 (42,160) and NIIT
    // 3,876 → 8 (3,868): 46,028.
    const rentalStep = attributeStrategies(after, meta)?.attribution.find((a) => /rental expenses/i.test(a.label));
    const stepOk = rentalStep?.savings === 46028;
    if (!stepOk) failed++;
    console.log(`  rental expenses step ${money(rentalStep?.savings)} vs by hand 46,028 ${stepOk ? "ok" : "MISMATCH"}`);
    console.log("  notes:\n   - " + r.derived.notes.join("\n   - "));
    const analysis = attributeStrategies(after, meta);
    // The client's headline: the before without the two kids, 1,200 more.
    const headline = computeRecap({ before: r.before, after, priorYearIncome: null, analysis }).savings;
    const sum = analysis ? analysis.attribution.reduce((s, a) => s + a.savings, 0) : NaN;
    const sumOk = sum === headline && headline === 119207;
    if (!sumOk) failed++;
    console.log(`  by strategy (${sumOk ? "adds up" : "DOES NOT ADD UP"} to ${money(headline)}, by hand $119,207):`);
    for (const a of analysis?.attribution ?? []) console.log(`   - ${a.label.padEnd(44)} ${money(a.savings).padStart(10)}  ${a.note}`);
    // The question the return was sent in with: what the year would have
    // cost without real estate professional status, everything else as
    // filed. By hand: rentals suspended, AGI 517,356, itemized 45,683 (the
    // SALT cap is still 34,793 there), QBI phased down to 17,879 inside the
    // range, tax 99,313 on 453,794, no child tax credit, $8 of NIIT:
    // 98,113 + 32,877 + 2,344 + 8 = 133,342.
    const reps = analysis?.attribution.find((a) => /real estate professional/i.test(a.label));
    const withoutReps = reps ? 96419 + reps.savings : null;
    const repsOk = withoutReps === 133342;
    if (!repsOk) failed++;
    console.log(`  without REPS the federal total would be ${money(withoutReps)} vs by hand $133,342 ${repsOk ? "ok" : "MISMATCH"}`);
    // The two children, joint return so no filing status rides on them: the
    // after's $2,500 child tax credit and $1,200 child-care credit; the
    // before's child tax credit has phased out, the care credit stays.
    const kids = analysis?.kids;
    const kidsOk = kids?.after === 3700 && kids?.before === 1200 && kids?.dependents === 2;
    if (!kidsOk) failed++;
    console.log(`  kids: after ${money(kids?.after)}, before ${money(kids?.before)} (${kids?.note}) vs by hand $3,700 / $1,200 ${kidsOk ? "ok" : "MISMATCH"}`);
  }
}

/* ── Client H 2025 (see CLIENT_H above): the whole return, by hand ─────────────
   Before: the K-1 is the $767,198 of receipts; both W-2s go (the officer's
   with the salary, the spouse's with the write-offs); AGI 767,259 with the
   $61 of interest; standard deduction 31,500; taxable before QBI 735,759 is
   past the phase-in range and the corporation pays no wages on the before,
   so no QBI deduction; tax 2,385 + 8,772 + 24,145 + 45,096 + 34,064 + 35% ×
   234,709 = 196,610; the $9,586 advance is still repaid in full (401%
   either way); the child tax credit has phased out; $2 of NIIT on the
   interest: 206,198. Massachusetts: 767,259 − 11,800 of exemptions and no
   FICA deduction (no wages) at 5% = 37,773; the corporation's $456. Both
   W-2s' withholding leaves; the $440 refundable credit stays as a payment.
   Penalties carried: 772. Before 245,199, after 48,249.                    */
{
  console.log("\nClient H 2025 (married filing jointly, MA Form 1, S corporation on MA 355S, spouse on the payroll)");
  const { meta, after, entity } = CLIENT_H;
  const want = {
    w2Income: null,
    w2Taxpayer: null,
    w2Spouse: null,
    w2TaxpayerEntity: null,
    w2SpouseEntity: null,
    scorpIncome: 767198,
    totalIncome: 767259,
    agi: 767259,
    qualifyingChildren: 2,
    otherDependents: 1,
    qbiDeduction: null,
    taxableIncome: 735759,
    incomeTax: 196610,
    additionalTaxes: 9586,
    childTaxCredit: null,
    niit: 2,
    otherTaxes: 2,
    federalTotalTax: 206198,
    federalPayments: 0,
    federalWithholding: null,
    federalAmountOwed: 206866,
    ptcAllowed: 0,
    ptcRepayment: 9586,
    stateExemptions: 11800,
    stateWageDeduction: null,
    stateTaxOnIncome: 37773,
    stateTotalTax: 37773,
    stateWithholding: null,
    statePayments: 440,
    stateAmountOwed: 37333,
    stateTotalDue: 37437,
  };
  const wantEntity = {
    grossReceipts: 767198,
    cogs: null,
    totalIncome: 767198,
    officerComp: null,
    wages: null,
    totalDeductions: 0,
    ordinaryIncome: 767198,
    k1Ordinary: 767198,
    stateTax: 456,
    stateTotalTax: 456,
    stateAmountDue: 0,
  };
  const r = deriveBefore(after, meta, undefined, entity);
  if (!r.ok) {
    failed++;
    console.log("  REFUSED:\n   - " + r.reasons.join("\n   - "));
  } else {
    console.log("  " + "line".padEnd(26) + "derived".padStart(10) + "by hand".padStart(11));
    for (const [key, w] of Object.entries(want)) {
      const got = r.before[key];
      const ok = got === w;
      if (!ok) failed++;
      console.log("  " + key.padEnd(26) + money(got).padStart(10) + money(w).padStart(11) + (ok ? "  ok" : "  MISMATCH"));
    }
    console.log("  1120-S before:");
    for (const [key, w] of Object.entries(wantEntity)) {
      const got = r.entityBefore?.[key] ?? null;
      const ok = got === w;
      if (!ok) failed++;
      console.log("  " + key.padEnd(26) + money(got).padStart(10) + money(w).padStart(11) + (ok ? "  ok" : "  MISMATCH"));
    }
    const savings = computeRecap({ before: r.before, after, priorYearIncome: null, entityBefore: r.entityBefore, entityAfter: entity }).savings;
    const ok = savings === 196950;
    if (!ok) failed++;
    console.log(`  savings ${money(savings)} vs by hand $196,950 ${ok ? "ok" : "MISMATCH"}`);
    console.log("  notes:\n   - " + r.derived.notes.join("\n   - "));
    const analysis = attributeStrategies(after, meta, undefined, entity);
    // The headline: the before without the three dependents, which on the
    // before are worth only their $150 of Massachusetts exemptions (the
    // federal credit has phased out).
    const headline = computeRecap({ before: r.before, after, priorYearIncome: null, entityBefore: r.entityBefore, entityAfter: entity, analysis }).savings;
    const sum = analysis ? analysis.attribution.reduce((s, a) => s + a.savings, 0) : NaN;
    const sumOk = sum === headline && headline === 197100;
    if (!sumOk) failed++;
    console.log(`  by strategy (${sumOk ? "adds up" : "DOES NOT ADD UP"} to ${money(headline)}, by hand $197,100):`);
    for (const a of analysis?.attribution ?? []) console.log(`   - ${a.label.padEnd(44)} ${money(a.savings).padStart(10)}  ${a.note}`);
    const kids = analysis?.kids;
    const kidsOk = kids?.after === 5050 && kids?.before === 150 && kids?.inBefore?.federal === 0 && kids?.inBefore?.state === 150;
    if (!kidsOk) failed++;
    console.log(`  kids: after ${money(kids?.after)}, before ${money(kids?.before)} (${kids?.note}) vs by hand $5,050 / $150 ${kidsOk ? "ok" : "MISMATCH"}`);
    // Schedule SE on the $180,200 K-1: 92.35% = 166,415; 12.4% + 2.9% = 25,461.
    const sc = analysis?.scorpSavings?.amount ?? null;
    const scOk = sc === 25461;
    if (!scOk) failed++;
    console.log(`  S-corp SE tax avoided ${money(sc)} vs by hand $25,461 ${scOk ? "ok" : "MISMATCH"}`);
    // The split must carry the spouse's wages note on the write-offs step.
    const wo = analysis?.attribution.find((a) => /write-offs/i.test(a.label));
    const noteOk = !!wo && /\$57,000 of wages paid to the spouse/.test(wo.note);
    if (!noteOk) failed++;
    console.log(`  ${noteOk ? "ok" : "WRONG"}  write-offs step names the spouse's wages`);
  }
}

/* ── Client K / Business K LLC 2025, married filing jointly, CA 540 + CA 100S ──
   AFTER only — the first live return through engine v11 (2026-10-16), from
   the Failures inbox record of its v11 refusal. Three things the engine
   carries rather than refuses on:
    - officer compensation ($176,363) is $263 more than the Medicare wages
      ($166,646) plus the premiums ($9,454): a 2% shareholder fringe benefit;
    - the QBI deduction ($88,262) is $80 over Form 8995-A's wage limit
      (50% × 176,363 = 88,182): REIT dividends, most likely;
    - the 100S's net income for tax ($794,131) is $3,046 under ordinary income
      plus the $59,500 added back: a California adjustment.
   Also: Schedule E line 26 read as $0 with nothing behind it (no rentals), a
   $898 pass-through Schedule C, NIIT that says $27,553 of the $30,423 of
   other income is investment income, Form 8962 over ten months, an $8,550
   HSA California adds back, the PTE credit capped at the $73,439 of tax.
   Before, as derived: federal 517,944, California 167,167, the corporation's
   24,152 franchise tax; savings 422,895 over the after's 286,368. */
{
  console.log("\nClient K 2025 (married filing jointly, CA 540, S corporation on CA 100S — engine v11, projected)");
  const meta = { taxYear: 2025, filingStatus: "Married filing jointly", stateCode: "CA", stateForm: "540", entityForm: "1120-S", unverified: ["ptcSlcsp"] };
  const after = numbers({
    w2Income: 152600,
    scorpIncome: 704048,
    rentalIncome: 0,
    totalIncome: 887071,
    qualifiedDividends: 14896,
    capitalGain: 4353,
    capitalGainLongTerm: 43663,
    agi: 869067,
    dependentCount: 2,
    qbiDeduction: 88262,
    qbiIncome: 703948,
    qbiW2Wages: 176363,
    qbiUbia: 107626,
    hsaDeduction: 8550,
    itemizedDeductions: 52970,
    saltPaid: 78650,
    saltDeducted: 10000,
    medicalExpenses: 18090,
    taxableIncome: 727835,
    incomeTax: 190950,
    otherTaxes: 1047,
    federalTotalTax: 200601,
    federalPayments: 109996,
    federalWithholding: 7596,
    federalAmountOwed: 90605,
    nonrefundableCredits: 856,
    niit: 1047,
    grossReceipts: 898,
    totalExpenses: 898,
    stateTotalTax: 0,
    statePayments: 29393,
    stateWithholding: 6393,
    stateRefund: 29393,
    stateAdjustments: 16365,
    stateDeduction: 31146,
    additionalTaxes: 9460,
    sehiDeduction: 9454,
    sehiPaid: 9454,
    medicareWages: 166646,
    ptcFamilySize: 4,
    ptcPovertyLine: 31200,
    ptcMonths: 10,
    ptcPremiums: 18090,
    ptcSlcsp: 15110,
    ptcAdvance: 9460,
    ptcAllowed: 0,
    ptcRepayment: 9460,
    stateTaxOnIncome: 73439,
    stateExemptionCredits: 0,
    statePteCreditAvailable: 73855,
    statePteCredit: 73439,
  });
  const entity = entityNumbers({
    grossReceipts: 1613162,
    totalIncome: 1613162,
    officerComp: 176363,
    taxesLicenses: 72598,
    pension: 44025,
    otherDeductions: 518001,
    totalDeductions: 875485,
    ordinaryIncome: 737677,
    k1Ordinary: 737677,
    k1Section179: 33629,
    ownershipPct: 100,
    distributions: 1187600,
    stateNetIncome: 794131,
    stateAddBack: 59500,
    stateTax: 11912,
    pteTax: 73855,
    stateTotalTax: 11912,
    statePayments: 11912,
    stateAmountDue: 0,
  });
  const r = deriveBefore(after, meta, undefined, entity);
  if (!r.ok) {
    failed++;
    console.log("  REFUSED:\n   - " + r.reasons.join("\n   - "));
  } else {
    const want = { scorpIncome: 1613162, agi: 1643585, federalTotalTax: 517944, stateTotalTax: 167167, rentalIncome: null };
    for (const [key, w] of Object.entries(want)) {
      const got = r.before[key];
      const ok = got === w;
      if (!ok) failed++;
      console.log("  " + key.padEnd(26) + money(got).padStart(12) + money(w).padStart(12) + (ok ? "  ok" : "  MISMATCH"));
    }
    const entityOk = r.entityBefore?.stateTax === 24152 && r.entityBefore?.stateNetIncome === 1610116;
    if (!entityOk) failed++;
    console.log(`  ${entityOk ? "ok" : "WRONG"}  100S before: franchise ${money(r.entityBefore?.stateTax)} on ${money(r.entityBefore?.stateNetIncome)} (want 24,152 on 1,610,116: the $3,046 adjustment carried)`);
    const p = r.derived.proof;
    const lines = p.residuals.map((m) => m.line).join(" | ");
    const proofOk =
      !p.verified &&
      p.residuals.length === 3 &&
      p.residuals.some((m) => /Officer compensation/.test(m.line) && m.read === 176363 && m.computed === 176100) &&
      p.residuals.some((m) => /QBI deduction/.test(m.line) && m.read === 88262 && m.computed === 88182) &&
      p.residuals.some((m) => /California S corporation net income/.test(m.line) && m.read === 794131 && m.computed === 797177);
    if (!proofOk) failed++;
    console.log(`  ${proofOk ? "ok" : "WRONG"}  projected with three lines carried: ${lines}`);
    const niiOk = r.derived.notes.some((s) => /Net investment income taken as \$27,553/.test(s));
    const rentalOk = r.derived.notes.some((s) => /read as \$0 with no rental lines behind it/.test(s));
    if (!niiOk || !rentalOk) failed++;
    console.log(`  ${niiOk && rentalOk ? "ok" : "WRONG"}  notes: NIIT's investment income inferred, the $0 rental line set aside`);
    const savings = computeRecap({ before: r.before, after, priorYearIncome: null, entityBefore: r.entityBefore, entityAfter: entity }).savings;
    const ok = savings === 422895;
    if (!ok) failed++;
    console.log(`  savings ${money(savings)} vs engine by hand $422,895 ${ok ? "ok" : "MISMATCH"}`);
    const analysis = attributeStrategies(after, meta, undefined, entity);
    const headline = computeRecap({ before: r.before, after, priorYearIncome: null, entityBefore: r.entityBefore, entityAfter: entity, analysis }).savings;
    const sum = analysis ? analysis.attribution.reduce((s, a) => s + a.savings, 0) : NaN;
    // Two dependents, but the child tax credit has phased out on both sides and a joint return has no status riding on them.
    const sumOk = sum === headline && headline === savings && analysis?.kids === null;
    if (!sumOk) failed++;
    console.log(`  by strategy (${sumOk ? "adds up" : "DOES NOT ADD UP"} to ${money(headline)}, no kids line):`);
    for (const a of analysis?.attribution ?? []) console.log(`   - ${a.label.padEnd(44)} ${money(a.savings).padStart(10)}`);
  }
}

/* ── Client J / Business J LLC 2025, single, NY IT-201 + CT-3-S + NYC-3L ──
   AFTER only — a New York City resident with an S corporation that files
   the city's own return, dropped as a third file (engine v11, 2026-10-16).
   Numbers from the Failures inbox record of the v11 refusal (the IT-201's
   tax page had been dropped by the page selector), with that page's lines
   and the NYC-3L's added from the prints.
    - New York City resident tax: IT-201 line 54, $15,802 on $410,904 of
      taxable income; the card's NYC brackets reproduce it, and give $36,875
      on the before's $954,595.
    - NYC-3L: 8.85% of $358,145 allocated at 54.21% = $194,150 → $17,182;
      on the before $962,595 → $521,823 → $46,181. The $300 CT-3-S minimum
      stays (receipts under $1M either way).
    - New York's tax benefit recapture (engine v14; v11–v13 carried it):
      line 39 reads $28,147, 6.85% flat on all taxable income — the
      schedule's $25,748 plus worksheet 8's $568 + $1,831. The before's
      $954,595 is in the same fully-recaptured zone (AGI over $265,400,
      taxable under $1,077,550): 6.85% flat, $65,390.
   Before: federal 307,280, New York 102,265 (65,390 + 36,875 city),
   the corporation's 300 + 46,181; savings 309,621 over the after's 146,405. */
/** Client J's return, for the engine v14 checks further down. */
let CLIENT_J = null;
{
  console.log("\nClient J 2025 (single, NY IT-201 with NYC resident tax, S corporation on CT-3-S + NYC-3L — verified since engine v14)");
  const meta = { taxYear: 2025, filingStatus: "Single", stateCode: "NY", stateForm: "IT-201", entityForm: "1120-S" };
  const after = numbers({
    w2Income: 76500,
    w2Taxpayer: 76500,
    scorpIncome: 358145,
    rentalIncome: 358145, // Schedule E line 41 read for line 26: screened out
    totalIncome: 434645,
    agi: 418904,
    qbiDeduction: 50000,
    qbiIncome: 358145,
    qbiW2Wages: 100000,
    qbiUbia: 7834,
    hsaDeduction: 4300,
    itemizedDeductions: 39114,
    saltPaid: 39114,
    saltDeducted: 39114,
    medicalExpenses: 0,
    taxableIncome: 329790,
    incomeTax: 84974,
    otherTaxes: 0,
    federalTotalTax: 84974,
    federalPayments: 72540,
    federalWithholding: 13340,
    federalAmountOwed: 12434,
    stateTotalTax: 43949,
    stateTaxOnIncome: 28147,
    stateLocalTax: 15802,
    statePayments: 35773,
    stateWithholding: 8042,
    stateAmountOwed: 8176,
    stateTotalDue: 8176,
    stateDeduction: 8000,
    sehiDeduction: 11441,
    sehiPaid: 11441,
    medicareWages: 88559,
  });
  const entity = entityNumbers({
    grossReceipts: 962595,
    totalIncome: 962595,
    officerComp: 100000,
    taxesLicenses: 7568,
    pension: 25000,
    otherDeductions: 460787,
    totalDeductions: 604450,
    ordinaryIncome: 358145,
    k1Ordinary: 358145,
    ownershipPct: 100,
    distributions: 295428,
    stateTax: 300,
    stateTotalTax: 300,
    statePayments: 300,
    cityNetIncome: 194150,
    cityAllocationPct: 54.21,
    cityReceipts: 521793,
    cityTax: 17182,
    cityAmountDue: 17182,
  });
  CLIENT_J = { meta, after, entity };
  const r = deriveBefore(after, meta, undefined, entity);
  if (!r.ok) {
    failed++;
    console.log("  REFUSED:\n   - " + r.reasons.join("\n   - "));
  } else {
    const want = { scorpIncome: 962595, federalTotalTax: 307280, stateTaxOnIncome: 65390, stateLocalTax: 36875, stateTotalTax: 102265, rentalIncome: null };
    for (const [key, w] of Object.entries(want)) {
      const got = r.before[key];
      const ok = got === w;
      if (!ok) failed++;
      console.log("  " + key.padEnd(26) + money(got).padStart(12) + money(w).padStart(12) + (ok ? "  ok" : "  MISMATCH"));
    }
    const eb = r.entityBefore;
    const entityOk = eb?.stateTax === 300 && eb?.cityNetIncome === 521823 && eb?.cityTax === 46181 && eb?.cityAmountDue === 46181 && eb?.cityAllocationPct === 54.21;
    if (!entityOk) failed++;
    console.log(`  ${entityOk ? "ok" : "WRONG"}  corporation before: CT-3-S ${money(eb?.stateTax)}, NYC-3L ${money(eb?.cityTax)} on ${money(eb?.cityNetIncome)} allocated at ${eb?.cityAllocationPct}% (want 300 / 46,181 on 521,823 at 54.21)`);
    const p = r.derived.proof;
    const proofOk = p.verified && p.residuals.length === 0;
    if (!proofOk) failed++;
    console.log(`  ${proofOk ? "ok" : "WRONG"}  verified with the recapture figured${p.residuals.length ? `: ${p.residuals.map((m) => `${m.line} ${money(m.read)} vs ${money(m.computed)}`).join("; ")}` : ""}`);
    const notesOk =
      r.derived.notes.some((s) => /New York City: the corporation's own NYC-3L tax at 8\.85%/.test(s) && /\$17,182 on the after, \$46,181 on the before/.test(s)) &&
      r.derived.notes.some((s) => /New York City resident tax on the IT-201: \$15,802 on the after, \$36,875 on the before/.test(s));
    if (!notesOk) failed++;
    console.log(`  ${notesOk ? "ok" : "WRONG"}  notes name the city's two taxes on both sides`);
    const savings = computeRecap({ before: r.before, after, priorYearIncome: null, entityBefore: r.entityBefore, entityAfter: entity }).savings;
    const ok = savings === 309621;
    if (!ok) failed++;
    console.log(`  savings ${money(savings)} vs engine by hand $309,621 ${ok ? "ok" : "MISMATCH"}`);
    const analysis = attributeStrategies(after, meta, undefined, entity);
    const headline = computeRecap({ before: r.before, after, priorYearIncome: null, entityBefore: r.entityBefore, entityAfter: entity, analysis }).savings;
    const sum = analysis ? analysis.attribution.reduce((s, a) => s + a.savings, 0) : NaN;
    const sumOk = sum === headline && headline === savings && analysis?.kids === null;
    if (!sumOk) failed++;
    console.log(`  by strategy (${sumOk ? "adds up" : "DOES NOT ADD UP"} to ${money(headline)}):`);
    for (const a of analysis?.attribution ?? []) console.log(`   - ${a.label.padEnd(44)} ${money(a.savings).padStart(10)}`);
    // Schedule SE on the $358,145 K-1: 92.35% = 330,747; 12.4% to the $176,100
    // wage base = 21,836, 2.9% = 9,592; plus 0.9% on 130,747 over $200,000 = 1,177.
    const sc = analysis?.scorpSavings?.amount ?? null;
    const scOk = sc === 32605;
    if (!scOk) failed++;
    console.log(`  S-corp SE tax avoided ${money(sc)} vs by hand $32,605 ${scOk ? "ok" : "MISMATCH"}`);
  }
}

/* ── Client L / Business L LLC 2025, single, CA 540 + CA 100S, with a Schedule C beside the corporation ──
   AFTER only — the print whose text layer is scrambled on every page
   (2026-10-16); numbers read off the pages by hand. The first return with
   a real Schedule C ($65,000 of receipts, no expenses) next to an S
   corporation K-1 ($354,500), which the engine used to refuse as "two
   businesses". W-2 wages $207,647: $65,000 is the officer's pay, the
   $142,647 beyond it another employer's (no W-2 copies in the print).
    - Schedule SE on the $65,000 against $207,647 of wages: the Social
      Security base is used up, so 60,028 × 2.9% = $1,741, as printed.
    - Additional Medicare tax: the engine has box 1 wages ($207,647) where
      Form 8959 has box 5 ($209,576, a 401(k) deferral on the other job):
      $609 against $626 printed — the $17 is carried on the federal total.
    - Form 8995-A lists only the corporation: $354,500 of QBI, $65,000 of
      wages → $32,500. The Schedule C has no wages or property, so over
      the threshold it gets nothing, which is why it isn't on the form.
   Before: the K-1 is the $1,205,825 of receipts, the officer's pay leaves,
   the $142,647 stays; Schedule SE then has $33,453 of base left (176,100 −
   142,647): 33,453 × 12.4% + 60,028 × 2.9% = $5,889.
   The tax team, 2026-10-22: a Schedule C with no expenses is only ever an S
   corporation's payroll cleanup — here the $65,000 of officer pay, never on
   a W-2, run through the Schedule C. So the W-2 is all another employer's,
   and on the before the Schedule C leaves with the officer's pay: no
   Schedule C, no SE tax (engine v13). */
{
  console.log("\nClient L 2025 (single, CA 540, S corporation on CA 100S, Schedule C beside it — engine v11, projected)");
  const meta = { taxYear: 2025, filingStatus: "Single", stateCode: "CA", stateForm: "540", entityForm: "1120-S" };
  const after = numbers({
    w2Income: 207647,
    w2Taxpayer: 207647,
    businessNetIncome: 65000,
    grossReceipts: 65000,
    scorpIncome: 354500,
    totalIncome: 627147,
    agi: 626276,
    qbiDeduction: 32500,
    qbiIncome: 354500,
    qbiW2Wages: 65000,
    qbiUbia: 0,
    taxableIncome: 578026,
    incomeTax: 171856,
    otherTaxes: 2367,
    federalTotalTax: 174223,
    federalPayments: 209715,
    federalWithholding: 39715,
    federalRefund: 25042,
    federalPenalty: 5450,
    seTax: 1741,
    stateTotalTax: 58391,
    statePayments: 61567,
    stateWithholding: 16567,
    stateRefund: 2004,
    statePenalty: 2004,
    stateDeduction: 5706,
    stateTaxOnIncome: 58391,
    stateExemptionCredits: 0,
  });
  const entity = entityNumbers({
    grossReceipts: 1205825,
    totalIncome: 1205825,
    officerComp: 65000,
    otherDeductions: 756756,
    totalDeductions: 851325,
    ordinaryIncome: 354500,
    k1Ordinary: 354500,
    ownershipPct: 100,
    distributions: 54848,
    stateNetIncome: 354500,
    stateTax: 5318,
    stateTotalTax: 5318,
    stateAmountDue: 5564,
  });
  const r = deriveBefore(after, meta, undefined, entity);
  if (!r.ok) {
    failed++;
    console.log("  REFUSED:\n   - " + r.reasons.join("\n   - "));
  } else {
    const want = { w2Income: 207647, businessNetIncome: null, grossReceipts: null, scorpIncome: 1205825, totalIncome: 1413472, seTax: null, agi: 1413472, qbiDeduction: null, taxableIncome: 1397722, incomeTax: 474177 };
    for (const [key, w] of Object.entries(want)) {
      const got = r.before[key];
      const ok = got === w;
      if (!ok) failed++;
      console.log("  " + key.padEnd(26) + money(got).padStart(12) + money(w).padStart(12) + (ok ? "  ok" : "  MISMATCH"));
    }
    const eb = r.entityBefore;
    const entityOk = eb?.stateTax === 18087 && eb?.ordinaryIncome === 1205825;
    if (!entityOk) failed++;
    console.log(`  ${entityOk ? "ok" : "WRONG"}  100S before: ${money(eb?.stateTax)} on ${money(eb?.ordinaryIncome)} (want 18,087 on 1,205,825)`);
    const p = r.derived.proof;
    const proofOk =
      !p.verified &&
      p.residuals.length === 1 &&
      p.residuals.some((m) => /Federal total tax/.test(m.line) && m.read === 174223 && m.computed === 174206);
    if (!proofOk) failed++;
    console.log(`  ${proofOk ? "ok" : "WRONG"}  projected with one line carried: ${p.residuals.map((m) => `${m.line} ${money(m.read)} vs ${money(m.computed)}`).join("; ")}`);
    const notesOk =
      r.derived.notes.some((s) => /payroll cleanup/.test(s) && /as officer compensation/.test(s) && /\$207,647 of W-2 wages are another employer's/.test(s));
    if (!notesOk) failed++;
    console.log(`  ${notesOk ? "ok" : "WRONG"}  notes: the Schedule C is the officer's pay (payroll cleanup), the W-2 all another employer's`);
    const savings = computeRecap({ before: r.before, after, priorYearIncome: null, entityBefore: r.entityBefore, entityAfter: entity }).savings;
    console.log(`  savings ${money(savings)} (before ${money(computeRecap({ before: r.before, after, priorYearIncome: null, entityBefore: r.entityBefore, entityAfter: entity }).before.totalTaxes)})`);
    const analysis = attributeStrategies(after, meta, undefined, entity);
    const headline = computeRecap({ before: r.before, after, priorYearIncome: null, entityBefore: r.entityBefore, entityAfter: entity, analysis }).savings;
    const sum = analysis ? analysis.attribution.reduce((s, a) => s + a.savings, 0) : NaN;
    const sumOk = sum === headline && headline === savings && analysis?.kids === null;
    if (!sumOk) failed++;
    console.log(`  by strategy (${sumOk ? "adds up" : "DOES NOT ADD UP"} to ${money(headline)}):`);
    for (const a of analysis?.attribution ?? []) console.log(`   - ${a.label.padEnd(44)} ${money(a.savings).padStart(10)}`);
    // No Schedule C expenses, so no Schedule C step on the split.
    const noSchCStep = !(analysis?.attribution ?? []).some((a) => a.key === "expenses" || a.key === "homeOffice");
    if (!noSchCStep) failed++;
    console.log(`  ${noSchCStep ? "ok" : "WRONG"}  no Schedule C write-off step (it has no expenses)`);
  }
}

/* ── The S corporation cards on their own: the corporation's tax and elective tax ──
   California is proven on Business D's prints; New Jersey's figures are the
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

console.log("\nRefusals, and returns that derive with a line carried");
for (const c of REFUSALS) {
  const r = deriveBefore(c.after, c.meta, undefined, c.entity ?? null);
  // `expect: null` is the opposite case: a return that has to derive —
  // `verified` says whether the after return has to reproduce outright
  // (true) or is expected to carry a line (false).
  const ok =
    c.expect === null
      ? r.ok &&
        (c.federal === undefined || r.before.federalTotalTax === c.federal) &&
        (c.state === undefined || r.before.stateTotalTax === c.state) &&
        (c.verified === undefined || r.derived.proof.verified === c.verified) &&
        (c.noNote === undefined || !r.derived.notes.some((s) => c.noNote.test(s))) &&
        (c.assert === undefined || c.assert(r))
      : !r.ok && r.reasons.some((s) => c.expect.test(s));
  if (!ok) failed++;
  console.log(`  ${ok ? "ok" : "WRONG"}  ${c.name}`);
  if (!r.ok) for (const s of r.reasons) console.log(`         → ${s}`);
  else if (c.expect !== null) console.log("         → derived when it should have refused");
  else {
    const p = r.derived.proof;
    console.log(
      `         → derived; federal before ${money(r.before.federalTotalTax)}${has(r.before.stateTotalTax) ? `, state ${money(r.before.stateTotalTax)}` : ""}; ${
        p.verified ? "verified" : `projected: ${p.residuals.map((m) => `${m.line} ${money(m.read)} vs ${money(m.computed)}`).join("; ")}`
      }`,
    );
  }
}

/* ── The Failures inbox, 2026-10-16…19 (engine v12) ─────────────────────────
   The tax team's refused returns from those four days, as the reader read
   them (the records' own numbers; five with the lines a re-read through
   the v12 reader prompt gives, noted in their names). Each derive pins the
   before's federal and state totals to the dollar, whether the after
   reproduces outright, and the v12 note that must fire; each refusal pins
   its reason. The data lives in fixtures/ — it's long, and generated from
   the records; `proves` says what each one is for.                        */
const FAILURES = JSON.parse(readFileSync(new URL("./fixtures/tax-recap-failures-2026-10.json", import.meta.url), "utf8"));
console.log("\nFailures inbox, 2026-10-16…19 (engine v12)");
for (const f of FAILURES) {
  const r = deriveBefore(numbers(f.after), f.meta, undefined, f.entity ? entityNumbers(f.entity) : null);
  const ok =
    f.expect === null
      ? r.ok &&
        r.before.federalTotalTax === f.federal &&
        r.before.stateTotalTax === f.state &&
        r.derived.proof.verified === f.verified &&
        (f.notes ?? []).every((n) => r.derived.notes.some((s) => new RegExp(n).test(s)))
      : !r.ok && r.reasons.some((s) => new RegExp(f.expect).test(s));
  if (!ok) failed++;
  console.log(`  ${ok ? "ok" : "WRONG"}  ${f.name} — ${f.proves}`);
  if (!r.ok) console.log(`         → ${r.reasons[0]}`);
  else {
    const p = r.derived.proof;
    console.log(
      `         → derived; federal before ${money(r.before.federalTotalTax)} (want ${money(f.federal)})${has(r.before.stateTotalTax) ? `, state ${money(r.before.stateTotalTax)} (want ${money(f.state)})` : ""}; ${p.verified ? "verified" : `projected (${p.residuals.length} carried)`}`,
    );
  }
}

/* ── Several states and several businesses on one 1040 (engine v13) ─────────
   Two of the failures above read again the way the v13 reader reads them:
   the main state's own lines, and every other state return on its own.
   Their numbers are off the returns' pages (the totals the v12 reader
   summed). And one S corporation's return cut into two corporations with
   the same lines between them — the before has to come out the same, every
   business on its own.                                                     */
console.log("\nSeveral states and several businesses (engine v13)");
const failure = (prefix) => FAILURES.find((f) => f.name.startsWith(prefix));
const stateLines = (v) => ({ ...emptyStateNumbers(), ...v });
const STATE_KEYS = [
  "stateTotalTax", "stateTaxOnIncome", "stateSourceIncome", "stateSourceBusinessIncome", "stateAdjustments", "stateDeduction", "stateExemptions",
  "stateExemptionCredits", "stateLocalTax", "stateOtherStateCredit", "statePayments", "stateWithholding", "stateRefund", "stateAmountOwed",
  "statePenalty", "stateTotalDue",
];
const mainStateOnly = (after, v) => numbers({ ...after, ...Object.fromEntries(STATE_KEYS.map((k) => [k, null])), ...v });
const check = (name, ok, detail) => {
  if (!ok) failed++;
  console.log(`  ${ok ? "ok" : "WRONG"}  ${name}`);
  if (detail) console.log(`         → ${detail}`);
};
{
  // Case 06 (2025, married filing separately): a Virginia resident (760CG)
  // with a Maine nonresident return (1040ME). Virginia's credit for the
  // Maine tax (Schedule OSC, $175) is claimed with the payments, line 24.
  const c = failure("Case 06");
  const after = mainStateOnly(c.after, {
    stateTotalTax: 5315, stateTaxOnIncome: 5315, statePayments: 4865, stateWithholding: 4690, stateAmountOwed: 450,
    stateAdjustments: -1069, stateDeduction: 8750, stateExemptions: 930, stateOtherStateCredit: 175,
  });
  const maine = stateLines({
    stateTotalTax: 210, stateTaxOnIncome: 5767, stateSourceIncome: 5000, stateAdjustments: -1069, stateDeduction: 13681, stateExemptions: 5150,
    statePayments: 316, stateWithholding: 316, stateRefund: 106,
  });
  const more = { states: [{ stateCode: "ME", stateForm: "1040ME", numbers: maine }] };
  const r = deriveBefore(after, c.meta, undefined, null, more);
  const recap = r.ok
    ? computeRecap({ before: r.before, after, priorYearIncome: null, stateCode: "VA", otherStates: [{ stateCode: "ME", stateForm: "1040ME", before: r.otherStatesBefore[0], after: maine }] })
    : null;
  check(
    "Virginia resident + Maine nonresident: each state on its own row, Virginia's OSC credit netted from its tax",
    r.ok && recap.after.stateRows[0] === 5140 && recap.after.stateRows[1] === 210 && r.otherStatesBefore[0].stateTotalTax >= 210 &&
      r.derived.notes.some((s) => /credit for the tax paid to Maine/.test(s)) &&
      recap.before.stateRows.length === 2,
    r.ok
      ? `VA ${recap.after.stateRows[0]} → ${recap.before.stateRows[0]}, ME ${recap.after.stateRows[1]} → ${recap.before.stateRows[1]}; ${r.derived.proof.verified ? "verified" : `projected (${r.derived.proof.residuals.length})`}`
      : r.reasons[0],
  );
}
{
  // Case 16 (2025, single): moved into New York on May 1 (IT-203, with
  // the New York City part-year tax) from California (540NR). The
  // Schedule C splits $8,390 New York, $17,033 California; with the
  // write-offs gone, each state's share of the business grows with it.
  const c = failure("Case 16");
  const after = mainStateOnly(c.after, {
    stateTotalTax: 441, stateTaxOnIncome: 216, stateLocalTax: 225, stateSourceIncome: 8390, stateSourceBusinessIncome: 8390,
    stateDeduction: 8000, statePayments: 34, stateAmountOwed: 407,
  });
  const california = stateLines({
    stateTotalTax: 32, stateTaxOnIncome: 177, stateSourceIncome: 17033, stateSourceBusinessIncome: 17033, stateDeduction: 5706,
    stateExemptionCredits: 110, statePayments: 62, stateRefund: 30,
  });
  const more = { states: [{ stateCode: "CA", stateForm: "540NR", numbers: california }] };
  const r = deriveBefore(after, c.meta, undefined, null, more);
  const ny = r.ok ? r.before.stateSourceIncome : null;
  const ca = r.ok ? r.otherStatesBefore[0].stateSourceIncome : null;
  check(
    "New York part-year + California nonresident: each state's source income grows with the business, each taxed on its own",
    r.ok && ny > 8390 && ca > 17033 && Math.abs(ny + ca - r.before.businessNetIncome) <= 2 && r.otherStatesBefore[0].stateTotalTax > 32 && r.before.stateTotalTax > 441,
    r.ok
      ? `NY source ${ny}, CA source ${ca} (Schedule C ${r.before.businessNetIncome}); NY ${r.before.stateTotalTax}, CA ${r.otherStatesBefore[0].stateTotalTax}; ${r.derived.proof.verified ? "verified" : `projected (${r.derived.proof.residuals.length})`}`
      : r.reasons[0],
  );
  const a = attributeStrategies(after, c.meta, undefined, null, more);
  const recap = r.ok
    ? computeRecap({ before: r.before, after, priorYearIncome: null, stateCode: "NY", analysis: a, otherStates: [{ stateCode: "CA", stateForm: "540NR", before: r.otherStatesBefore[0], after: california }] })
    : null;
  const split = a ? a.attribution.reduce((s, x) => s + x.savings, 0) : null;
  check("…and the strategy split adds up to the headline with both states in it", r.ok && a && split === recap.savings, `split ${split}, headline ${recap?.savings}`);
}
{
  // Client D's corporation cut in two: the same receipts, deductions, pay
  // and PTE election between two 1120-S returns, each wholly owned.
  const d = PAIRINGS.find((p) => p.name.startsWith("Client D"));
  const e = d.entity;
  const half = (v) => (v === null ? null : Math.floor(v / 2));
  const rest = (v) => (v === null ? null : v - Math.floor(v / 2));
  const a = entityNumbers(Object.fromEntries(Object.entries(e).map(([k, v]) => [k, k === "ownershipPct" ? v : half(v)])));
  const b = entityNumbers(Object.fromEntries(Object.entries(e).map(([k, v]) => [k, k === "ownershipPct" ? v : rest(v)])));
  for (const x of [a, b]) {
    x.totalIncome = x.grossReceipts - x.cogs;
    x.ordinaryIncome = x.totalIncome - x.totalDeductions;
    x.k1Ordinary = x.ordinaryIncome;
    x.stateNetIncome = x.ordinaryIncome + x.stateAddBack;
    x.stateTax = Math.round(x.stateNetIncome * 0.015);
    x.pteTax = Math.round(x.stateNetIncome * 0.093);
    x.stateTotalTax = x.stateTax;
    x.statePayments = x.stateTax;
  }
  const one = deriveBefore(d.after, d.meta, undefined, d.entity);
  const two = deriveBefore(d.after, { ...d.meta, entityForm: "1120-S" }, undefined, a, { entities: [{ numbers: b, form: "1120-S", stateCode: "CA", name: "Business D2" }] });
  const entityTax = (r) => (r.ok ? [r.entityBefore, ...r.otherEntitiesBefore].reduce((s, x) => s + (x.stateTax ?? 0), 0) : null);
  check(
    "one S corporation cut into two: the same before, each corporation's own state tax",
    one.ok && two.ok && two.before.federalTotalTax === one.before.federalTotalTax && two.before.stateTotalTax === one.before.stateTotalTax &&
      Math.abs(entityTax(two) - entityTax(one)) <= 2 && two.otherEntitiesBefore.length === 1,
    two.ok
      ? `federal ${two.before.federalTotalTax} (one: ${one.before.federalTotalTax}), state ${two.before.stateTotalTax} (${one.before.stateTotalTax}), entities ${entityTax(two)} (${entityTax(one)})`
      : two.reasons.join(" / "),
  );
}
{
  // Client D with a partnership beside the corporation: a 50% share of a
  // small 1065 on Schedule E, on the owner's own Schedule SE.
  const d = PAIRINGS.find((p) => p.name.startsWith("Client D"));
  const p = entityNumbers({
    grossReceipts: 10000, totalIncome: 10000, otherDeductions: 4000, totalDeductions: 4000, ordinaryIncome: 6000,
    k1Ordinary: 3000, ownershipPct: 50, stateTax: 800, stateTotalTax: 800, statePayments: 800,
  });
  const after = numbers({ ...d.after, partnershipIncome: 3000, totalIncome: d.after.totalIncome + 3000, agi: d.after.agi + 3000 - 212, seTax: 424, otherTaxes: 424 });
  const r = deriveBefore(after, { ...d.meta, entityForm: "1120-S" }, undefined, d.entity, { entities: [{ numbers: p, form: "1065", stateCode: "CA", name: "Partnership P" }] });
  check(
    "an S corporation and a partnership on one 1040: the partnership's own before beside the corporation's",
    r.ok && r.before.partnershipIncome === 5000 && r.otherEntitiesBefore[0].k1Ordinary === 5000 && r.before.scorpIncome === 836958 && r.before.seTax > 424,
    r.ok
      ? `K-1s ${r.before.scorpIncome} + ${r.before.partnershipIncome}, SE tax ${r.before.seTax}; ${r.derived.proof.verified ? "verified" : `projected (${r.derived.proof.residuals.length})`}`
      : r.reasons.join(" / "),
  );
}

/* Engine v14 (2026-10-22): the lines v11–v13 carried that the tables can
   figure. The earned income credit and the additional child tax credit on
   each scenario's income; line 32's payments read as credits moved to line
   31; New York's tax benefit recapture, IT-203's income percentage and a
   part-year New York City resident's tax; New York City residency taken
   from a total read without page 3; Massachusetts' wage deduction counting
   the Schedule SE tax; a part-year schedule on a resident form. */
console.log("\nThe carried lines figured (engine v14)");
{
  // Case 03 · the line 32 credits of a joint return with three children:
  // the earned income credit on the larger of AGI and earned income
  // ($63,603 against a $30,470 start) and the additional child tax credit
  // (15% of earned income over $2,500), within $2 of the $4,457 printed.
  const c = FAILURES.find((x) => x.name.startsWith("Case 03"));
  const r = deriveBefore(numbers(c.after), c.meta, undefined, c.entity ? entityNumbers(c.entity) : null);
  const carried = r.ok ? r.derived.proof.residuals.some((m) => /Refundable/.test(m.line)) : true;
  check(
    "the earned income credit and the additional child tax credit reproduce line 32 (three children, $63,603 of AGI)",
    r.ok && !carried && r.before.federalRefundableCredits === null,
    r.ok
      ? `${r.derived.notes.find((s) => /^Earned income credit/.test(s)) ?? "no EIC note"}; ${r.derived.notes.find((s) => /^Additional child tax credit/.test(s)) ?? "no ACTC note"}`
      : r.reasons.join(" / "),
  );
}
{
  // Case 21 · $29,334 on line 32 at $135,898 of AGI, single, no
  // dependents: no credit can come to that; it's line 33 less the
  // withholding — estimated payments. Moved to line 31 on both sides, and
  // the after column takes the same fix, so the recap's after side is the
  // printed $33,223, not $3,889.
  const c = FAILURES.find((x) => x.name.startsWith("Case 21"));
  const after = numbers(c.after);
  const r = deriveBefore(after, c.meta, undefined, null);
  const fixed = r.ok ? { ...after, ...r.afterFixes } : after;
  const side = computeRecap({ before: r.ok ? r.before : after, after: fixed, priorYearIncome: null }).after;
  check(
    "line 32's estimated payments taken as payments, on the after column too",
    r.ok && r.afterFixes.otherPayments === 29334 && side.federalTaxes === 33223 && r.derived.notes.some((s) => /estimated payments \(line 26\)/.test(s)),
    r.ok ? `fix ${JSON.stringify(r.afterFixes)}, after federal taxes ${side.federalTaxes}` : r.reasons.join(" / "),
  );
}
{
  // Client J's return read without the IT-201's page 3 (the 2026-10-16
  // print): no line 39, no city lines, only line 61's $43,949. New York's
  // $28,147 and the city's $15,802 on the same income add up to it to the
  // dollar, so the filer is a city resident and the before is the same.
  const j = CLIENT_J;
  const after = numbers({ ...j.after, stateTaxOnIncome: null, stateLocalTax: null });
  const r = deriveBefore(after, j.meta, undefined, j.entity);
  check(
    "New York City residency taken from a total read without page 3",
    r.ok && r.derived.proof.verified && r.before.stateTotalTax === 102265 && r.before.stateLocalTax === 36875 && r.derived.notes.some((s) => /resident tax wasn't read/.test(s)),
    r.ok ? `state ${r.before.stateTotalTax}, city ${r.before.stateLocalTax}; ${r.derived.proof.verified ? "verified" : "projected"}` : r.reasons.join(" / "),
  );
}
{
  // Case 02 · Delaware's total read off line 26, before the personal
  // credits: $28,469 read, while the $7,000 of payments and $20,919 still
  // owed settle against $27,919 — the card's figure. The after column takes
  // the settled total, and the before carries nothing for it.
  const c = FAILURES.find((x) => x.name.startsWith("Case 02"));
  const r = deriveBefore(numbers(c.after), c.meta, undefined, c.entity ? entityNumbers(c.entity) : null);
  const carried = r.ok ? r.derived.proof.residuals.some((m) => /Delaware/.test(m.line)) : true;
  check(
    "a state total read before the credits, settled by the payments and the balance due",
    r.ok && r.afterFixes.stateTotalTax === 27919 && !carried,
    r.ok ? `fix ${JSON.stringify(r.afterFixes)}; ${r.derived.proof.residuals.map((m) => m.line).join(", ") || "nothing carried"}` : r.reasons.join(" / "),
  );
}
{
  // Case 12 · Massachusetts: $8,423 of wages and $35,459 of SE tax; lines
  // 11a/11b print the full $2,000, which the wages alone ($644) don't reach.
  const c = FAILURES.find((x) => x.name.startsWith("Case 12"));
  const r = deriveBefore(numbers(c.after), c.meta, undefined, null);
  const carried = r.ok ? r.derived.proof.residuals.some((m) => /Social Security \/ Medicare deduction/.test(m.line)) : true;
  check(
    "Massachusetts' wage deduction counts the Schedule SE tax",
    r.ok && !carried && r.before.stateWageDeduction === 2000,
    r.ok ? `before ${r.before.stateWageDeduction}` : r.reasons.join(" / "),
  );
}
{
  // Case 22 · a South Carolina SC1040 with Schedule NR: the same form as a
  // resident's, its state-source income below the return's total. With the
  // source read it's prorated the usual way and fitted; without it, it's a
  // resident return as before.
  const c = FAILURES.find((x) => x.name.startsWith("Case 22"));
  const resident = deriveBefore(numbers(c.after), c.meta, undefined, c.entity ? entityNumbers(c.entity) : null);
  const partYear = deriveBefore(numbers({ ...c.after, stateSourceIncome: 120000 }), c.meta, undefined, c.entity ? entityNumbers(c.entity) : null);
  check(
    "a part-year schedule on the resident form (South Carolina's Schedule NR) is prorated",
    resident.ok && partYear.ok && partYear.before.stateSourceIncome === 120000 && partYear.derived.notes.some((s) => /part-year or nonresident schedule/.test(s)) && partYear.before.stateTotalTax < resident.before.stateTotalTax,
    partYear.ok && resident.ok ? `SC before ${partYear.before.stateTotalTax} prorated, ${resident.before.stateTotalTax} as a resident` : [...(resident.ok ? [] : resident.reasons), ...(partYear.ok ? [] : partYear.reasons)].join(" / "),
  );
}

console.log(failed ? `\n${failed} problem(s)` : "\nAll good");
process.exit(failed ? 1 : 0);
