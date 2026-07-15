"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Sits in two places: the sidebar footer on desktop, the header on phones —
 *  hence the className escape hatch rather than two components. */
export default function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    await fetch("/api/portal/session", { method: "DELETE" }).catch(() => {});
    router.replace("/portal/login");
    router.refresh();
  };

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
