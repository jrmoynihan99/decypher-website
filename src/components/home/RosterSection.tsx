import Image from "next/image";
import Reveal from "@/components/reveal/Reveal";
import ConsultButton from "@/components/ui/ConsultButton";
import SectionHeading from "@/components/ui/SectionHeading";
import Marquee from "@/components/ui/Marquee";
import { Creator, creatorHandle } from "@/lib/creators";
import type { SectionHeadingContent } from "@/sanity/types";

/**
 * Minimum cards per half of the track. The marquee wraps on two identical
 * halves, so a half narrower than the viewport tears a gap open at the loop
 * point (~250px per card at md, i.e. 8 covers a 1920px screen — the density
 * this section has always run at). A shorter hand-picked list is repeated up
 * to this length first, so a thin selection reads as a tight loop rather than
 * a broken strip. Studio steers editors well past it — see
 * homePage.rosterCreators.
 */
const MIN_PER_HALF = 8;

function RosterRow({
  row,
  reverse = false,
  className = "",
}: {
  row: Creator[];
  reverse?: boolean;
  className?: string;
}) {
  const reps = row.length ? Math.ceil(MIN_PER_HALF / row.length) : 1;
  const half = Array.from({ length: reps }, () => row).flat();
  return (
    <Marquee
      duration={reverse ? 78 : 64}
      reverse={reverse}
      curve={20}
      scrollDrive
      className={`gap-4 md:gap-5 ${className}`}
    >
      {[...half, ...half].map((c, i) => (
        <div
          key={`${c.name}-${i}`}
          className="flex w-[164px] flex-none flex-col gap-3 md:w-[230px]"
        >
          <Image
            src={c.img}
            alt={c.name}
            width={230}
            height={280}
            className="block h-[200px] w-[164px] rounded-2xl border border-edge bg-panel object-cover object-[50%_20%] md:h-[280px] md:w-[230px]"
          />
          <div className="flex flex-col gap-[3px] px-1">
            <b className="font-display text-[15px] font-semibold text-fog">
              {c.name}
            </b>
            <span className="font-mono text-[11.5px] text-dusk">
              {creatorHandle(c)}
            </span>
          </div>
        </div>
      ))}
    </Marquee>
  );
}

export default function RosterSection({
  content,
  creators,
}: {
  content: SectionHeadingContent;
  creators: Creator[];
}) {
  // Split down the middle rather than a fixed 8/8: the list is curated in
  // Studio now, so any length has to divide into two balanced rows.
  const split = Math.ceil(creators.length / 2);
  const rowA = creators.slice(0, split);
  const rowB = creators.slice(split);
  return (
    <section id="roster" className="relative z-[1] pb-16 pt-10 md:pb-[130px]">
      <SectionHeading
        eyebrow={content.eyebrow ?? ""}
        title={content.title ?? ""}
        glowDuration={16}
      />
      <Reveal delay={0.2} className="mt-7 flex justify-center">
        <ConsultButton href="/creators" size="lg">Our Creators</ConsultButton>
      </Reveal>
      <Reveal
        amount={0.2}
        className="mt-8 overflow-hidden py-4 md:mt-11 md:py-8 md:[mask-image:linear-gradient(90deg,transparent,#000_7%,#000_93%,transparent)]"
      >
        {rowA.length ? <RosterRow row={rowA} className="py-1.5" /> : null}
        {rowB.length ? (
          <RosterRow row={rowB} reverse className="pb-1.5 pt-5" />
        ) : null}
      </Reveal>
    </section>
  );
}
