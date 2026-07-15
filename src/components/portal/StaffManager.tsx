"use client";

import { useState } from "react";
import type { StaffUser } from "@/lib/firebase/session";
import {
  FieldError,
  Select,
  TextInput,
  btnGhostCls,
  btnPrimaryCls,
  fieldLabelCls,
} from "@/components/estimator/fields";

/**
 * The whole account-provisioning surface. Creating a staff member mints a
 * passwordless Firebase account plus a one-time set-password link, which is
 * handed back here for the admin to copy into Slack. Nobody types anybody
 * else's password, and there's no signup route for outsiders to find.
 */
export default function StaffManager({
  initialStaff,
  currentUid,
}: {
  initialStaff: StaffUser[];
  currentUid: string;
}) {
  const [staff, setStaff] = useState(initialStaff);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyUid, setBusyUid] = useState("");
  const [invite, setInvite] = useState<{ email: string; link: string } | null>(null);

  const clearErr = (field: string) =>
    setErrors((e) => (e[field] ? { ...e, [field]: false } : e));

  const refresh = async () => {
    const res = await fetch("/api/portal/users");
    const data = await res.json().catch(() => ({}));
    if (data?.ok) setStaff(data.users);
  };

  const create = async () => {
    if (submitting) return;

    const errs: Record<string, boolean> = {};
    if (!name.trim()) errs.name = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = true;
    setErrors(errs);
    setFormError("");
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    const res = await fetch("/api/portal/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name.trim(), email: email.trim(), role }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (!res.ok) {
      setFormError(data?.message || "Could not create the account.");
      return;
    }

    setInvite({ email: email.trim(), link: data.inviteLink });
    setName("");
    setEmail("");
    setRole("staff");
    setAdding(false);
    await refresh();
  };

  const patch = async (uid: string, body: Record<string, unknown>) => {
    setBusyUid(uid);
    await fetch(`/api/portal/users/${uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
    await refresh();
    setBusyUid("");
  };

  const remove = async (user: StaffUser) => {
    if (!confirm(`Delete ${user.displayName}'s account? This can't be undone.`)) return;
    setBusyUid(user.uid);
    await fetch(`/api/portal/users/${user.uid}`, { method: "DELETE" }).catch(() => {});
    await refresh();
    setBusyUid("");
  };

  const reinvite = async (user: StaffUser) => {
    setBusyUid(user.uid);
    const res = await fetch(`/api/portal/users/${user.uid}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusyUid("");
    if (data?.ok) setInvite({ email: user.email, link: data.inviteLink });
  };

  return (
    <>
      {invite ? (
        <InvitePanel
          email={invite.email}
          link={invite.link}
          onDismiss={() => setInvite(null)}
        />
      ) : null}

      <div className="mt-8 overflow-hidden rounded-[18px] border border-white/10">
        {staff.map((user, i) => {
          const isSelf = user.uid === currentUid;
          const busy = busyUid === user.uid;
          return (
            <div
              key={user.uid}
              className={`flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 ${
                i ? "border-t border-white/[0.07]" : ""
              } ${user.disabled ? "opacity-50" : ""}`}
            >
              <div className="min-w-[180px] flex-1">
                <div className="font-body text-sm text-fog">
                  {user.displayName}
                  {isSelf ? <span className="ml-2 text-xs text-dusk">(you)</span> : null}
                </div>
                <div className="font-mono text-[11px] text-dusk">{user.email}</div>
              </div>

              {user.disabled ? (
                <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[1.2px] text-dusk">
                  Suspended
                </span>
              ) : null}

              {isSelf ? (
                <span className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-dusk">
                  {user.role}
                </span>
              ) : (
                <Select
                  aria-label={`Role for ${user.displayName}`}
                  value={user.role}
                  disabled={busy}
                  onChange={(e) => patch(user.uid, { role: e.target.value })}
                  className="w-auto py-1.5 text-[13px]"
                >
                  <option value="staff">staff</option>
                  <option value="admin">admin</option>
                </Select>
              )}

              {/* No controls on your own row — the API refuses these anyway, but
                  there's no reason to offer a button that only ever errors. */}
              {isSelf ? null : (
                <div className="flex items-center gap-2">
                  <RowButton disabled={busy} onClick={() => reinvite(user)}>
                    Re-invite
                  </RowButton>
                  <RowButton
                    disabled={busy}
                    onClick={() => patch(user.uid, { disabled: !user.disabled })}
                  >
                    {user.disabled ? "Restore" : "Suspend"}
                  </RowButton>
                  <RowButton disabled={busy} danger onClick={() => remove(user)}>
                    Delete
                  </RowButton>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {adding ? (
        <div className="mt-6 rounded-[18px] border border-white/10 bg-white/[0.03] p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={fieldLabelCls} htmlFor="n-name">
                Name
              </label>
              <TextInput
                id="n-name"
                placeholder="Jane Doe"
                value={name}
                invalid={!!errors.name}
                onChange={(e) => {
                  setName(e.target.value);
                  clearErr("name");
                }}
              />
              <FieldError show={!!errors.name}>Please enter a name.</FieldError>
            </div>
            <div>
              <label className={fieldLabelCls} htmlFor="n-email">
                Email
              </label>
              <TextInput
                id="n-email"
                type="email"
                placeholder="jane@decypher.com"
                value={email}
                invalid={!!errors.email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearErr("email");
                }}
              />
              <FieldError show={!!errors.email}>Enter a valid email address.</FieldError>
            </div>
          </div>

          <div className="mt-4 max-w-[200px]">
            <label className={fieldLabelCls} htmlFor="n-role">
              Role
            </label>
            <Select
              id="n-role"
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "staff")}
            >
              <option value="staff">staff</option>
              <option value="admin">admin</option>
            </Select>
          </div>

          {formError ? (
            <div className="mt-4 rounded-[11px] border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">
              {formError}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className={`${btnPrimaryCls} w-auto disabled:cursor-default disabled:opacity-60`}
              onClick={create}
              disabled={submitting}
            >
              {submitting ? "Creating…" : "Create account"}
            </button>
            <button
              className={`${btnGhostCls} w-auto`}
              onClick={() => {
                setAdding(false);
                setErrors({});
                setFormError("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className={`${btnPrimaryCls} mt-6 w-auto`} onClick={() => setAdding(true)}>
          + Add staff member
        </button>
      )}
    </>
  );
}

function RowButton({
  children,
  onClick,
  disabled,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`cursor-pointer rounded-full border border-white/15 bg-transparent px-3 py-1 font-body text-[12px] transition-colors duration-150 disabled:cursor-default disabled:opacity-40 ${
        danger
          ? "text-danger hover:border-danger"
          : "text-mist hover:border-mist hover:text-fog"
      }`}
    >
      {children}
    </button>
  );
}

/** Shown once, right after an account is created or re-invited. The link is the
 *  only way into the new account, and it isn't recoverable from here later —
 *  hence the copy button and the explicit "expires" warning. */
function InvitePanel({
  email,
  link,
  onDismiss,
}: {
  email: string;
  link: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-8 rounded-[18px] border border-teal/30 bg-teal/[0.06] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold text-fog">
            Invite link for {email}
          </h2>
          <p className="mt-1 text-sm text-mist">
            Send this to them directly. It lets them set a password once, then
            stops working. It also expires on its own — if they&rsquo;re slow,
            hit Re-invite for a fresh one.
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="flex-none cursor-pointer font-mono text-[11px] uppercase tracking-[1.2px] text-dusk hover:text-fog"
        >
          Dismiss
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <code className="min-w-[240px] flex-1 truncate rounded-[11px] border border-white/10 bg-night/60 px-3 py-2.5 font-mono text-[11px] text-mist">
          {link}
        </code>
        <button
          onClick={copy}
          className="flex-none cursor-pointer rounded-full border border-white/15 px-4 py-2 font-body text-[13px] text-fog transition-colors duration-150 hover:border-mist"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
    </div>
  );
}
