"use client";

import { useState } from "react";
import type { StaffUser } from "@/lib/firebase/session";
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  type PermissionKey,
} from "@/lib/permissions";
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
 *
 * Tab access is picked at invite time and editable per row afterwards. The
 * checkboxes only matter for the staff role — admins hold every tab by
 * definition, so their rows don't offer the editor.
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
  const [perms, setPerms] = useState<PermissionKey[]>([...PERMISSION_KEYS]);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [formError, setFormError] = useState("");
  // Row actions used to fail silently — a button that does nothing reads as a
  // frozen UI, so anything the API refuses gets said out loud above the table.
  const [rowError, setRowError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyUid, setBusyUid] = useState("");
  const [accessUid, setAccessUid] = useState("");
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
      body: JSON.stringify({
        displayName: name.trim(),
        email: email.trim(),
        role,
        permissions: perms,
      }),
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
    setPerms([...PERMISSION_KEYS]);
    setAdding(false);
    await refresh();
  };

  /** Fire a row action and report whatever the API said if it refused. */
  const act = async (uid: string, init: RequestInit, fallback: string) => {
    setBusyUid(uid);
    setRowError("");
    const data = await fetch(`/api/portal/users/${uid}`, init)
      .then((res) => res.json().catch(() => ({})))
      .catch(() => ({}));
    setBusyUid("");
    if (!data?.ok) setRowError(data?.message || fallback);
    return data;
  };

  const patch = async (uid: string, body: Record<string, unknown>) => {
    await act(
      uid,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      "Could not update the account.",
    );
    await refresh();
  };

  const remove = async (user: StaffUser) => {
    if (!confirm(`Delete ${user.displayName}'s account? This can't be undone.`)) return;
    await act(user.uid, { method: "DELETE" }, "Could not delete the account.");
    await refresh();
  };

  const reinvite = async (user: StaffUser) => {
    const data = await act(
      user.uid,
      { method: "POST" },
      "Could not generate an invite link.",
    );
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

      {rowError ? (
        <div className="mt-8 rounded-[11px] border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {rowError}
        </div>
      ) : null}

      <div className="mt-8 overflow-hidden rounded-[18px] border border-white/10">
        {staff.map((user, i) => {
          const isSelf = user.uid === currentUid;
          const busy = busyUid === user.uid;
          // null = pre-permissions doc — resolves to everything, so show that.
          const granted = user.permissions ?? [...PERMISSION_KEYS];
          const accessOpen = accessUid === user.uid && user.role === "staff";
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
                  {user.role === "staff" ? (
                    <RowButton
                      disabled={busy}
                      onClick={() => setAccessUid(accessOpen ? "" : user.uid)}
                    >
                      Access · {granted.length}/{PERMISSION_KEYS.length}
                    </RowButton>
                  ) : null}
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

              {accessOpen && !isSelf ? (
                <div className="basis-full rounded-[14px] border border-white/[0.08] bg-white/[0.02] p-4">
                  <div className="mb-3 font-mono text-[9.5px] font-bold uppercase tracking-[1.4px] text-faint">
                    Tabs {user.displayName.split(" ")[0] || user.email} can see
                  </div>
                  <PermissionPicker
                    value={granted}
                    disabled={busy}
                    onChange={(next) => patch(user.uid, { permissions: next })}
                  />
                  <p className="mt-3 text-[11.5px] text-dusk">
                    Applies from their next page load — no re-invite needed.
                  </p>
                </div>
              ) : null}
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

          <div className="mt-4">
            <div className={fieldLabelCls}>Tab access</div>
            {role === "admin" ? (
              <p className="text-[12.5px] text-dusk">
                Admins see every tab — nothing to pick.
              </p>
            ) : (
              <PermissionPicker value={perms} onChange={setPerms} />
            )}
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

/**
 * The tab-grant checkboxes, shared by the invite form (local state) and the
 * per-row editor (each toggle PATCHes the new full set). Toggling on rebuilds
 * from PERMISSION_KEYS so the array stays in canonical order however it's
 * clicked together.
 */
function PermissionPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: PermissionKey[];
  onChange: (next: PermissionKey[]) => void;
  disabled?: boolean;
}) {
  const toggle = (key: PermissionKey) => {
    const has = value.includes(key);
    onChange(PERMISSION_KEYS.filter((k) => (k === key ? !has : value.includes(k))));
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {PERMISSION_KEYS.map((key) => (
        <label
          key={key}
          className={`flex items-center gap-2.5 rounded-[11px] border border-white/10 px-3 py-2 font-body text-[13px] text-mist transition-colors duration-150 ${
            disabled ? "opacity-60" : "cursor-pointer hover:border-white/20"
          }`}
        >
          <input
            type="checkbox"
            checked={value.includes(key)}
            disabled={disabled}
            onChange={() => toggle(key)}
            className="h-4 w-4 flex-none accent-magenta"
          />
          {PERMISSION_LABELS[key]}
        </label>
      ))}
    </div>
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
