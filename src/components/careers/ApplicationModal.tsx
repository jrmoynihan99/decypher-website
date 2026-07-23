"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { CmsJob } from "@/sanity/types";
import ApplicationForm from "./ApplicationForm";

/**
 * The apply form in a modal — chrome only (overlay, escape-to-close,
 * body-scroll-lock), scaffold lifted from the estimator's LeadModal. The form
 * itself lives in ApplicationForm, shared with the job detail page's inline
 * APPLICATION tab; this shell remains for job cards that predate the detail
 * pages (no slug to link to).
 */
export default function ApplicationModal({
  job,
  open,
  onClose,
}: {
  job: CmsJob;
  open: boolean;
  onClose: () => void;
}) {
  // lock body scroll + escape-to-close while open
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Guard runs before any portal call, and `open` is always false on the server,
  // so createPortal never touches document during SSR.
  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="am-title"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(6,4,10,0.72)] px-4 pb-6 pt-10 backdrop-blur-sm sm:pt-24"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-auto w-full max-w-[460px] rounded-[20px] border border-white/15 bg-panel p-7 shadow-[0_0_60px_-10px_rgba(255,45,120,0.4)]">
        <button
          onClick={onClose}
          aria-label="Close"
          className="float-right -mr-3 -mt-3 flex h-11 w-11 cursor-pointer items-center justify-center border-none bg-transparent p-0 text-[22px] leading-none text-faint hover:text-fog"
        >
          ×
        </button>
        <ApplicationForm job={job} variant="modal" autoFocus onDone={onClose} />
      </div>
    </div>,
    document.body,
  );
}
