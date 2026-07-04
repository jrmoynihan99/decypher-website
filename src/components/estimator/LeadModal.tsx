"use client";

import { useEffect, useRef, useState } from "react";
import {
  Eyebrow,
  FieldError,
  PhoneInput,
  Select,
  TextInput,
  btnPrimaryCls,
  fieldLabelCls,
} from "./fields";

export const CONSENT_TEXT =
  "I understand this is an estimate, not tax advice, and agree to be contacted by DeCypher Financials about my taxes.";

export interface Lead {
  name: string;
  email: string;
  phone: string;
  isCreator: boolean;
  platform: string;
  username: string;
  revenueBand: string;
  consent: true;
  consentText: string;
}

/**
 * Lead-capture modal gating the recommendations. Creator-specific fields
 * (channel / handle / revenue band) only appear once a creator has entered a
 * complete phone number.
 */
export default function LeadModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (lead: Lead) => void;
}) {
  const [creator, setCreator] = useState<"yes" | "no" | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [platform, setPlatform] = useState("");
  const [username, setUsername] = useState("");
  const [band, setBand] = useState("");
  const [consent, setConsent] = useState(false);
  const [shownCreatorFields, setShownCreatorFields] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const nameRef = useRef<HTMLInputElement>(null);

  const creatorFieldsVisible = creator === "yes" && shownCreatorFields;

  // reveal channel/username only once a creator has a full phone number
  const syncCreatorFields = (nextCreator: typeof creator, nextPhone: string) => {
    if (nextCreator !== "yes") setShownCreatorFields(false);
    else if (nextPhone.replace(/\D/g, "").length >= 10)
      setShownCreatorFields(true);
  };

  // lock body scroll + focus + escape-to-close while open
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => nameRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const clearErr = (field: string) =>
    setErrors((e) => (e[field] ? { ...e, [field]: false } : e));

  const submit = () => {
    const errs: Record<string, boolean> = {};
    if (!creator) errs.creator = true;
    if (!name.trim()) errs.name = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = true;
    if (phone.replace(/\D/g, "").length < 10) errs.phone = true;
    if (creator === "yes" && creatorFieldsVisible) {
      if (!platform) errs.platform = true;
      if (!username.trim()) errs.username = true;
      if (!band) errs.band = true;
    }
    if (!consent) errs.consent = true;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const isCreator = creator === "yes";
    onSubmit({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      isCreator,
      platform: isCreator ? platform : "",
      username: isCreator ? username.trim() : "",
      revenueBand: isCreator ? band : "",
      consent: true,
      consentText: CONSENT_TEXT,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-title"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(6,4,10,0.72)] px-4 pb-6 pt-24 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON") {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div className="mx-auto w-full max-w-[460px] rounded-[20px] border border-white/15 bg-panel p-7 shadow-[0_0_60px_-10px_rgba(255,45,120,0.4)]">
        <button
          onClick={onClose}
          aria-label="Close"
          className="float-right cursor-pointer border-none bg-transparent p-0 text-[22px] leading-none text-faint hover:text-fog"
        >
          ×
        </button>
        <Eyebrow className="mb-2.5">Unlock your recommendations</Eyebrow>
        <h2
          id="lead-title"
          className="mb-1 mt-1 font-display text-[22px] font-semibold tracking-[-0.3px] text-fog"
        >
          We will email you your recommendations
        </h2>
        <p className="mb-[22px] mt-0 text-sm text-mist">
          Enter your details and we&rsquo;ll reveal what&rsquo;s driving your
          number, the strategies that could reduce it, and email you a copy.
        </p>

        <div className="mb-4">
          <label className={fieldLabelCls}>
            Are you a creator or content-based business?
          </label>
          <div className="flex gap-2.5">
            {(["yes", "no"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setCreator(v);
                  syncCreatorFields(v, phone);
                  clearErr("creator");
                }}
                className={`flex-1 cursor-pointer rounded-[11px] border p-[13px] font-display text-[15px] font-semibold transition-colors duration-150 ${
                  creator === v
                    ? "bg-grad border-transparent text-white"
                    : `bg-panel-2 text-mist hover:text-fog ${
                        errors.creator ? "border-danger" : "border-white/15 hover:border-mist"
                      }`
                }`}
              >
                {v === "yes" ? "Yes" : "No"}
              </button>
            ))}
          </div>
          <FieldError show={!!errors.creator}>Please choose one.</FieldError>
        </div>

        <div className="mb-4">
          <label className={fieldLabelCls} htmlFor="l-name">
            Name
          </label>
          <TextInput
            ref={nameRef}
            id="l-name"
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
          <label className={fieldLabelCls} htmlFor="l-email">
            Email
          </label>
          <TextInput
            id="l-email"
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
          <label className={fieldLabelCls} htmlFor="l-phone">
            Phone
          </label>
          <PhoneInput
            id="l-phone"
            placeholder="(555) 123-4567"
            value={phone}
            invalid={!!errors.phone}
            onChange={(v) => {
              setPhone(v);
              syncCreatorFields(creator, v);
              clearErr("phone");
            }}
          />
          <FieldError show={!!errors.phone}>
            Please enter a valid phone number.
          </FieldError>
        </div>

        {creatorFieldsVisible && (
          <>
            <div className="mb-4">
              <label className={fieldLabelCls} htmlFor="l-platform">
                Primary channel
              </label>
              <Select
                id="l-platform"
                value={platform}
                invalid={!!errors.platform}
                onChange={(e) => {
                  setPlatform(e.target.value);
                  clearErr("platform");
                }}
              >
                <option value="" disabled>
                  Select one
                </option>
                <option>YouTube</option>
                <option>TikTok</option>
                <option>Instagram</option>
                <option>Twitch</option>
                <option>Service-based</option>
              </Select>
              <FieldError show={!!errors.platform}>
                Please choose your primary channel.
              </FieldError>
            </div>
            <div className="mb-4">
              <label className={fieldLabelCls} htmlFor="l-username">
                Username / handle
              </label>
              <TextInput
                id="l-username"
                type="text"
                placeholder="@yourhandle"
                value={username}
                invalid={!!errors.username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  clearErr("username");
                }}
              />
              <FieldError show={!!errors.username}>
                Please enter your username.
              </FieldError>
            </div>
            <div className="mb-4">
              <label className={fieldLabelCls} htmlFor="l-band">
                Current annual revenue
              </label>
              <Select
                id="l-band"
                value={band}
                invalid={!!errors.band}
                onChange={(e) => {
                  setBand(e.target.value);
                  clearErr("band");
                }}
              >
                <option value="" disabled>
                  Select a range
                </option>
                <option>50–100k</option>
                <option>100–250k</option>
                <option>250–500k</option>
                <option>500k+</option>
              </Select>
              <FieldError show={!!errors.band}>
                Please select a range.
              </FieldError>
            </div>
          </>
        )}

        <div className="mb-4 flex items-start gap-[11px]">
          <input
            type="checkbox"
            id="l-consent"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              clearErr("consent");
            }}
            className="mt-px h-[19px] w-[19px] flex-none accent-magenta"
          />
          <label
            htmlFor="l-consent"
            className="cursor-pointer text-sm leading-[1.45] text-mist"
          >
            {CONSENT_TEXT}
          </label>
        </div>
        {errors.consent && (
          <div className="-mt-2 mb-3 text-xs text-danger">
            Please confirm to continue.
          </div>
        )}

        <button className={btnPrimaryCls} onClick={submit}>
          Show me my breakdown →
        </button>
      </div>
    </div>
  );
}
