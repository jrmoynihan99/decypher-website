"use client";

import { useState } from "react";
import {
  FieldError,
  PhoneInput,
  Select,
  TextInput,
  btnPrimaryCls,
  fieldLabelCls,
} from "@/components/estimator/fields";
import DecryptOnView from "@/components/ui/DecryptOnView";
import { SERVICES_FIVE } from "@/lib/content";

/**
 * Booking-call form — front-end only for now. Submitting validates the two
 * required fields and flips the panel into a "transmission received"
 * confirmation; no network call is made yet. Field styling is shared with the
 * estimator's lead modal so forms feel identical across the site.
 */

const CHANNELS = [
  "YouTube",
  "TikTok",
  "Instagram",
  "Twitch",
  "Podcast",
  "UGC / Other",
];

const REVENUE_BANDS = ["Under 50k", "50–100k", "100–250k", "250–500k", "500k+"];

const textareaCls =
  "min-h-[110px] w-full resize-y rounded-[11px] border border-white/15 bg-panel-2 px-3 py-[11px] font-body text-base text-fog outline-none transition-[border-color,box-shadow] duration-150 focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.22)]";

export default function ScheduleForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState("");
  const [handle, setHandle] = useState("");
  const [band, setBand] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [refCode, setRefCode] = useState<string | null>(null);

  const clearErr = (field: string) =>
    setErrors((e) => (e[field] ? { ...e, [field]: false } : e));

  const toggleInterest = (title: string) =>
    setInterests((list) =>
      list.includes(title)
        ? list.filter((t) => t !== title)
        : [...list, title],
    );

  const submit = () => {
    const errs: Record<string, boolean> = {};
    if (!name.trim()) errs.name = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = true;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    // front-end only: mint a reference code and show the confirmation state
    setRefCode(
      `DCY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    );
  };

  const reset = () => {
    setRefCode(null);
    setName("");
    setEmail("");
    setPhone("");
    setChannel("");
    setHandle("");
    setBand("");
    setInterests([]);
    setMessage("");
    setErrors({});
  };

  return (
    <div className="relative w-full">
      <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.045] p-7 backdrop-blur-xl sm:p-8">
        {/* top edge glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,45,120,.55),rgba(139,43,232,.55),transparent)]"
        />

        {refCode ? (
          /* ---- confirmation state ---- */
          <div className="py-8 text-center">
            <p className="m-0 font-mono text-[11px] tracking-[0.3em] text-teal">
              ● CHANNEL OPEN
            </p>
            <DecryptOnView
              as="h3"
              text="Transmission received."
              threshold={0}
              className="mx-auto mt-4 font-display text-[clamp(26px,3.4vw,38px)] font-bold tracking-[-0.02em] text-fog"
            />
            <p className="mx-auto mt-4 max-w-[42ch] text-[15.5px] leading-relaxed text-mist">
              We&rsquo;ll reply within one business day to lock in a time.
              Keep an eye on your inbox.
            </p>
            <p className="mt-6 font-mono text-[11px] tracking-[0.18em] text-faint">
              {`// REF ${refCode}`}
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-7 cursor-pointer rounded-full border border-edge-bright bg-transparent px-6 py-3 font-mono text-[11px] tracking-[0.16em] text-mist transition-colors hover:border-magenta hover:text-magenta"
            >
              SEND ANOTHER →
            </button>
          </div>
        ) : (
          /* ---- form state ---- */
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={fieldLabelCls} htmlFor="s-name">
                  Name
                </label>
                <TextInput
                  id="s-name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  invalid={!!errors.name}
                  onChange={(e) => {
                    setName(e.target.value);
                    clearErr("name");
                  }}
                />
                <FieldError show={!!errors.name}>
                  Please enter your name.
                </FieldError>
              </div>
              <div>
                <label className={fieldLabelCls} htmlFor="s-email">
                  Email
                </label>
                <TextInput
                  id="s-email"
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
              <div>
                <label className={fieldLabelCls} htmlFor="s-phone">
                  Phone <span className="text-dusk">(optional)</span>
                </label>
                <PhoneInput
                  id="s-phone"
                  placeholder="(555) 123-4567"
                  value={phone}
                  onChange={setPhone}
                />
              </div>
              <div>
                <label className={fieldLabelCls} htmlFor="s-channel">
                  Primary channel
                </label>
                <Select
                  id="s-channel"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  <option value="" disabled>
                    Select one
                  </option>
                  {CHANNELS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className={fieldLabelCls} htmlFor="s-handle">
                  Username / handle
                </label>
                <TextInput
                  id="s-handle"
                  type="text"
                  placeholder="@yourhandle"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                />
              </div>
              <div>
                <label className={fieldLabelCls} htmlFor="s-band">
                  Annual revenue
                </label>
                <Select
                  id="s-band"
                  value={band}
                  onChange={(e) => setBand(e.target.value)}
                >
                  <option value="" disabled>
                    Select a range
                  </option>
                  {REVENUE_BANDS.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="mt-5">
              <label className={fieldLabelCls}>
                What do you need? <span className="text-dusk">(pick any)</span>
              </label>
              <div className="flex flex-wrap gap-2.5">
                {SERVICES_FIVE.map((svc) => {
                  const on = interests.includes(svc.title);
                  return (
                    <button
                      key={svc.num}
                      type="button"
                      onClick={() => toggleInterest(svc.title)}
                      aria-pressed={on}
                      className={`cursor-pointer rounded-full border px-4 py-2 font-mono text-[11px] tracking-[0.08em] transition-colors duration-200 ${
                        on
                          ? "border-magenta/55 bg-magenta/[.14] text-magenta"
                          : "border-white/15 bg-panel-2 text-muted hover:border-magenta/50 hover:text-mist"
                      }`}
                    >
                      {svc.title.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5">
              <label className={fieldLabelCls} htmlFor="s-message">
                Anything else? <span className="text-dusk">(optional)</span>
              </label>
              <textarea
                id="s-message"
                placeholder="Biggest money question, current setup, deadlines…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={textareaCls}
              />
            </div>

            <div className="mt-6">
              <button className={btnPrimaryCls} onClick={submit}>
                Request my call →
              </button>
            </div>
            <p className="mb-0 mt-4 text-center font-mono text-[10.5px] tracking-[0.14em] text-faint">
              {"// TAKES ~60 SECONDS. NO SPAM, NO SELLING YOUR DATA."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
