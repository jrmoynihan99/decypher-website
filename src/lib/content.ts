/** Static marketing copy for the homepage sections. */

/** All booking CTAs route to the on-site schedule page. */
export const SCHEDULE_URL = "/schedule";

/** External scheduling tool — linked from the schedule page's form flow later. */
export const EXTERNAL_SCHEDULE_URL = "https://wedecypher.co/schedule-team";

export interface Stat {
  value: string;
  label: string;
}

export const STATS: Stat[] = [
  { value: "150+", label: "Creators helped" },
  { value: "$120M+", label: "Creator lifetime revenue" },
  { value: "$4.6M+", label: "Creator tax savings" },
  { value: "600+", label: "Tax strategies set" },
];

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

export interface Testimonial {
  quote: string;
  name: string;
  handle: string;
  followers: string;
  cat: string;
  initials: string;
  accent: string;
  accentBorder: string;
}

export const TESTIMONIALS_ROW_A: Testimonial[] = [
  {
    quote:
      "DeCypher found $23K in deductions my old CPA never even mentioned. Paid for itself in the first month.",
    name: "Maya Chen",
    handle: "@mayamakesup",
    followers: "890K followers",
    cat: "Beauty",
    initials: "MC",
    accent: "#FF2D78",
    accentBorder: "rgba(255,45,120,.4)",
  },
  {
    quote:
      "First April ever that I didn't panic. S-corp set up, quarterlies on autopilot, and I actually understand my numbers now.",
    name: "Jordan Reyes",
    handle: "@jayplaysgames",
    followers: "1.2M followers",
    cat: "Gaming",
    initials: "JR",
    accent: "#B06CFF",
    accentBorder: "rgba(139,43,232,.45)",
  },
  {
    quote:
      "They rebuilt two years of books in three weeks and found write-offs I didn't know existed. Weekly updates, zero chasing.",
    name: "Tasha Bell",
    handle: "@tashacooks",
    followers: "640K followers",
    cat: "Food",
    initials: "TB",
    accent: "#FF7A4D",
    accentBorder: "rgba(255,92,46,.45)",
  },
];

export const TESTIMONIALS_ROW_B: Testimonial[] = [
  {
    quote:
      "I went from a shoebox of 1099s to a real business. LLC, EIN, bank — done in a week. The crash course actually stuck.",
    name: "Devon Price",
    handle: "@devon.ugc",
    followers: "210K followers",
    cat: "UGC",
    initials: "DP",
    accent: "#FF2D78",
    accentBorder: "rgba(255,45,120,.4)",
  },
  {
    quote:
      "My tax bill dropped $31K the first year. Same income. That's not an ad — that's just what a real strategy does.",
    name: "Liv Marsh",
    handle: "@livlifts",
    followers: "480K followers",
    cat: "Fitness",
    initials: "LM",
    accent: "#B06CFF",
    accentBorder: "rgba(139,43,232,.45)",
  },
  {
    quote:
      "It feels like having a CFO in the group chat. I ask, they answer, my money moves right.",
    name: "Andre Sims",
    handle: "@simstalksmoney",
    followers: "350K followers",
    cat: "Finance",
    initials: "AS",
    accent: "#FF7A4D",
    accentBorder: "rgba(255,92,46,.45)",
  },
];

export interface Faq {
  q: string;
  a: string;
}

export const FAQS: Faq[] = [
  {
    q: "How often do I meet with the DeCypher team?",
    a: "We have planned meetings depending on the package you choose — and every client can book one-off meetings with any member of the team about bookkeeping, taxes, or business consulting.",
  },
  {
    q: "What is the investment to work with DeCypher?",
    a: "We're innovating the way accounting firms work. We have a custom investment model built for creators depending on the services you need. Book a discovery call so we can see if we can support you.",
  },
  {
    q: "Can I cancel my subscription any time?",
    a: "Yes. We run a weekly model, so you can cancel whenever you'd like. No yearly contracts like old-school accountants — we want you to get weekly value.",
  },
  {
    q: "Can I get an estimate on how much I will owe in taxes?",
    a: "Exact estimates are nearly impossible given the complexity of tax calculations. As a rule of thumb, we recommend putting 20% of your income away for taxes.",
  },
  {
    q: "Will I get tax strategy?",
    a: "Long story short: yes. We work on a partnership model — we act as your finance team inside your creator business. Because we understand your finances, we know exactly which tax strategies work for you.",
  },
  {
    q: "Does DeCypher do financial advising?",
    a: "We're not licensed to advise on stocks. We advise on tax strategies and financial vehicles that create tax savings — for example, setting up a Solo 401(k).",
  },
];
