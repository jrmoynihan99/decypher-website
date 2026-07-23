"use client";

import { useJobTabs } from "./JobTabs";

const SIZES = {
  sm: { spin: 260, label: "px-[22px] py-[11px]", text: "text-sm" },
  lg: { spin: 340, label: "px-[34px] py-[17px]", text: "text-[16.5px]" },
  xl: { spin: 380, label: "px-10 py-[18px]", text: "text-[17px]" },
} as const;

/**
 * The detail page's apply action: ConsultButton's "encrypted core" look
 * (spinning conic ring under a gradient pill) rebuilt as a real <button>.
 * Clicking it opens the APPLICATION tab in place of the overview and scrolls
 * the role file into view — must render inside JobTabsProvider.
 */
export default function ApplyCta({
  size = "lg",
  children = "Apply for this role",
}: {
  size?: keyof typeof SIZES;
  children?: React.ReactNode;
}) {
  const { openApplication } = useJobTabs();
  const s = SIZES[size];
  return (
    <button
      type="button"
      onClick={openApplication}
      className={`group relative inline-block cursor-pointer overflow-hidden rounded-full border-none bg-transparent p-0 font-display font-semibold text-white transition-shadow duration-300 hover:shadow-[0_0_38px_rgba(139,43,232,0.5)] ${s.text}`}
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
    </button>
  );
}
