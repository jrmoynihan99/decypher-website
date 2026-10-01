"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Chip, Mono, Note, Panel } from "@/components/portal/widgets/ui";
import { proveTables, type ProofPairing } from "@/lib/tax-recap/derive";
import {
  FILING_STATUSES,
  FILING_STATUS_SHORT,
  US_STATES,
  blankStateCard,
  noIncomeTaxCard,
  seedFor,
  validateYearCard,
  type Bracket,
  type ByStatus,
  type EntityRules,
  type FederalCard,
  type PartnershipRules,
  type StateCard,
  type TaxTableRule,
  type YearCard,
} from "@/lib/tax-recap/tables";

/**
 * The Tax Tables page: every number and rule the derivation engine uses,
 * per tax year, editable.
 *
 * One card per year. The federal side is figures only (brackets, standard
 * deduction, SE rates, thresholds). Each state is a rule card: choices the
 * engine interprets (where the state's income starts, add-backs, deduction,
 * exemption as credit or deduction, tax-table rounding, surtax, city tax)
 * plus its figures. Nothing state-specific lives in code, so a new state is
 * added here, not deployed.
 *
 * Two things stop a bad number reaching a client. Validation blocks saving
 * anything the engine couldn't compute with (a bracket out of order, a
 * blank rate). The proof panel re-runs the engine on every saved recap whose
 * before was read from a real print, with the draft as it stands, and shows
 * whether each before comes out as printed. A card that proves on no return
 * is marked as such rather than trusted.
 *
 * Numbers are held as strings inside each input (a half-typed "0.0" has to
 * survive), committed to the draft on every valid keystroke. The whole
 * editor remounts on a reset so the inputs pick up the seed again.
 */

export type YearRow = {
  taxYear: number;
  card: YearCard;
  /** A saved override exists in Firestore. */
  stored: boolean;
  /** A seed ships in code for this year. */
  seeded: boolean;
  updatedAt: string | null;
  updatedBy: string;
};

type Props = { years: YearRow[]; pairings: ProofPairing[] };

type Draft = { card: YearCard; stored: boolean; seeded: boolean; dirty: boolean };

const btn =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-transparent px-5 py-2.5 font-display text-[14px] font-semibold no-underline transition-[transform,filter,opacity] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary = `${btn} bg-grad text-white hover:brightness-[1.07]`;
const btnGhost = `${btn} border-white/15 bg-transparent text-fog hover:border-mist`;
const linkBtn =
  "cursor-pointer font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted hover:text-fog disabled:cursor-not-allowed disabled:opacity-50";
const inputCls =
  "w-full rounded-[10px] border border-edge-mid bg-panel-2 px-2.5 py-1.5 font-mono text-[12.5px] tabular-nums text-fog outline-none transition-[border-color,box-shadow] duration-150 focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]";
const selectCls = `${inputCls} cursor-pointer appearance-none pr-7`;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export default function TaxTablesEditor({ years, pairings }: Props) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<number, Draft>>(() =>
    Object.fromEntries(
      years.map((y) => [y.taxYear, { card: clone(y.card), stored: y.stored, seeded: y.seeded, dirty: false }]),
    ),
  );
  const yearList = Object.keys(drafts).map(Number).sort((a, b) => b - a);
  const [selected, setSelected] = useState<number>(yearList[0] ?? new Date().getFullYear() - 1);
  const [tab, setTab] = useState<string>("federal");
  /** Bumped on reset so every input remounts with the seed's value. */
  const [revision, setRevision] = useState(0);
  const [addingYear, setAddingYear] = useState("");
  const [addingState, setAddingState] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverProblems, setServerProblems] = useState<string[]>([]);
  const [flash, setFlash] = useState(false);

  const draft = drafts[selected];
  const card = draft?.card ?? null;

  const update = (fn: (c: YearCard) => YearCard) =>
    setDrafts((d) => {
      const cur = d[selected];
      if (!cur) return d;
      return { ...d, [selected]: { ...cur, card: fn(cur.card), dirty: true } };
    });
  const setFederal = (patch: Partial<FederalCard>) =>
    update((c) => ({ ...c, federal: { ...c.federal, ...patch } }));
  const setState = (code: string, patch: Partial<StateCard>) =>
    update((c) => ({ ...c, states: { ...c.states, [code]: { ...c.states[code], ...patch } } }));

  const problems = useMemo(() => (card ? validateYearCard(card) : []), [card]);
  const proof = useMemo(
    () =>
      card
        ? proveTables(
            pairings.filter((p) => p.taxYear === selected),
            { [selected]: card },
          )
        : [],
    [card, pairings, selected],
  );
  const proofFailing = proof.filter((p) => p.outcome !== "match").length;

  /* ─────────────────────────────── actions ─────────────────────────────── */

  const addYear = () => {
    const y = Number(addingYear);
    if (!/^\d{4}$/.test(addingYear) || drafts[y]) return;
    // Start from the newest year's card: the rules are right, the numbers
    // need the new year's published figures.
    const from = drafts[yearList[0]]?.card ?? seedFor(yearList[0]) ?? null;
    if (!from) return;
    setDrafts((d) => ({ ...d, [y]: { card: clone(from), stored: false, seeded: false, dirty: true } }));
    setSelected(y);
    setTab("federal");
    setAddingYear("");
  };

  const addState = () => {
    const code = addingState;
    if (!code || !card || card.states[code]) return;
    update((c) => ({ ...c, states: { ...c.states, [code]: blankStateCard(code) } }));
    setTab(code);
    setAddingState("");
  };

  const removeState = (code: string) => {
    if (!card) return;
    if (!confirm(`Remove ${US_STATES[code] ?? code} from the ${selected} tables?`)) return;
    update((c) => {
      const states = { ...c.states };
      delete states[code];
      return { ...c, states };
    });
    setTab("federal");
  };

  const save = async () => {
    if (!card || problems.length) return;
    setSaving(true);
    setError(null);
    setServerProblems([]);
    try {
      const res = await fetch(`/api/portal/tax-recap/tables/${selected}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; problems?: string[] };
      if (!res.ok || !data.ok) {
        setServerProblems(data.problems ?? []);
        throw new Error(data.message ?? "Couldn't save");
      }
      setDrafts((d) => ({ ...d, [selected]: { ...d[selected], stored: true, dirty: false } }));
      setFlash(true);
      setTimeout(() => setFlash(false), 2200);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  /** Drop the saved override (or an unsaved new year) and go back to the seed. */
  const reset = async () => {
    if (!draft) return;
    const seed = seedFor(selected);
    if (draft.stored) {
      if (!confirm(seed ? `Discard the saved ${selected} tables and go back to the shipped ones?` : `Delete the ${selected} tables? No shipped version exists for that year.`)) return;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/portal/tax-recap/tables/${selected}`, { method: "DELETE" });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
        if (!res.ok || !data.ok) throw new Error(data.message ?? "Couldn't delete");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't delete");
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    setDrafts((d) => {
      const next = { ...d };
      if (seed) next[selected] = { card: clone(seed), stored: false, seeded: true, dirty: false };
      else delete next[selected];
      return next;
    });
    if (!seed) setSelected(yearList.find((y) => y !== selected) ?? yearList[0]);
    setTab("federal");
    setRevision((r) => r + 1);
  };

  /* ─────────────────────────────── render ─────────────────────────────── */

  if (!card || !draft) {
    return (
      <Panel title="Tax tables">
        <p className="text-[13.5px] text-muted">No tables yet.</p>
      </Panel>
    );
  }

  const stateCodes = Object.keys(card.states).sort();
  const addable = Object.keys(US_STATES).filter((c) => !card.states[c]).sort();

  return (
    <div className="space-y-6">
      {/* ─────────────────────── year ─────────────────────── */}
      <Panel
        title="Tax year"
        action={
          <span className="text-[12px] text-dusk">
            {draft.stored
              ? `Saved tables${draft.seeded ? " (override the shipped ones)" : ""}`
              : draft.seeded
                ? "Shipped tables — not yet edited"
                : "New year, not saved yet"}
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {yearList.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => {
                setSelected(y);
                setTab("federal");
              }}
              className={`cursor-pointer rounded-full border px-4 py-1.5 font-mono text-[13px] tabular-nums transition-colors ${
                y === selected
                  ? "border-magenta/60 bg-magenta/10 text-fog"
                  : "border-white/10 text-muted hover:border-mist hover:text-fog"
              }`}
            >
              {y}
              {drafts[y].dirty ? <span className="ml-1 text-magenta">•</span> : null}
            </button>
          ))}
          <div className="ml-2 flex items-center gap-2">
            <input
              value={addingYear}
              onChange={(e) => setAddingYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="2026"
              inputMode="numeric"
              aria-label="New tax year"
              className={`${inputCls} !w-20`}
            />
            <button type="button" onClick={addYear} disabled={!/^\d{4}$/.test(addingYear) || !!drafts[Number(addingYear)]} className={linkBtn}>
              + Add year
            </button>
          </div>
        </div>
        <Note>
          A new year starts as a copy of the newest one: the rules carry over, the numbers need
          that year&rsquo;s published figures (the IRS revenue procedure and each state&rsquo;s printed
          rate schedules). Every client of that year is then computed from this one card.
        </Note>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* ─────────────────────── cards ─────────────────────── */}
        <Panel title="Cards" bodyClassName="!px-2 !py-2">
          <CardTab active={tab === "federal"} onClick={() => setTab("federal")} label="Federal" sub="brackets, SE, QBI, credits" />
          <div className="mt-2 border-t border-edge pt-2">
            {stateCodes.map((code) => {
              const s = card.states[code];
              return (
                <CardTab
                  key={code}
                  active={tab === code}
                  onClick={() => setTab(code)}
                  label={`${code} · ${s.name || US_STATES[code] || code}`}
                  sub={s.incomeTax ? `Form ${s.form || "—"}${s.proven ? " · proven" : " · unproven"}` : "no income tax"}
                  mute={!s.incomeTax}
                />
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2 border-t border-edge px-2 pt-3">
            <div className="relative min-w-0 flex-1">
              <select value={addingState} onChange={(e) => setAddingState(e.target.value)} aria-label="State to add" className={selectCls}>
                <option value="">State…</option>
                {addable.map((c) => (
                  <option key={c} value={c}>
                    {c} · {US_STATES[c]}
                  </option>
                ))}
              </select>
              <Caret />
            </div>
            <button type="button" onClick={addState} disabled={!addingState} className={linkBtn}>
              + Add
            </button>
          </div>
        </Panel>

        {/* ─────────────────────── the card ─────────────────────── */}
        <div key={`${selected}:${revision}:${tab}`} className="min-w-0">
          {tab === "federal" ? (
            <FederalEditor card={card.federal} onChange={setFederal} />
          ) : card.states[tab] ? (
            <StateEditor
              code={tab}
              card={card.states[tab]}
              onChange={(patch) => setState(tab, patch)}
              onRemove={() => removeState(tab)}
            />
          ) : null}
        </div>
      </div>

      {/* ─────────────────────── proof + save ─────────────────────── */}
      <Panel
        title={`Proof · ${selected}`}
        action={
          proof.length ? (
            <Chip tone={proofFailing ? "warn" : "pos"}>
              {proofFailing ? `${proofFailing} of ${proof.length} not matching` : `${proof.length} of ${proof.length} returns reproduced`}
            </Chip>
          ) : (
            <Chip tone="mute">no real pairings for this year yet</Chip>
          )
        }
      >
        {proof.length ? (
          <ul className="space-y-2 text-[13px]">
            {proof.map((p) => (
              <li key={p.id} className="flex gap-3">
                <Mono
                  className={`mt-0.5 w-16 flex-none ${
                    p.outcome === "match" ? "text-teal" : p.outcome === "refused" ? "text-dusk" : "text-ember"
                  }`}
                >
                  {p.outcome === "match" ? "match" : p.outcome === "refused" ? "skipped" : "off"}
                </Mono>
                <div className="min-w-0">
                  <div className="text-fog">{p.clientName}</div>
                  {p.outcome === "mismatch" ? (
                    <ul className="mt-0.5 text-[12px] text-mist">
                      {p.diffs.map((d) => (
                        <li key={d.line}>
                          {d.line}: derived {fmtMoney(d.derived)}, printed {fmtMoney(d.read)}
                        </li>
                      ))}
                    </ul>
                  ) : p.outcome === "refused" ? (
                    <ul className="mt-0.5 text-[12px] text-dusk">
                      {p.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-[12px] text-dusk">Before column derived exactly as printed.</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">
            Build a recap from a real before print and a real after print for {selected} and it
            shows up here as a test case: the engine re-derives that before with these tables and
            has to match it to the dollar.
          </p>
        )}
        <Note>
          &ldquo;Skipped&rdquo; means the engine won&rsquo;t derive that return at all (a part-year
          form, a credit, a state without a card), so it proves nothing either way. &ldquo;Off&rdquo;
          means a number on this card is wrong for that client.
        </Note>

        {problems.length || serverProblems.length ? (
          <ul className="mt-4 space-y-1 rounded-[16px] border border-danger/40 bg-danger/[0.06] px-4 py-3 text-[12.5px] text-mist">
            <li className="text-danger">Can&rsquo;t save until these are fixed:</li>
            {[...problems, ...serverProblems].map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-ember">·</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-edge pt-5">
          <button type="button" onClick={save} disabled={saving || !!problems.length || !draft.dirty} className={btnPrimary}>
            {saving ? "Saving…" : `Save ${selected} tables`}
          </button>
          {draft.stored || !draft.seeded ? (
            <button type="button" onClick={reset} disabled={saving} className={btnGhost}>
              {draft.stored ? (draft.seeded ? "Back to the shipped tables" : "Delete this year") : "Discard this year"}
            </button>
          ) : draft.dirty ? (
            <button type="button" onClick={reset} disabled={saving} className={btnGhost}>
              Discard changes
            </button>
          ) : null}
          {flash ? <span className="text-[13px] font-semibold text-teal">Saved</span> : null}
          {error ? <span className="text-[13px] text-danger">{error}</span> : null}
          {!draft.dirty && !flash ? <span className="text-[12px] text-dusk">No unsaved changes.</span> : null}
        </div>
      </Panel>
    </div>
  );
}

/* ─────────────────────────────── federal ─────────────────────────────── */

function FederalEditor({ card, onChange }: { card: FederalCard; onChange: (patch: Partial<FederalCard>) => void }) {
  return (
    <div className="space-y-5">
      <Panel title="Federal · brackets">
        <BracketGrid value={card.brackets} onChange={(brackets) => onChange({ brackets })} />
        <TaxTableBox
          value={card.taxTable}
          onChange={(taxTable) => onChange({ taxTable })}
          hint="The IRS tax table: $50 rows, priced at the row's midpoint, used under $100,000."
        />
      </Panel>
      <Panel title="Federal · deduction and thresholds">
        <StatusRow label="Standard deduction" value={card.standardDeduction} onChange={(standardDeduction) => onChange({ standardDeduction })} />
        <StatusRow label="QBI threshold" hint="Form 8995-A: above this taxable income the W-2 wage and property limits phase in." value={card.qbi.threshold} onChange={(threshold) => onChange({ qbi: { ...card.qbi, threshold } })} />
        <StatusRow label="QBI phase-in range" hint="Form 8995-A Part III: the limits phase in over this much income above the threshold." value={card.qbi.phaseInRange} onChange={(phaseInRange) => onChange({ qbi: { ...card.qbi, phaseInRange } })} />
        <StatusRow label="Additional Medicare threshold" hint="Form 8959: wages + SE earnings above this pay the extra rate." value={card.additionalMedicare.threshold} onChange={(threshold) => onChange({ additionalMedicare: { ...card.additionalMedicare, threshold } })} />
        <StatusRow label="Net investment income tax threshold" hint="Form 8960: the rate applies to investment income above this AGI." value={card.netInvestmentIncomeTax.threshold} onChange={(threshold) => onChange({ netInvestmentIncomeTax: { ...card.netInvestmentIncomeTax, threshold } })} />
        <StatusRow label="Child tax credit phase-out threshold" hint="Schedule 8812: the credit shrinks above this AGI." value={card.childTaxCredit.phaseOutThreshold} onChange={(phaseOutThreshold) => onChange({ childTaxCredit: { ...card.childTaxCredit, phaseOutThreshold } })} />
        <StatusRow label="Capital gains 0% bracket" hint="Qualified Dividends and Capital Gain Tax Worksheet: dividends and long-term gains inside this much taxable income are taxed at 0%." value={card.capitalGains.zeroRateBelow} onChange={(zeroRateBelow) => onChange({ capitalGains: { ...card.capitalGains, zeroRateBelow } })} />
        <StatusRow label="Capital gains top-rate threshold" hint="Taxable income above this is taxed at the top capital gains rate." value={card.capitalGains.topRateAbove} onChange={(topRateAbove) => onChange({ capitalGains: { ...card.capitalGains, topRateAbove } })} />
      </Panel>
      <Panel title="Federal · child tax credit and QBI limits">
        <div className="grid gap-4 sm:grid-cols-3">
          <Labeled label="Credit per child" hint="Form 1040 line 19, before the phase-out.">
            <Num value={card.childTaxCredit.perChild} onChange={(v) => onChange({ childTaxCredit: { ...card.childTaxCredit, perChild: v ?? 0 } })} />
          </Labeled>
          <Labeled label="Phase-out: reduce by" hint="Per step (or part) of AGI over the threshold.">
            <Num value={card.childTaxCredit.phaseOutPer} onChange={(v) => onChange({ childTaxCredit: { ...card.childTaxCredit, phaseOutPer: v ?? 0 } })} />
          </Labeled>
          <Labeled label="Phase-out: per step of">
            <Num value={card.childTaxCredit.phaseOutStep} onChange={(v) => onChange({ childTaxCredit: { ...card.childTaxCredit, phaseOutStep: v ?? 1000 } })} />
          </Labeled>
          <Labeled label="QBI W-2 wage limit" hint="Form 8995-A line 5: this share of W-2 wages.">
            <Num value={card.qbi.wageLimit} pct onChange={(v) => onChange({ qbi: { ...card.qbi, wageLimit: v ?? 0 } })} />
          </Labeled>
          <Labeled label="QBI wages + property: wages" hint="Form 8995-A line 6.">
            <Num value={card.qbi.wageAndPropertyLimit.wages} pct onChange={(v) => onChange({ qbi: { ...card.qbi, wageAndPropertyLimit: { ...card.qbi.wageAndPropertyLimit, wages: v ?? 0 } } })} />
          </Labeled>
          <Labeled label="QBI wages + property: property" hint="Form 8995-A line 8.">
            <Num value={card.qbi.wageAndPropertyLimit.property} pct onChange={(v) => onChange({ qbi: { ...card.qbi, wageAndPropertyLimit: { ...card.qbi.wageAndPropertyLimit, property: v ?? 0 } } })} />
          </Labeled>
        </div>
      </Panel>
      <Panel title="Federal · itemized deductions and rental losses">
        <StatusRow label="SALT cap" hint="Schedule A line 5e: the most state and local tax that can be deducted." value={card.salt.cap} onChange={(cap) => onChange({ salt: { ...card.salt, cap } })} />
        <div className="py-3">
          <Check
            value={!!card.salt.phaseDownAbove}
            onChange={(on) =>
              onChange({
                salt: {
                  ...card.salt,
                  phaseDownAbove: on ? { single: 500000, mfj: 500000, qss: 500000, hoh: 500000, mfs: 250000 } : null,
                  phaseDownRate: on ? card.salt.phaseDownRate || 0.3 : 0,
                },
              })
            }
            label="The cap phases down on income"
            hint="From 2025 the $40,000 cap shrinks by 30% of modified AGI over $500,000, down to a $10,000 floor. Years with a flat $10,000 cap have no phase-down."
          />
        </div>
        {card.salt.phaseDownAbove ? (
          <div className="space-y-1 rounded-[16px] border border-edge px-4 py-3">
            <StatusRow label="Phases down above (modified AGI)" value={card.salt.phaseDownAbove} onChange={(phaseDownAbove) => onChange({ salt: { ...card.salt, phaseDownAbove } })} />
            <Labeled label="Reduce by (share of the excess)" className="max-w-[160px] pt-3">
              <Num value={card.salt.phaseDownRate} pct onChange={(v) => onChange({ salt: { ...card.salt, phaseDownRate: v ?? 0 } })} />
            </Labeled>
            <StatusRow label="Floor" value={card.salt.floor} onChange={(floor) => onChange({ salt: { ...card.salt, floor } })} />
          </div>
        ) : null}
        <div className="mt-5 border-t border-edge pt-4">
          <Mono className="text-mist">Rental loss allowance (Form 8582)</Mono>
          <p className="mt-1 text-[11.5px] leading-snug text-dusk">
            The special allowance for rental real estate losses with active participation, shrinking by the rate for every dollar of modified AGI over the threshold. Statutory: $25,000, half of the excess over $100,000.
          </p>
          <div className="mt-3 grid max-w-[520px] gap-4 sm:grid-cols-3">
            <Labeled label="Allowance">
              <Num value={card.passiveAllowance.amount} onChange={(v) => onChange({ passiveAllowance: { ...card.passiveAllowance, amount: v ?? 0 } })} />
            </Labeled>
            <Labeled label="Phases out above">
              <Num value={card.passiveAllowance.magiAbove} onChange={(v) => onChange({ passiveAllowance: { ...card.passiveAllowance, magiAbove: v ?? 0 } })} />
            </Labeled>
            <Labeled label="Rate">
              <Num value={card.passiveAllowance.rate} pct onChange={(v) => onChange({ passiveAllowance: { ...card.passiveAllowance, rate: v ?? 0 } })} />
            </Labeled>
          </div>
        </div>
      </Panel>
      <Panel title="Federal · premium tax credit (Form 8962)">
        <Mono className="text-mist">Applicable figure by household income as a % of the poverty line</Mono>
        <p className="mt-1 text-[11.5px] leading-snug text-dusk">
          Within each row the figure runs in a straight line from the start to the end. Below the first row it is 0; at or above the cap it is the cap figure.
        </p>
        <div className="mt-3 overflow-x-auto">
          <div className="min-w-[520px]">
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_28px] gap-2 border-b border-edge pb-2">
              {["From %", "To %", "Start", "End"].map((h) => (
                <Mono key={h} className="text-dusk">{h}</Mono>
              ))}
              <span />
            </div>
            {card.ptc.applicableFigure.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_28px] items-center gap-2 border-b border-edge py-1.5 last:border-b-0">
                <Num value={row.from} onChange={(v) => onChange({ ptc: { ...card.ptc, applicableFigure: card.ptc.applicableFigure.map((r, j) => (j === i ? { ...r, from: v ?? 0 } : r)) } })} ariaLabel={`PTC row ${i + 1} from`} />
                <Num value={row.to} onChange={(v) => onChange({ ptc: { ...card.ptc, applicableFigure: card.ptc.applicableFigure.map((r, j) => (j === i ? { ...r, to: v ?? 0 } : r)) } })} ariaLabel={`PTC row ${i + 1} to`} />
                <Num value={row.start} pct onChange={(v) => onChange({ ptc: { ...card.ptc, applicableFigure: card.ptc.applicableFigure.map((r, j) => (j === i ? { ...r, start: v ?? 0 } : r)) } })} ariaLabel={`PTC row ${i + 1} start`} />
                <Num value={row.end} pct onChange={(v) => onChange({ ptc: { ...card.ptc, applicableFigure: card.ptc.applicableFigure.map((r, j) => (j === i ? { ...r, end: v ?? 0 } : r)) } })} ariaLabel={`PTC row ${i + 1} end`} />
                <button type="button" onClick={() => onChange({ ptc: { ...card.ptc, applicableFigure: card.ptc.applicableFigure.filter((_, j) => j !== i) } })} aria-label={`Remove PTC row ${i + 1}`} className="cursor-pointer text-center text-[14px] text-dusk hover:text-danger">
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const last = card.ptc.applicableFigure[card.ptc.applicableFigure.length - 1];
                onChange({ ptc: { ...card.ptc, applicableFigure: [...card.ptc.applicableFigure, { from: last?.to ?? 0, to: (last?.to ?? 0) + 50, start: last?.end ?? 0, end: last?.end ?? 0 }] } });
              }}
              className={`${linkBtn} mt-3`}
            >
              + Add range
            </button>
          </div>
        </div>
        <div className="mt-4 grid max-w-[360px] gap-4 sm:grid-cols-2">
          <Labeled label="Cap at %">
            <Num value={card.ptc.capAt} onChange={(v) => onChange({ ptc: { ...card.ptc, capAt: v ?? 0 } })} />
          </Labeled>
          <Labeled label="Figure at the cap">
            <Num value={card.ptc.capFigure} pct onChange={(v) => onChange({ ptc: { ...card.ptc, capFigure: v ?? 0 } })} />
          </Labeled>
        </div>
        <div className="mt-5 border-t border-edge pt-4">
          <Mono className="text-mist">Repayment cap on excess advance credit (line 28)</Mono>
          <p className="mt-1 text-[11.5px] leading-snug text-dusk">
            Each row applies to household income below that percentage of the poverty line. Above the last row the whole excess is repaid.
          </p>
          <div className="mt-3 max-w-[520px]">
            <div className="grid grid-cols-[1fr_1fr_1fr_28px] gap-2 border-b border-edge pb-2">
              {["Below %", "Single", "Any other status"].map((h) => (
                <Mono key={h} className="text-dusk">{h}</Mono>
              ))}
              <span />
            </div>
            {card.ptc.repaymentLimit.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_28px] items-center gap-2 border-b border-edge py-1.5 last:border-b-0">
                <Num value={row.below} onChange={(v) => onChange({ ptc: { ...card.ptc, repaymentLimit: card.ptc.repaymentLimit.map((r, j) => (j === i ? { ...r, below: v ?? 0 } : r)) } })} ariaLabel={`Repayment cap row ${i + 1} below`} />
                <Num value={row.single} onChange={(v) => onChange({ ptc: { ...card.ptc, repaymentLimit: card.ptc.repaymentLimit.map((r, j) => (j === i ? { ...r, single: v ?? 0 } : r)) } })} ariaLabel={`Repayment cap row ${i + 1} single`} />
                <Num value={row.other} onChange={(v) => onChange({ ptc: { ...card.ptc, repaymentLimit: card.ptc.repaymentLimit.map((r, j) => (j === i ? { ...r, other: v ?? 0 } : r)) } })} ariaLabel={`Repayment cap row ${i + 1} other`} />
                <button type="button" onClick={() => onChange({ ptc: { ...card.ptc, repaymentLimit: card.ptc.repaymentLimit.filter((_, j) => j !== i) } })} aria-label={`Remove repayment cap row ${i + 1}`} className="cursor-pointer text-center text-[14px] text-dusk hover:text-danger">
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const last = card.ptc.repaymentLimit[card.ptc.repaymentLimit.length - 1];
                onChange({ ptc: { ...card.ptc, repaymentLimit: [...card.ptc.repaymentLimit, { below: (last?.below ?? 100) + 100, single: last?.single ?? 0, other: last?.other ?? 0 }] } });
              }}
              className={`${linkBtn} mt-3`}
            >
              + Add row
            </button>
          </div>
        </div>
      </Panel>
      <Panel title="Federal · rates">
        <div className="grid gap-4 sm:grid-cols-3">
          <Labeled label="QBI rate">
            <Num value={card.qbi.rate} pct onChange={(v) => onChange({ qbi: { ...card.qbi, rate: v ?? 0 } })} />
          </Labeled>
          <Labeled label="Additional Medicare rate">
            <Num value={card.additionalMedicare.rate} pct onChange={(v) => onChange({ additionalMedicare: { ...card.additionalMedicare, rate: v ?? 0 } })} />
          </Labeled>
          <Labeled label="Net investment income tax rate">
            <Num value={card.netInvestmentIncomeTax.rate} pct onChange={(v) => onChange({ netInvestmentIncomeTax: { ...card.netInvestmentIncomeTax, rate: v ?? 0 } })} />
          </Labeled>
          <Labeled label="Capital gains rate" hint="Qualified dividends and long-term gains between the two thresholds">
            <Num value={card.capitalGains.rate} pct onChange={(v) => onChange({ capitalGains: { ...card.capitalGains, rate: v ?? 0 } })} />
          </Labeled>
          <Labeled label="Capital gains top rate">
            <Num value={card.capitalGains.topRate} pct onChange={(v) => onChange({ capitalGains: { ...card.capitalGains, topRate: v ?? 0 } })} />
          </Labeled>
          <Labeled label="SS wage base" hint="Schedule SE line 7">
            <Num value={card.selfEmployment.wageBase} onChange={(v) => onChange({ selfEmployment: { ...card.selfEmployment, wageBase: v ?? 0 } })} />
          </Labeled>
          <Labeled label="SE net earnings factor" hint="Schedule SE line 4a">
            <Num value={card.selfEmployment.netEarningsFactor} pct onChange={(v) => onChange({ selfEmployment: { ...card.selfEmployment, netEarningsFactor: v ?? 0 } })} />
          </Labeled>
          <Labeled label="Social Security rate">
            <Num value={card.selfEmployment.socialSecurityRate} pct onChange={(v) => onChange({ selfEmployment: { ...card.selfEmployment, socialSecurityRate: v ?? 0 } })} />
          </Labeled>
          <Labeled label="Medicare rate">
            <Num value={card.selfEmployment.medicareRate} pct onChange={(v) => onChange({ selfEmployment: { ...card.selfEmployment, medicareRate: v ?? 0 } })} />
          </Labeled>
        </div>
      </Panel>
    </div>
  );
}

/* ─────────────────────────────── state ─────────────────────────────── */

function StateEditor({
  code,
  card,
  onChange,
  onRemove,
}: {
  code: string;
  card: StateCard;
  onChange: (patch: Partial<StateCard>) => void;
  onRemove: () => void;
}) {
  const ex = card.exemption;
  return (
    <div className="space-y-5">
      <Panel
        title={`${code} · ${card.name || US_STATES[code] || code}`}
        action={
          <button type="button" onClick={onRemove} className={`${linkBtn} hover:!text-danger`}>
            Remove state
          </button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <Labeled label="Name">
            <input value={card.name} onChange={(e) => onChange({ name: e.target.value.slice(0, 40) })} className={inputCls} />
          </Labeled>
          <Labeled label="Resident form" hint="e.g. 540, NJ-1040, IT-201.">
            <input value={card.form} onChange={(e) => onChange({ form: e.target.value.slice(0, 20) })} className={inputCls} disabled={!card.incomeTax} />
          </Labeled>
          <Labeled
            label="Nonresident form"
            hint="e.g. 540NR. Prorates the resident tax by the state-source share of income, California's way. Blank means nonresident returns are refused."
          >
            <input
              value={card.nonresident?.form ?? ""}
              onChange={(e) => {
                const form = e.target.value.slice(0, 20);
                onChange({ nonresident: form.trim() ? { form } : null });
              }}
              className={inputCls}
              disabled={!card.incomeTax}
            />
          </Labeled>
          <Labeled label="Income tax">
            <Toggle value={card.incomeTax} onChange={(incomeTax) => onChange(incomeTax ? { incomeTax } : { ...noIncomeTaxCard(code), name: card.name })} labels={["Yes", "None"]} />
          </Labeled>
        </div>
        {!card.incomeTax ? (
          <Note>
            No income tax: a resident of this state has no state column on either side of the recap.
          </Note>
        ) : (
          <div className="mt-4 space-y-3 border-t border-edge pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <Chip tone={card.proven ? "pos" : "warn"}>{card.proven ? "Proven on a real return" : "Seeded, not yet proven on a client"}</Chip>
              <Check
                value={card.proven}
                onChange={(proven) => onChange({ proven })}
                label="Proven on a real return"
                hint="Flip this once a client of this state has gone through cleanly. The engine still proves the card on every return before using it; this only changes the note staff see."
              />
            </div>
            <Labeled label="Notes on this card" hint="Where the figures came from, what to verify first, and what the engine can't model for this state.">
              <textarea
                value={card.note}
                onChange={(e) => onChange({ note: e.target.value.slice(0, 1200) })}
                rows={3}
                className="w-full rounded-[10px] border border-edge-mid bg-panel-2 px-3 py-2 font-body text-[12.5px] leading-relaxed text-fog outline-none transition-[border-color,box-shadow] duration-150 focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]"
              />
            </Labeled>
          </div>
        )}
      </Panel>

      {card.incomeTax ? (
        <>
          <Panel title="Rules · where the state starts">
            <div className="grid gap-4 sm:grid-cols-2">
              <Labeled label="Starting point" hint="Most states start from federal AGI. Some start from federal taxable income, which already has the standard deduction and QBI taken off. New Jersey starts from its own gross income: wages plus its own business profit line, with none of the federal adjustments.">
                <Select
                  value={card.base}
                  onChange={(base) => onChange({ base: base as StateCard["base"] })}
                  options={[
                    { value: "federalAgi", label: "Federal adjusted gross income" },
                    { value: "federalTaxableIncome", label: "Federal taxable income" },
                    { value: "stateGrossIncome", label: "The state's own gross income (New Jersey)" },
                  ]}
                />
              </Labeled>
              <div className="space-y-3">
                {card.base !== "stateGrossIncome" ? (
                  <Check
                    value={card.addBackSeDeduction}
                    onChange={(addBackSeDeduction) => onChange({ addBackSeDeduction })}
                    label="Disallows the SE-tax deduction (add it back)"
                    hint="Pennsylvania does."
                  />
                ) : null}
                {card.base === "federalTaxableIncome" ? (
                  <Check
                    value={card.addBackQbi}
                    onChange={(addBackQbi) => onChange({ addBackQbi })}
                    label="Disallows the QBI deduction (add it back)"
                  />
                ) : null}
              </div>
            </div>
          </Panel>

          <Panel title="Rules · deduction">
            <Labeled label="Deduction">
              <Select
                value={card.deduction.kind}
                onChange={(kind) =>
                  onChange({
                    deduction:
                      kind === "standard"
                        ? { kind, amount: card.deduction.kind === "standard" ? card.deduction.amount : same(0) }
                        : kind === "federal"
                          ? { kind }
                          : { kind: "none" },
                  })
                }
                options={[
                  { value: "standard", label: "The state's own standard deduction" },
                  { value: "federal", label: "Same as the federal deduction" },
                  { value: "none", label: "None (New Jersey)" },
                ]}
              />
            </Labeled>
            {card.deduction.kind === "standard" ? (
              <StatusRow label="Standard deduction" value={card.deduction.amount} onChange={(amount) => onChange({ deduction: { kind: "standard", amount } })} />
            ) : null}
          </Panel>

          <Panel title="Rules · personal exemption">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <Labeled label="Exemption">
                <Select
                  value={ex.kind}
                  onChange={(kind) => onChange({ exemption: { ...ex, kind: kind as StateCard["exemption"]["kind"] } })}
                  options={[
                    { value: "none", label: "None" },
                    { value: "credit", label: "A credit off the tax (California's $153)" },
                    { value: "deduction", label: "A deduction off income (New Jersey's $1,000)" },
                  ]}
                />
              </Labeled>
              {ex.kind !== "none" ? (
                <Labeled label="Amount each">
                  <Num value={ex.amount} onChange={(v) => onChange({ exemption: { ...ex, amount: v ?? 0 } })} />
                </Labeled>
              ) : null}
            </div>
            {ex.kind !== "none" ? (
              <>
                <StatusRow label="Exemptions" hint="How many the filer gets: 1, or 2 on a joint return." value={ex.count} onChange={(count) => onChange({ exemption: { ...ex, count } })} />
                <Labeled label="Per dependent" hint="The same kind of exemption for each dependent on the return (California's $475 credit, New Jersey's $1,500 deduction). 0 if the state has none." className="max-w-[200px] pt-3">
                  <Num value={ex.dependentAmount} onChange={(v) => onChange({ exemption: { ...ex, dependentAmount: v ?? 0 } })} />
                </Labeled>
                <div className="mt-4">
                  <Check
                    value={!!ex.phaseOut}
                    onChange={(on) =>
                      onChange({
                        exemption: {
                          ...ex,
                          phaseOut: on ? { threshold: same(250000), step: same(2500), reduce: 6 } : null,
                        },
                      })
                    }
                    label="Shrinks above an income threshold"
                    hint="California takes $6 off per $2,500 of federal AGI over the threshold, per exemption."
                  />
                </div>
                {ex.phaseOut ? (
                  <div className="mt-3 space-y-1 rounded-[16px] border border-edge px-4 py-3">
                    <StatusRow label="Threshold (federal AGI)" value={ex.phaseOut.threshold} onChange={(threshold) => onChange({ exemption: { ...ex, phaseOut: { ...ex.phaseOut!, threshold } } })} />
                    <StatusRow label="Per step of" value={ex.phaseOut.step} onChange={(step) => onChange({ exemption: { ...ex, phaseOut: { ...ex.phaseOut!, step } } })} />
                    <Labeled label="Reduce by (each exemption)" className="max-w-[160px]">
                      <Num value={ex.phaseOut.reduce} onChange={(v) => onChange({ exemption: { ...ex, phaseOut: { ...ex.phaseOut!, reduce: v ?? 0 } } })} />
                    </Labeled>
                  </div>
                ) : null}
              </>
            ) : null}
          </Panel>

          <Panel title="Brackets">
            <BracketGrid value={card.brackets} onChange={(brackets) => onChange({ brackets })} />
            <TaxTableBox
              value={card.taxTable}
              onChange={(taxTable) => onChange({ taxTable })}
              hint="If the state prints a tax table for lower incomes, the return's tax comes from it and rounds the way its rows do. California: $100 rows centred on the hundreds, under $100,000."
            />
          </Panel>

          <Panel title="Rules · medical and health coverage">
            <Check
              value={!!card.medical}
              onChange={(on) => onChange({ medical: on ? { floorRate: 0.02, seHealthInsuranceFull: true } : null })}
              label="Medical expense deduction"
              hint="New Jersey: marketplace premiums the client actually paid (less the credit allowed) above a share of gross income, plus the self-employed health insurance deduction in full."
            />
            {card.medical ? (
              <div className="mt-3 grid max-w-[520px] gap-4 sm:grid-cols-2">
                <Labeled label="Floor (share of gross income)">
                  <Num value={card.medical.floorRate} pct onChange={(v) => onChange({ medical: { ...card.medical!, floorRate: v ?? 0 } })} />
                </Labeled>
                <div className="pt-6">
                  <Check
                    value={card.medical.seHealthInsuranceFull}
                    onChange={(seHealthInsuranceFull) => onChange({ medical: { ...card.medical!, seHealthInsuranceFull } })}
                    label="SE health insurance deduction counts in full"
                  />
                </div>
              </div>
            ) : null}
            <div className="mt-5">
              <Check
                value={!!card.sharedResponsibility}
                onChange={(on) => onChange({ sharedResponsibility: on ? { rate: 0.025, threshold: { single: 10000, mfs: 10000, hoh: 20000, mfj: 20000, qss: 20000 }, flatAdult: 695 } : null })}
                label="Health coverage penalty (shared responsibility payment)"
                hint="The greater of a rate on income over the filing threshold and a flat amount per adult, prorated by uninsured months. Counted in State Taxes, as the recap does."
              />
              {card.sharedResponsibility ? (
                <div className="mt-3 space-y-1 rounded-[16px] border border-edge px-4 py-3">
                  <div className="grid max-w-[360px] gap-4 sm:grid-cols-2">
                    <Labeled label="Rate">
                      <Num value={card.sharedResponsibility.rate} pct onChange={(v) => onChange({ sharedResponsibility: { ...card.sharedResponsibility!, rate: v ?? 0 } })} />
                    </Labeled>
                    <Labeled label="Flat amount per adult">
                      <Num value={card.sharedResponsibility.flatAdult} onChange={(v) => onChange({ sharedResponsibility: { ...card.sharedResponsibility!, flatAdult: v ?? 0 } })} />
                    </Labeled>
                  </div>
                  <StatusRow label="Income threshold" value={card.sharedResponsibility.threshold} onChange={(threshold) => onChange({ sharedResponsibility: { ...card.sharedResponsibility!, threshold } })} />
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel title="Rules · S corporations">
            <Check
              value={!!card.entity}
              onChange={(on) =>
                onChange({
                  entity: on
                    ? { form: "", rate: 0, minimum: [{ below: null, amount: 0 }], pte: null }
                    : null,
                })
              }
              label="The state has its own return for the S corporation"
              hint="What the corporation itself pays: a rate on its net income (California's 1.5%), a minimum tax — flat, or tiered by gross receipts (New Jersey's $375 to $1,500) — and the elective pass-through entity tax with how it comes back to the owner. Without this the engine refuses an S corporation shareholder's return for this state."
            />
            {card.entity ? <EntityEditor value={card.entity} onChange={(entity) => onChange({ entity })} /> : null}
          </Panel>

          <Panel title="Rules · partnerships and LLCs">
            <Check
              value={!!card.partnership}
              onChange={(on) => onChange({ partnership: on ? { form: "", annualTax: 0, fee: [{ below: null, amount: 0 }] } : null })}
              label="The state has its own return for the partnership or LLC"
              hint="What the entity itself pays: a flat annual tax (California's $800) and a fee tiered by its total income — gross receipts, not profit (California's $900 from $250,000 up to $11,790 from $5,000,000). A state that charges nothing still needs the rule, with zeros, or the engine refuses a partner's return. The elective pass-through entity tax is the S corporation rule above, which a partnership shares."
            />
            {card.partnership ? <PartnershipEditor value={card.partnership} onChange={(partnership) => onChange({ partnership })} /> : null}
          </Panel>

          <Panel title="Extras">
            <Check
              value={!!card.surtax}
              onChange={(on) => onChange({ surtax: on ? { rate: 0.01, above: 1000000 } : null })}
              label="Surtax above a floor"
              hint="California's 1% Mental Health Services Tax on taxable income over $1,000,000."
            />
            {card.surtax ? (
              <div className="mt-3 grid max-w-[360px] gap-4 sm:grid-cols-2">
                <Labeled label="Rate">
                  <Num value={card.surtax.rate} pct onChange={(v) => onChange({ surtax: { ...card.surtax!, rate: v ?? 0 } })} />
                </Labeled>
                <Labeled label="Above">
                  <Num value={card.surtax.above} onChange={(v) => onChange({ surtax: { ...card.surtax!, above: v ?? 0 } })} />
                </Labeled>
              </div>
            ) : null}
            <div className="mt-5">
              <Check
                value={!!card.local}
                onChange={(on) => onChange({ local: on ? { name: "", brackets: same([{ upTo: null, rate: 0.03 }]) } : null })}
                label="A city tax on the same taxable income"
                hint="New York City residents pay it on the state return."
              />
              {card.local ? (
                <div className="mt-3 space-y-3">
                  <Labeled label="City" className="max-w-[240px]">
                    <input value={card.local.name} onChange={(e) => onChange({ local: { ...card.local!, name: e.target.value.slice(0, 40) } })} placeholder="New York City" className={inputCls} />
                  </Labeled>
                  <BracketGrid value={card.local.brackets} onChange={(brackets) => onChange({ local: { ...card.local!, brackets } })} />
                </div>
              ) : null}
            </div>
          </Panel>
        </>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────── S corporation rules ─────────────────────────────── */

function EntityEditor({ value, onChange }: { value: EntityRules; onChange: (v: EntityRules) => void }) {
  const minimum = value.minimum.length ? value.minimum : [{ below: null, amount: 0 }];
  const setMin = (rows: EntityRules["minimum"]) => onChange({ ...value, minimum: rows });
  const pte = value.pte;
  const setPte = (p: EntityRules["pte"]) => onChange({ ...value, pte: p });
  return (
    <div className="mt-4 space-y-5">
      <div className="grid max-w-[520px] gap-4 sm:grid-cols-2">
        <Labeled label="Form" hint="e.g. 100S, CBT-100S, CT-3-S">
          <input value={value.form} onChange={(e) => onChange({ ...value, form: e.target.value.slice(0, 20) })} className={inputCls} />
        </Labeled>
        <Labeled label="Rate on net income" hint="0 where the state charges only a minimum.">
          <Num value={value.rate} pct onChange={(v) => onChange({ ...value, rate: v ?? 0 })} />
        </Labeled>
      </div>

      <div>
        <Mono className="text-mist">Minimum tax</Mono>
        <p className="mt-1 text-[11.5px] leading-snug text-dusk">
          One row is a flat minimum. Several are tiers by the corporation&rsquo;s gross receipts: the first row the receipts fall under applies; the last row is &ldquo;and over&rdquo;.
        </p>
        <div className="mt-3 max-w-[420px]">
          <div className="grid grid-cols-[1fr_1fr_28px] gap-2 border-b border-edge pb-2">
            <Mono className="text-dusk">Receipts below</Mono>
            <Mono className="text-dusk">Minimum</Mono>
            <span />
          </div>
          {minimum.map((row, i) => {
            const last = i === minimum.length - 1;
            return (
              <div key={i} className="grid grid-cols-[1fr_1fr_28px] items-center gap-2 border-b border-edge py-1.5 last:border-b-0">
                {last ? (
                  <span className="px-2.5 font-mono text-[11.5px] text-dusk">and over</span>
                ) : (
                  <Num value={row.below} nullable onChange={(v) => setMin(minimum.map((r, j) => (j === i ? { ...r, below: v } : r)))} ariaLabel={`Minimum tax row ${i + 1} receipts below`} />
                )}
                <Num value={row.amount} onChange={(v) => setMin(minimum.map((r, j) => (j === i ? { ...r, amount: v ?? 0 } : r)))} ariaLabel={`Minimum tax row ${i + 1} amount`} />
                <button
                  type="button"
                  disabled={minimum.length <= 1}
                  onClick={() => {
                    const rows = minimum.filter((_, j) => j !== i);
                    rows[rows.length - 1] = { ...rows[rows.length - 1], below: null };
                    setMin(rows);
                  }}
                  aria-label={`Remove minimum tax row ${i + 1}`}
                  className="cursor-pointer text-center text-[14px] text-dusk hover:text-danger disabled:opacity-30"
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => {
              const lastRow = minimum[minimum.length - 1];
              setMin([...minimum.slice(0, -1), { ...lastRow, below: 0 }, { below: null, amount: lastRow.amount }]);
            }}
            className={`${linkBtn} mt-3`}
          >
            + Add tier
          </button>
        </div>
      </div>

      <div>
        <Check
          value={!!pte}
          onChange={(on) => setPte(on ? { brackets: [{ upTo: null, rate: 0.093 }], credit: "nonrefundable" } : null)}
          label="Elective pass-through entity tax"
          hint="The corporation can pay state tax on its income for the owner (deducted federally). One bracket is a flat rate (California's 9.3%); several are graduated on the entity's income (New Jersey's BAIT)."
        />
        {pte ? (
          <div className="mt-3 space-y-4 rounded-[16px] border border-edge px-4 py-3">
            <div className="max-w-[420px]">
              <div className="grid grid-cols-[1fr_1fr_28px] gap-2 border-b border-edge pb-2">
                <Mono className="text-dusk">Rate</Mono>
                <Mono className="text-dusk">Up to</Mono>
                <span />
              </div>
              {pte.brackets.map((row, i) => {
                const last = i === pte.brackets.length - 1;
                return (
                  <div key={i} className="grid grid-cols-[1fr_1fr_28px] items-center gap-2 border-b border-edge py-1.5 last:border-b-0">
                    <Num value={row.rate} pct onChange={(v) => setPte({ ...pte, brackets: pte.brackets.map((r, j) => (j === i ? { ...r, rate: v ?? 0 } : r)) })} ariaLabel={`PTE bracket ${i + 1} rate`} />
                    {last ? (
                      <span className="px-2.5 font-mono text-[11.5px] text-dusk">and over</span>
                    ) : (
                      <Num value={row.upTo} nullable onChange={(v) => setPte({ ...pte, brackets: pte.brackets.map((r, j) => (j === i ? { ...r, upTo: v } : r)) })} ariaLabel={`PTE bracket ${i + 1} up to`} />
                    )}
                    <button
                      type="button"
                      disabled={pte.brackets.length <= 1}
                      onClick={() => {
                        const rows = pte.brackets.filter((_, j) => j !== i);
                        rows[rows.length - 1] = { ...rows[rows.length - 1], upTo: null };
                        setPte({ ...pte, brackets: rows });
                      }}
                      aria-label={`Remove PTE bracket ${i + 1}`}
                      className="cursor-pointer text-center text-[14px] text-dusk hover:text-danger disabled:opacity-30"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  const lastRow = pte.brackets[pte.brackets.length - 1];
                  setPte({ ...pte, brackets: [...pte.brackets.slice(0, -1), { ...lastRow, upTo: 0 }, { upTo: null, rate: lastRow.rate }] });
                }}
                className={`${linkBtn} mt-3`}
              >
                + Add bracket
              </button>
            </div>
            <Labeled label="How the owner gets it back" className="max-w-[520px]">
              <Select
                value={pte.credit}
                onChange={(credit) => setPte({ ...pte, credit: credit as NonNullable<EntityRules["pte"]>["credit"] })}
                options={[
                  { value: "nonrefundable", label: "A credit limited to their tax, inside the state's total (California, FTB 3804-CR)" },
                  { value: "refundable", label: "A refundable credit claimed with the payments (New Jersey BAIT, New York)" },
                  { value: "exclusion", label: "The income is left off their state return instead (Georgia)" },
                ]}
              />
            </Labeled>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ─────────────────────────────── partnership rules ─────────────────────────────── */

function PartnershipEditor({ value, onChange }: { value: PartnershipRules; onChange: (v: PartnershipRules) => void }) {
  const fee = value.fee.length ? value.fee : [{ below: null, amount: 0 }];
  const setFee = (rows: PartnershipRules["fee"]) => onChange({ ...value, fee: rows });
  return (
    <div className="mt-4 space-y-5">
      <div className="grid max-w-[520px] gap-4 sm:grid-cols-2">
        <Labeled label="Form" hint="e.g. 568, 565, NJ-1065">
          <input value={value.form} onChange={(e) => onChange({ ...value, form: e.target.value.slice(0, 20) })} className={inputCls} />
        </Labeled>
        <Labeled label="Annual tax" hint="A flat amount every year, whatever the income.">
          <Num value={value.annualTax} onChange={(v) => onChange({ ...value, annualTax: v ?? 0 })} />
        </Labeled>
      </div>
      <div>
        <Mono className="text-mist">Fee by total income</Mono>
        <p className="mt-1 text-[11.5px] leading-snug text-dusk">
          The first row the entity&rsquo;s total income falls under applies; the last row is &ldquo;and over&rdquo;. One row of 0 means no fee.
        </p>
        <div className="mt-3 max-w-[420px]">
          <div className="grid grid-cols-[1fr_1fr_28px] gap-2 border-b border-edge pb-2">
            <Mono className="text-dusk">Income below</Mono>
            <Mono className="text-dusk">Fee</Mono>
            <span />
          </div>
          {fee.map((row, i) => {
            const last = i === fee.length - 1;
            return (
              <div key={i} className="grid grid-cols-[1fr_1fr_28px] items-center gap-2 border-b border-edge py-1.5 last:border-b-0">
                {last ? (
                  <span className="px-2.5 font-mono text-[11.5px] text-dusk">and over</span>
                ) : (
                  <Num value={row.below} nullable onChange={(v) => setFee(fee.map((r, j) => (j === i ? { ...r, below: v } : r)))} ariaLabel={`Fee row ${i + 1} income below`} />
                )}
                <Num value={row.amount} onChange={(v) => setFee(fee.map((r, j) => (j === i ? { ...r, amount: v ?? 0 } : r)))} ariaLabel={`Fee row ${i + 1} amount`} />
                <button
                  type="button"
                  disabled={fee.length <= 1}
                  onClick={() => {
                    const rows = fee.filter((_, j) => j !== i);
                    rows[rows.length - 1] = { ...rows[rows.length - 1], below: null };
                    setFee(rows);
                  }}
                  aria-label={`Remove fee row ${i + 1}`}
                  className="cursor-pointer text-center text-[14px] text-dusk hover:text-danger disabled:opacity-30"
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => {
              const lastRow = fee[fee.length - 1];
              setFee([...fee.slice(0, -1), { ...lastRow, below: 0 }, { below: null, amount: lastRow.amount }]);
            }}
            className={`${linkBtn} mt-3`}
          >
            + Add tier
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── pieces ─────────────────────────────── */

const same = <T,>(v: T): ByStatus<T> => ({ single: v, mfj: v, mfs: v, hoh: v, qss: v });

function fmtMoney(v: number | null): string {
  return v === null ? "blank" : `$${Math.round(v).toLocaleString("en-US")}`;
}

function CardTab({ active, onClick, label, sub, mute = false }: { active: boolean; onClick: () => void; label: string; sub: string; mute?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full cursor-pointer rounded-[10px] px-3 py-2 text-left transition-colors ${
        active ? "bg-white/[0.06] text-fog" : "text-muted hover:bg-white/[0.03] hover:text-fog"
      }`}
    >
      <div className={`text-[13px] font-semibold ${mute && !active ? "text-dusk" : ""}`}>{label}</div>
      <div className="font-mono text-[10px] uppercase tracking-[0.8px] text-dusk">{sub}</div>
    </button>
  );
}

function Labeled({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-mist">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[11.5px] leading-snug text-dusk">{hint}</span> : null}
    </label>
  );
}

function Caret() {
  return (
    <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-dusk">
      ▾
    </span>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Caret />
    </div>
  );
}

function Toggle({ value, onChange, labels }: { value: boolean; onChange: (v: boolean) => void; labels: [string, string] }) {
  return (
    <div role="group" className="inline-flex rounded-[10px] border border-edge-mid bg-panel-2 p-[3px]">
      {[true, false].map((v, i) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={`cursor-pointer rounded-[7px] px-3 py-1 font-mono text-[11px] uppercase tracking-[1px] transition-colors ${
            value === v ? "bg-white/[0.08] text-fog" : "text-dusk hover:text-fog"
          }`}
        >
          {labels[i]}
        </button>
      ))}
    </div>
  );
}

function Check({ value, onChange, label, hint }: { value: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 cursor-pointer accent-[#ff2d78]" />
      <span>
        <span className="block text-[13px] text-fog">{label}</span>
        {hint ? <span className="block text-[11.5px] leading-snug text-dusk">{hint}</span> : null}
      </span>
    </label>
  );
}

/**
 * A number input that keeps what was typed. `pct` shows a rate as a
 * percentage (0.093 ↔ "9.3"); `nullable` lets a blank mean "none" (the last
 * bracket's "and over"). Commits on every keystroke that parses.
 */
function Num({
  value,
  onChange,
  pct = false,
  nullable = false,
  placeholder,
  className = "",
  ariaLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  pct?: boolean;
  nullable?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const show = (v: number | null) =>
    v === null || !isFinite(v) ? "" : pct ? String(Math.round(v * 1e6) / 1e4) : String(v);
  const [raw, setRaw] = useState(show(value));
  return (
    <div className={`relative ${className}`}>
      <input
        value={raw}
        inputMode="decimal"
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.\-]/g, "");
          setRaw(t);
          if (t.trim() === "") {
            if (nullable) onChange(null);
            return;
          }
          const p = parseFloat(t);
          if (isFinite(p)) onChange(pct ? p / 100 : p);
        }}
        className={`${inputCls} ${pct ? "pr-7" : ""}`}
      />
      {pct ? <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] text-dusk">%</span> : null}
    </div>
  );
}

function StatusRow({ label, hint, value, onChange }: { label: string; hint?: string; value: ByStatus<number>; onChange: (v: ByStatus<number>) => void }) {
  return (
    <div className="border-b border-edge py-3 last:border-b-0">
      <div className="mb-2">
        <span className="font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-mist">{label}</span>
        {hint ? <span className="ml-2 text-[11.5px] text-dusk">{hint}</span> : null}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {FILING_STATUSES.map((s) => (
          <div key={s}>
            <Mono className="text-dusk">{FILING_STATUS_SHORT[s]}</Mono>
            <Num value={value[s]} onChange={(v) => onChange({ ...value, [s]: v ?? 0 })} ariaLabel={`${label}, ${FILING_STATUS_SHORT[s]}`} className="mt-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The bracket schedule as one grid: a row per bracket, the rate once (every
 * US schedule uses the same rates for every filing status; only the
 * thresholds differ) and an "up to" per status. The last row is "and over".
 */
function BracketGrid({ value, onChange }: { value: ByStatus<Bracket[]>; onChange: (v: ByStatus<Bracket[]>) => void }) {
  const rows = Math.max(1, ...FILING_STATUSES.map((s) => value[s].length));
  const cell = (s: (typeof FILING_STATUSES)[number], i: number): Bracket =>
    value[s][i] ?? { upTo: i === rows - 1 ? null : 0, rate: value.single[i]?.rate ?? 0 };

  const setRate = (i: number, rate: number) =>
    onChange(
      Object.fromEntries(
        FILING_STATUSES.map((s) => [s, Array.from({ length: rows }, (_, j) => (j === i ? { ...cell(s, j), rate } : cell(s, j)))]),
      ) as ByStatus<Bracket[]>,
    );
  const setUpTo = (s: (typeof FILING_STATUSES)[number], i: number, upTo: number | null) =>
    onChange({ ...value, [s]: Array.from({ length: rows }, (_, j) => (j === i ? { ...cell(s, j), upTo } : cell(s, j))) });
  const addRow = () =>
    onChange(
      Object.fromEntries(
        FILING_STATUSES.map((s) => {
          const list = Array.from({ length: rows }, (_, j) => cell(s, j));
          const last = list[list.length - 1];
          // The old last row gets a threshold to fill in; the new last row is "and over".
          return [s, [...list.slice(0, -1), { ...last, upTo: 0 }, { upTo: null, rate: last.rate }]];
        }),
      ) as ByStatus<Bracket[]>,
    );
  const removeRow = (i: number) =>
    onChange(
      Object.fromEntries(
        FILING_STATUSES.map((s) => {
          const list = Array.from({ length: rows }, (_, j) => cell(s, j)).filter((_, j) => j !== i);
          if (list.length) list[list.length - 1] = { ...list[list.length - 1], upTo: null };
          return [s, list];
        }),
      ) as ByStatus<Bracket[]>,
    );

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-[72px_repeat(5,minmax(0,1fr))_28px] gap-2 border-b border-edge pb-2">
          <Mono className="text-dusk">Rate</Mono>
          {FILING_STATUSES.map((s) => (
            <Mono key={s} className="text-dusk">
              {FILING_STATUS_SHORT[s]} up to
            </Mono>
          ))}
          <span />
        </div>
        {Array.from({ length: rows }, (_, i) => {
          const last = i === rows - 1;
          return (
            <div key={i} className="grid grid-cols-[72px_repeat(5,minmax(0,1fr))_28px] items-center gap-2 border-b border-edge py-1.5 last:border-b-0">
              <Num value={cell("single", i).rate} pct onChange={(v) => setRate(i, v ?? 0)} ariaLabel={`Row ${i + 1} rate`} />
              {FILING_STATUSES.map((s) =>
                last ? (
                  <span key={s} className="px-2.5 font-mono text-[11.5px] text-dusk">
                    and over
                  </span>
                ) : (
                  <Num key={s} value={cell(s, i).upTo} nullable onChange={(v) => setUpTo(s, i, v)} ariaLabel={`Row ${i + 1} ${FILING_STATUS_SHORT[s]} up to`} />
                ),
              )}
              <button type="button" onClick={() => removeRow(i)} disabled={rows <= 1} aria-label={`Remove row ${i + 1}`} className="cursor-pointer text-center text-[14px] text-dusk hover:text-danger disabled:opacity-30">
                ×
              </button>
            </div>
          );
        })}
        <button type="button" onClick={addRow} className={`${linkBtn} mt-3`}>
          + Add bracket
        </button>
      </div>
    </div>
  );
}

function TaxTableBox({ value, onChange, hint }: { value: TaxTableRule | null; onChange: (v: TaxTableRule | null) => void; hint: string }) {
  return (
    <div className="mt-5 border-t border-edge pt-4">
      <Check value={!!value} onChange={(on) => onChange(on ? { below: 100000, row: 50, rounding: "midpoint" } : null)} label="Uses a printed tax table for lower incomes" hint={hint} />
      {value ? (
        <div className="mt-3 grid max-w-[760px] gap-4 sm:grid-cols-[1fr_1fr_1.6fr]">
          <Labeled label="Use below">
            <Num value={value.below} onChange={(v) => onChange({ ...value, below: v ?? 0 })} />
          </Labeled>
          <Labeled label="Row width">
            <Num value={value.row} onChange={(v) => onChange({ ...value, row: v ?? 0 })} />
          </Labeled>
          <Labeled label="Rows are">
            <Select
              value={value.rounding}
              onChange={(rounding) => onChange({ ...value, rounding: rounding as TaxTableRule["rounding"] })}
              options={[
                { value: "midpoint", label: "Priced at the midpoint (IRS)" },
                { value: "centred", label: "Centred on the round number (FTB)" },
              ]}
            />
          </Labeled>
        </div>
      ) : null}
    </div>
  );
}
