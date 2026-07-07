import Image from "next/image";
import Reveal from "@/components/reveal/Reveal";
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
      curve={50}
      scrollDrive
      className={`gap-5 ${className}`}
    >
      {[...row, ...row].map((c, i) => (
        <div key={`${c.name}-${i}`} className="flex w-[230px] flex-none flex-col gap-3">
          <Image
            src={c.img}
            alt={c.name}
            width={230}
            height={280}
            className="block h-[280px] w-[230px] rounded-2xl border border-edge bg-panel object-cover object-[50%_20%]"
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
  totalCount,
}: {
  content: SectionHeadingContent;
  creators: Creator[];
  totalCount: number;
}) {
  const rowA = creators.slice(0, 8);
  const rowB = creators.slice(8, 16);
  return (
    <section id="roster" className="relative z-[1] pb-[130px] pt-10">
      <SectionHeading
        eyebrow={content.eyebrow ?? ""}
        title={content.title ?? ""}
        sub={content.sub?.replaceAll("{count}", String(totalCount))}
        subMono
        glowDuration={16}
      />
      <Reveal
        amount={0.2}
        className="mt-[54px] overflow-hidden py-8 [mask-image:linear-gradient(90deg,transparent,#000_7%,#000_93%,transparent)]"
      >
        <RosterRow row={rowA} className="py-1.5" />
        <RosterRow row={rowB} reverse className="pb-1.5 pt-5" />
      </Reveal>
    </section>
  );
}
