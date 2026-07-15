import type { StaffSession } from "@/lib/firebase/session";
import SignOutButton from "@/components/portal/SignOutButton";

/** Who you are + the way out, pinned to the foot of the rail. */
export default function SidebarUser({ session }: { session: StaffSession }) {
  const label = session.displayName || session.email;

  // First letters of the first two words — "Jason Moynihan" -> JM. Falls back to
  // the email's first character for accounts created without a name.
  const initials =
    session.displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || session.email[0]?.toUpperCase() || "?";

  return (
    <div className="p-3">
      <div className="flex items-center gap-2.5 px-1 py-1">
        <div
          aria-hidden
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-grad font-display text-[11px] font-bold text-white"
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-body text-[13px] leading-tight text-fog">
            {label}
          </div>
          <div className="font-mono text-[9.5px] uppercase tracking-[1.2px] text-dusk">
            {session.role}
          </div>
        </div>
      </div>

      <SignOutButton className="mt-2.5 w-full" />
    </div>
  );
}
