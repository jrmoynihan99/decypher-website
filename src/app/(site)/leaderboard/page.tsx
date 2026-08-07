import type { Metadata } from "next";
import NeuralWeb from "@/components/effects/NeuralWeb";
import CtaSection from "@/components/home/CtaSection";
import StatsGrid from "@/components/home/StatsGrid";
import Reveal from "@/components/reveal/Reveal";
import SectionReveal from "@/components/reveal/SectionReveal";
import PageHeader from "@/components/ui/PageHeader";
import Readout from "@/components/ui/Readout";
import SectionHeading from "@/components/ui/SectionHeading";
import { HawaiiCard, HawaiiEmpty } from "@/components/leaderboard/HawaiiClub";
import LeaderRow from "@/components/leaderboard/LeaderRow";
import RiseList from "@/components/leaderboard/RiseList";
import { getLeaderboard } from "@/lib/sales/leaderboard";
import {
  HAWAII_THRESHOLD,
  PARTNER_REWARD,
  REFEREE_CREDIT,
  type LeaderboardEntry,
} from "@/lib/sales/leaderboard-types";
import { socialMetadata } from "@/lib/seo";
import { getLeaderboardPage } from "@/sanity/queries";

/**
 * The public referral leaderboard — the "Race to Hawaii".
 *
 * TWO SOURCES, cleanly split:
 *   Firestore  the standings. Who is on the board, how many referrals they
 *              closed, what they earned — aggregated live from the same
 *              `salesCalls` the portal's Referrals tab edits. Never editable
 *              in Sanity; an editable copy would immediately disagree.
 *   Sanity     the wrapper. Headings, copy, CTA, and the per-creator social
 *              post spotlights, matched to a row by name.
 *
 * Every Sanity field is optional and falls back to the copy below, so the page
 * renders correctly against an empty dataset — which is the state it ships in.
 *
 * ISR at 5 minutes: a deal closed mid-call shows up while the client is still
 * on the phone about it, without a Firestore read per pageview.
 */

export const revalidate = 300;

const FALLBACK = {
  eyebrow: "[ 01 // race to hawaii ]",
  title: "Referral Leaderboard",
  sub: `Every closed referral moves you up the board. The top ten make the cut — hit ${HAWAII_THRESHOLD} and you're on the plane to Hawaii.`,
  readout: `// **$${PARTNER_REWARD}** PER CLOSED REFERRAL · THE CREATOR YOU REFER GETS **$${REFEREE_CREDIT}** IN CREDIT`,
  hawaiiEyebrow: "[ 02 // the hawaii club ]",
  hawaiiTitle: "Hawaii Trip Unlocked",
  hawaiiSub: `Cleared ${HAWAII_THRESHOLD} closed referrals. Seat booked.`,
  standingsEyebrow: "[ 03 // standings ]",
  standingsTitle: "Top 10",
  standingsSub: "// RANKED BY CLOSED REFERRALS · UPDATED CONTINUOUSLY",
  riseEyebrow: "[ 04 // on the rise ]",
  riseTitle: "Creators on the Rise",
  riseSub:
    "Not in the top ten yet? Find your name and see exactly how far you are from the plane.",
  ctaTitle: "Know a creator who needs this?",
  ctaBody: `Send them our way. When they close, you earn $${PARTNER_REWARD} and they start with $${REFEREE_CREDIT} in credit — and your name moves up this page.`,
  ctaLabel: "Book a call",
  ctaReadout: `// HAWAII UNLOCKS AT ${HAWAII_THRESHOLD} CLOSED REFERRALS`,
};

export async function generateMetadata(): Promise<Metadata> {
  const page = await getLeaderboardPage();
  const title = page?.seo?.title ?? "Referral Leaderboard — DeCypher";
  const description =
    page?.seo?.description ??
    `Every closed referral moves you up the board. Hit ${HAWAII_THRESHOLD} and you're on the plane to Hawaii — the DeCypher creator referral program.`;
  return { title, description, ...socialMetadata({ title, description }) };
}

/**
 * Compact money for the stat tiles. StatsGrid splits a value on
 * /^(\D*)([\d.]+)(.*)$/ and rolls the numeric part up from zero — so a
 * comma-grouped "$50,210" would parse as 50 with a ",210" suffix and animate
 * through "$0,210". A compact "$50.2k" rolls correctly.
 */
function compactMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

/** Loose key so "MEGHAN LIM" in Sanity finds "Meghan Lim" on the board. */
const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

export default async function LeaderboardPage() {
  const [{ entries, totals }, page] = await Promise.all([
    getLeaderboard(),
    getLeaderboardPage(),
  ]);

  // Spotlights are authored against a display name because that's what an
  // editor can see on the page; the referrer's Firestore id is invisible to
  // them. Unmatched entries are simply inert.
  const spotlights = new Map(
    (page?.spotlights ?? [])
      .filter((s) => s.name && s.postUrl)
      .map((s) => [nameKey(s.name!), { postUrl: s.postUrl!, caption: s.caption }]),
  );
  const spotlightFor = (e: LeaderboardEntry) => spotlights.get(nameKey(e.name));

  // Qualifiers get their own section AND keep their place in the standings —
  // they earned the rank, and pulling them out would silently promote whoever
  // is 11th into a top ten they didn't finish in.
  const hawaii = entries.filter((e) => e.closed >= HAWAII_THRESHOLD);
  const top = entries.slice(0, 10);
  const rest = entries.slice(10);

  const h = page?.header;
  const hawaiiHead = page?.hawaiiSection;
  const standings = page?.standingsSection;
  const rise = page?.riseSection;

  return (
    <main className="relative">
      {/* One continuous mesh from the header through the standings, fading out
          above the closing CTA — the same grouping every sub-page uses. */}
      <div className="relative z-[1]">
        <NeuralWeb
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 280px), transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 280px), transparent 100%)",
          }}
        />

        <PageHeader
          eyebrow={h?.eyebrow ?? FALLBACK.eyebrow}
          title={h?.title ?? FALLBACK.title}
          titleMax="15ch"
          sub={h?.sub ?? FALLBACK.sub}
          readout={
            <Readout
              text={h?.readout ?? FALLBACK.readout}
              vars={{ reward: `$${PARTNER_REWARD}`, credit: `$${REFEREE_CREDIT}` }}
              blink
            />
          }
        />

        {/* headline numbers */}
        <section className="relative z-[1] mx-auto max-w-[1160px] px-4 pb-[30px] pt-[10px] md:px-6">
          <StatsGrid
            stats={[
              { value: String(totals.partners), label: "Creators on the board" },
              { value: String(totals.closed), label: "Referrals closed" },
              { value: compactMoney(totals.earned), label: "Paid to creators" },
              { value: String(totals.hawaii), label: "Hawaii unlocked" },
            ]}
            className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-[18px]"
          />
        </section>

        {/* the Hawaii club — its own section, ahead of the standings */}
        <section className="relative z-[1] mx-auto max-w-[1100px] px-6 pb-[80px] pt-[60px]">
          <SectionHeading
            eyebrow={hawaiiHead?.eyebrow ?? FALLBACK.hawaiiEyebrow}
            title={hawaiiHead?.title ?? FALLBACK.hawaiiTitle}
            sub={hawaiiHead?.sub ?? FALLBACK.hawaiiSub}
            subMono={(hawaiiHead?.sub ?? FALLBACK.hawaiiSub).trim().startsWith("//")}
          />
          {hawaii.length ? (
            <SectionReveal
              amount={0.1}
              // Grid sized to the count so one or two qualifiers sit centred
              // rather than stranded at the left of a three-column track.
              className={`mx-auto mt-12 grid gap-[18px] ${
                hawaii.length === 1 ? "max-w-[330px]"
                : hawaii.length === 2 ? "max-w-[690px] sm:grid-cols-2"
                : "max-w-[1040px] sm:grid-cols-2 lg:grid-cols-3"
              }`}
            >
              {hawaii.map((entry, i) => (
                <Reveal key={entry.id} delay={0.1 + Math.min(i * 0.1, 0.5)}>
                  <HawaiiCard entry={entry} />
                </Reveal>
              ))}
            </SectionReveal>
          ) : (
            <SectionReveal amount={0.1} className="mx-auto mt-12 max-w-[720px]">
              <Reveal delay={0.1}>
                <HawaiiEmpty body={page?.hawaiiEmpty} closest={entries[0] ?? null} />
              </Reveal>
            </SectionReveal>
          )}
        </section>

        {/* the chase */}
        <section className="relative z-[1] mx-auto max-w-[920px] px-6 pb-[90px] pt-[20px]">
          <SectionHeading
            eyebrow={standings?.eyebrow ?? FALLBACK.standingsEyebrow}
            title={standings?.title ?? FALLBACK.standingsTitle}
            sub={standings?.sub ?? FALLBACK.standingsSub}
            subMono={(standings?.sub ?? FALLBACK.standingsSub).trim().startsWith("//")}
          />
          {top.length ? (
            <SectionReveal amount={0.08} className="mt-12 flex flex-col gap-4">
              {top.map((entry, i) => (
                <Reveal key={entry.id} delay={0.1 + Math.min(i * 0.08, 0.5)}>
                  <LeaderRow entry={entry} spotlight={spotlightFor(entry)} />
                </Reveal>
              ))}
            </SectionReveal>
          ) : (
            <SectionReveal amount={0.1} className="mt-12">
              <Reveal delay={0.1}>
                <div className="rounded-[20px] border border-dashed border-edge-mid bg-panel/60 px-6 py-12 text-center">
                  <p className="m-0 font-mono text-[11px] tracking-[0.22em] text-faint">
                    {"// NO CLOSED REFERRALS ON RECORD"}
                  </p>
                  <p className="mx-auto mb-0 mt-4 max-w-[46ch] text-[15px] leading-relaxed text-muted">
                    The board fills itself the moment a referral closes. Nothing
                    to see here yet.
                  </p>
                </div>
              </Reveal>
            </SectionReveal>
          )}
        </section>

        {/* everyone else */}
        {rest.length ? (
          <section className="relative z-[1] mx-auto max-w-[920px] px-6 pb-[110px]">
            <SectionHeading
              eyebrow={rise?.eyebrow ?? FALLBACK.riseEyebrow}
              title={rise?.title ?? FALLBACK.riseTitle}
              sub={rise?.sub ?? FALLBACK.riseSub}
              subMono={(rise?.sub ?? FALLBACK.riseSub).trim().startsWith("//")}
            />
            <RiseList
              entries={rest}
              spotlights={Object.fromEntries(
                rest
                  .map((e) => [e.id, spotlightFor(e)] as const)
                  .filter(([, s]) => s != null),
              )}
            />
          </section>
        ) : null}
      </div>

      <CtaSection
        content={{
          title: page?.cta?.title ?? FALLBACK.ctaTitle,
          body: page?.cta?.body ?? FALLBACK.ctaBody,
          ctaLabel: page?.cta?.ctaLabel ?? FALLBACK.ctaLabel,
          ctaHref: page?.cta?.ctaHref,
          readout: page?.cta?.readout ?? FALLBACK.ctaReadout,
        }}
      />
    </main>
  );
}
