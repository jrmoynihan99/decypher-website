/**
 * DEV FIXTURES ONLY. Production content lives in Sanity (see
 * src/sanity/queries.ts); the only remaining consumers of this file are the
 * experimental variants in /services-lab, which stay on static copy.
 */

/** External scheduling tool — linked from the schedule page's form flow later. */
export const EXTERNAL_SCHEDULE_URL = "https://wedecypher.co/schedule-team";

export interface Service {
  num: string;
  title: string;
  promise: string;
  body: string;
  chips?: string[];
  imgLabel: string;
  /** Path under /public — once real service imagery lands, layouts render it
   *  in place of the framed placeholder slot. */
  img?: string;
}

export const SERVICES_FIVE: Service[] = [
  {
    num: "01",
    title: "Tax Filing + Strategy",
    promise: "PAY LESS TO THE IRS",
    body: "We understand creator deductions — and we go on offense. A proactive plan built around your channels and revenue, with live support all year so you never overpay.",
    imgLabel: "// TAX_FILING_STRATEGY.IMG",
  },
  {
    num: "02",
    title: "LLC Filing + Course",
    promise: "STRUCTURED TO SAVE",
    body: "File your business the right way — completely done for you. Then take our crash course and learn how to structure and maintain it to reduce taxes.",
    chips: ["LLC", "EIN", "BOI", "BANK"],
    imgLabel: "// LLC_FILING_COURSE.IMG",
  },
  {
    num: "03",
    title: "Bookkeeping",
    promise: "THE KEY TO HIGHER SAVINGS",
    body: "We specialize in the creator economy. Your finances are done weekly — so you can make decisions when you need to, and capture every write-off you're owed.",
    imgLabel: "// BOOKKEEPING.IMG",
  },
  // 04 + 05 are placeholder copy — swap for real offerings before shipping.
  {
    num: "04",
    title: "S-Corp + Payroll",
    promise: "KEEP MORE OF EVERY DOLLAR",
    body: "When the numbers say it's time, we handle the S-corp election, set a reasonable salary, and run your payroll on autopilot — so the savings actually land.",
    chips: ["ELECTION", "PAYROLL", "QUARTERLIES"],
    imgLabel: "// SCORP_PAYROLL.IMG",
  },
  {
    num: "05",
    title: "Fractional CFO",
    promise: "A FINANCE TEAM ON SPEED DIAL",
    body: "Forecasting, brand-deal pricing, cash-flow planning — senior finance help in your corner for every decision bigger than a spreadsheet.",
    imgLabel: "// FRACTIONAL_CFO.IMG",
  },
];

/**
 * The original three services. The earlier variants were built around a
 * 3-card layout (orbit geometry, `/03` readouts) — they keep consuming this
 * slice while the neural-web variants render all of SERVICES_FIVE.
 */
export const SERVICES: Service[] = SERVICES_FIVE.slice(0, 3);
