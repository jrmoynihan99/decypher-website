import Link from "next/link";
import { requireSession } from "@/lib/firebase/session";
import { Eyebrow } from "@/components/estimator/fields";
import { NavIcon, PORTAL_INBOX, PORTAL_WIDGETS } from "@/components/portal/nav-items";

export default async function PortalDashboard() {
  const session = await requireSession();
  const firstName = session.displayName.split(" ")[0] || "there";

  // Same filter as the sidebar: a tile you can't open is just a tease.
  const can = new Set(session.permissions);
  const widgets = [...PORTAL_INBOX, ...PORTAL_WIDGETS].filter((w) =>
    can.has(w.permission),
  );

  return (
    <>
      <Eyebrow>Dashboard</Eyebrow>
      <h1 className="mt-4 font-display text-3xl font-semibold text-fog">
        Welcome back, {firstName}.
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Leads and applications are live below. The tools are next.
      </p>

      <div className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {widgets.map((widget) => (
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
              <span
                className={`flex-none rounded-full border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[1.2px] ${
                  widget.live
                    ? "border-teal/40 text-teal"
                    : "border-white/10 text-dusk"
                }`}
              >
                {widget.live ? "Live" : "Planned"}
              </span>
            </div>
            <p className="mt-2.5 text-sm text-mist">{widget.blurb}</p>
            <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[1.2px] text-faint">
              {widget.note}
            </p>
          </Link>
        ))}
      </div>

      {widgets.length === 0 ? (
        <div className="mt-9 rounded-[18px] border border-dashed border-white/12 bg-white/[0.02] px-6 py-14 text-center text-sm text-dusk">
          Your account doesn&rsquo;t have any tabs enabled yet — ask an admin to
          grant you access.
        </div>
      ) : null}
    </>
  );
}
