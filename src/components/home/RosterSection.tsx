import Image from "next/image";
import SectionHeading from "@/components/ui/SectionHeading";
import { Creator, creatorHandle, creators } from "@/lib/creators";

const ROW_A = creators.slice(0, 8);
const ROW_B = creators.slice(8, 16);

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
    <div
      className={`flex w-max gap-5 hover:[animation-play-state:paused] ${
        reverse ? "animate-marquee-rev" : "animate-marquee"
      } ${className}`}
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
    </div>
  );
}

export default function RosterSection() {
  return (
    <section id="roster" className="relative z-[1] pb-[130px] pt-10">
      <SectionHeading
        eyebrow="[ 04 // the roster ]"
        title="The creators we work with."
        sub={`// ${creators.length} records on file — browse the full database on Our Creators`}
        subMono
        glowDuration={16}
      />
      <div className="mt-[54px] overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_7%,#000_93%,transparent)]">
        <RosterRow row={ROW_A} className="py-1.5" />
        <RosterRow row={ROW_B} reverse className="pb-1.5 pt-5" />
      </div>
    </section>
  );
}
