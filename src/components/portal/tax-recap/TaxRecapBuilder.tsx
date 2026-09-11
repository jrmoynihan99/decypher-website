"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TextInput } from "@/components/estimator/fields";
import {
  Chip,
  Field,
  Kpi,
  KpiRow,
  LineRow,
  Mono,
  Note,
  NumInput,
  Panel,
} from "@/components/portal/widgets/ui";
import { money } from "@/lib/widget-format";
import { computeRecap, validateAll } from "@/lib/tax-recap/compute";
import {
  DEFAULT_NEXT_STEPS,
  DEFAULT_STRATEGIES,
  RETURN_FIELDS,
  RETURN_FIELD_KEYS,
  asMoney,
  displayName,
  emptyNumbers,
  numbersFromExtract,
  type FieldGroup,
  type RecapDoc,
  type RecapNextStep,
  type ReturnExtract,
  type ReturnFieldKey,
  type ReturnNumbers,
} from "@/lib/tax-recap/schema";
import { preparePdf } from "./pdf-prepare";

/**
 * The recap builder: two PDFs in, a shareable page out.
 *
 * Three stages on one screen. Upload reads both returns in parallel (one
 * request each — Vercel's body cap). Review shows every extracted number
 * next to the page it came from and whether it was found in the PDF's text,
 * with the recap's totals recomputing live as staff correct a cell. Save
 * writes the reviewed numbers and hands back the client link.
 *
 * The numbers are held as raw strings while editing — the same reason the
 * widgets do it: a half-typed "12," has to survive a re-render. They become
 * numbers at the two places that need them: the live preview and the save.
 *
 * `initial` is an existing recap, which skips upload and lands on review:
 * fixing a number after the fact shouldn't cost a re-read.
 */

type Kind = "before" | "after";
type RawNumbers = Record<ReturnFieldKey, string>;
/** upload → review → done. A saved recap reopened for editing starts at review. */
type Stage = "upload" | "review" | "done";

type SideState = {
  file: File | null;
  status: "idle" | "reading" | "done" | "error";
  message: string;
  extract: ReturnExtract | null;
  warnings: string[];
  /** Pages in the return as printed. */
  pages: number | null;
  /** Pages actually sent to the model, after trimming. */
  sentPages: number | null;
};

const idleSide = (): SideState => ({
  file: null,
  status: "idle",
  message: "",
  extract: null,
  warnings: [],
  pages: null,
  sentPages: null,
});

const toRaw = (n: ReturnNumbers): RawNumbers =>
  Object.fromEntries(
    RETURN_FIELD_KEYS.map((k) => [k, n[k] === null ? "" : String(n[k])]),
  ) as RawNumbers;

const toNumbers = (r: RawNumbers): ReturnNumbers =>
  Object.fromEntries(
    RETURN_FIELD_KEYS.map((k) => [k, r[k].trim() === "" ? null : asMoney(r[k])]),
  ) as ReturnNumbers;

const GROUPS: { id: FieldGroup; title: string }[] = [
  { id: "income", title: "Income" },
  { id: "federal", title: "Federal" },
  { id: "business", title: "Schedule C" },
  { id: "state", title: "State" },
];

const btn =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-transparent px-5 py-2.5 font-display text-[14px] font-semibold no-underline transition-[transform,filter,opacity] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary = `${btn} bg-grad text-white hover:brightness-[1.07]`;
const btnGhost = `${btn} border-white/15 bg-transparent text-fog hover:border-mist`;

const fmtBytes = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

/** Over this, a PDF is staged in pieces (see readOne). Under Vercel's ~4.5MB body cap. */
const DIRECT_MAX = 3.5 * 1024 * 1024;
/** Mirrors UPLOAD_CHUNK_BYTES / UPLOAD_MAX_BYTES in lib/tax-recap/uploads.ts. */
const CHUNK = 750 * 1024;
const PER_REQUEST = 4;
const FILE_MAX = 24 * 1024 * 1024;

export default function TaxRecapBuilder({ initial }: { initial: RecapDoc | null }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(initial ? "review" : "upload");

  const [clientName, setClientName] = useState(initial?.clientName ?? "");
  const [taxYear, setTaxYear] = useState(initial ? String(initial.taxYear) : "");
  const [priorYearIncome, setPriorYearIncome] = useState(
    initial?.priorYearIncome != null ? String(initial.priorYearIncome) : "",
  );
  const [stateCode, setStateCode] = useState(initial?.stateCode ?? "");

  const [sides, setSides] = useState<Record<Kind, SideState>>({
    before: { ...idleSide(), extract: initial?.extraction.before ?? null },
    after: { ...idleSide(), extract: initial?.extraction.after ?? null },
  });
  const [numbers, setNumbers] = useState<Record<Kind, RawNumbers>>({
    before: toRaw(initial?.before ?? emptyNumbers()),
    after: toRaw(initial?.after ?? emptyNumbers()),
  });
  const [strategies, setStrategies] = useState(
    (initial?.strategies ?? DEFAULT_STRATEGIES).join("\n"),
  );
  const [nextSteps, setNextSteps] = useState<RecapNextStep[]>(
    initial?.nextSteps.length ? initial.nextSteps : DEFAULT_NEXT_STEPS,
  );

  const [saved, setSaved] = useState<{ id: string; token: string } | null>(
    initial ? { id: initial.id, token: initial.token } : null,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** Transient "Saved" tick next to the button, for re-saves of an open recap. */
  const [flash, setFlash] = useState(false);
  // Read after mount, not at render: the server has no window, and a link
  // that exists only on the client is a hydration mismatch on edit pages.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const reading = sides.before.status === "reading" || sides.after.status === "reading";

  /* ─────────────────────────────── upload ─────────────────────────────── */

  const pickFile = (kind: Kind, file: File | null) =>
    setSides((s) => ({ ...s, [kind]: { ...idleSide(), file } }));

  const readOne = async (kind: Kind, file: File) => {
    const say = (message: string) =>
      setSides((s) => ({ ...s, [kind]: { ...s[kind], status: "reading", message } }));

    say("Opening the PDF…");
    // Reads the page text and trims the return to the pages the recap needs,
    // which is what keeps both the bill and the read time down.
    const prepared = await preparePdf(file);
    setSides((s) => ({
      ...s,
      [kind]: { ...s[kind], pages: prepared.totalPages, sentPages: prepared.sentPages },
    }));

    const reading =
      prepared.trimmed
        ? `Reading the ${prepared.sentPages} pages that hold the numbers, out of ${prepared.totalPages}…`
        : prepared.fallback === "no-text-layer"
          ? "Reading a scanned copy — no text layer, so numbers can't be cross-checked…"
          : `Reading all ${prepared.totalPages} pages — this takes a minute or two…`;

    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("pageTexts", JSON.stringify(prepared.pageTexts));
    // Page numbers the model cites are positions in the trimmed copy; this
    // maps them back so the reviewer sees the page of the real return.
    fd.append("pageMap", JSON.stringify(prepared.pageMap));

    if (prepared.sentBytes > DIRECT_MAX) {
      // Still too big for one request (Vercel's body cap) — a scan can't be
      // trimmed. Stage it in pieces; the extract route reassembles them.
      const uploadId = crypto.randomUUID();
      const total = Math.ceil(prepared.sentBytes / CHUNK);
      for (let i = 0; i < total; i += PER_REQUEST) {
        const part = new FormData();
        part.append("uploadId", uploadId);
        part.append("total", String(total));
        part.append("size", String(prepared.sentBytes));
        part.append("name", file.name);
        for (let j = i; j < Math.min(total, i + PER_REQUEST); j++) {
          part.append(`chunk-${j}`, prepared.data.slice(j * CHUNK, (j + 1) * CHUNK), String(j));
        }
        say(
          `Uploading ${fmtBytes(Math.min(prepared.sentBytes, (i + PER_REQUEST) * CHUNK))} of ${fmtBytes(prepared.sentBytes)}…`,
        );
        const r = await fetch("/api/portal/tax-recap/upload", { method: "POST", body: part });
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { message?: string };
          throw new Error(d.message ?? "Upload failed");
        }
      }
      fd.append("uploadId", uploadId);
    } else {
      fd.append("file", prepared.data, file.name);
    }
    say(reading);

    const res = await fetch("/api/portal/tax-recap/extract", { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      extract?: ReturnExtract;
      warnings?: string[];
    };
    if (!res.ok || !data.ok || !data.extract) {
      throw new Error(data.message ?? `Couldn't read the ${kind} return`);
    }
    return { extract: data.extract, warnings: data.warnings ?? [] };
  };

  const readBoth = async () => {
    const before = sides.before.file;
    const after = sides.after.file;
    if (!before || !after) return;

    const run = async (kind: Kind, file: File) => {
      try {
        const { extract, warnings } = await readOne(kind, file);
        setSides((s) => ({
          ...s,
          [kind]: { ...s[kind], status: "done", message: "", extract, warnings },
        }));
        setNumbers((n) => ({ ...n, [kind]: toRaw(numbersFromExtract(extract)) }));
        return extract;
      } catch (e) {
        setSides((s) => ({
          ...s,
          [kind]: {
            ...s[kind],
            status: "error",
            message: e instanceof Error ? e.message : "Couldn't read that return",
          },
        }));
        return null;
      }
    };

    const [b, a] = await Promise.all([run("before", before), run("after", after)]);
    if (b && a) {
      // Name, year and state come off the returns; the after return is the
      // final one, so it wins where the two disagree. Only prior-year income
      // has to be typed — it isn't in either PDF.
      setClientName(displayName(a.taxpayerName || b.taxpayerName || ""));
      setTaxYear(String(a.taxYear ?? b.taxYear ?? new Date().getFullYear() - 1));
      setStateCode(a.stateCode || b.stateCode || "");
      setStage("review");
    }
  };

  /**
   * Back to an empty tool, ready for the next client. Everything goes — the
   * client fields prefill from the return now, so a name left over from the
   * last recap would silently ride along into the next one.
   */
  const startOver = () => {
    setClientName("");
    setTaxYear("");
    setPriorYearIncome("");
    setStateCode("");
    setSides({ before: idleSide(), after: idleSide() });
    setNumbers({ before: toRaw(emptyNumbers()), after: toRaw(emptyNumbers()) });
    setStrategies(DEFAULT_STRATEGIES.join("\n"));
    setNextSteps(DEFAULT_NEXT_STEPS);
    setSaved(null);
    setSaveError(null);
    setStage("upload");
    // An edit was opened via ?edit=<id>; drop the param so a refresh doesn't
    // reload that recap over the blank form.
    if (initial) router.push("/portal/tax-recap");
  };

  /* ─────────────────────────────── review ─────────────────────────────── */

  const parsed = useMemo(
    () => ({ before: toNumbers(numbers.before), after: toNumbers(numbers.after) }),
    [numbers],
  );
  const computed = useMemo(
    () =>
      computeRecap({
        before: parsed.before,
        after: parsed.after,
        priorYearIncome: priorYearIncome.trim() ? asMoney(priorYearIncome) : null,
      }),
    [parsed, priorYearIncome],
  );
  const warnings = useMemo(() => validateAll(parsed.before, parsed.after), [parsed]);

  const setCell = (kind: Kind, key: ReturnFieldKey, raw: string) =>
    setNumbers((n) => ({ ...n, [kind]: { ...n[kind], [key]: raw } }));

  /* ─────────────────────────────── save ───────────────────────────────── */

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    const body = {
      clientName: clientName.trim(),
      taxYear: Number(taxYear),
      priorYearIncome: priorYearIncome.trim() ? asMoney(priorYearIncome) : null,
      stateCode: stateCode.trim() || null,
      before: parsed.before,
      after: parsed.after,
      strategies: strategies
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      nextSteps: nextSteps.filter((s) => s.label.trim()),
      extraction: { before: sides.before.extract, after: sides.after.extract },
    };
    try {
      const res = await fetch(
        saved ? `/api/portal/tax-recap/${saved.id}` : "/api/portal/tax-recap",
        {
          method: saved ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        recap?: { id: string; token: string };
      };
      if (!res.ok || !data.ok || !data.recap) throw new Error(data.message ?? "Couldn't save");
      const isNew = !saved;
      setSaved({ id: data.recap.id, token: data.recap.token });
      // The list below is server-rendered, so it only learns about this recap
      // when the route re-renders. Without this you save and nothing appears.
      router.refresh();
      if (isNew) {
        // A first save finishes the job: hand over the link and get out of the
        // way, rather than leaving four filled-in panels for the next client.
        setStage("done");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setFlash(true);
        setTimeout(() => setFlash(false), 2200);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const link = saved && origin ? `${origin}/recap/${saved.token}` : null;

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the link is visible to select by hand */
    }
  };

  const canRead =
    !!sides.before.file &&
    !!sides.after.file &&
    sides.before.file.size <= FILE_MAX &&
    sides.after.file.size <= FILE_MAX &&
    !reading;
  const canSave = clientName.trim().length > 0 && /^\d{4}$/.test(taxYear.trim()) && !saving;

  /* ─────────────────────────────── done ───────────────────────────────── */

  if (stage === "done" && saved) {
    return (
      <Panel title="Saved">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <Mono className="text-teal">Ready to send</Mono>
            <h2 className="mt-1.5 font-display text-[24px] font-semibold leading-tight text-fog">
              {clientName}
              <span className="ml-2 font-mono text-[14px] font-normal text-dusk">{taxYear}</span>
            </h2>
            <p className="mt-1.5 text-[13.5px] text-muted">
              {money(computed.savings)} saved, {money(computed.before.totalTaxes)} down to{" "}
              {money(computed.after.totalTaxes)}.
            </p>
          </div>
          <div className="font-display text-[34px] font-bold leading-none tabular-nums text-teal">
            {money(computed.savings)}
          </div>
        </div>

        <div className="mt-5 rounded-[16px] border border-teal/40 bg-teal/[0.06] px-4 py-3.5">
          <Mono className="text-teal">Client link</Mono>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-fog">
              {link ?? "…"}
            </code>
            <button type="button" onClick={copyLink} className={btnGhost}>
              {copied ? "Copied" : "Copy"}
            </button>
            <Link href={`/recap/${saved.token}`} target="_blank" className={btnGhost}>
              Open
            </Link>
          </div>
          <Note className="!mt-2">
            Anyone with this link can see the recap. Revoke it from the list below if it
            goes to the wrong person.
          </Note>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-edge pt-5">
          <button type="button" onClick={startOver} className={btnPrimary}>
            Start another recap
          </button>
          <button type="button" onClick={() => setStage("review")} className={btnGhost}>
            Back to the numbers
          </button>
          <span className="text-[12px] text-dusk">
            It&rsquo;s in the list below — reopen it any time from there.
          </span>
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─────────────────────── 1 · returns ─────────────────────── */}
      <Panel
        title="1 · Returns"
        action={
          stage === "review" ? (
            <button
              type="button"
              onClick={startOver}
              className="cursor-pointer font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted hover:text-fog"
            >
              {initial ? "New recap" : "Start over"}
            </button>
          ) : null
        }
      >
        {stage === "upload" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <DropZone
                kind="before"
                title="Before return"
                hint="Income only — no write-offs, no strategies"
                side={sides.before}
                disabled={reading}
                onPick={(f) => pickFile("before", f)}
              />
              <DropZone
                kind="after"
                title="After return"
                hint="The final return with everything applied"
                side={sides.after}
                disabled={reading}
                onPick={(f) => pickFile("after", f)}
              />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="button" onClick={readBoth} disabled={!canRead} className={btnPrimary}>
                {reading ? "Reading…" : "Read both returns"}
              </button>
              <span className="text-[12px] text-dusk">
                Both PDFs are sent to Claude to read the form lines. Nothing is stored until you save.
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(["before", "after"] as Kind[]).map((k) => {
              const s = sides[k];
              const ex = s.extract;
              if (!ex) return null;
              const n = RETURN_FIELD_KEYS.filter((key) => ex.fields[key].value !== null).length;
              const unverified = RETURN_FIELD_KEYS.filter((key) => ex.fields[key].verified === false).length;
              return (
                <Chip key={k} tone={unverified ? "warn" : "pos"}>
                  {k}: {n} lines read
                  {s.pages
                    ? s.sentPages && s.sentPages < s.pages
                      ? ` from ${s.sentPages} of ${s.pages} pages`
                      : ` from ${s.pages} pages`
                    : ""}
                  {unverified ? `, ${unverified} to check` : ""}
                </Chip>
              );
            })}
          </div>
        )}
      </Panel>

      {stage === "review" ? (
        <>
          {/* ─────────────────────── 2 · client ─────────────────────── */}
          <Panel title="2 · Client">
            <div className="grid gap-4 sm:grid-cols-[1.6fr_0.7fr_0.6fr_1fr]">
              <Field label="Client name" hint="Read from the return — as it should appear on the recap">
                <TextInput
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="!py-2.5 !text-[14px]"
                />
              </Field>
              <Field label="Tax year" hint="Read from the return">
                <TextInput
                  inputMode="numeric"
                  value={taxYear}
                  onChange={(e) => setTaxYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="!py-2.5 !text-[14px] font-mono tabular-nums"
                />
              </Field>
              <Field label="State" hint="Blank if no state return">
                <TextInput
                  value={stateCode}
                  onChange={(e) =>
                    setStateCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))
                  }
                  placeholder="—"
                  className="!py-2.5 !text-[14px] font-mono uppercase"
                />
              </Field>
              <Field label="Prior-year income" hint="Optional. From last year's return — not in these PDFs">
                <NumInput value={priorYearIncome} onChange={setPriorYearIncome} prefix="$" />
              </Field>
            </div>
          </Panel>

          {/* ─────────────────────── 3 · check the numbers ─────────────────────── */}
          <Panel title="3 · Check the numbers" bodyClassName="!px-0 !py-0">
            <div className="grid grid-cols-2 items-end gap-3 border-b border-edge px-4 py-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <Mono className="hidden text-dusk sm:block">Line</Mono>
              <Mono className="text-dusk">Before</Mono>
              <Mono className="text-dusk">After</Mono>
            </div>
            {GROUPS.map((g) => (
              <div key={g.id}>
                <div className="border-b border-edge bg-white/[0.02] px-4 py-2">
                  <Mono className="font-bold text-mist">{g.title}</Mono>
                </div>
                {RETURN_FIELDS.filter((f) => f.group === g.id).map((f) => (
                  <div
                    key={f.key}
                    // Phones: label across the top, the two inputs beneath it.
                    // Three columns at 390px squeeze "$123,038" into "$123,0".
                    className="grid grid-cols-2 items-start gap-x-3 gap-y-1.5 border-b border-edge px-4 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3"
                  >
                    <div className="col-span-2 min-w-0 sm:col-span-1 sm:pt-1.5">
                      <div className="text-[13px] text-fog">{f.label}</div>
                      <div className="mt-0.5 truncate text-[11px] text-dusk" title={f.source}>
                        {f.source}
                      </div>
                    </div>
                    {(["before", "after"] as Kind[]).map((k) => (
                      <Cell
                        key={k}
                        raw={numbers[k][f.key]}
                        extracted={sides[k].extract?.fields[f.key] ?? null}
                        onChange={(v) => setCell(k, f.key, v)}
                        label={`${f.label} (${k})`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ))}
            <div className="border-t border-edge px-4 py-3">
              <Legend />
            </div>
          </Panel>

          {(warnings.length ||
            sides.before.warnings.length ||
            sides.after.warnings.length) > 0 ? (
            <Panel title="Things to look at">
              <ul className="space-y-1.5 text-[13px] text-mist">
                {sides.before.warnings.map((w, i) => (
                  <li key={`b${i}`} className="flex gap-2">
                    <Mono className="mt-0.5 flex-none text-ember">before</Mono>
                    <span>{w}</span>
                  </li>
                ))}
                {sides.after.warnings.map((w, i) => (
                  <li key={`a${i}`} className="flex gap-2">
                    <Mono className="mt-0.5 flex-none text-ember">after</Mono>
                    <span>{w}</span>
                  </li>
                ))}
                {warnings.map((w, i) => (
                  <li key={`v${i}`} className="flex gap-2">
                    <Mono className="mt-0.5 flex-none text-ember">{w.side}</Mono>
                    <span>{w.message}</span>
                  </li>
                ))}
              </ul>
              <Note>
                None of these block saving. They&rsquo;re the arithmetic identities the forms
                have to satisfy, so a failure usually means one line was misread.
              </Note>
            </Panel>
          ) : null}

          {/* ─────────────────────── 4 · the recap ─────────────────────── */}
          <Panel title="4 · The recap">
            <KpiRow cols={3}>
              <Kpi label="Before DeCypher" value={money(computed.before.totalTaxes)} tone="neg" />
              <Kpi label="After DeCypher" value={money(computed.after.totalTaxes)} />
              <Kpi
                label="Total tax savings"
                value={money(computed.savings)}
                tone={computed.savings >= 0 ? "pos" : "neg"}
              />
            </KpiRow>

            <div className="mt-5 grid gap-6 md:grid-cols-2">
              <div>
                <Mono className="text-dusk">Savings breakdown (exact)</Mono>
                <div className="mt-1">
                  <LineRow label="Deductions found" value={money(computed.breakdown.deductionsFound)} size="sm" />
                  <LineRow label="Self-employment tax saved" value={money(computed.breakdown.seTaxSaved)} size="sm" />
                  <LineRow label="Federal income tax saved" value={money(computed.breakdown.incomeTaxSaved)} size="sm" />
                  <LineRow label="State tax saved" value={money(computed.breakdown.stateSaved)} size="sm" />
                  <LineRow label="Penalties avoided" value={money(computed.breakdown.penaltiesSaved)} size="sm" />
                  <LineRow label="Total" value={money(computed.savings)} size="sm" total tone="pos" />
                </div>
              </div>
              <div>
                <Mono className="text-dusk">At filing (after return)</Mono>
                <div className="mt-1">
                  <LineRow
                    label={`Federal: ${money(computed.filing.federal.owed)} owed − ${money(computed.filing.federal.paid)} paid`}
                    value={dueLabel(computed.filing.federal.due)}
                    size="sm"
                    tone={computed.filing.federal.due > 0 ? "neg" : "pos"}
                  />
                  <LineRow
                    label={`State: ${money(computed.filing.state.owed)} owed − ${money(computed.filing.state.paid)} paid`}
                    value={dueLabel(computed.filing.state.due)}
                    size="sm"
                    tone={computed.filing.state.due > 0 ? "neg" : "pos"}
                  />
                  <LineRow
                    label="Total"
                    value={dueLabel(computed.filing.total)}
                    size="sm"
                    total
                    tone={computed.filing.total > 0 ? "neg" : "pos"}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Field
                label="Improvements / tax strategy"
                hint="One per line. These print as the numbered list on the recap."
              >
                <textarea
                  value={strategies}
                  onChange={(e) => setStrategies(e.target.value)}
                  rows={6}
                  className="w-full rounded-[10px] border border-edge-mid bg-panel-2 px-3 py-2.5 font-body text-[13.5px] leading-relaxed text-fog outline-none transition-[border-color,box-shadow] duration-150 focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]"
                />
              </Field>
              <div>
                <span className="mb-1.5 block font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-mist">
                  Next steps
                </span>
                <div className="space-y-2">
                  {nextSteps.map((s, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <input
                        value={s.label}
                        onChange={(e) =>
                          setNextSteps((all) =>
                            all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                          )
                        }
                        placeholder="Step"
                        className={smallInput}
                      />
                      <input
                        value={s.href ?? ""}
                        onChange={(e) =>
                          setNextSteps((all) =>
                            all.map((x, j) => (j === i ? { ...x, href: e.target.value || null } : x)),
                          )
                        }
                        placeholder="https:// (optional)"
                        className={`${smallInput} font-mono`}
                      />
                      <button
                        type="button"
                        aria-label="Remove step"
                        onClick={() => setNextSteps((all) => all.filter((_, j) => j !== i))}
                        className="cursor-pointer rounded-[10px] border border-edge-mid px-2.5 text-[14px] text-dusk hover:text-danger"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {nextSteps.length < 8 ? (
                    <button
                      type="button"
                      onClick={() => setNextSteps((all) => [...all, { label: "", href: null }])}
                      className="cursor-pointer font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted hover:text-fog"
                    >
                      + Add a step
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-edge pt-5">
              <button type="button" onClick={save} disabled={!canSave} className={btnPrimary}>
                {saving ? "Saving…" : saved ? "Save changes" : "Save & create link"}
              </button>
              {saved ? (
                <button type="button" onClick={() => setStage("done")} className={btnGhost}>
                  Done
                </button>
              ) : null}
              {flash ? <span className="text-[13px] font-semibold text-teal">Saved</span> : null}
              {saveError ? <span className="text-[13px] text-danger">{saveError}</span> : null}
              {!canSave && !saving ? (
                <span className="text-[12px] text-dusk">Needs a client name and a four-digit year.</span>
              ) : null}
            </div>

            {saved && link ? (
              <div className="mt-4 rounded-[16px] border border-teal/40 bg-teal/[0.06] px-4 py-3.5">
                <Mono className="text-teal">Client link</Mono>
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-fog">{link}</code>
                  <button type="button" onClick={copyLink} className={btnGhost}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <Link href={`/recap/${saved.token}`} target="_blank" className={btnGhost}>
                    Open
                  </Link>
                </div>
                <Note className="!mt-2">
                  Edits are live the moment you save — the link never changes.
                </Note>
              </div>
            ) : null}
          </Panel>
        </>
      ) : null}
    </div>
  );
}

const smallInput =
  "w-full rounded-[10px] border border-edge-mid bg-panel-2 px-3 py-2 font-body text-[13px] text-fog outline-none transition-[border-color,box-shadow] duration-150 focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]";

function dueLabel(due: number): string {
  if (due < 0) return `${money(-due)} refund`;
  return `${money(due)} due`;
}

/* ─────────────────────────────── pieces ─────────────────────────────── */

function DropZone({
  kind,
  title,
  hint,
  side,
  disabled,
  onPick,
}: {
  kind: Kind;
  title: string;
  hint: string;
  side: SideState;
  disabled: boolean;
  onPick: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const tone =
    side.status === "error" ? "border-danger/60"
    : side.status === "done" ? "border-teal/50"
    : side.file ? "border-magenta/50"
    : over ? "border-mist"
    : "border-dashed border-edge-bright";

  const take = (f: File | null | undefined) => {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") {
      onPick(null);
      return;
    }
    onPick(f);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) take(e.dataTransfer.files?.[0]);
      }}
      className={`rounded-[16px] border bg-white/[0.02] px-4 py-4 transition-colors ${tone}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <Mono className="text-magenta">{kind}</Mono>
          <div className="mt-0.5 font-display text-[15px] font-semibold text-fog">{title}</div>
          <div className="mt-0.5 text-[12px] text-dusk">{hint}</div>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className={btnGhost}
        >
          {side.file ? "Change" : "Choose PDF"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <div className="mt-3 min-h-[20px] text-[12.5px]">
        {side.file ? (
          <span className="text-mist">
            {side.file.name} <span className="text-dusk">· {fmtBytes(side.file.size)}</span>
            {side.file.size > FILE_MAX ? (
              <span className="ml-2 text-danger">over the 24 MB limit</span>
            ) : null}
          </span>
        ) : (
          <span className="text-dusk">
            Drop the ProSeries PDF here. Exports are best; a scan works but can&rsquo;t be cross-checked.
          </span>
        )}
        {side.message ? (
          <div className={`mt-1 ${side.status === "error" ? "text-danger" : "text-teal"}`}>
            {side.status === "reading" ? <Spinner /> : null}
            {side.message}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="mr-2 inline-block h-3 w-3 animate-spin-grad rounded-full border-2 border-teal/30 border-t-teal align-[-2px]"
    />
  );
}

/**
 * One editable number with its provenance underneath: the page it was read
 * from and whether that number was found in the PDF's text on that page. An
 * edited cell shows "edited" so a reviewer can tell a correction from a read.
 */
function Cell({
  raw,
  extracted,
  onChange,
  label,
}: {
  raw: string;
  extracted: { value: number | null; page: number | null; verified: boolean | null } | null;
  onChange: (raw: string) => void;
  label: string;
}) {
  const current = raw.trim() === "" ? null : asMoney(raw);
  const edited = extracted ? current !== extracted.value : false;
  let tag: React.ReactNode = null;
  if (!extracted) {
    // No extraction for this side at all (typed in by hand) — nothing to
    // compare against, so no tag rather than a misleading "blank".
    tag = null;
  } else if (edited) {
    tag = <span className="text-magenta">edited</span>;
  } else if (extracted.value === null) {
    tag = <span className="text-faint">blank on the return</span>;
  } else if (extracted.verified === true) {
    tag = <span className="text-teal">p. {extracted.page} ✓</span>;
  } else if (extracted.verified === false) {
    tag = <span className="text-ember">p. {extracted.page} — not found in text, check</span>;
  } else {
    tag = <span className="text-dusk">p. {extracted.page}</span>;
  }
  return (
    <div className="min-w-0">
      <NumInput value={raw} onChange={onChange} prefix="$" ariaLabel={label} />
      <div className="mt-1 truncate font-mono text-[10px] tracking-[0.4px]">{tag}</div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10px] tracking-[0.4px]">
      <span className="text-teal">p. n ✓ — found on that page of the PDF</span>
      <span className="text-ember">not found — the number isn&rsquo;t in the PDF text, read it off the form</span>
      <span className="text-magenta">edited — you changed it</span>
      <span className="text-faint">blank — the line is empty on the return</span>
    </div>
  );
}
