"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Shared by this button (phone header) and the rail's Sign out row. */
export function useSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    await fetch("/api/portal/session", { method: "DELETE" }).catch(() => {});
    router.replace("/portal/login");
    router.refresh();
  };

  return { busy, signOut };
}

/** The phone header's way out. On desktop it's a row at the foot of the rail
 *  (RailSignOut), which has to fit the collapsed icon column. */
export default function SignOutButton({ className = "" }: { className?: string }) {
  const { busy, signOut } = useSignOut();

  return (
    <button
      onClick={signOut}
      disabled={busy}
      className={`cursor-pointer rounded-full border border-white/15 bg-transparent px-3.5 py-1.5 font-body text-[13px] text-mist transition-colors duration-150 hover:border-mist hover:text-fog disabled:cursor-default disabled:opacity-60 ${className}`}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
