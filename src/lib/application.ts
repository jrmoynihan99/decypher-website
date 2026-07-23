/**
 * A job application from the careers page.
 *
 * Grown from the original four-field form into the full application: contact,
 * role fit, tools, culture answers, logistics, and the pre-submit compliance
 * questions. The contract for adding a field is unchanged: add it here, add an
 * input to ApplicationForm, a line to parseApplication in /api/apply, and (if
 * recruiting should see it at a glance) a row in postApplicationToSlack. The
 * store writes the whole object, so Firestore picks new fields up for free.
 *
 * `role` and `department` are not typed by the applicant — they're captured from
 * whichever job opened the form, so a submission always knows what it's for.
 *
 * The resume file itself is NOT on this interface — it travels next to the
 * fields as multipart form data and is stored by lib/application-store.
 */

export interface Application {
  /** Job title, e.g. "Senior Tax Associate". Captured from the job. */
  role: string;
  /** Department chip on the card, e.g. "Tax". Captured from the job. */
  department: string;

  // ── 01 · Basics & contact ──────────────────────────────────────────────
  name: string;
  email: string;
  phone: string;
  /** "City, State" — free text. */
  location: string;
  /** LinkedIn / portfolio URL. Optional now that the resume is a real file. */
  linkedin: string;
  /** How they found us: referral | social | job-board | other. */
  heardAbout: string;

  // ── 02 · Role fit & background ─────────────────────────────────────────
  /** full-time | part-time | contractor. */
  employmentType: string;
  /** Years of relevant experience, banded: <1 | 1-2 | 3-5 | 6-9 | 10+. */
  experience: string;
  /** Current role & company, free text. */
  currentRole: string;
  /** Desired compensation, free text (range welcome). */
  desiredComp: string;
  /** Earliest start date, free text. */
  startDate: string;

  // ── 03 · Skills & tools (labels from the form's checkbox lists) ────────
  tools: string[];
  /** Work they've personally handled end to end. */
  handled: string[];

  // ── 04 · Culture & behavior ────────────────────────────────────────────
  whyUs: string;
  ownershipStory: string;
  /** Our value is "do the boring work" — what that means to them. */
  boringWork: string;

  // ── 05 · Logistics ─────────────────────────────────────────────────────
  /** Typical weekly availability, free text. */
  availability: string;
  remoteCameras: boolean | null;
  internet: boolean | null;
  backgroundCheck: boolean | null;

  // ── 06 · Before you submit ─────────────────────────────────────────────
  /** Authorized to work in the U.S. without sponsorship. */
  workAuth: boolean | null;
  /** Will now or in the future require sponsorship (H-1B, O-1, …). */
  needsSponsorship: boolean | null;
  /** Professional commitments that might conflict. Optional free text. */
  conflicts: string;

  /** Anything else they'd like us to know. Optional. */
  message: string;
}

/** Resume file constraints, shared by the form (pre-flight) and the route. */
export const RESUME_MAX_BYTES = 4 * 1024 * 1024; // Vercel's request cap is ~4.5MB
export const RESUME_EXTENSIONS = [".pdf", ".doc", ".docx"] as const;

/** Metadata for a stored resume, as the portal reads it off the Firestore doc. */
export interface ResumeMeta {
  filename: string;
  contentType: string;
  size: number;
}

export const HEARD_ABOUT_OPTIONS = [
  { value: "referral", label: "Referral" },
  { value: "social", label: "Social media" },
  { value: "job-board", label: "Job board" },
  { value: "other", label: "Other" },
] as const;

export const EMPLOYMENT_TYPES = [
  { value: "full-time", label: "Full-time" },
  { value: "part-time", label: "Part-time" },
  { value: "contractor", label: "Contractor" },
] as const;

export const EXPERIENCE_BANDS = [
  { value: "<1", label: "Less than 1 year" },
  { value: "1-2", label: "1–2 years" },
  { value: "3-5", label: "3–5 years" },
  { value: "6-9", label: "6–9 years" },
  { value: "10+", label: "10+ years" },
] as const;

/**
 * Checkbox lists for section 03. Fixed labels for now (the whole careers page
 * is accounting/tax roles); if a future department needs different lists, the
 * job document in Sanity is the place to hang them.
 */
export const TOOL_OPTIONS = [
  "QuickBooks Online",
  "Xero",
  "Gusto / Rippling / other payroll",
  "Stripe / PayPal",
  "Tax software (Drake, ProConnect, UltraTax…)",
  "Excel / Google Sheets",
  "Slack / Notion",
  "A CRM (HubSpot, Salesforce…)",
] as const;

export const HANDLED_OPTIONS = [
  "S-corp setups & reasonable salary",
  "Multi-member LLCs",
  "Multi-state returns",
  "Creators / influencers with multiple income streams",
  "Short-term rental / real estate strategies",
  "Sales tax for digital products",
] as const;
