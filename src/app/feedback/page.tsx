import FeedbackSurvey from "@/components/feedback/FeedbackSurvey";
import { readFeedbackLink } from "@/lib/feedback/links";
import { roundOf } from "@/lib/feedback/schema";
import { hasSubmitted } from "@/lib/feedback/store";

/**
 * The survey link, read on the server: which survey (`s`), whose it is, the
 * round, the team. See lib/feedback/links for the parameter contract — TaxDome
 * automations and already-sent emails depend on it.
 *
 * A link that names a client (cid) or a recap (rid) is checked against what's
 * already in before the page renders, so someone who's answered this round
 * lands straight on "you're all set" instead of a survey that would bounce
 * them at the end. A staff preview never is. A failed check renders the
 * survey: the send re-checks, and is the real gate.
 */
export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const link = readFeedbackLink((k) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  });

  let already = false;
  if (!link.preview && (link.cid || link.rid)) {
    try {
      already = await hasSubmitted(link.cid || null, link.rid || null, roundOf(link.kind, link.bq, link.ty));
    } catch (e) {
      console.error("[feedback] status check failed:", e);
    }
  }

  return <FeedbackSurvey link={link} already={already} />;
}
