"use client";

import { useState, useSyncExternalStore } from "react";
import { Field, Panel, Segmented, SelectInput } from "@/components/portal/widgets/ui";
import {
  FEEDBACK_PATH,
  SURVEY_KINDS,
  SURVEY_KIND_LABELS,
  defaultQuarter,
  defaultTaxYear,
  feedbackHref,
  type SurveyKind,
  type TeamRole,
} from "@/lib/feedback/links";
import { LINK_ROLES, ROLE_LABELS, TEAMS, sectionsFor, type FeedbackSettings } from "@/lib/feedback/schema";
import { ToolButton } from "./bits";

/**
 * Send a link: every way into the survey, in one place.
 *
 *   For one client  a ready-to-send link, built here, for a survey that goes
 *                   out by hand rather than from a TaxDome automation
 *   TaxDome         the templates the automations fill in
 *   Preview         try a survey yourself; the answers save as test data
 *
 * A link has to name the client to count. A bare one is read as staff trying
 * the survey (lib/feedback/links `preview`), and its answers save as test
 * data — the trap a hand-typed `/feedback?s=tax` falls into, and why the
 * builder won't hand out a link without a name.
 *
 * Plain URL parameters, not stored short links: they're what TaxDome and the
 * tax recap already use, they need no lookup, and a link keeps working
 * whatever happens to the database.
 */

const TD_LINKS: [SurveyKind, string, string, string][] = [
  ["onb", "Onboarding", "when onboarding moves to Done", ""],
  ["bk", "Bookkeeping check-in", "2–3 months after onboarding", "&bq=QUARTER"],
  ["tax", "Tax season", "1–2 weeks after returns are delivered", "&ty=TAX_YEAR"],
  ["both", "Both sections", "when both are fresh", "&bq=QUARTER&ty=TAX_YEAR"],
];

const noopSubscribe = () => () => {};

const inputCls =
  "w-full rounded-[10px] border border-edge-mid bg-panel-2 px-3 py-2.5 font-body text-[14px] text-fog outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]";

const codeCls =
  "min-w-0 flex-1 break-all rounded-[10px] border border-edge bg-panel-2 px-3 py-2.5 font-mono text-[12px] text-mist";

export default function LinksTab({
  settings,
  onChange,
  onCopy,
}: {
  settings: FeedbackSettings;
  /** `debounce` for typing. */
  onChange: (next: FeedbackSettings, debounce?: boolean) => void;
  onCopy: (text: string, label: string) => void;
}) {
  // The origin is only knowable in the browser; the server render shows the path alone.
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const base = settings.baseUrl ? settings.baseUrl.replace(/[?#].*$/, "") : `${origin}${FEEDBACK_PATH}`;
  const tdLink = (k: SurveyKind, extra: string) =>
    `${base}?name=CLIENT_NAME&cid=CLIENT_ID${k === "onb" ? "" : `&s=${k}`}${extra}`;

  return (
    <div className="space-y-5">
      <OneClient base={base} settings={settings} onCopy={onCopy} />

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
                  <code className={codeCls}>{href}</code>
                  <ToolButton onClick={() => onCopy(href, "Link")}>Copy</ToolButton>
                </div>
              </div>
            );
          })}
        </div>
        <p className="m-0 mt-3.5 text-[12.5px] leading-relaxed text-dusk">
          The client ID stops a second answer for the same round and joins the response to their record. Without{" "}
          <b className="text-mist">bq</b> the period defaults to the current quarter; without <b className="text-mist">ty</b>{" "}
          the tax year defaults to last year. Links from a client’s tax recap carry the recap instead of a client ID, and fill
          in their name and tax year.
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
          <span className="mt-1.5 block text-[12px] text-dusk">
            Where the survey lives, for every link on this tab. Blank uses this site’s {FEEDBACK_PATH}.
          </span>
        </label>
      </Panel>

      <Panel title="Preview the survey">
        <p className="m-0 mb-3 text-[13px] leading-relaxed text-muted">
          Opens the survey with nobody on the link, so the answers save as test data (they show with a{" "}
          <span className="font-mono text-[12px]">test</span> flag on Responses and clear with “Clear test data”). Don’t send
          these to clients: use a link from the top of this tab.
        </p>
        <div className="flex flex-wrap gap-2">
          {SURVEY_KINDS.map((k) => (
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
    </div>
  );
}

/** The builder: one client, one survey, one link to paste into an email or a text. */
function OneClient({
  base,
  settings,
  onCopy,
}: {
  base: string;
  settings: FeedbackSettings;
  onCopy: (text: string, label: string) => void;
}) {
  const [kind, setKind] = useState<SurveyKind>("onb");
  const [name, setName] = useState("");
  const [cid, setCid] = useState("");
  const [bq, setBq] = useState(() => defaultQuarter());
  const [ty, setTy] = useState(() => defaultTaxYear());
  const [team, setTeam] = useState<Partial<Record<TeamRole, string>>>({});

  const sections = sectionsFor(kind);
  const roles = LINK_ROLES.filter((lr) => sections.includes(lr.team));
  const wantsBq = kind === "bk" || kind === "both";
  const wantsTy = kind === "tax" || kind === "both";
  const named = name.trim().length >= 2;

  // Only the roles this survey asks about ride on the link (feedbackHref
  // drops the period and year that don't apply on its own).
  const rel = feedbackHref({
    kind,
    name,
    cid,
    bq,
    ty,
    team: Object.fromEntries(roles.map(({ role }) => [role, team[role] ?? ""])),
  });
  const href = `${base}${rel.slice(FEEDBACK_PATH.length)}`;

  return (
    <Panel title="A link for one client">
      <p className="m-0 mb-4 text-[13px] leading-relaxed text-muted">
        For a survey you’re sending by hand. Fill in the client and who worked with them, then copy the link into your email
        or message.
      </p>

      <Segmented<SurveyKind>
        size="sm"
        value={kind}
        onChange={setKind}
        ariaLabel="Which survey"
        options={SURVEY_KINDS.map((k) => ({ value: k, label: SURVEY_KIND_LABELS[k] }))}
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Client name">
          <input
            value={name}
            maxLength={120}
            autoComplete="off"
            placeholder="e.g. Maya Rodriguez"
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="TaxDome client ID (optional)" hint="Stops a second answer for the same round.">
          <input
            value={cid}
            maxLength={100}
            autoComplete="off"
            placeholder="If you have it"
            onChange={(e) => setCid(e.target.value)}
            className={`${inputCls} font-mono`}
          />
        </Field>
        {wantsBq ? (
          <Field label="Bookkeeping period" hint="Quarter the check-in is about.">
            <input
              value={bq}
              maxLength={24}
              placeholder={defaultQuarter()}
              onChange={(e) => setBq(e.target.value)}
              className={`${inputCls} font-mono`}
            />
          </Field>
        ) : null}
        {wantsTy ? (
          <Field label="Tax year" hint="The year the returns were for.">
            <input
              value={ty}
              maxLength={12}
              inputMode="numeric"
              placeholder={defaultTaxYear()}
              onChange={(e) => setTy(e.target.value)}
              className={`${inputCls} font-mono`}
            />
          </Field>
        ) : null}
      </div>

      {sections.map((t) => (
        <div key={t}>
          <h4 className="m-0 mb-2 mt-4 font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-dusk">
            {TEAMS[t].label} team <span className="font-normal normal-case tracking-normal">(optional)</span>
          </h4>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr))]">
            {roles
              .filter((lr) => lr.team === t)
              .map(({ role }) => (
                <Field key={role} label={ROLE_LABELS[role]}>
                  <SelectInput value={team[role] ?? ""} onChange={(e) => setTeam((m) => ({ ...m, [role]: e.target.value }))}>
                    <option value="">—</option>
                    {settings.lists[role].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
              ))}
          </div>
        </div>
      ))}

      <div className="mt-5 flex items-stretch gap-2">
        {named ? (
          <code className={codeCls}>{href}</code>
        ) : (
          <div className="min-w-0 flex-1 rounded-[10px] border border-dashed border-edge-mid px-3 py-2.5 text-[13px] text-dusk">
            Add the client’s name to make the link. Without one, the survey treats it as a preview and saves the answers as
            test data.
          </div>
        )}
        <ToolButton disabled={!named} onClick={() => onCopy(href, "Link")}>
          Copy link
        </ToolButton>
      </div>
    </Panel>
  );
}
