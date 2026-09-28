import type { Bracket, ByStatus, StateCard } from "./tables";

/**
 * What changes on a state's card from year to year, as overrides on the
 * 2025 card in seeds-2025-states.ts (and, for California and New Jersey,
 * on the cards in tables.ts).
 *
 * Three kinds of state:
 *
 *  - **Unindexed** (New Jersey, New York, Pennsylvania, Illinois, Oklahoma,
 *    Delaware, DC, Virginia's brackets): the same figures every year, so
 *    the override is empty or a single known change.
 *  - **Flat rates that step down by statute** (Georgia, Kentucky, Indiana,
 *    Idaho, Mississippi, North Carolina, Utah, Iowa, Ohio, Nebraska's top
 *    rate): the year's rate is known and seeded.
 *  - **Indexed brackets and deductions** (California, Minnesota, Wisconsin,
 *    Oregon, Maine, Rhode Island, Vermont, Missouri, North Dakota …): 2023
 *    and 2024 are the published schedules; 2026's mostly aren't published
 *    yet, so those cards carry the 2025 figures and say so.
 *
 * A card with no override for a year is the 2025 card carried across with
 * its note prefixed. That is deliberate: a carried card can't produce a
 * wrong recap — the engine refuses when the year's tax doesn't reproduce —
 * and a year card that exists lets every no-tax-state and unindexed-state
 * client through. Every year card starts unproven except the ones the
 * sample pairings covered (2025).
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
const scale = (rows: Rows, factor: number): Rows =>
  rows.map(([upTo, rate]) => [upTo === null ? null : Math.round(upTo * factor), rate]);
const brackets = (single: Rows, mfj: Rows = scale(single, 2), hoh: Rows = single, mfs: Rows = single): ByStatus<Bracket[]> =>
  by(b(single), b(mfj), b(hoh), b(mfs), b(mfj));
const flat = (rate: number) => brackets([[null, rate]], [[null, rate]]);
const ONE = by(1, 2, 1, 1, 2);
const standard = (single: number, mfj: number, hoh: number, mfs = single): StateCard["deduction"] => ({
  kind: "standard",
  amount: by(single, mfj, hoh, mfs, mfj),
});
const exemption = (
  kind: "credit" | "deduction",
  amount: number,
  dependentAmount: number,
  count: ByStatus<number> = ONE,
  phaseOut: StateCard["exemption"]["phaseOut"] = null,
): StateCard["exemption"] => ({ kind, amount, count, dependentAmount, phaseOut });

/** A note that says the card is the year's own figures (as opposed to carried). */
const own = (year: number, text: string) => `${year} figures. ${text}`;

export type StateOverrides = Record<string, Partial<StateCard>>;

/* ─────────────────────────────── California ─────────────────────────────── */

/** FTB rate schedules, standard deductions, exemption credits and line 32 thresholds by year. */
export const CALIFORNIA_YEARS: Record<number, Partial<StateCard>> = {
  2023: {
    brackets: brackets(
      [[10412, 0.01], [24684, 0.02], [38959, 0.04], [54081, 0.06], [68350, 0.08], [349137, 0.093], [418961, 0.103], [698271, 0.113], [null, 0.123]],
      [[20824, 0.01], [49368, 0.02], [77918, 0.04], [108162, 0.06], [136700, 0.08], [698274, 0.093], [837922, 0.103], [1396542, 0.113], [null, 0.123]],
      [[20839, 0.01], [49371, 0.02], [63644, 0.04], [78765, 0.06], [93037, 0.08], [474824, 0.093], [569790, 0.103], [949649, 0.113], [null, 0.123]],
    ),
    deduction: standard(5363, 10726, 10726),
    exemption: exemption("credit", 144, 446, ONE, {
      threshold: by(237035, 474075, 355558, 237035, 474075),
      step: by(2500, 2500, 2500, 1250, 2500),
      reduce: 6,
    }),
    proven: false,
    note: own(2023, "FTB 2023 rate schedules, $5,363 / $10,726 standard deduction, $144 personal and $446 dependent credits, line 32 thresholds $237,035 / $355,558 / $474,075. Same rules as the proven 2025 card, not yet proven on a 2023 client. S corporation: 1.5%, $800, PTE 9.3% (the election ran 2021–2025)."),
  },
  2024: {
    brackets: brackets(
      [[10756, 0.01], [25499, 0.02], [40245, 0.04], [55866, 0.06], [70606, 0.08], [360659, 0.093], [432787, 0.103], [721314, 0.113], [null, 0.123]],
      [[21512, 0.01], [50998, 0.02], [80490, 0.04], [111732, 0.06], [141212, 0.08], [721318, 0.093], [865574, 0.103], [1442628, 0.113], [null, 0.123]],
      [[21527, 0.01], [51000, 0.02], [65744, 0.04], [81364, 0.06], [96107, 0.08], [490493, 0.093], [588593, 0.103], [980987, 0.113], [null, 0.123]],
    ),
    deduction: standard(5540, 11080, 11080),
    exemption: exemption("credit", 149, 461, ONE, {
      threshold: by(244857, 489719, 367291, 244857, 489719),
      step: by(2500, 2500, 2500, 1250, 2500),
      reduce: 6,
    }),
    proven: false,
    note: own(2024, "FTB 2024 rate schedules, $5,540 / $11,080 standard deduction, $149 personal and $461 dependent credits, line 32 thresholds $244,857 / $367,291 / $489,719. Same rules as the proven 2025 card, not yet proven on a 2024 client."),
  },
  2026: {
    proven: false,
    note: "CARRIED FROM 2025 — the FTB publishes the 2026 rate schedules, standard deduction and credits in the autumn of 2026; update them here before trusting a 2026 return (the engine will refuse until they reproduce the client's tax). The PTE election was extended through 2030 (SB 132), so the entity rules stand.",
  },
};

/* ─────────────────────────────── New Jersey ─────────────────────────────── */

/** New Jersey's rates, exemptions, minimum tax and BAIT are unindexed. */
export const NEW_JERSEY_YEARS: Record<number, Partial<StateCard>> = {
  2023: { proven: false, note: own(2023, "New Jersey's rates, $1,000 / $1,500 exemptions, the shared responsibility payment and the BAIT schedule (2022 on) are unindexed, so the 2025 card applies as is; not yet proven on a 2023 client.") },
  2024: { proven: false, note: own(2024, "Unindexed: the 2025 card applies as is (2024's Schedule NJ-HCC and BAIT rules are the same); not yet proven on a 2024 client.") },
  2026: { proven: false, note: own(2026, "Unindexed: the 2025 card applies as is; not yet proven on a 2026 client.") },
};

/* ─────────────────────────────── the other states ─────────────────────────────── */

export const STATE_YEARS: Record<number, StateOverrides> = {
  /* ─────────────── 2023 ─────────────── */
  2023: {
    AR: {
      brackets: brackets([[4300, 0.02], [8500, 0.04], [null, 0.047]], [[4300, 0.02], [8500, 0.04], [null, 0.047]]),
      deduction: standard(2270, 4540, 2270),
      note: own(2023, "Top rate 4.7% (Act 532 of 2023), standard deduction $2,270 (verify the middle bracket edge). $29 personal credit."),
    },
    CO: { brackets: flat(0.044), note: own(2023, "4.4% flat on federal taxable income.") },
    CT: {
      brackets: brackets(
        [[10000, 0.03], [50000, 0.05], [100000, 0.055], [200000, 0.06], [250000, 0.065], [500000, 0.069], [null, 0.0699]],
        [[20000, 0.03], [100000, 0.05], [200000, 0.055], [400000, 0.06], [500000, 0.065], [1000000, 0.069], [null, 0.0699]],
        [[16000, 0.03], [80000, 0.05], [160000, 0.055], [320000, 0.06], [400000, 0.065], [800000, 0.069], [null, 0.0699]],
      ),
      note: own(2023, "The two lowest rates were 3% and 5% until 2024. Same exemption caveats as the 2025 card; the PE tax was mandatory through 2023."),
    },
    GA: {
      brackets: brackets(
        [[750, 0.01], [2250, 0.02], [3750, 0.03], [5250, 0.04], [7000, 0.05], [null, 0.0575]],
        [[1000, 0.01], [3000, 0.02], [5000, 0.03], [7000, 0.04], [10000, 0.05], [null, 0.0575]],
        [[1000, 0.01], [3000, 0.02], [5000, 0.03], [7000, 0.04], [10000, 0.05], [null, 0.0575]],
      ),
      deduction: standard(5400, 7100, 5400),
      exemption: exemption("deduction", 2700, 3000, by(1, 2, 1, 1, 2)),
      note: own(2023, "Georgia's last graduated year: 1%–5.75%, standard deduction $5,400 / $7,100, personal exemption $2,700 ($7,400 joint — seeded as 2 × $2,700, off by $2,000 on joint returns), $3,000 per dependent. PTE 5.75% with the income excluded."),
    },
    HI: { deduction: standard(2200, 4400, 3212), note: own(2023, "Standard deduction $2,200 / $4,400 / $3,212, $1,144 exemption, the same 12 brackets. PTE tax 9% for 2023 — set it here if a 2023 S corporation elected.") },
    IA: {
      brackets: brackets([[6000, 0.044], [30000, 0.0482], [75000, 0.057], [null, 0.06]], [[12000, 0.044], [60000, 0.0482], [150000, 0.057], [null, 0.06]]),
      note: own(2023, "Four brackets, top 6% (verify the starting point: Iowa began conforming to the federal standard deduction in 2023)."),
    },
    ID: { brackets: flat(0.058), note: own(2023, "5.8% flat (HB 1 of 2022), federal standard deduction. Grocery credit $120 per person not modeled.") },
    IL: { exemption: exemption("deduction", 2425, 2425), note: own(2023, "$2,425 exemption per person; 4.95% flat. 1.5% replacement tax; PTE 4.95%.") },
    IN: { brackets: flat(0.0315), note: own(2023, "3.15% flat. County tax not modeled (expect a refusal).") },
    KS: {
      brackets: brackets([[15000, 0.031], [30000, 0.0525], [null, 0.057]], [[30000, 0.031], [60000, 0.0525], [null, 0.057]]),
      deduction: standard(3500, 8000, 6000),
      exemption: exemption("deduction", 2250, 2250),
      note: own(2023, "Three brackets 3.1% / 5.25% / 5.7%, standard deduction $3,500 / $8,000 / $6,000, $2,250 per exemption."),
    },
    KY: { brackets: flat(0.045), deduction: standard(2980, 5960, 2980), note: own(2023, "4.5% flat, standard deduction $2,980 (verify).") },
    LA: {
      brackets: brackets([[12500, 0.0185], [50000, 0.035], [null, 0.0425]], [[25000, 0.0185], [100000, 0.035], [null, 0.0425]]),
      deduction: { kind: "none" },
      exemption: exemption("deduction", 4500, 1000, by(1, 2, 1, 1, 2)),
      note: own(2023, "1.85% / 3.5% / 4.25%; the combined personal exemption–standard deduction of $4,500 ($9,000 joint) seeded as an exemption, $1,000 per dependent. PTE at the individual rates with the income excluded."),
    },
    MA: { surtax: { rate: 0.04, above: 1000000 }, note: own(2023, "The 4% surtax's first year, above $1,000,000. Same caveats as the 2025 card (FICA deduction, 90% PTE credit).") },
    MD: {
      brackets: brackets(
        [[1000, 0.02], [2000, 0.03], [3000, 0.04], [100000, 0.0475], [125000, 0.05], [150000, 0.0525], [250000, 0.055], [null, 0.0575]],
        [[1000, 0.02], [2000, 0.03], [3000, 0.04], [150000, 0.0475], [175000, 0.05], [225000, 0.0525], [300000, 0.055], [null, 0.0575]],
        [[1000, 0.02], [2000, 0.03], [3000, 0.04], [150000, 0.0475], [175000, 0.05], [225000, 0.0525], [300000, 0.055], [null, 0.0575]],
      ),
      deduction: standard(2550, 5150, 5150),
      note: own(2023, "Top rate 5.75% (the 6.25% / 6.5% brackets came in 2025), standard deduction maximum $2,550 / $5,150. County tax not modeled (expect a refusal)."),
    },
    ME: {
      brackets: brackets([[24500, 0.058], [58050, 0.0675], [null, 0.0715]], [[49050, 0.058], [116100, 0.0675], [null, 0.0715]], [[36750, 0.058], [87100, 0.0675], [null, 0.0715]]),
      exemption: exemption("deduction", 4700, 0),
      note: own(2023, "2023 schedule, $4,700 personal exemption, federal standard deduction (2023's $13,850 / $27,700 / $20,800)."),
    },
    MI: { brackets: flat(0.0405), exemption: exemption("deduction", 5400, 5400), note: own(2023, "4.05% (the one-year rate cut), $5,400 exemptions.") },
    MN: {
      brackets: brackets(
        [[30070, 0.0535], [98760, 0.068], [183340, 0.0785], [null, 0.0985]],
        [[43950, 0.0535], [174610, 0.068], [304970, 0.0785], [null, 0.0985]],
        [[37010, 0.0535], [148730, 0.068], [243720, 0.0785], [null, 0.0985]],
        [[21975, 0.0535], [87305, 0.068], [152485, 0.0785], [null, 0.0985]],
      ),
      deduction: standard(13825, 27650, 20800),
      exemption: exemption("deduction", 0, 4800),
      note: own(2023, "2023 schedule, standard deduction $13,825 / $27,650 / $20,800, $4,800 dependent exemption."),
    },
    MO: {
      brackets: brackets(
        [[1207, 0], [2414, 0.02], [3621, 0.025], [4828, 0.03], [6035, 0.035], [7242, 0.04], [8449, 0.045], [null, 0.0495]],
        [[1207, 0], [2414, 0.02], [3621, 0.025], [4828, 0.03], [6035, 0.035], [7242, 0.04], [8449, 0.045], [null, 0.0495]],
      ),
      note: own(2023, "Top rate 4.95% (SB 3 of 2022). Federal tax deduction not modeled (expect a refusal)."),
    },
    MS: { brackets: brackets([[10000, 0], [null, 0.05]], [[10000, 0], [null, 0.05]]), note: own(2023, "5% over the first $10,000 (the 4% bracket ended in 2022).") },
    MT: {
      base: "federalAgi",
      brackets: brackets(
        [[3600, 0.01], [6300, 0.02], [9700, 0.03], [13000, 0.04], [16800, 0.05], [21600, 0.06], [null, 0.0675]],
        [[3600, 0.01], [6300, 0.02], [9700, 0.03], [13000, 0.04], [16800, 0.05], [21600, 0.06], [null, 0.0675]],
      ),
      deduction: { kind: "none" },
      exemption: exemption("deduction", 2960, 2960),
      note: own(2023, "Montana's last year on its own structure: seven brackets to 6.75% on federal AGI, $2,960 exemptions. NOT MODELED: Montana's own standard deduction (20% of AGI within a floor and cap) and the federal tax deduction — expect a refusal and a typed before. 2024 moved to federal taxable income."),
    },
    NC: { brackets: flat(0.0475), note: own(2023, "4.75% flat. Child deduction not modeled.") },
    ND: {
      brackets: brackets(
        [[44725, 0], [225975, 0.0195], [null, 0.025]],
        [[74750, 0], [275100, 0.0195], [null, 0.025]],
        [[59950, 0], [250550, 0.0195], [null, 0.025]],
        [[37375, 0], [137550, 0.0195], [null, 0.025]],
      ),
      note: own(2023, "The first year of the 0% / 1.95% / 2.5% schedule (HB 1158)."),
    },
    NE: {
      brackets: brackets(
        [[3700, 0.0246], [22170, 0.0351], [35730, 0.0501], [null, 0.0664]],
        [[7390, 0.0246], [44340, 0.0351], [71460, 0.0501], [null, 0.0664]],
        [[6900, 0.0246], [35480, 0.0351], [52980, 0.0501], [null, 0.0664]],
      ),
      deduction: standard(7900, 15800, 11600),
      exemption: exemption("credit", 157, 157),
      note: own(2023, "Top rate 6.64%, standard deduction about $7,900 / $15,800 / $11,600 and a $157 credit (verify the indexing)."),
    },
    NM: {
      brackets: brackets(
        [[5500, 0.017], [11000, 0.032], [16000, 0.047], [210000, 0.049], [null, 0.059]],
        [[8000, 0.017], [16000, 0.032], [24000, 0.047], [315000, 0.049], [null, 0.059]],
        [[8000, 0.017], [16000, 0.032], [24000, 0.047], [315000, 0.049], [null, 0.059]],
        [[4000, 0.017], [8000, 0.032], [12000, 0.047], [157500, 0.049], [null, 0.059]],
      ),
      note: own(2023, "The five-bracket schedule in force before 2025 (1.7% to 5.9%)."),
    },
    OH: {
      brackets: brackets([[26050, 0], [100000, 0.0275], [115300, 0.03688], [null, 0.0375]], [[26050, 0], [100000, 0.0275], [115300, 0.03688], [null, 0.0375]]),
      note: own(2023, "0% / 2.75% / 3.688% / 3.75%. Business income deduction not modeled (expect a refusal)."),
    },
    OR: {
      brackets: brackets([[4050, 0.0475], [10200, 0.0675], [125000, 0.0875], [null, 0.099]], [[8100, 0.0475], [20400, 0.0675], [250000, 0.0875], [null, 0.099]], [[8100, 0.0475], [20400, 0.0675], [250000, 0.0875], [null, 0.099]]),
      deduction: standard(2605, 5210, 4195),
      exemption: exemption("credit", 236, 236),
      note: own(2023, "2023 schedule, standard deduction $2,605 / $5,210 / $4,195, $236 exemption credit. Federal tax subtraction not modeled."),
    },
    RI: {
      brackets: brackets([[73450, 0.0375], [166950, 0.0475], [null, 0.0599]], [[73450, 0.0375], [166950, 0.0475], [null, 0.0599]]),
      deduction: standard(10000, 20050, 15050),
      exemption: exemption("deduction", 4700, 4700),
      note: own(2023, "2023 schedule, standard deduction $10,000 / $20,050 / $15,050, $4,700 exemption."),
    },
    SC: {
      brackets: brackets([[3200, 0], [16040, 0.03], [null, 0.064]], [[3200, 0], [16040, 0.03], [null, 0.064]]),
      exemption: exemption("deduction", 0, 4430),
      note: own(2023, "0% / 3% / 6.4% on federal taxable income, $4,430 dependent exemption."),
    },
    UT: { brackets: flat(0.0465), note: own(2023, "4.65% flat. Taxpayer tax credit not modeled.") },
    VA: { deduction: standard(8000, 16000, 8000), note: own(2023, "Standard deduction $8,000 / $16,000; the same schedule and $930 exemptions.") },
    VT: {
      brackets: brackets(
        [[45400, 0.0335], [110050, 0.066], [229550, 0.076], [null, 0.0875]],
        [[75850, 0.0335], [183400, 0.066], [279450, 0.076], [null, 0.0875]],
        [[60850, 0.0335], [157150, 0.066], [254500, 0.076], [null, 0.0875]],
        [[37925, 0.0335], [91700, 0.066], [139725, 0.076], [null, 0.0875]],
      ),
      deduction: standard(7000, 14050, 10450),
      exemption: exemption("deduction", 4850, 4850),
      note: own(2023, "2023 schedule, standard deduction $7,000 / $14,050 / $10,450, $4,850 exemption."),
    },
    WI: {
      brackets: brackets(
        [[13810, 0.035], [27630, 0.044], [304170, 0.053], [null, 0.0765]],
        [[18420, 0.035], [36840, 0.044], [405550, 0.053], [null, 0.0765]],
        [[13810, 0.035], [27630, 0.044], [304170, 0.053], [null, 0.0765]],
        [[9210, 0.035], [18420, 0.044], [202780, 0.053], [null, 0.0765]],
      ),
      note: own(2023, "2023 schedule. Sliding standard deduction not modeled (expect a refusal)."),
    },
    WV: {
      brackets: brackets(
        [[10000, 0.0236], [25000, 0.0315], [40000, 0.0354], [60000, 0.0472], [null, 0.0512]],
        [[10000, 0.0236], [25000, 0.0315], [40000, 0.0354], [60000, 0.0472], [null, 0.0512]],
        [[10000, 0.0236], [25000, 0.0315], [40000, 0.0354], [60000, 0.0472], [null, 0.0512]],
        [[5000, 0.0236], [12500, 0.0315], [20000, 0.0354], [30000, 0.0472], [null, 0.0512]],
      ),
      note: own(2023, "The rates after the 2023 cut (HB 2526): 2.36% to 5.12%."),
    },
  },

  /* ─────────────── 2024 ─────────────── */
  2024: {
    AR: {
      brackets: brackets([[4400, 0.02], [8800, 0.04], [null, 0.039]], [[4400, 0.02], [8800, 0.04], [null, 0.039]]),
      deduction: standard(2340, 4680, 2340),
      note: own(2024, "Top rate 3.9% (Act 1 of the June 2024 special session, retroactive to January 1), standard deduction $2,340 (verify the bracket edges)."),
    },
    CO: { brackets: flat(0.0425), note: own(2024, "4.25% — the TABOR-triggered temporary rate for 2024 (SB24-228).") },
    GA: { brackets: flat(0.0549), note: own(2024, "5.49% flat (the first flat year), standard deduction $12,000 / $24,000, $4,000 per dependent. PTE 5.49% with the income excluded.") },
    HI: { deduction: standard(2200, 4400, 3212), note: own(2024, "Standard deduction $2,200 / $4,400 / $3,212 (raised for 2025), $1,144 exemption. PTE tax 9%.") },
    IA: {
      brackets: brackets([[6210, 0.044], [31050, 0.0482], [null, 0.057]], [[12420, 0.044], [62100, 0.0482], [null, 0.057]]),
      note: own(2024, "Three brackets, top 5.7% (verify the indexed thresholds)."),
    },
    ID: { brackets: flat(0.05695), note: own(2024, "5.695% flat (HB 521). Grocery credit not modeled.") },
    IL: { exemption: exemption("deduction", 2775, 2775), note: own(2024, "$2,775 exemption per person; 4.95% flat.") },
    IN: { brackets: flat(0.0305), note: own(2024, "3.05% flat. County tax not modeled (expect a refusal).") },
    KY: { brackets: flat(0.04), deduction: standard(3160, 6320, 3160), note: own(2024, "4% flat, standard deduction $3,160.") },
    LA: {
      brackets: brackets([[12500, 0.0185], [50000, 0.035], [null, 0.0425]], [[25000, 0.0185], [100000, 0.035], [null, 0.0425]]),
      deduction: { kind: "none" },
      exemption: exemption("deduction", 4500, 1000, by(1, 2, 1, 1, 2)),
      note: own(2024, "1.85% / 3.5% / 4.25%, the combined $4,500 / $9,000 exemption–deduction, $1,000 per dependent."),
    },
    MA: { surtax: { rate: 0.04, above: 1053750 }, note: own(2024, "Surtax threshold $1,053,750. Same caveats as the 2025 card.") },
    MD: {
      brackets: brackets(
        [[1000, 0.02], [2000, 0.03], [3000, 0.04], [100000, 0.0475], [125000, 0.05], [150000, 0.0525], [250000, 0.055], [null, 0.0575]],
        [[1000, 0.02], [2000, 0.03], [3000, 0.04], [150000, 0.0475], [175000, 0.05], [225000, 0.0525], [300000, 0.055], [null, 0.0575]],
        [[1000, 0.02], [2000, 0.03], [3000, 0.04], [150000, 0.0475], [175000, 0.05], [225000, 0.0525], [300000, 0.055], [null, 0.0575]],
      ),
      note: own(2024, "Top rate 5.75%, standard deduction maximum $2,700 / $5,450. County tax not modeled (expect a refusal)."),
    },
    ME: {
      brackets: brackets([[26050, 0.058], [61600, 0.0675], [null, 0.0715]], [[52100, 0.058], [123250, 0.0675], [null, 0.0715]], [[39050, 0.058], [92450, 0.0675], [null, 0.0715]]),
      exemption: exemption("deduction", 5000, 0),
      note: own(2024, "2024 schedule, $5,000 personal exemption, federal standard deduction."),
    },
    MI: { brackets: flat(0.0425), exemption: exemption("deduction", 5600, 5600), note: own(2024, "4.25%, $5,600 exemptions.") },
    MN: {
      brackets: brackets(
        [[31690, 0.0535], [104090, 0.068], [193240, 0.0785], [null, 0.0985]],
        [[46330, 0.0535], [184040, 0.068], [321450, 0.0785], [null, 0.0985]],
        [[39010, 0.0535], [156760, 0.068], [256880, 0.0785], [null, 0.0985]],
        [[23165, 0.0535], [92020, 0.068], [160725, 0.0785], [null, 0.0985]],
      ),
      deduction: standard(14575, 29150, 21900),
      exemption: exemption("deduction", 0, 5050),
      note: own(2024, "2024 schedule, standard deduction $14,575 / $29,150 / $21,900, $5,050 dependent exemption."),
    },
    MO: {
      brackets: brackets(
        [[1273, 0], [2546, 0.02], [3819, 0.025], [5092, 0.03], [6365, 0.035], [7638, 0.04], [8911, 0.045], [null, 0.048]],
        [[1273, 0], [2546, 0.02], [3819, 0.025], [5092, 0.03], [6365, 0.035], [7638, 0.04], [8911, 0.045], [null, 0.048]],
      ),
      note: own(2024, "Top rate 4.8%. Federal tax deduction not modeled (expect a refusal)."),
    },
    MS: { brackets: brackets([[10000, 0], [null, 0.047]], [[10000, 0], [null, 0.047]]), note: own(2024, "4.7% over the first $10,000.") },
    MT: {
      brackets: brackets([[20500, 0.047], [null, 0.059]], [[41000, 0.047], [null, 0.059]], [[30750, 0.047], [null, 0.059]]),
      note: own(2024, "The first year of the two-bracket schedule on federal taxable income: 4.7% to $20,500 / $41,000, 5.9% over."),
    },
    NC: { brackets: flat(0.045), note: own(2024, "4.5% flat. Child deduction not modeled.") },
    ND: {
      brackets: brackets(
        [[47150, 0], [238200, 0.0195], [null, 0.025]],
        [[78775, 0], [289975, 0.0195], [null, 0.025]],
        [[63175, 0], [264100, 0.0195], [null, 0.025]],
        [[39388, 0], [144988, 0.0195], [null, 0.025]],
      ),
      note: own(2024, "2024 indexed thresholds (verify)."),
    },
    NE: {
      brackets: brackets(
        [[3700, 0.0246], [22170, 0.0351], [35730, 0.0501], [null, 0.0584]],
        [[7390, 0.0246], [44340, 0.0351], [71460, 0.0501], [null, 0.0584]],
        [[6900, 0.0246], [35480, 0.0351], [52980, 0.0501], [null, 0.0584]],
      ),
      deduction: standard(8100, 16200, 11900),
      exemption: exemption("credit", 162, 162),
      note: own(2024, "Top rate 5.84% (LB 754), standard deduction about $8,100 / $16,200 / $11,900 and a $162 credit (verify the indexing)."),
    },
    NM: {
      brackets: brackets(
        [[5500, 0.017], [11000, 0.032], [16000, 0.047], [210000, 0.049], [null, 0.059]],
        [[8000, 0.017], [16000, 0.032], [24000, 0.047], [315000, 0.049], [null, 0.059]],
        [[8000, 0.017], [16000, 0.032], [24000, 0.047], [315000, 0.049], [null, 0.059]],
        [[4000, 0.017], [8000, 0.032], [12000, 0.047], [157500, 0.049], [null, 0.059]],
      ),
      note: own(2024, "The five-bracket schedule in force before 2025."),
    },
    OH: { brackets: brackets([[26050, 0], [100000, 0.0275], [null, 0.035]], [[26050, 0], [100000, 0.0275], [null, 0.035]]), note: own(2024, "0% / 2.75% / 3.5%. Business income deduction not modeled (expect a refusal).") },
    OR: {
      brackets: brackets([[4300, 0.0475], [10750, 0.0675], [125000, 0.0875], [null, 0.099]], [[8600, 0.0475], [21500, 0.0675], [250000, 0.0875], [null, 0.099]], [[8600, 0.0475], [21500, 0.0675], [250000, 0.0875], [null, 0.099]]),
      deduction: standard(2745, 5495, 4420),
      exemption: exemption("credit", 249, 249),
      note: own(2024, "2024 schedule, standard deduction $2,745 / $5,495 / $4,420, $249 exemption credit. Federal tax subtraction not modeled."),
    },
    RI: {
      brackets: brackets([[77450, 0.0375], [176050, 0.0475], [null, 0.0599]], [[77450, 0.0375], [176050, 0.0475], [null, 0.0599]]),
      deduction: standard(10550, 21150, 15850),
      exemption: exemption("deduction", 4950, 4950),
      note: own(2024, "2024 schedule, standard deduction $10,550 / $21,150 / $15,850, $4,950 exemption."),
    },
    SC: {
      brackets: brackets([[3460, 0], [17330, 0.03], [null, 0.063]], [[3460, 0], [17330, 0.03], [null, 0.063]]),
      exemption: exemption("deduction", 0, 4610),
      note: own(2024, "0% / 3% / 6.3% on federal taxable income, $4,610 dependent exemption."),
    },
    UT: { brackets: flat(0.0455), note: own(2024, "4.55% flat. Taxpayer tax credit not modeled.") },
    VA: { deduction: standard(8500, 17000, 8500), note: own(2024, "Standard deduction $8,500 / $17,000; the same schedule and $930 exemptions.") },
    VT: {
      brackets: brackets(
        [[47900, 0.0335], [116000, 0.066], [242000, 0.076], [null, 0.0875]],
        [[79950, 0.0335], [193300, 0.066], [294600, 0.076], [null, 0.0875]],
        [[64200, 0.0335], [165800, 0.066], [268500, 0.076], [null, 0.0875]],
        [[39975, 0.0335], [96650, 0.066], [147300, 0.076], [null, 0.0875]],
      ),
      deduction: standard(7400, 14850, 11100),
      exemption: exemption("deduction", 5100, 5100),
      note: own(2024, "2024 schedule, standard deduction $7,400 / $14,850 / $11,100, $5,100 exemption."),
    },
    WI: {
      brackets: brackets(
        [[14320, 0.035], [28640, 0.044], [315310, 0.053], [null, 0.0765]],
        [[19090, 0.035], [38190, 0.044], [420420, 0.053], [null, 0.0765]],
        [[14320, 0.035], [28640, 0.044], [315310, 0.053], [null, 0.0765]],
        [[9550, 0.035], [19090, 0.044], [210210, 0.053], [null, 0.0765]],
      ),
      note: own(2024, "2024 schedule. Sliding standard deduction not modeled (expect a refusal)."),
    },
    WV: {
      brackets: brackets(
        [[10000, 0.0236], [25000, 0.0315], [40000, 0.0354], [60000, 0.0472], [null, 0.0512]],
        [[10000, 0.0236], [25000, 0.0315], [40000, 0.0354], [60000, 0.0472], [null, 0.0512]],
        [[10000, 0.0236], [25000, 0.0315], [40000, 0.0354], [60000, 0.0472], [null, 0.0512]],
        [[5000, 0.0236], [12500, 0.0315], [20000, 0.0354], [30000, 0.0472], [null, 0.0512]],
      ),
      note: own(2024, "2.36% to 5.12% (the further 4% cut applied from 2025)."),
    },
  },

  /* ─────────────── 2026 ─────────────── */
  2026: {
    GA: { brackets: flat(0.0509), note: own(2026, "5.09% flat if the revenue triggers in HB 111 are met (else 5.19%) — verify against the return. Standard deduction $12,000 / $24,000, $4,000 per dependent.") },
    IN: { brackets: flat(0.0295), note: own(2026, "2.95% flat (the scheduled step). County tax not modeled (expect a refusal).") },
    KY: { brackets: flat(0.035), deduction: standard(3360, 6720, 3360), note: own(2026, "3.5% flat (HB 1 of 2025); standard deduction $3,360 (verify).") },
    MS: { brackets: brackets([[10000, 0], [null, 0.04]], [[10000, 0], [null, 0.04]]), note: own(2026, "4.0% over the first $10,000 (HB 1 of 2025).") },
    NC: { brackets: flat(0.0399), note: own(2026, "3.99% flat. Child deduction not modeled.") },
    NE: {
      brackets: brackets(
        [[3700, 0.0246], [22170, 0.0351], [35730, 0.0501], [null, 0.0455]],
        [[7390, 0.0246], [44340, 0.0351], [71460, 0.0501], [null, 0.0455]],
        [[6900, 0.0246], [35480, 0.0351], [52980, 0.0501], [null, 0.0455]],
      ),
      note: own(2026, "Top rate 4.55% (LB 754); note the top rate is now below the 5.01% third bracket — verify the 2026 schedule, which may have collapsed it. Thresholds carried from 2024; indexing not applied."),
    },
    OH: { brackets: brackets([[26050, 0], [null, 0.0275]], [[26050, 0], [null, 0.0275]]), note: own(2026, "2.75% flat over $26,050 (HB 96). Business income deduction not modeled (expect a refusal).") },
    IA: { note: own(2026, "3.8% flat (unchanged from 2025).") },
    ID: { note: own(2026, "5.3% flat (unchanged from 2025).") },
    CO: { note: own(2026, "4.4% on federal taxable income unless a TABOR reduction applies — verify against the return.") },
    MA: { surtax: { rate: 0.04, above: 1110650 }, note: own(2026, "Surtax threshold indexed to about $1,110,650 (verify). Same caveats as the 2025 card.") },
    UT: { note: own(2026, "4.5% (verify — a further cut was proposed for 2026). Taxpayer tax credit not modeled.") },
    WV: { note: "CARRIED FROM 2025 — West Virginia's rates may step down again for 2026 under the trigger law; verify the 2026 IT-140 schedule." },
  },
};

/** The states whose 2026 override above is only a note: their rules are the 2025 card's. */
export const CARRIED_NOTE = (year: number) =>
  `CARRIED FROM 2025 — ${year}'s indexed brackets, deduction and exemption amounts have not been applied to this card. The engine will refuse a ${year} return until they reproduce its tax; update them from the state's ${year} rate schedule. `;
