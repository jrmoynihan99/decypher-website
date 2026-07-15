import Link from "next/link";
import { requireSession } from "@/lib/firebase/session";
import { Eyebrow } from "@/components/estimator/fields";
import { NavIcon, PORTAL_WIDGETS } from "@/components/portal/nav-items";

export default async function PortalDashboard() {
  const session = await requireSession();
  const firstName = session.displayName.split(" ")[0] || "there";

  return (
    <>
      <Eyebrow>Dashboard</Eyebrow>
      <h1 className="mt-4 font-display text-3xl font-semibold text-fog">
        Welcome back, {firstName}.
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        The scaffolding is live — auth, sessions and staff accounts. The tools
        below are next.
      </p>

      <div className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {PORTAL_WIDGETS.map((widget) => (
          <Link
            key={widget.href}
            href={widget.href}
            className="group relative overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.03] p-6 no-underline transition-colors duration-150 hover:border-white/20 hover:bg-white/[0.05]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <NavIcon
                  d={widget.icon}
                  className="text-muted transition-colors duration-150 group-hover:text-magenta"
                />
                <h2 className="font-display text-lg font-semibold text-fog">
                  {widget.name}
                </h2>
              </div>
              <span className="flex-none rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[1.2px] text-dusk">
                Planned
              </span>
            </div>
            <p className="mt-2.5 text-sm text-mist">{widget.blurb}</p>
            <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[1.2px] text-faint">
              {widget.note}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
