import { SCHEDULE_URL } from "@/lib/content";

const SIZES = {
  sm: { spin: 260, label: "px-[22px] py-[11px]", text: "text-sm" },
  lg: { spin: 340, label: "px-[34px] py-[17px]", text: "text-[16.5px]" },
  xl: { spin: 380, label: "px-10 py-[18px]", text: "text-[17px]" },
} as const;

/**
 * The "encrypted core" CTA: a spinning conic gradient ring peeking out from
 * under a gradient pill. On hover the pill goes dark, the ring glows, and the
 * label becomes gradient-clipped text.
 */
export default function ConsultButton({
  size = "sm",
  href = SCHEDULE_URL,
  children = "Free Consultation",
}: {
  size?: keyof typeof SIZES;
  href?: string;
  children?: React.ReactNode;
}) {
  const s = SIZES[size];
  return (
    <a
      href={href}
      className={`group relative inline-block overflow-hidden rounded-full font-display font-semibold text-white no-underline transition-shadow duration-300 hover:shadow-[0_0_38px_rgba(139,43,232,0.5)] ${s.text}`}
    >
      <span
        aria-hidden
        className="absolute left-1/2 top-1/2 animate-spin-grad bg-[conic-gradient(#FF5C2E,#FF2D78,#8B2BE8,#FF2D78,#FF5C2E)]"
        style={{
          width: s.spin,
          height: s.spin,
          margin: `${-s.spin / 2}px 0 0 ${-s.spin / 2}px`,
        }}
      />
      <span
        aria-hidden
        className="absolute inset-[2px] rounded-full bg-grad transition-colors duration-300 group-hover:bg-none group-hover:bg-[#0D0C12]"
      />
      <span
        className={`relative inline-block transition-all duration-300 group-hover:bg-[linear-gradient(115deg,#FF5C2E,#FF2D78_45%,#B06CFF)] group-hover:bg-clip-text group-hover:text-transparent ${s.label}`}
      >
        {children}
      </span>
    </a>
  );
}
