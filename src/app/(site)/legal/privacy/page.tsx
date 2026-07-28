import Link from "next/link";
import { Fill, H1, H2, P, UL, Updated } from "@/components/legal/prose";

export const metadata = {
  title: "Portal Privacy Policy — DeCypher Financials",
  description:
    "How the DeCypher client portal handles staff account information and the client financial data it reads from QuickBooks Online.",
  robots: { index: true, follow: true },
};

/**
 * Privacy policy for the PORTAL, not the marketing site.
 *
 * Every factual claim here is written against what the code actually does — the
 * processors listed are the ones the app really calls, the security measures are
 * the ones actually implemented, and nothing asserts a deletion schedule that no
 * code enforces. If the implementation changes, this changes with it.
 */
export default function PortalPrivacyPage() {
  return (
    <>
      <H1>Portal Privacy Policy</H1>
      <Updated>
        Effective <Fill>[EFFECTIVE DATE]</Fill>
      </Updated>

      <P>
        This policy explains how <Fill>[LEGAL ENTITY NAME]</Fill>{" "}(&ldquo;DeCypher&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo;) handles information in the{" "}
        <strong className="text-fog">DeCypher client portal</strong>{" "}— the internal
        application our staff use to manage client work, including the Creator Finances
        tool that reads accounting data from QuickBooks Online.
      </P>
      <P>
        It covers the portal only. Our public marketing website is governed by the
        separate policy published at{" "}
        <a
          href="https://wedecypher.co/privacy-policy"
          className="text-magenta underline underline-offset-4"
        >
          wedecypher.co/privacy-policy
        </a>
        . Where the two overlap, this policy governs the portal.
      </P>

      <H2>Who this policy is about</H2>
      <P>
        The portal is not a consumer product and is not open to the public. It is used by
        authorised DeCypher personnel. Two groups of people are affected by it:
      </P>
      <UL>
        <li>
          <strong className="text-fog">Our staff</strong>, who hold portal accounts.
        </li>
        <li>
          <strong className="text-fog">Our clients</strong>, whose business financial
          records we process on their behalf as part of the bookkeeping and accounting
          services they have engaged us to provide.
        </li>
      </UL>
      <P>
        For client accounting records we act as a service provider to the client. We
        process those records to deliver the services they have engaged us for, and for no
        independent purpose of our own.
      </P>

      <H2>Information we handle</H2>
      <P>
        <strong className="text-fog">Staff account information.</strong>{" "}Name, work email
        address, the role and tool permissions assigned to the account, and authentication
        records. Sessions are maintained with a signed, HTTP-only cookie.
      </P>
      <P>
        <strong className="text-fog">Client accounting data from QuickBooks Online.</strong>{" "}
        Where a client&rsquo;s books are connected, we read their profit and loss report and
        their chart of accounts. In practice this means account names, account
        classifications, and the monetary totals posted to each account by month. We store
        the resulting summary so the portal does not have to query QuickBooks on every
        page view.
      </P>
      <P>
        <strong className="text-fog">Enquiries and submissions.</strong>{" "}Information
        people voluntarily send us through our website — such as contact details and the
        figures entered into our tax estimator, consultation bookings, and job
        applications including any documents attached to them.
      </P>
      <P>
        We do not use cookies or similar technologies in the portal for advertising,
        tracking, or profiling. The only cookie the portal sets is the one that keeps a
        signed-in staff member signed in.
      </P>

      <H2>How we use QuickBooks data</H2>
      <P>This section is deliberately specific, because it is the sensitive part.</P>
      <UL>
        <li>
          We request <strong className="text-fog">read-only accounting access</strong>. The
          application does not create, alter, or delete anything in a client&rsquo;s
          QuickBooks company file.
        </li>
        <li>
          We use the data to present each client&rsquo;s profit and loss — revenue streams,
          expense categories, operating profit and net profit — to our own staff, and to
          produce aggregate figures across our client base.
        </li>
        <li>
          We do <strong className="text-fog">not</strong>{" "}sell, rent, or licence QuickBooks
          data. We do not use it for advertising or marketing. We do not use it to train
          machine-learning models. We do not disclose one client&rsquo;s financial
          information to another client.
        </li>
        <li>
          Aggregate figures shown in the portal are visible only to authorised DeCypher
          staff and are never published or shared externally in a form that identifies an
          individual client.
        </li>
        <li>
          Access credentials issued by Intuit are encrypted before they are stored and are
          never exposed to a web browser.
        </li>
      </UL>

      <H2>Service providers</H2>
      <P>
        We use a small number of third-party providers to operate the portal. They process
        information only on our instructions and only to provide their service to us. They
        are not permitted to use it for their own purposes.
      </P>
      <UL>
        <li>
          <strong className="text-fog">Vercel</strong>{" "}— application hosting (United
          States).
        </li>
        <li>
          <strong className="text-fog">Google Firebase / Cloud Firestore</strong>{" "}—
          authentication and data storage (United States).
        </li>
        <li>
          <strong className="text-fog">Intuit</strong>{" "}— the source of the accounting data,
          accessed with the client company&rsquo;s authorisation.
        </li>
        <li>
          <strong className="text-fog">Resend</strong>{" "}— transactional email.
        </li>
        <li>
          <strong className="text-fog">Slack</strong>{" "}— internal notifications to our own
          team.
        </li>
        <li>
          <strong className="text-fog">Calendly</strong>{" "}— consultation scheduling.
        </li>
      </UL>
      <P>
        We may also disclose information where we are required to by law, or where it is
        necessary to establish or defend legal claims.
      </P>

      <H2>How we protect it</H2>
      <UL>
        <li>All traffic to and from the portal is encrypted in transit.</li>
        <li>
          QuickBooks access credentials are encrypted at rest with AES-256-GCM, using a key
          held outside the database.
        </li>
        <li>
          The database rejects all direct access from browsers. Every read and write goes
          through our server, which authenticates the request first.
        </li>
        <li>
          Portal access is per-person and per-tool: a staff member can only open the tools
          they have been granted. Sessions expire and can be revoked immediately.
        </li>
        <li>
          The QuickBooks connection holds read-only scope, so a compromise of the portal
          could not be used to alter a client&rsquo;s books.
        </li>
      </UL>
      <P>
        No system is perfectly secure, and we do not claim otherwise. We aim to apply
        protections appropriate to the sensitivity of financial records.
      </P>

      <H2>How long we keep it</H2>
      <P>
        We retain client accounting summaries for as long as the client relationship
        continues and thereafter for as long as we are required to keep records under
        applicable law and professional standards — currently <Fill>[RETENTION PERIOD]</Fill>.
        Staff account records are kept while the account is active and removed when it is
        closed.
      </P>
      <P>
        When a QuickBooks connection is disconnected, we revoke our access credentials with
        Intuit and delete our copy of them. Previously retrieved summaries are retained
        under the schedule above unless deletion is requested.
      </P>

      <H2>Your choices</H2>
      <P>
        A client may disconnect our access to their QuickBooks company at any time, either
        by asking us to do so or from within their own QuickBooks account. Disconnecting
        stops any further access immediately.
      </P>
      <P>
        You may ask us what information we hold about you, ask us to correct it, or ask us
        to delete it. Some information must be retained where law or professional
        obligations require it, and we will tell you if that applies. Contact us at{" "}
        <Fill>[CONTACT EMAIL]</Fill>.
      </P>
      <P>
        Depending on where you live you may have additional rights under laws such as the
        California Consumer Privacy Act. We do not sell personal information or share it
        for cross-context behavioural advertising.
      </P>

      <H2>Children</H2>
      <P>
        The portal is a business tool and is not directed to children. We do not knowingly
        collect information from anyone under 18 through it.
      </P>

      <H2>Changes</H2>
      <P>
        If we change this policy we will update the effective date above. Material changes
        affecting client data will be communicated directly rather than only posted here.
      </P>

      <H2>Contact</H2>
      <P>
        <Fill>[LEGAL ENTITY NAME]</Fill>
        <br />
        <Fill>[MAILING ADDRESS]</Fill>
        <br />
        <Fill>[CONTACT EMAIL]</Fill>
        <br />
        <Fill>[PHONE]</Fill>
      </P>
      <P>
        See also our <Link href="/legal/terms" className="text-magenta underline underline-offset-4">Portal Terms of Use</Link>.
      </P>
    </>
  );
}
