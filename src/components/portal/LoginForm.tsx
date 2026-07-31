"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getAuthClient, isFirebaseConfigured } from "@/lib/firebase/client";
import {
  Eyebrow,
  FieldError,
  TextInput,
  btnPrimaryCls,
  fieldLabelCls,
} from "@/components/estimator/fields";

/**
 * Sign-in is a two-step handshake: Firebase in the browser turns the password
 * into an ID token, then our server turns that ID token into an httpOnly
 * session cookie. Only the cookie matters afterwards — so once it's minted we
 * sign the client SDK back out and let it forget everything. It exists here as
 * a token-minting device, nothing more.
 */
export default function LoginForm({
  next,
  notice = "",
}: {
  next: string;
  /** Why they're looking at this screen, when they didn't ask for it. */
  notice?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const clearErr = (field: string) =>
    setErrors((e) => (e[field] ? { ...e, [field]: false } : e));

  const submit = async () => {
    if (submitting) return;

    const errs: Record<string, boolean> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = true;
    if (!password) errs.password = true;
    setErrors(errs);
    setFormError("");
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const auth = getAuthClient();
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const idToken = await cred.user.getIdToken();

      const res = await fetch("/api/portal/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json().catch(() => ({}));

      // The cookie is the credential from here on; drop the client-side session.
      await signOut(auth).catch(() => {});

      if (!res.ok) {
        setFormError(data?.message || "Could not sign you in.");
        setSubmitting(false);
        return;
      }

      router.replace(next);
      router.refresh();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      // Never distinguish "no such account" from "wrong password" — that turns
      // the login box into a tool for discovering who works here.
      setFormError(
        code === "auth/too-many-requests"
          ? "Too many attempts. Wait a minute and try again."
          : code === "auth/invalid-api-key" || code === "auth/configuration-not-found"
            ? "The portal isn't configured correctly. Check the Firebase env vars."
            : "Email or password is incorrect.",
      );
      setSubmitting(false);
    }
  };

  // Config missing entirely — say so plainly rather than offering a form whose
  // only possible outcome is an error.
  if (!isFirebaseConfigured()) {
    return (
      <div className="w-full max-w-[420px] rounded-[22px] border border-white/10 bg-white/[0.045] p-8">
        <Eyebrow>Staff access</Eyebrow>
        <h1 className="mt-4 font-display text-2xl font-semibold text-fog">
          Portal not configured
        </h1>
        <p className="mt-2 text-sm text-muted">
          The <code className="font-mono text-[12px] text-mist">NEXT_PUBLIC_FIREBASE_*</code>{" "}
          environment variables are missing. See{" "}
          <code className="font-mono text-[12px] text-mist">docs/PORTAL.md</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-[420px] overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.045] p-7 backdrop-blur-xl sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-magenta/60 to-transparent"
      />

      <Eyebrow>Staff access</Eyebrow>
      <h1 className="mt-4 font-display text-2xl font-semibold text-fog">
        Sign in to the portal
      </h1>
      <p className="mt-2 text-sm text-muted">
        Accounts are issued by an admin. There&rsquo;s no self sign-up.
      </p>

      {/* Suppressed once they've actually tried — a failed attempt is the more
          useful thing to be reading. */}
      {notice && !formError ? (
        <div className="mt-5 rounded-[11px] border border-white/15 bg-white/[0.04] px-3 py-2.5 text-sm text-mist">
          {notice}
        </div>
      ) : null}

      <div className="mt-7">
        <label className={fieldLabelCls} htmlFor="p-email">
          Email
        </label>
        <TextInput
          id="p-email"
          type="email"
          autoComplete="username"
          placeholder="you@decypher.com"
          value={email}
          invalid={!!errors.email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearErr("email");
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <FieldError show={!!errors.email}>Enter a valid email address.</FieldError>
      </div>

      <div className="mt-5">
        <label className={fieldLabelCls} htmlFor="p-password">
          Password
        </label>
        <TextInput
          id="p-password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          invalid={!!errors.password}
          onChange={(e) => {
            setPassword(e.target.value);
            clearErr("password");
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <FieldError show={!!errors.password}>Enter your password.</FieldError>
      </div>

      {formError ? (
        <div className="mt-5 rounded-[11px] border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {formError}
        </div>
      ) : null}

      <button
        className={`${btnPrimaryCls} mt-7 disabled:cursor-default disabled:opacity-60`}
        onClick={submit}
        disabled={submitting}
      >
        {submitting ? "Signing in…" : "Sign in →"}
      </button>
    </div>
  );
}
