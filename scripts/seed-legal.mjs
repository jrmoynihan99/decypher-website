/**
 * Seeds the two legal documents Intuit's app assessment asks for:
 * /legal/privacy and /legal/terms.
 *
 * Additive, like seed-careers.mjs — createIfNotExists, so re-running never
 * clobbers a Studio edit. To start a document over, delete it in Studio first.
 *
 * The copy is drafted against what the code actually does: the processors
 * listed are the ones the app really calls, the security measures are the ones
 * actually implemented, and nothing asserts a deletion schedule that no code
 * enforces. It has NOT been reviewed by a lawyer — get it read before
 * publishing. Anything in [SQUARE BRACKETS] is a blank; Studio warns while any
 * remain.
 *
 *   node scripts/seed-legal.mjs
 */
import { createClient } from "@sanity/client";
import { readFileSync } from "node:fs";

// ── env (.env.local, no dotenv dep) ─────────────────────────────────
const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const client = createClient({
  projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: env.NEXT_PUBLIC_SANITY_DATASET,
  token: env.SANITY_API_WRITE_TOKEN,
  apiVersion: "2024-01-01",
  useCdn: false,
});

// ── portable-text builders ──────────────────────────────────────────

let n = 0;
const key = () => `lg${(n++).toString(36).padStart(4, "0")}`;

const span = (text, marks = []) => ({ _type: "span", _key: key(), text, marks });
const bold = (text) => span(text, ["strong"]);
/** Link marks need a markDef on the parent block, so this is resolved there. */
const a = (text, href) => ({ __link: true, text, href });

const block = (style, children, extra = {}) => {
  const markDefs = [];
  const kids = (Array.isArray(children) ? children : [children]).map((c) => {
    if (typeof c === "string") return span(c);
    if (c.__link) {
      const _key = key();
      markDefs.push({ _type: "link", _key, href: c.href });
      return span(c.text, [_key]);
    }
    return c;
  });
  return { _type: "block", _key: key(), style, markDefs, children: kids, ...extra };
};

const p = (...children) => block("normal", children);
const h2 = (text) => block("h2", text);
const li = (...children) => block("normal", children, { listItem: "bullet", level: 1 });

// ── privacy policy ──────────────────────────────────────────────────

const privacyBody = [
  p(
    "This policy explains how [LEGAL ENTITY NAME] (“DeCypher”, “we”, “us”) handles information in the ",
    bold("DeCypher client portal"),
    " — the internal application our staff use to manage client work, including the Creator Finances tool that reads accounting data from QuickBooks Online.",
  ),
  p(
    "It covers the portal only. Our public marketing website is governed by the separate policy published at ",
    a("wedecypher.co/privacy-policy", "https://wedecypher.co/privacy-policy"),
    ". Where the two overlap, this policy governs the portal.",
  ),

  h2("Who this policy is about"),
  p(
    "The portal is not a consumer product and is not open to the public. It is used by authorised DeCypher personnel. Two groups of people are affected by it:",
  ),
  li(bold("Our staff"), ", who hold portal accounts."),
  li(
    bold("Our clients"),
    ", whose business financial records we process on their behalf as part of the bookkeeping and accounting services they have engaged us to provide.",
  ),
  p(
    "For client accounting records we act as a service provider to the client. We process those records to deliver the services they have engaged us for, and for no independent purpose of our own.",
  ),

  h2("Information we handle"),
  p(
    bold("Staff account information."),
    " Name, work email address, the role and tool permissions assigned to the account, and authentication records. Sessions are maintained with a signed, HTTP-only cookie.",
  ),
  p(
    bold("Client accounting data from QuickBooks Online."),
    " Where a client’s books are connected, we read their profit and loss report and their chart of accounts. In practice this means account names, account classifications, and the monetary totals posted to each account by month. We store the resulting summary so the portal does not have to query QuickBooks on every page view.",
  ),
  p(
    bold("Enquiries and submissions."),
    " Information people voluntarily send us through our website — such as contact details and the figures entered into our tax estimator, consultation bookings, and job applications including any documents attached to them.",
  ),
  p(
    "We do not use cookies or similar technologies in the portal for advertising, tracking, or profiling. The only cookie the portal sets is the one that keeps a signed-in staff member signed in.",
  ),

  h2("How we use QuickBooks data"),
  p("This section is deliberately specific, because it is the sensitive part."),
  li(
    "We request ",
    bold("read-only accounting access"),
    ". The application does not create, alter, or delete anything in a client’s QuickBooks company file.",
  ),
  li(
    "We use the data to present each client’s profit and loss — revenue streams, expense categories, operating profit and net profit — to our own staff, and to produce aggregate figures across our client base.",
  ),
  li(
    "We do ",
    bold("not"),
    " sell, rent, or licence QuickBooks data. We do not use it for advertising or marketing. We do not use it to train machine-learning models. We do not disclose one client’s financial information to another client.",
  ),
  li(
    "Aggregate figures shown in the portal are visible only to authorised DeCypher staff and are never published or shared externally in a form that identifies an individual client.",
  ),
  li(
    "Access credentials issued by Intuit are encrypted before they are stored and are never exposed to a web browser.",
  ),

  h2("Service providers"),
  p(
    "We use a small number of third-party providers to operate the portal. They process information only on our instructions and only to provide their service to us. They are not permitted to use it for their own purposes.",
  ),
  li(bold("Vercel"), " — application hosting (United States)."),
  li(
    bold("Google Firebase / Cloud Firestore"),
    " — authentication and data storage (United States).",
  ),
  li(
    bold("Intuit"),
    " — the source of the accounting data, accessed with the client company’s authorisation.",
  ),
  li(bold("Resend"), " — transactional email."),
  li(bold("Slack"), " — internal notifications to our own team."),
  li(bold("Calendly"), " — consultation scheduling."),
  p(
    "We may also disclose information where we are required to by law, or where it is necessary to establish or defend legal claims.",
  ),

  h2("How we protect it"),
  li("All traffic to and from the portal is encrypted in transit."),
  li(
    "QuickBooks access credentials are encrypted at rest with AES-256-GCM, using a key held outside the database.",
  ),
  li(
    "The database rejects all direct access from browsers. Every read and write goes through our server, which authenticates the request first.",
  ),
  li(
    "Portal access is per-person and per-tool: a staff member can only open the tools they have been granted. Sessions expire and can be revoked immediately.",
  ),
  li(
    "The QuickBooks connection holds read-only scope, so a compromise of the portal could not be used to alter a client’s books.",
  ),
  p(
    "No system is perfectly secure, and we do not claim otherwise. We aim to apply protections appropriate to the sensitivity of financial records.",
  ),

  h2("How long we keep it"),
  p(
    "We retain client accounting summaries for as long as the client relationship continues and thereafter for as long as we are required to keep records under applicable law and professional standards — currently [RETENTION PERIOD]. Staff account records are kept while the account is active and removed when it is closed.",
  ),
  p(
    "When a QuickBooks connection is disconnected, we revoke our access credentials with Intuit and delete our copy of them. Previously retrieved summaries are retained under the schedule above unless deletion is requested.",
  ),

  h2("Your choices"),
  p(
    "A client may disconnect our access to their QuickBooks company at any time, either by asking us to do so or from within their own QuickBooks account. Disconnecting stops any further access immediately.",
  ),
  p(
    "You may ask us what information we hold about you, ask us to correct it, or ask us to delete it. Some information must be retained where law or professional obligations require it, and we will tell you if that applies. Contact us at [CONTACT EMAIL].",
  ),
  p(
    "Depending on where you live you may have additional rights under laws such as the California Consumer Privacy Act. We do not sell personal information or share it for cross-context behavioural advertising.",
  ),

  h2("Children"),
  p(
    "The portal is a business tool and is not directed to children. We do not knowingly collect information from anyone under 18 through it.",
  ),

  h2("Changes"),
  p(
    "If we change this policy we will update the effective date above. Material changes affecting client data will be communicated directly rather than only posted here.",
  ),

  h2("Contact"),
  p(bold("[LEGAL ENTITY NAME]")),
  p("[MAILING ADDRESS]"),
  p("[CONTACT EMAIL]"),
  p("[PHONE]"),
  p("See also our ", a("Portal Terms of Use", "/legal/terms"), "."),
];

// ── terms of use ────────────────────────────────────────────────────

const termsBody = [
  p(
    "These terms govern use of the ",
    bold("DeCypher client portal"),
    " (the “Portal”), software operated by [LEGAL ENTITY NAME] (“DeCypher”, “we”, “us”). By signing in you agree to them. If you do not agree, do not use the Portal.",
  ),

  h2("1. What the Portal is"),
  p(
    "The Portal is an internal business application used by DeCypher personnel to deliver accounting, bookkeeping and advisory services. It is not a public product, is not sold or licensed to third parties, and is not available for self-service registration. Among other tools it includes Creator Finances, which displays client financial information read from QuickBooks Online.",
  ),

  h2("2. Who may use it"),
  p(
    "Access is granted to named individuals authorised by DeCypher — employees, contractors and other personnel acting on our behalf. Accounts are personal. You may not share your credentials, allow anyone else to use your account, or use an account issued to someone else.",
  ),
  p(
    "You must notify us immediately if you believe your credentials have been compromised. We may suspend or terminate any account at any time, with or without notice, including immediately on the end of your engagement with DeCypher.",
  ),

  h2("3. Acceptable use"),
  p("You agree not to:"),
  li(
    "Access client information you have no business reason to access, or use it for any purpose other than delivering services to that client.",
  ),
  li(
    "Copy, export, transmit or retain client financial information outside systems approved by DeCypher.",
  ),
  li(
    "Disclose client information to anyone not authorised to receive it, inside or outside DeCypher.",
  ),
  li(
    "Attempt to circumvent authentication, permissions or any other security control, or probe, scan or test the Portal’s security.",
  ),
  li(
    "Reverse engineer, decompile, copy or create derivative works from the Portal, or make it available to any third party.",
  ),
  li("Use the Portal in violation of any applicable law or professional standard."),

  h2("4. Connecting client accounting systems"),
  p(
    "The Portal can connect to a client’s QuickBooks Online company file. Before connecting any company you confirm that DeCypher holds the client’s authorisation to access those records and that you are permitted to establish the connection on the firm’s behalf.",
  ),
  p(
    "Connections are read-only. The Portal does not write to, alter or delete anything in a client’s accounting records. A connection may be revoked at any time by DeCypher or by the client.",
  ),

  h2("5. Intuit and other third-party services"),
  p(
    "QuickBooks Online is a product of Intuit Inc. DeCypher is not affiliated with, endorsed by, or acting as an agent of Intuit. Use of QuickBooks is governed by the client’s own agreement with Intuit, and nothing in these terms modifies it.",
  ),
  p(
    "The Portal depends on third-party services, including Intuit’s. We are not responsible for their availability, accuracy or changes to them. If a third-party service changes or withdraws functionality, corresponding features of the Portal may change or stop working.",
  ),

  h2("6. Accuracy of information"),
  p(
    "Figures shown in the Portal are read from source systems such as QuickBooks Online and are only as accurate and as current as the underlying records. They reflect the bookkeeping as entered, which may be incomplete, unreconciled, or subject to adjustment.",
  ),
  p(
    bold(
      "Nothing in the Portal is a tax return, a financial statement, an audit, or professional advice.",
    ),
    " Its outputs — including estimates, projections, aggregates and category allocations — are working tools for qualified personnel and must not be relied on as a substitute for professional judgement, nor presented to a client or any third party as a final or filed figure.",
  ),

  h2("7. Confidentiality"),
  p(
    "All client information accessible through the Portal is confidential. Your obligations of confidentiality under your engagement with DeCypher, and under applicable professional standards, apply in full to everything you see here and continue after your access ends.",
  ),

  h2("8. Ownership"),
  p(
    "The Portal, including its software, design and content, is owned by DeCypher and protected by intellectual property law. These terms grant a limited, personal, non-transferable, revocable right to use the Portal for authorised business purposes only. No other rights are granted.",
  ),
  p("Client data remains the property of the client."),

  h2("9. Availability"),
  p(
    "The Portal is provided on an “as is” and “as available” basis. We do not warrant that it will be uninterrupted, error-free, or that data shown will be complete or current. We may modify, suspend or discontinue any part of it at any time.",
  ),

  h2("10. Limitation of liability"),
  p(
    "To the fullest extent permitted by law, DeCypher will not be liable for any indirect, incidental, special, consequential or punitive damages, or for any loss of profits, revenue, data or goodwill, arising out of use of the Portal. Nothing in these terms limits liability that cannot be limited by law.",
  ),

  h2("11. Changes to these terms"),
  p(
    "We may update these terms. Where changes are material we will notify authorised users. Continued use after an update constitutes acceptance.",
  ),

  h2("12. Governing law"),
  p(
    "These terms are governed by the laws of [STATE], without regard to its conflict of law rules. The courts located in [COUNTY, STATE] will have exclusive jurisdiction over any dispute arising from them.",
  ),

  h2("13. Contact"),
  p(bold("[LEGAL ENTITY NAME]")),
  p("[MAILING ADDRESS]"),
  p("[CONTACT EMAIL]"),
  p("See also our ", a("Portal Privacy Policy", "/legal/privacy"), "."),
];

// ── documents ───────────────────────────────────────────────────────

const docs = [
  {
    _id: "legalPrivacy",
    _type: "legalPage",
    title: "Portal Privacy Policy",
    slug: { current: "privacy" },
    effectiveDate: "[EFFECTIVE DATE]",
    seo: {
      title: "Portal Privacy Policy — DeCypher Financials",
      description:
        "How the DeCypher client portal handles staff account information and the client financial data it reads from QuickBooks Online.",
    },
    body: privacyBody,
  },
  {
    _id: "legalTerms",
    _type: "legalPage",
    title: "Portal Terms of Use",
    slug: { current: "terms" },
    eyebrow: "End-user licence agreement",
    effectiveDate: "[EFFECTIVE DATE]",
    seo: {
      title: "Portal Terms of Use — DeCypher Financials",
      description:
        "The end-user licence agreement governing authorised use of the DeCypher client portal.",
    },
    body: termsBody,
  },
];

const tx = client.transaction();
for (const doc of docs) tx.createIfNotExists(doc);
await tx.commit();

for (const doc of docs) {
  console.log(`✓ ${doc.title} → /legal/${doc.slug.current}`);
}
console.log(
  "\nExisting documents were left alone. Fill the [BRACKETED] blanks in Studio → Legal Pages.",
);
