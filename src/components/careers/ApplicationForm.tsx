"use client";

import { useEffect, useRef, useState } from "react";
import type { CmsJob } from "@/sanity/types";
import {
  Eyebrow,
  FieldError,
  PhoneInput,
  Select,
  TextInput,
  btnPrimaryCls,
  fieldLabelCls,
  formatPhoneString,
  optNoteCls,
} from "@/components/estimator/fields";
import {
  EMPLOYMENT_TYPES,
  EXPERIENCE_BANDS,
  HANDLED_OPTIONS,
  HEARD_ABOUT_OPTIONS,
  RESUME_EXTENSIONS,
  RESUME_MAX_BYTES,
  TOOL_OPTIONS,
} from "@/lib/application";
import { extractResumeGuess } from "@/lib/resume-autofill";

/**
 * The full application — resume upload, contact, role fit, tools, culture
 * questions, logistics, and the pre-submit compliance answers — shared by
 * ApplicationModal (legacy slug-less cards) and the detail page's inline
 * APPLICATION tab. Containers provide only chrome (overlay/panel).
 *
 * The resume leads the form on purpose: attaching a PDF autofills the contact
 * basics (lib/resume-autofill), which is the single biggest drop-off saver in
 * a form this long. Fields the applicant already typed are never overwritten.
 *
 * Submission is multipart — the Application fields as one JSON part, the file
 * beside them — matching /api/apply's parseApplication/parseResume pair. The
 * validation here mirrors the route's checks so bad input is caught before a
 * round trip, not instead of one.
 *
 * `variant` only tunes typography ("panel" sits in the wide dossier card,
 * "modal" in the narrow overlay); `idPrefix` keeps field ids unique should a
 * modal and an inline form ever share a document.
 */

// Mirrors of the route's checks. The `<>|` exclusions match the server, which
// forbids them so these values can't break out of Slack's link syntax.
const EMAIL_RE = /^[^\s@<>|]+@[^\s@<>|]+\.[^\s@<>|]+$/;
const URL_RE = /^https?:\/\/[^\s.<>|]+\.[^\s<>|]+$/i;

const blank = {
  name: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
  heardAbout: "",
  employmentType: "",
  experience: "",
  currentRole: "",
  desiredComp: "",
  startDate: "",
  tools: [] as string[],
  handled: [] as string[],
  whyUs: "",
  ownershipStory: "",
  boringWork: "",
  availability: "",
  remoteCameras: null as boolean | null,
  internet: null as boolean | null,
  backgroundCheck: null as boolean | null,
  workAuth: null as boolean | null,
  needsSponsorship: null as boolean | null,
  conflicts: "",
  message: "",
};
type Fields = typeof blank;

/** Top-to-bottom order, used to scroll to the first invalid field on submit. */
const FIELD_ORDER = [
  "resume",
  "name",
  "email",
  "phone",
  "location",
  "linkedin",
  "heardAbout",
  "employmentType",
  "experience",
  "desiredComp",
  "startDate",
  "whyUs",
  "ownershipStory",
  "boringWork",
  "availability",
  "remoteCameras",
  "internet",
  "backgroundCheck",
  "workAuth",
  "needsSponsorship",
] as const;

/* ---- small pieces shared across sections (module scope so their identity
   is stable across renders — inputs keep focus) ---- */

function TextArea({
  invalid,
  className = "",
  ...props
}: React.ComponentProps<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      {...props}
      className={`w-full resize-y rounded-[11px] border bg-panel-2 px-3 py-[11px] font-body text-base text-fog outline-none transition-[border-color,box-shadow] duration-150 focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.22)] ${
        invalid
          ? "border-danger shadow-[0_0_0_3px_rgba(255,107,122,0.18)]"
          : "border-white/15"
      } ${className}`}
    />
  );
}

function YesNo({
  value,
  onChange,
  invalid,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  invalid?: boolean;
}) {
  return (
    <div role="radiogroup" className="flex gap-2">
      {([true, false] as const).map((v) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`min-w-[74px] cursor-pointer rounded-full border px-4 py-2 font-body text-sm transition-colors duration-150 ${
            value === v
              ? "border-magenta bg-magenta/15 text-fog"
              : `bg-panel-2 text-mist hover:border-mist ${
                  invalid ? "border-danger/60" : "border-white/15"
                }`
          }`}
        >
          {v ? "Yes" : "No"}
        </button>
      ))}
    </div>
  );
}

function CheckGroup({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (o: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o)}
            className={`cursor-pointer rounded-full border px-3.5 py-2 text-left font-body text-[13px] leading-snug transition-colors duration-150 ${
              on
                ? "border-magenta bg-magenta/15 text-fog"
                : "border-white/15 bg-panel-2 text-mist hover:border-mist"
            }`}
          >
            {on ? "✓ " : ""}
            {o}
          </button>
        );
      })}
    </div>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-9 border-t border-edge pt-7">
      <p className="m-0 mb-5 font-mono text-[11px] tracking-[0.22em] text-faint">
        {`${n} // ${title}`}
      </p>
      {children}
    </section>
  );
}

const prettyBytes = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

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
  const [f, setF] = useState<Fields>(blank);
  const [resume, setResume] = useState<File | null>(null);
  const [autofillNote, setAutofillNote] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Mirror of `f` for the async autofill path — by the time a PDF has been
  // parsed, the closure's `f` is stale.
  const fRef = useRef(f);
  fRef.current = f;

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

  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    clearErr(k);
  };

  const toggle = (k: "tools" | "handled", o: string) =>
    setF((p) => ({
      ...p,
      [k]: p[k].includes(o) ? p[k].filter((x) => x !== o) : [...p[k], o],
    }));

  /** Accept a file, then (for PDFs) mine it to fill any still-empty basics. */
  const onFile = async (file: File | null) => {
    setAutofillNote(null);
    if (!file) return;
    const ext = RESUME_EXTENSIONS.some((e) => file.name.toLowerCase().endsWith(e));
    if (!ext || file.size > RESUME_MAX_BYTES || file.size === 0) {
      setResume(null);
      setErrors((e) => ({ ...e, resume: true }));
      return;
    }
    setResume(file);
    clearErr("resume");

    if (!file.name.toLowerCase().endsWith(".pdf")) return;
    setAutofillNote("Reading your resume…");
    const guess = await extractResumeGuess(file);
    if (!guess) {
      setAutofillNote(null);
      return;
    }
    // Only fill what's still empty — never overwrite something they typed.
    // The note is computed from the latest snapshot; the merge itself is a
    // functional update so a keystroke racing the parse can never be lost.
    const KEYS = ["name", "email", "phone", "location", "linkedin"] as const;
    const fillable = (prev: Fields) =>
      KEYS.filter((k) => guess[k] && !prev[k].trim());

    const filled = fillable(fRef.current);
    setF((prev) => {
      const next = { ...prev };
      for (const k of fillable(prev)) {
        next[k] = k === "phone" ? formatPhoneString(guess[k]!).out : guess[k]!;
      }
      return next;
    });
    setAutofillNote(
      filled.length
        ? `Autofilled ${filled
            .map((k) => (k === "linkedin" ? "LinkedIn" : k))
            .join(", ")} from your resume — double-check before submitting.`
        : null,
    );
  };

  const clearResume = () => {
    setResume(null);
    setAutofillNote(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const validate = () => {
    const errs: Record<string, boolean> = {};
    if (!resume) errs.resume = true;
    if (!f.name.trim()) errs.name = true;
    if (!EMAIL_RE.test(f.email.trim())) errs.email = true;
    if (f.phone.replace(/\D/g, "").length < 10) errs.phone = true;
    if (!f.location.trim()) errs.location = true;
    if (f.linkedin.trim() && !URL_RE.test(f.linkedin.trim())) errs.linkedin = true;
    if (!f.heardAbout) errs.heardAbout = true;
    if (!f.employmentType) errs.employmentType = true;
    if (!f.experience) errs.experience = true;
    if (!f.desiredComp.trim()) errs.desiredComp = true;
    if (!f.startDate.trim()) errs.startDate = true;
    if (!f.whyUs.trim()) errs.whyUs = true;
    if (!f.ownershipStory.trim()) errs.ownershipStory = true;
    if (!f.boringWork.trim()) errs.boringWork = true;
    if (!f.availability.trim()) errs.availability = true;
    for (const k of [
      "remoteCameras",
      "internet",
      "backgroundCheck",
      "workAuth",
      "needsSponsorship",
    ] as const) {
      if (f[k] === null) errs[k] = true;
    }
    return errs;
  };

  const submit = async () => {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).some((k) => errs[k])) {
      setFailure("Please fix the highlighted fields above.");
      const first = FIELD_ORDER.find((k) => errs[k]);
      if (first) {
        document
          .getElementById(`${idPrefix}-f-${first}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    setBusy(true);
    setFailure(null);
    try {
      const fd = new FormData();
      fd.append(
        "application",
        JSON.stringify({
          role: job.title,
          department: job.department,
          ...f,
          name: f.name.trim(),
          email: f.email.trim(),
          linkedin: f.linkedin.trim(),
        }),
      );
      if (resume) fd.append("resume", resume);

      const res = await fetch("/api/apply", { method: "POST", body: fd });
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
          Thanks, {f.name.trim().split(" ")[0] || "there"}
          {" — we’ve got it."}
        </h2>
        <p className="mb-[22px] mt-0 text-sm text-mist">
          {"Your application for "}
          {job.title}
          {" is in front of our team. If it’s a fit, you’ll hear from us at "}
          {f.email.trim()}.
        </p>
        <button className={btnPrimaryCls} onClick={onDone}>
          Done
        </button>
      </div>
    );
  }

  /* ---- tiny render helpers (plain functions, not components, so inputs
     aren't remounted — and keep focus — on every keystroke) ---- */

  const field = (
    k: string,
    label: React.ReactNode,
    control: React.ReactNode,
    error?: React.ReactNode,
    optional = false,
  ) => (
    <div className="mb-4" id={`${idPrefix}-f-${k}`}>
      <label className={fieldLabelCls} htmlFor={`${idPrefix}-${k}`}>
        {label} {optional && <span className={optNoteCls}>(optional)</span>}
      </label>
      {control}
      {error ? <FieldError show={!!errors[k]}>{error}</FieldError> : null}
    </div>
  );

  const yesNo = (
    k: "remoteCameras" | "internet" | "backgroundCheck" | "workAuth" | "needsSponsorship",
    question: string,
  ) => (
    <div className="mb-5" id={`${idPrefix}-f-${k}`}>
      <p className="mb-2.5 mt-0 font-body text-sm leading-relaxed text-mist">
        {question}
      </p>
      <YesNo value={f[k]} onChange={(v) => set(k, v)} invalid={!!errors[k]} />
      <FieldError show={!!errors[k]}>Please pick one.</FieldError>
    </div>
  );

  return (
    <div>
      <Eyebrow className="mb-2.5">Apply · {job.department}</Eyebrow>
      <h2 id={`${idPrefix}-title`} className={headingCls}>
        {job.title}
      </h2>
      <p className="mb-6 mt-0 text-sm leading-relaxed text-mist">
        The whole thing takes about ten minutes. Start with your resume — if
        it&rsquo;s a PDF we&rsquo;ll fill in your details for you.
      </p>

      {/* ── 01 · Resume ─────────────────────────────────────────────── */}
      <div className="mb-4" id={`${idPrefix}-f-resume`}>
        <label className={fieldLabelCls}>Resume (PDF or Word)</label>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        {resume ? (
          <div className="flex items-center gap-3 rounded-[11px] border border-white/15 bg-panel-2 px-3.5 py-[11px]">
            <span aria-hidden className="font-mono text-[11px] text-magenta">
              FILE
            </span>
            <span className="min-w-0 flex-1 truncate font-body text-sm text-fog">
              {resume.name}
            </span>
            <span className="flex-none font-mono text-[11px] text-dusk">
              {prettyBytes(resume.size)}
            </span>
            <button
              type="button"
              onClick={clearResume}
              aria-label="Remove resume"
              className="flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[16px] leading-none text-faint hover:text-fog"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer.files?.[0] ?? null);
            }}
            className={`w-full cursor-pointer rounded-[11px] border border-dashed bg-panel-2/60 px-4 py-7 text-center transition-colors duration-150 hover:border-magenta/70 ${
              errors.resume ? "border-danger/70" : "border-white/20"
            }`}
          >
            <span className="block font-body text-sm text-mist">
              Drop your resume here, or{" "}
              <span className="text-magenta">browse</span>
            </span>
            <span className="mt-1 block font-body text-xs text-dusk">
              PDF, DOC, or DOCX · 4MB max · PDFs autofill the form
            </span>
          </button>
        )}
        {autofillNote && (
          <div className="mt-1.5 text-xs text-teal">{autofillNote}</div>
        )}
        <FieldError show={!!errors.resume}>
          Please attach your resume — PDF or Word, 4MB max.
        </FieldError>
      </div>

      <Section n="02" title="BASICS & CONTACT">
        {field(
          "name",
          "Full name",
          <TextInput
            ref={nameRef}
            id={`${idPrefix}-name`}
            type="text"
            placeholder="Your name"
            value={f.name}
            invalid={!!errors.name}
            onChange={(e) => set("name", e.target.value)}
          />,
          "Please enter your name.",
        )}
        {field(
          "email",
          "Email",
          <TextInput
            id={`${idPrefix}-email`}
            type="email"
            placeholder="you@example.com"
            value={f.email}
            invalid={!!errors.email}
            onChange={(e) => set("email", e.target.value)}
          />,
          "Please enter a valid email.",
        )}
        <div className="grid gap-x-4 sm:grid-cols-2">
          {field(
            "phone",
            "Phone",
            <PhoneInput
              id={`${idPrefix}-phone`}
              value={f.phone}
              placeholder="(555) 123-4567"
              invalid={!!errors.phone}
              onChange={(v) => set("phone", v)}
            />,
            "Please enter a valid phone number.",
          )}
          {field(
            "location",
            "City & state",
            <TextInput
              id={`${idPrefix}-location`}
              type="text"
              placeholder="Austin, TX"
              value={f.location}
              invalid={!!errors.location}
              onChange={(e) => set("location", e.target.value)}
            />,
            "Where are you based?",
          )}
        </div>
        {field(
          "linkedin",
          "LinkedIn or portfolio",
          <TextInput
            id={`${idPrefix}-linkedin`}
            type="url"
            inputMode="url"
            placeholder="https://linkedin.com/in/…"
            value={f.linkedin}
            invalid={!!errors.linkedin}
            onChange={(e) => set("linkedin", e.target.value)}
          />,
          "Please enter a full URL starting with https://",
          true,
        )}
        {field(
          "heardAbout",
          "How did you hear about us?",
          <Select
            id={`${idPrefix}-heardAbout`}
            value={f.heardAbout}
            invalid={!!errors.heardAbout}
            onChange={(e) => set("heardAbout", e.target.value)}
          >
            <option value="" disabled>
              Select one
            </option>
            {HEARD_ABOUT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>,
          "Please pick one.",
        )}
      </Section>

      <Section n="03" title="ROLE FIT & BACKGROUND">
        <div className="grid gap-x-4 sm:grid-cols-2">
          {field(
            "employmentType",
            "Desired employment type",
            <Select
              id={`${idPrefix}-employmentType`}
              value={f.employmentType}
              invalid={!!errors.employmentType}
              onChange={(e) => set("employmentType", e.target.value)}
            >
              <option value="" disabled>
                Select one
              </option>
              {EMPLOYMENT_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>,
            "Please pick one.",
          )}
          {field(
            "experience",
            "Years of relevant experience",
            <Select
              id={`${idPrefix}-experience`}
              value={f.experience}
              invalid={!!errors.experience}
              onChange={(e) => set("experience", e.target.value)}
            >
              <option value="" disabled>
                Select one
              </option>
              {EXPERIENCE_BANDS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>,
            "Please pick one.",
          )}
        </div>
        {field(
          "currentRole",
          "Current role & company",
          <TextInput
            id={`${idPrefix}-currentRole`}
            type="text"
            placeholder="Senior Accountant at …"
            value={f.currentRole}
            onChange={(e) => set("currentRole", e.target.value)}
          />,
          undefined,
          true,
        )}
        <div className="grid gap-x-4 sm:grid-cols-2">
          {field(
            "desiredComp",
            "Desired compensation",
            <TextInput
              id={`${idPrefix}-desiredComp`}
              type="text"
              placeholder="$70–85k, open to discussion"
              value={f.desiredComp}
              invalid={!!errors.desiredComp}
              onChange={(e) => set("desiredComp", e.target.value)}
            />,
            "A range is fine.",
          )}
          {field(
            "startDate",
            "Earliest start date",
            <TextInput
              id={`${idPrefix}-startDate`}
              type="text"
              placeholder="Two weeks from offer"
              value={f.startDate}
              invalid={!!errors.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />,
            "When could you start?",
          )}
        </div>
      </Section>

      <Section n="04" title="SKILLS & TOOLS">
        <div className="mb-5">
          <label className={fieldLabelCls}>
            Tools you&rsquo;ve used professionally{" "}
            <span className={optNoteCls}>(check all that apply)</span>
          </label>
          <CheckGroup
            options={TOOL_OPTIONS}
            selected={f.tools}
            onToggle={(o) => toggle("tools", o)}
          />
        </div>
        <div className="mb-1">
          <label className={fieldLabelCls}>
            You&rsquo;ve personally handled, end to end{" "}
            <span className={optNoteCls}>(check all that apply)</span>
          </label>
          <CheckGroup
            options={HANDLED_OPTIONS}
            selected={f.handled}
            onToggle={(o) => toggle("handled", o)}
          />
        </div>
      </Section>

      <Section n="05" title="CULTURE & BEHAVIOR">
        {field(
          "whyUs",
          "Why do you want to work at DeCypher specifically?",
          <TextArea
            id={`${idPrefix}-whyUs`}
            rows={4}
            placeholder="3–6 sentences."
            value={f.whyUs}
            invalid={!!errors.whyUs}
            onChange={(e) => set("whyUs", e.target.value)}
          />,
          "This one matters to us — a few sentences, please.",
        )}
        {field(
          "ownershipStory",
          "A time you took ownership of a problem and saw it through",
          <TextArea
            id={`${idPrefix}-ownershipStory`}
            rows={4}
            placeholder="What was the problem, what did you do, how did it end?"
            value={f.ownershipStory}
            invalid={!!errors.ownershipStory}
            onChange={(e) => set("ownershipStory", e.target.value)}
          />,
          "Tell us the story — a few sentences, please.",
        )}
        {field(
          "boringWork",
          "Our value is “do the boring work.” What does that mean to you?",
          <TextArea
            id={`${idPrefix}-boringWork`}
            rows={3}
            placeholder="In your day-to-day, concretely."
            value={f.boringWork}
            invalid={!!errors.boringWork}
            onChange={(e) => set("boringWork", e.target.value)}
          />,
          "A couple of sentences, please.",
        )}
      </Section>

      <Section n="06" title="LOGISTICS">
        {field(
          "availability",
          "Typical weekly availability",
          <TextInput
            id={`${idPrefix}-availability`}
            type="text"
            placeholder="Mon–Fri, 9am–5pm CT"
            value={f.availability}
            invalid={!!errors.availability}
            onChange={(e) => set("availability", e.target.value)}
          />,
          "Days and time blocks, in your time zone.",
        )}
        {yesNo(
          "remoteCameras",
          "Are you comfortable working remotely, with cameras on for key calls?",
        )}
        {yesNo("internet", "Do you have reliable high-speed internet?")}
        {yesNo(
          "backgroundCheck",
          "Are you comfortable with a background check and signing an NDA?",
        )}
      </Section>

      <Section n="07" title="BEFORE YOU SUBMIT">
        {yesNo(
          "workAuth",
          "Are you currently authorized to work in the U.S. without sponsorship?",
        )}
        {yesNo(
          "needsSponsorship",
          "Will you now or in the future require sponsorship for employment (e.g. H-1B, O-1, TN, E-3)?",
        )}
        {field(
          "conflicts",
          "Any professional commitments that might conflict with your work at DeCypher?",
          <TextArea
            id={`${idPrefix}-conflicts`}
            rows={2}
            placeholder="Other clients, a notice period, a side business…"
            value={f.conflicts}
            onChange={(e) => set("conflicts", e.target.value)}
          />,
          undefined,
          true,
        )}
        {field(
          "message",
          "Anything else you'd like us to know",
          <TextArea
            id={`${idPrefix}-message`}
            rows={3}
            placeholder="Whatever didn't fit above."
            value={f.message}
            onChange={(e) => set("message", e.target.value)}
          />,
          undefined,
          true,
        )}
      </Section>

      {failure && <div className="mb-3 mt-2 text-sm text-danger">{failure}</div>}

      <button
        className={`${btnPrimaryCls} mt-2`}
        disabled={busy}
        onClick={submit}
      >
        {busy ? "Sending…" : "Submit application →"}
      </button>
    </div>
  );
}
