import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import NeuralWeb from "@/components/effects/NeuralWeb";
import StatsSection from "@/components/home/StatsSection";
import Reveal from "@/components/reveal/Reveal";
import VideoWall from "@/components/thankyou/VideoWall";
import AutoplayVideo from "@/components/ui/AutoplayVideo";
import PageHeader from "@/components/ui/PageHeader";
import ScrollToTop from "@/components/ui/ScrollToTop";
import { withLiveStats } from "@/lib/quickbooks/public-stats";
import {
  getAllJobSlugs,
  getJobBySlug,
  getSiteSettings,
  getThankYouSharedSections,
  getVideoTestimonials,
} from "@/sanity/queries";

/**
 * Where an applicant lands the moment they submit (/careers/<slug>/thank-you).
 *
 * The top half is role-specific and comes from the job doc's "After you apply"
 * section; every field is optional and falls back to the built-in copy below,
 * so a role whose editor never opened that section still gets a real page —
 * the whole point is that the applicant knows exactly what happens next.
 *
 * The creator-video wall and the results stats close the page. The written
 * review carousel is deliberately NOT here — it's pitched at prospects
 * deciding whether to hire the firm, which isn't the question an applicant is
 * asking; the videos and the numbers say what the place is like to work at.
 * The wall's heading and its videos can be set per role, falling back to the
 * careers copy below / the Video Testimonials collection, so a role nobody has
 * configured still closes on something finished.
 */

// Safety net only — content updates land instantly via the Sanity webhook.
export const revalidate = 86400;

type Props = { params: Promise<{ slug: string }> };

/**
 * The video wall's careers copy. Deliberately NOT the shared Book a Call
 * heading the campaign thank-you pages use — that one is pitched at prospects
 * ("the receipts", "REAL CLIENTS. REAL RESULTS"), and an applicant is asking a
 * different question. Any of the three is overridable per role in the Studio.
 */
const WALL_DEFAULTS = {
  eyebrow: "[ the team ]",
  title: "Hear it from our team",
  sub: "// TAP A VIDEO TO PLAY.",
};

export async function generateStaticParams() {
  const slugs = await getAllJobSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const job = await getJobBySlug(slug);
  if (!job) return {};
  return {
    title: `Application received — ${job.title}`,
    // A post-submit page has no business in search results.
    robots: { index: false, follow: false },
  };
}

export default async function JobThankYouPage({ params }: Props) {
  const { slug } = await params;
  const job = await getJobBySlug(slug);
  if (!job) notFound();

  // Identical GROQ calls within one render are deduped by Next's fetch
  // memoization, so this costs the same as the campaign pages' own reads.
  const [settings, shared, sharedVideos] = await Promise.all([
    getSiteSettings().then(withLiveStats),
    getThankYouSharedSections(),
    getVideoTestimonials(),
  ]);

  const ty = job.thankYou;
  // No steps in the Studio means no section — not a stand-in list. An invented
  // hiring process is worse than none.
  const steps = ty?.steps ?? [];

  // Per-role video wall, falling back field by field rather than all-or-
  // nothing: setting just a title shouldn't cost you the eyebrow.
  const wall = ty?.videoWall;
  const wallVideos = wall?.videos?.length ? wall.videos : sharedVideos;
  const wallContent = {
    eyebrow: wall?.eyebrow || WALL_DEFAULTS.eyebrow,
    title: wall?.title || WALL_DEFAULTS.title,
    sub: wall?.sub || WALL_DEFAULTS.sub,
  };

  return (
    <main className="relative">
      {/* one continuous mesh from the header through the proof, fading out
          above whichever section closes the page — mirrors ThankYouTemplate */}
      <div className="relative z-[1]">
        <NeuralWeb
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 300px), transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 200px, #000 calc(100% - 300px), transparent 100%)",
          }}
        />

        <PageHeader
          eyebrow={`[ careers // ${job.department.toLowerCase()} ]`}
          title={ty?.title || "Application received."}
          sub={
            ty?.body ||
            `Thanks for applying for ${job.title}. Here’s exactly what happens from here.`
          }
        />

        {/* The video gets its OWN container at the same 960px the booking
            thank-you pages use, not the 760px reading column below it.
            YouTube picks its default quality from the player's rendered size,
            so a narrower frame doesn't just look smaller — it serves 360p. */}
        {ty?.videoUrl ? (
          <section className="relative z-[1] mx-auto max-w-[960px] px-4 md:px-6">
            <Reveal delay={0.5} amount={0.15} className="relative">
              <AutoplayVideo
                url={ty.videoUrl}
                title={`${job.title} — what happens next`}
                variant="hero"
              />
            </Reveal>
          </section>
        ) : null}

        <section
          className={`relative mx-auto w-full max-w-[760px] px-6 pb-16 ${
            ty?.videoUrl ? "pt-14" : ""
          }`}
        >
          {steps.length ? (
            <>
              <p className="m-0 mb-4 font-mono text-[11px] tracking-[0.22em] text-faint">
                {"// WHAT HAPPENS NEXT"}
              </p>
              <ol className="m-0 flex list-none flex-col gap-4 p-0">
                {steps.map((s, i) => (
                  <li
                    key={`${i}-${s.title}`}
                    className="flex gap-4 rounded-[16px] border border-edge bg-panel/60 px-5 py-4"
                  >
                    <span
                      aria-hidden
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-grad font-mono text-[13px] font-bold text-white"
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <h3 className="m-0 text-[15.5px] font-semibold leading-snug text-fog">
                        {s.title}
                      </h3>
                      {s.body ? (
                        <p className="m-0 mt-1 text-[14px] leading-relaxed text-mist">
                          {s.body}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : null}

          {/* The top margin belongs to the steps above it. Without steps the
              section's own pt already supplies the gap under the video, and
              keeping both stacks two gaps into one dead band. */}
          <div
            className={`flex flex-wrap items-center gap-4 ${
              steps.length ? "mt-12" : ""
            }`}
          >
            <Link
              href="/careers"
              className="rounded-full border border-white/15 px-5 py-2.5 font-mono text-[12px] uppercase tracking-[1.2px] text-mist no-underline transition-colors duration-150 hover:border-mist hover:text-fog"
            >
              ← Back to careers
            </Link>
            <Link
              href="/"
              className="font-mono text-[12px] uppercase tracking-[1.2px] text-faint no-underline transition-colors duration-150 hover:text-fog"
            >
              DeCypher home
            </Link>
          </div>
        </section>

        {/* Videos then numbers, no review carousel — see the note at the top.
            StatsSection brings its own bottom padding, so it can close the
            page the same way it does on the booking thank-you pages. */}
        <VideoWall content={wallContent} videos={wallVideos} />

        <StatsSection
          eyebrow={shared.statsSection?.eyebrow}
          title={shared.statsSection?.title}
          stats={settings?.stats ?? []}
        />
      </div>

      <ScrollToTop />
    </main>
  );
}
