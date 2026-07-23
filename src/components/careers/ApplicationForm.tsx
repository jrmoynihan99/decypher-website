"use client";

import { useEffect, useRef, useState } from "react";
import type { CmsJob } from "@/sanity/types";
import {
  Eyebrow,
  FieldError,
  TextInput,
  btnPrimaryCls,
  fieldLabelCls,
} from "@/components/estimator/fields";

/**
 * The apply form itself — header, fields, submit, and the success view —
 * shared by ApplicationModal (legacy slug-less cards) and the detail page's
 * inline APPLICATION tab. Containers provide only chrome (overlay/panel).
 *
 * Lightweight on purpose: name, email, a link, an optional note. To add a
 * field later, add an input here and a line to parseApplication in /api/apply
 * — see lib/application for the four-spot contract. `role`/`department` aren't
 * asked; they ride along from the job that rendered this.
 *
 * `variant` only tunes typography ("panel" sits in the wide dossier card,
 * "modal" in the narrow overlay); `idPrefix` keeps field ids unique should a
 * modal and an inline form ever share a document.
 */

// Mirrors of the route's checks — catch bad input before a round trip. The
// `<>|` exclusions match the server, which forbids them so these values can't
// break out of Slack's link syntax; see /api/apply.
const EMAIL_RE = /^[^\s@<>|]+@[^\s@<>|]+\.[^\s@<>|]+$/;
const URL_RE = /^https?:\/\/[^\s.<>|]+\.[^\s<>|]+$/i;

export default function ApplicationForm({
  job,
  variant = "modal",
  autoFocus = false,
  onDone,
}: {
  job: CmsJob;
  variant?: "modal" | "panel";
  /** Focus the name field on mount (the modal wants this; inline doesn't). */
  autoFocus?: boolean;
  /** The success view's Done button — close the modal / go back to overview. */
  onDone?: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const panel = variant === "panel";
  const idPrefix = panel ? "ap" : "am";
  const headingCls = panel
    ? "mb-1 mt-1 font-display text-[clamp(22px,2.6vw,28px)] font-semibold tracking-[-0.015em] text-fog"
    : "mb-1 mt-1 font-display text-[22px] font-semibold tracking-[-0.3px] text-fog";

  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => nameRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [autoFocus]);

  const clearErr = (field: string) =>
    setErrors((e) => (e[field] ? { ...e, [field]: false } : e));

  const submit = async () => {
    const errs: Record<string, boolean> = {};
    if (!name.trim()) errs.name = true;
    if (!EMAIL_RE.test(email.trim())) errs.email = true;
    if (!URL_RE.test(link.trim())) errs.link = true;
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    setFailure(null);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application: {
            role: job.title,
            department: job.department,
            name: name.trim(),
            email: email.trim(),
            link: link.trim(),
            message: message.trim(),
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setDone(true);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="py-2">
        <Eyebrow className="mb-2.5">Application received</Eyebrow>
        <h2 id={`${idPrefix}-title`} className={headingCls}>
          Thanks, {name.trim().split(" ")[0] || "there"}
          {" — we’ve got it."}
        </h2>
        <p className="mb-[22px] mt-0 text-sm text-mist">
          {"Your application for "}
          {job.title}
          {" is in front of our team. If it’s a fit, you’ll hear from us at "}
          {email.trim()}.
        </p>
        <button className={btnPrimaryCls} onClick={onDone}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div
      onKeyDown={(e) => {
        if (
          e.key === "Enter" &&
          (e.target as HTMLElement).tagName !== "BUTTON" &&
          (e.target as HTMLElement).tagName !== "TEXTAREA"
        ) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <Eyebrow className="mb-2.5">Apply · {job.department}</Eyebrow>
      <h2 id={`${idPrefix}-title`} className={headingCls}>
        {job.title}
      </h2>
      <p className="mb-[22px] mt-0 text-sm text-mist">
        Tell us who you are and where to look. A quick note on why this role
        never hurts.
      </p>

      <div className="mb-4">
        <label className={fieldLabelCls} htmlFor={`${idPrefix}-name`}>
          Name
        </label>
        <TextInput
          ref={nameRef}
          id={`${idPrefix}-name`}
          type="text"
          placeholder="Your name"
          value={name}
          invalid={!!errors.name}
          onChange={(e) => {
            setName(e.target.value);
            clearErr("name");
          }}
        />
        <FieldError show={!!errors.name}>Please enter your name.</FieldError>
      </div>

      <div className="mb-4">
        <label className={fieldLabelCls} htmlFor={`${idPrefix}-email`}>
          Email
        </label>
        <TextInput
          id={`${idPrefix}-email`}
          type="email"
          placeholder="you@example.com"
          value={email}
          invalid={!!errors.email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearErr("email");
          }}
        />
        <FieldError show={!!errors.email}>
          Please enter a valid email.
        </FieldError>
      </div>

      <div className="mb-4">
        <label className={fieldLabelCls} htmlFor={`${idPrefix}-link`}>
          LinkedIn, portfolio, or resume link
        </label>
        <TextInput
          id={`${idPrefix}-link`}
          type="url"
          inputMode="url"
          placeholder="https://linkedin.com/in/…"
          value={link}
          invalid={!!errors.link}
          onChange={(e) => {
            setLink(e.target.value);
            clearErr("link");
          }}
        />
        <FieldError show={!!errors.link}>
          Please enter a full URL starting with https://
        </FieldError>
      </div>

      <div className="mb-4">
        <label className={fieldLabelCls} htmlFor={`${idPrefix}-message`}>
          Anything you&rsquo;d like us to know{" "}
          <span className="font-normal normal-case tracking-normal text-dusk">
            (optional)
          </span>
        </label>
        <textarea
          id={`${idPrefix}-message`}
          rows={4}
          placeholder="A line or two on why this role."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full resize-y rounded-[11px] border border-white/15 bg-panel-2 px-3 py-[11px] font-body text-base text-fog outline-none transition-[border-color,box-shadow] duration-150 focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.22)]"
        />
      </div>

      {failure && <div className="mb-3 text-sm text-danger">{failure}</div>}

      <button className={btnPrimaryCls} disabled={busy} onClick={submit}>
        {busy ? "Sending…" : "Submit application →"}
      </button>
    </div>
  );
}
