"use client";

import { useState, useSyncExternalStore } from "react";
import { Panel } from "@/components/portal/widgets/ui";
import { FEEDBACK_PATH, SURVEY_KIND_LABELS, type SurveyKind } from "@/lib/feedback/links";
import {
  GOOGLE_REVIEW_URL,
  LINK_ROLES,
  ROLE_LABELS,
  TEAMS,
  THRESHOLDS,
  type FeedbackSettings,
  type TeamKey,
  type TeamRole,
} from "@/lib/feedback/schema";
import { ToolButton } from "./bits";

/**
 * Team & setup: the names in each role's dropdown, the link templates for the
 * TaxDome automations, preview links, and the rules in words.
 *
 * Removing a name from a list keeps it on the clients it's already on — the
 * Responses dropdown shows it as "(not in list)" — because a person leaving
 * shouldn't rewrite who worked with whom.
 */

const TD_LINKS: [SurveyKind, string, string, string][] = [
  ["onb", "Onboarding", "when onboarding moves to Done", ""],
  ["bk", "Bookkeeping check-in", "2–3 months after onboarding", "&bq=QUARTER"],
  ["tax", "Tax season", "1–2 weeks after returns are delivered", "&ty=TAX_YEAR"],
  ["both", "Both sections", "when both are fresh", "&bq=QUARTER&ty=TAX_YEAR"],
];

const noopSubscribe = () => () => {};

const inputCls =
  "w-full rounded-[10px] border border-edge-mid bg-panel-2 px-3 py-2 font-body text-[13.5px] text-fog outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]";

export default function SetupTab({
  settings,
  onChange,
  onCopy,
  flash,
}: {
  settings: FeedbackSettings;
  /** `debounce` for typing; lists save at once. */
  onChange: (next: FeedbackSettings, debounce?: boolean) => void;
  onCopy: (text: string, label: string) => void;
  flash: (msg: string) => void;
}) {
  // The origin is only knowable in the browser; the server render shows the path alone.
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const base = settings.baseUrl ? settings.baseUrl.replace(/[?#].*$/, "") : `${origin}${FEEDBACK_PATH}`;
  const tdLink = (k: SurveyKind, extra: string) =>
    `${base}?name=CLIENT_NAME&cid=CLIENT_ID${k === "onb" ? "" : `&s=${k}`}${extra}`;

  return (
    <div className="space-y-5">
      <ListsPanel settings={settings} onChange={onChange} flash={flash} />

      <Panel title="Links for TaxDome">
        <p className="m-0 mb-4 text-[13px] leading-relaxed text-muted">
          Paste these into the TaxDome automations. Swap the capitals for TaxDome’s client name and client ID fields, and set
          the quarter or tax year each time it runs.
        </p>
        <div className="space-y-3.5">
          {TD_LINKS.map(([k, label, when, extra]) => {
            const href = tdLink(k, extra);
            return (
              <div key={k}>
                <div className="mb-1.5 text-[13px] font-medium text-fog">
                  {label} <span className="font-normal text-dusk">· {when}</span>
                </div>
                <div className="flex items-stretch gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-[10px] border border-edge bg-panel-2 px-3 py-2.5 font-mono text-[12px] text-mist">
                    {href}
                  </code>
                  <ToolButton onClick={() => onCopy(href, "Link")}>Copy</ToolButton>
                </div>
              </div>
            );
          })}
        </div>
        <p className="m-0 mt-3.5 text-[12.5px] leading-relaxed text-dusk">
          The client ID stops a second answer for the same round and joins the response to their record. Without{" "}
          <b className="text-mist">bq</b> the period defaults to the current quarter; without <b className="text-mist">ty</b>{" "}
          the tax year defaults to last year. If the name is left out, the survey asks for it. Links from a client’s tax
          recap carry the recap instead of a client ID, and fill in their name and tax year.
        </p>
        <label className="mt-4 block max-w-[560px]">
          <span className="mb-1.5 block font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-mist">
            Survey page URL
          </span>
          <input
            type="url"
            value={settings.baseUrl}
            placeholder={`${origin}${FEEDBACK_PATH}`}
            onChange={(e) => onChange({ ...settings, baseUrl: e.target.value }, true)}
            className={inputCls}
          />
          <span className="mt-1.5 block text-[12px] text-dusk">Where the survey lives. Blank uses this site’s {FEEDBACK_PATH}.</span>
        </label>
      </Panel>

      <Panel title="Preview the survey">
        <p className="m-0 mb-3 text-[13px] leading-relaxed text-muted">
          Opens the survey with nobody on the link, so the answers save as test data (they show with a{" "}
          <span className="font-mono text-[12px]">test</span> flag here and clear with “Clear test data”).
        </p>
        <div className="flex flex-wrap gap-2">
          {(["onb", "bk", "tax", "both"] as SurveyKind[]).map((k) => (
            <a
              key={k}
              href={`${FEEDBACK_PATH}${k === "onb" ? "" : `?s=${k}`}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-edge-mid px-4 py-2 font-display text-[13px] font-semibold text-fog no-underline transition-colors hover:border-magenta"
            >
              {SURVEY_KIND_LABELS[k]}
              <span className="font-mono text-[10px] text-magenta">↗</span>
            </a>
          ))}
        </div>
      </Panel>

      <Panel title="Links & rules">
        <label className="block max-w-[560px]">
          <span className="mb-1.5 block font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-mist">
            Founder on at-risk follow-ups
          </span>
          <input
            type="text"
            value={settings.escalation}
            maxLength={80}
            onChange={(e) => onChange({ ...settings, escalation: e.target.value }, true)}
            className={inputCls}
          />
          <span className="mt-1.5 block text-[12px] leading-relaxed text-dusk">
            Onboarding follow-ups go to the onboarding team lead, bookkeeping follow-ups to the bookkeeping lead, and tax
            follow-ups to the tax strategist and tax manager, each plus this person. A link’s own{" "}
            <span className="font-mono">esc</span> overrides it.
          </span>
        </label>
        <div className="mt-4">
          <span className="mb-1.5 block font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-mist">
            Google review link
          </span>
          <code className="block break-all rounded-[10px] border border-edge bg-panel-2 px-3 py-2.5 font-mono text-[12px] text-mist">
            {GOOGLE_REVIEW_URL}
          </code>
        </div>
        <div className="mt-4 space-y-2 text-[12.5px] leading-relaxed text-dusk">
          <p className="m-0">
            The review ask shows only when every team answered is CSAT ≥ {THRESHOLDS.promoterCsat} and NPS ≥{" "}
            {THRESHOLDS.promoterNps}. A team is <b className="text-mist">at risk</b> at CSAT ≤ {THRESHOLDS.atRiskCsat} or NPS ≤{" "}
            {THRESHOLDS.atRiskNps} (onboarding also at confidence ≤ 3) and creates a follow-up, plus a ping in Slack.
          </p>
          <p className="m-0">
            Each client’s team carries forward: set the bookkeeping lead at onboarding and their later bookkeeping responses
            start with it. You can still change any row.
          </p>
          <p className="m-0">Data: Firestore, through the portal. Test responses are flagged and never count as a client’s answer.</p>
        </div>
      </Panel>
    </div>
  );
}

function ListsPanel({
  settings,
  onChange,
  flash,
}: {
  settings: FeedbackSettings;
  onChange: (next: FeedbackSettings, debounce?: boolean) => void;
  flash: (msg: string) => void;
}) {
  const [drafts, setDrafts] = useState<Partial<Record<TeamRole, string>>>({});

  const add = (role: TeamRole) => {
    const name = (drafts[role] ?? "").replace(/\s+/g, " ").trim();
    if (!name) return;
    if (settings.lists[role].some((n) => n.toLowerCase() === name.toLowerCase())) {
      flash(`${name} is already on that list`);
      return;
    }
    onChange({ ...settings, lists: { ...settings.lists, [role]: [...settings.lists[role], name] } });
    setDrafts((d) => ({ ...d, [role]: "" }));
    flash(`${name} added`);
  };

  const remove = (role: TeamRole, name: string) =>
    onChange({ ...settings, lists: { ...settings.lists, [role]: settings.lists[role].filter((n) => n !== name) } });

  return (
    <Panel title="Dropdown lists">
      <p className="m-0 mb-1 text-[13px] leading-relaxed text-muted">
        The names in each dropdown on the Responses tab. Add or remove people here. Removing someone keeps them on the
        clients they’re already assigned to.
      </p>
      {(["onboarding", "bookkeeping", "tax"] as TeamKey[]).map((team) => (
        <div key={team}>
          <h3 className="m-0 mb-2 mt-4 font-display text-[15px] font-semibold text-fog">{TEAMS[team].label}</h3>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
            {LINK_ROLES.filter((lr) => lr.team === team).map(({ role }) => (
              <div key={role} className="flex flex-col gap-2.5 rounded-[16px] border border-edge bg-panel-2 p-3">
                <div className="flex justify-between font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-dusk">
                  {ROLE_LABELS[role]}
                  <span>{settings.lists[role].length}</span>
                </div>
                <div className="flex min-h-[28px] flex-wrap items-center gap-1.5 text-[13px]">
                  {settings.lists[role].length ? (
                    settings.lists[role].map((n) => (
                      <span
                        key={n}
                        className="inline-flex items-center gap-1 rounded-full border border-edge-mid bg-panel py-1 pl-2.5 pr-1 text-[13px] text-fog"
                      >
                        {n}
                        <button
                          type="button"
                          onClick={() => remove(role, n)}
                          aria-label={`Remove ${n} from ${ROLE_LABELS[role]}`}
                          className="grid h-[22px] w-[22px] cursor-pointer place-items-center rounded-full border-0 bg-transparent text-[15px] leading-none text-dusk hover:bg-danger/10 hover:text-danger"
                        >
                          ×
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="text-dusk">No one yet</span>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={drafts[role] ?? ""}
                    placeholder="Add a name"
                    autoComplete="off"
                    maxLength={80}
                    aria-label={`Add a name to ${ROLE_LABELS[role]}`}
                    onChange={(e) => setDrafts((d) => ({ ...d, [role]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        add(role);
                      }
                    }}
                    className="min-w-0 flex-1 rounded-[10px] border border-edge-mid bg-panel px-2.5 py-1.5 font-body text-[13px] text-fog outline-none placeholder:text-faint focus:border-magenta"
                  />
                  <ToolButton onClick={() => add(role)}>Add</ToolButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Panel>
  );
}
