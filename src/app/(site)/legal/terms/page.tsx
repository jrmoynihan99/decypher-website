import Link from "next/link";
import { Fill, H1, H2, P, UL, Updated } from "@/components/legal/prose";

export const metadata = {
  title: "Portal Terms of Use — DeCypher Financials",
  description:
    "The end-user licence agreement governing authorised use of the DeCypher client portal.",
  robots: { index: true, follow: true },
};

/**
 * The end-user licence agreement Intuit's app assessment asks for.
 *
 * Written for what this actually is: an internal tool used by DeCypher's own
 * staff, not a public application that clients install. That scoping matters —
 * a marketplace-style EULA aimed at consumers would misdescribe the
 * relationship, and the accuracy disclaimer below is the clause that carries the
 * most weight for an accounting firm.
 */
export default function PortalTermsPage() {
  return (
    <>
      <H1>Portal Terms of Use</H1>
      <Updated>
        End-user licence agreement · Effective <Fill>[EFFECTIVE DATE]</Fill>
      </Updated>

      <P>
        These terms govern use of the <strong className="text-fog">DeCypher client
        portal</strong>{" "}(the &ldquo;Portal&rdquo;), software operated by{" "}
        <Fill>[LEGAL ENTITY NAME]</Fill>{" "}(&ldquo;DeCypher&rdquo;, &ldquo;we&rdquo;,
        &ldquo;us&rdquo;). By signing in you agree to them. If you do not agree, do not use
        the Portal.
      </P>

      <H2>1. What the Portal is</H2>
      <P>
        The Portal is an internal business application used by DeCypher personnel to
        deliver accounting, bookkeeping and advisory services. It is not a public product,
        is not sold or licensed to third parties, and is not available for self-service
        registration. Among other tools it includes Creator Finances, which displays client
        financial information read from QuickBooks Online.
      </P>

      <H2>2. Who may use it</H2>
      <P>
        Access is granted to named individuals authorised by DeCypher — employees,
        contractors and other personnel acting on our behalf. Accounts are personal. You
        may not share your credentials, allow anyone else to use your account, or use an
        account issued to someone else.
      </P>
      <P>
        You must notify us immediately if you believe your credentials have been
        compromised. We may suspend or terminate any account at any time, with or without
        notice, including immediately on the end of your engagement with DeCypher.
      </P>

      <H2>3. Acceptable use</H2>
      <P>You agree not to:</P>
      <UL>
        <li>
          Access client information you have no business reason to access, or use it for
          any purpose other than delivering services to that client.
        </li>
        <li>
          Copy, export, transmit or retain client financial information outside systems
          approved by DeCypher.
        </li>
        <li>
          Disclose client information to anyone not authorised to receive it, inside or
          outside DeCypher.
        </li>
        <li>
          Attempt to circumvent authentication, permissions or any other security control,
          or probe, scan or test the Portal&rsquo;s security.
        </li>
        <li>
          Reverse engineer, decompile, copy or create derivative works from the Portal, or
          make it available to any third party.
        </li>
        <li>Use the Portal in violation of any applicable law or professional standard.</li>
      </UL>

      <H2>4. Connecting client accounting systems</H2>
      <P>
        The Portal can connect to a client&rsquo;s QuickBooks Online company file. Before
        connecting any company you confirm that DeCypher holds the client&rsquo;s
        authorisation to access those records and that you are permitted to establish the
        connection on the firm&rsquo;s behalf.
      </P>
      <P>
        Connections are read-only. The Portal does not write to, alter or delete anything
        in a client&rsquo;s accounting records. A connection may be revoked at any time by
        DeCypher or by the client.
      </P>

      <H2>5. Intuit and other third-party services</H2>
      <P>
        QuickBooks Online is a product of Intuit Inc. DeCypher is not affiliated with,
        endorsed by, or acting as an agent of Intuit. Use of QuickBooks is governed by the
        client&rsquo;s own agreement with Intuit, and nothing in these terms modifies it.
      </P>
      <P>
        The Portal depends on third-party services, including Intuit&rsquo;s. We are not
        responsible for their availability, accuracy or changes to them. If a third-party
        service changes or withdraws functionality, corresponding features of the Portal
        may change or stop working.
      </P>

      <H2>6. Accuracy of information</H2>
      <P>
        Figures shown in the Portal are read from source systems such as QuickBooks Online
        and are only as accurate and as current as the underlying records. They reflect the
        bookkeeping as entered, which may be incomplete, unreconciled, or subject to
        adjustment.
      </P>
      <P>
        <strong className="text-fog">
          Nothing in the Portal is a tax return, a financial statement, an audit, or
          professional advice.
        </strong>{" "}
        Its outputs — including estimates, projections, aggregates and category
        allocations — are working tools for qualified personnel and must not be relied on
        as a substitute for professional judgement, nor presented to a client or any third
        party as a final or filed figure.
      </P>

      <H2>7. Confidentiality</H2>
      <P>
        All client information accessible through the Portal is confidential. Your
        obligations of confidentiality under your engagement with DeCypher, and under
        applicable professional standards, apply in full to everything you see here and
        continue after your access ends.
      </P>

      <H2>8. Ownership</H2>
      <P>
        The Portal, including its software, design and content, is owned by DeCypher and
        protected by intellectual property law. These terms grant a limited, personal,
        non-transferable, revocable right to use the Portal for authorised business
        purposes only. No other rights are granted.
      </P>
      <P>Client data remains the property of the client.</P>

      <H2>9. Availability</H2>
      <P>
        The Portal is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo;
        basis. We do not warrant that it will be uninterrupted, error-free, or that data
        shown will be complete or current. We may modify, suspend or discontinue any part
        of it at any time.
      </P>

      <H2>10. Limitation of liability</H2>
      <P>
        To the fullest extent permitted by law, DeCypher will not be liable for any
        indirect, incidental, special, consequential or punitive damages, or for any loss
        of profits, revenue, data or goodwill, arising out of use of the Portal. Nothing in
        these terms limits liability that cannot be limited by law.
      </P>

      <H2>11. Changes to these terms</H2>
      <P>
        We may update these terms. Where changes are material we will notify authorised
        users. Continued use after an update constitutes acceptance.
      </P>

      <H2>12. Governing law</H2>
      <P>
        These terms are governed by the laws of <Fill>[STATE]</Fill>, without regard to its
        conflict of law rules. The courts located in <Fill>[COUNTY, STATE]</Fill>{" "}will have
        exclusive jurisdiction over any dispute arising from them.
      </P>

      <H2>13. Contact</H2>
      <P>
        <Fill>[LEGAL ENTITY NAME]</Fill>
        <br />
        <Fill>[MAILING ADDRESS]</Fill>
        <br />
        <Fill>[CONTACT EMAIL]</Fill>
      </P>
      <P>
        See also our{" "}
        <Link href="/legal/privacy" className="text-magenta underline underline-offset-4">
          Portal Privacy Policy
        </Link>
        .
      </P>
    </>
  );
}
