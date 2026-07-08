import Image from "next/image";
import Reveal from "@/components/reveal/Reveal";
import ConsultButton from "@/components/ui/ConsultButton";
import SectionHeading from "@/components/ui/SectionHeading";
import Marquee from "@/components/ui/Marquee";
import { Creator, creatorHandle } from "@/lib/creators";
import type { SectionHeadingContent } from "@/sanity/types";

function RosterRow({
  row,
  reverse = false,
  className = "",
}: {
  row: Creator[];
  reverse?: boolean;
  className?: string;
}) {
  return (
    <Marquee
      duration={reverse ? 78 : 64}
      reverse={reverse}
      curve={20}
      scrollDrive
      className={`gap-4 md:gap-5 ${className}`}
    >
      {[...row, ...row].map((c, i) => (
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
  const rowA = creators.slice(0, 8);
  const rowB = creators.slice(8, 16);
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
        <RosterRow row={rowA} className="py-1.5" />
        <RosterRow row={rowB} reverse className="pb-1.5 pt-5" />
      </Reveal>
    </section>
  );
}
