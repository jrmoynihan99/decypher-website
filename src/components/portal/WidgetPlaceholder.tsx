import { Eyebrow } from "@/components/estimator/fields";
import { NavIcon, type PortalWidget } from "@/components/portal/nav-items";

/**
 * Stand-in body for a tool that doesn't exist yet. Every tool page is this
 * until it's built, so the nav, the gate and the routing are all real and only
 * the contents are pending. Replace the call, not this file, when building one.
 */
export default function WidgetPlaceholder({
  widget,
  children,
}: {
  widget: PortalWidget;
  children?: React.ReactNode;
}) {
  return (
    <>
      <Eyebrow>Tool</Eyebrow>

      <div className="mt-4 flex items-center gap-3">
        <h1 className="font-display text-3xl font-semibold text-fog">
          {widget.name}
        </h1>
        <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[1.2px] text-dusk">
          Planned
        </span>
      </div>

      <p className="mt-2 max-w-xl text-sm text-muted">{widget.blurb}</p>

      {children ?? (
        <div className="mt-9 flex flex-col items-center justify-center rounded-[18px] border border-dashed border-white/12 bg-white/[0.02] px-6 py-16 text-center">
          <NavIcon d={widget.icon} className="!h-7 !w-7 text-faint" />
          <p className="mt-4 font-display text-base font-semibold text-mist">
            Nothing here yet
          </p>
          <p className="mt-1.5 max-w-sm text-sm text-dusk">{widget.blurb}</p>
          <p className="mt-5 font-mono text-[10.5px] uppercase tracking-[1.2px] text-faint">
            {widget.note}
          </p>
        </div>
      )}
    </>
  );
}
