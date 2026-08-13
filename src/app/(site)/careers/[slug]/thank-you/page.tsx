import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ClickToPlayVideo from "@/components/schedule/ClickToPlayVideo";
import PageHeader from "@/components/ui/PageHeader";
import { getAllJobSlugs, getJobBySlug } from "@/sanity/queries";

/**
 * Where an applicant lands the moment they submit (/careers/<slug>/thank-you).
 * Content comes from the job doc's "After you apply" section; every field is
 * optional and falls back to the built-in copy below, so a role whose editor
 * never opened that section still gets a real page — the whole point is that
 * the applicant knows exactly what happens next.
 */

// Safety net only — content updates land instantly via the Sanity webhook.
export const revalidate = 86400;

type Props = { params: Promise<{ slug: string }> };

const DEFAULT_STEPS: { title: string; body?: string }[] = [
  {
    title: "We read every application",
    body: "A real person on our team reviews what you sent — usually within a few business days.",
  },
  {
    title: "If it’s a fit, we reach out",
    body: "You’ll get an email from us to set up a first conversation. Keep an eye on your inbox — and your spam folder.",
  },
  {
    title: "Interviews, then an offer",
    body: "A short loop with the people you’d actually work with, and if we’re both in, an offer.",
  },
];

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

  const ty = job.thankYou;
  const steps = ty?.steps?.length ? ty.steps : DEFAULT_STEPS;

  return (
    <main className="relative">
      <PageHeader
        eyebrow={`[ careers // ${job.department.toLowerCase()} ]`}
        title={ty?.title || "Application received."}
        sub={
          ty?.body ||
          `Thanks for applying for ${job.title}. Here’s exactly what happens from here.`
        }
      />

      <section className="relative mx-auto w-full max-w-[760px] px-6 pb-24">
        {ty?.videoUrl ? (
          <div className="mb-10">
            <p className="m-0 mb-3 font-mono text-[11px] tracking-[0.22em] text-faint">
              {"// TRANSMISSION — WHILE YOU'RE HERE"}
            </p>
            <ClickToPlayVideo
              url={ty.videoUrl}
              title={`${job.title} — what happens next`}
              variant="hero"
            />
          </div>
        ) : null}

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

        <div className="mt-12 flex flex-wrap items-center gap-4">
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
    </main>
  );
}
