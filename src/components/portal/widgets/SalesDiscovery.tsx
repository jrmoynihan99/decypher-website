"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Field, Note, Panel } from "@/components/portal/widgets/ui";
import { btnCls } from "@/components/portal/widgets/accountable-plan/kit";
import { QUESTIONS, SECTIONS, type SectionKey } from "@/lib/discovery/schema";

/**
 * Sales Discovery — the Tax Strategy tool that starts a discovery call.
 *
 * The call itself runs at /discovery-call, full screen in the feedback
 * survey's skin and outside the portal, so a screen share shows the creator
 * the questions and nothing else (no sidebar, no other tabs). This panel is
 * the launcher: the creator's first name, whether it's a practice run, and
 * the button. Answers land in the Setter Answers inbox tab.
 */

const CALL_PATH = "/discovery-call";

const inputCls =
  "w-full rounded-[10px] border border-edge-mid bg-panel-2 px-3 py-2.5 font-body text-[14px] text-fog outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]";

export default function SalesDiscovery() {
  const [name, setName] = useState("");
  const [practice, setPractice] = useState(false);

  const params = new URLSearchParams();
  const clean = name.replace(/\s+/g, " ").trim();
  if (clean) params.set("name", clean);
  if (practice) params.set("test", "1");
  const qs = params.toString();
  const href = qs ? `${CALL_PATH}?${qs}` : CALL_PATH;

  const counts = (Object.keys(SECTIONS) as SectionKey[]).map((k) => ({
    key: k,
    label: SECTIONS[k],
    n: QUESTIONS.filter((q) => q.sec === k).length,
  }));

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.2fr_1fr]">
      <Panel title="Run a call">
        <p className="m-0 mb-4 text-[13.5px] leading-relaxed text-muted">
          The call opens in a new tab, full screen in the survey’s own look. The portal stays here, so a screen share only ever
          shows the creator the questions. Type their first name now or on the first screen.
        </p>
        <Field label="Creator’s first name" className="mb-4 max-w-[360px]">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First name"
            autoComplete="off"
            maxLength={120}
            className={inputCls}
          />
        </Field>
        <Check checked={practice} onChange={setPractice}>
          Practice call (kept out of the real numbers)
        </Check>
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <a href={href} target="_blank" rel="noopener noreferrer" className={`${btnCls("primary")} no-underline`}>
            Start a call ↗
          </a>
          <Link href="/portal/setter-answers" className={`${btnCls("ghost")} no-underline`}>
            Setter Answers
          </Link>
        </div>
        <Note>
          Staff notes live behind the lock in the call’s header (or the <span className="font-mono">\</span> key): advisor, fit,
          next step, notes, the Fathom link, and talking points that build as the creator answers. It’s closed by default and
          nothing in it renders while closed. Everything in it except the practice flag can also be set afterwards in Setter
          Answers.
        </Note>
      </Panel>

      <Panel title="What it asks">
        <ol className="m-0 list-none p-0">
          {counts.map((s, i) => (
            <li key={s.key} className="flex items-baseline justify-between gap-3 border-t border-edge py-2.5 text-[13.5px] first:border-t-0">
              <span className="flex items-baseline gap-2.5 text-fog">
                <span className="font-mono text-[11px] text-magenta">{String(i + 1).padStart(2, "0")}</span>
                {s.label}
              </span>
              <span className="font-mono text-[11.5px] text-dusk">
                up to {s.n} question{s.n === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ol>
        <Note>
          Branches open on the answers: an S corp gets the payroll and salary questions, a non-US filer gets nothing past the
          first. A red flag (an S corp with no payroll, mixed spending) or a recommendation (get an LLC, open a business
          account, cap the salary at the wage base) pops up as it comes, with the Loom links ready to copy into the chat. The
          end screen books the strategy session.
        </Note>
      </Panel>
    </div>
  );
}
