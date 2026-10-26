"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import { computeRecap, taxRows, validateAll } from "@/lib/tax-recap/compute";
import {
  DERIVE_VERSION,
  attributeStrategies,
  deriveBefore,
  type DeriveMeta,
  type DeriveMore,
  type Mismatch,
} from "@/lib/tax-recap/derive";
import { entityEins, entityFormFromFileName, entityW2Pages, type EntityW2Page, type ReturnKind } from "@/lib/tax-recap/pages";
import { US_STATES, type TableSet } from "@/lib/tax-recap/tables";
import {
  ADJUSTMENTS_TOLERANCE,
  CITY_FIELD_KEYS,
  DEFAULT_NEXT_STEPS,
  DEFAULT_STRATEGIES,
  ENTITY_FIELDS,
  ENTITY_FIELD_KEYS,
  MAX_OTHER_ENTITIES,
  OTHER_STATE_FIELD_KEYS,
  RETURN_FIELDS,
  RETURN_FIELD_KEYS,
  SCHEDULE_1_ADJUSTMENT_KEYS,
  asMoney,
  displayName,
  emptyEntityNumbers,
  emptyNumbers,
  numbersFromEntityExtract,
  numbersFromExtract,
  stateNumbersFromExtract,
  unplacedAdjustments,
  type DerivedBefore,
  type EntityExtract,
  type EntityFieldGroup,
  type EntityForm,
  type EntityFieldKey,
  type EntityNumbers,
  type FieldGroup,
  type OtherStateFieldKey,
  type RecapAnalysis,
  type RecapDoc,
  type RecapNextStep,
  type RecapOtherEntity,
  type RecapOtherState,
  type ReturnExtract,
  type ReturnFieldKey,
  type ReturnNumbers,
  type StateNumbers,
} from "@/lib/tax-recap/schema";
import { analyzePdf, preparePdf, redactionBlock, type PdfAnalysis } from "./pdf-prepare";
import { VideoStatus, useVideoMaker } from "./VideoMaker";
import { videoIsCurrent } from "@/lib/decyphered/fromRecap";

/**
 * The recap builder: the client's return(s) in, a shareable page out.
 *
 * Three stages on one screen. Upload takes the final 1040 — and, when the
 * business is an S corporation, the 1120-S alongside it; the files are
 * told apart by their own pages, so they go in one drop. Each is read
 * (one request per file — Vercel's body cap), then the before column is
 * derived with lib/tax-recap/derive.ts: the same return with every write-off
 * at zero, recalculated against the year's tax tables (`tables`, from the
 * Tax Tables page), and the savings are split by strategy. Review shows
 * every number next to where it came from — the page of the PDF for a read
 * line, "derived" for a computed one — with the recap's totals recomputing
 * live as staff correct a cell. Save writes the reviewed numbers and hands
 * back the client link.
 *
 * The derivation only succeeds when the engine can first reproduce the after
 * return's own tax. When it can't (a part-year form, a credit, a state with
 * no card yet) the reasons are shown with two ways through: type the before
 * column by hand, or add a before print and have that read instead.
 *
 * The numbers are held as raw strings while editing — the same reason the
 * widgets do it: a half-typed "12," has to survive a re-render. They become
 * numbers at the two places that need them: the live preview and the save.
 *
 * `initial` is an existing recap, which skips upload and lands on review:
 * fixing a number after the fact shouldn't cost a re-read.
 */

/** The returns the tool reads: the 1040 (after, and a before print), the entity's 1120-S/1065, and a city's own return for the entity (NYC-3L). */
type Kind = "before" | "after" | "entity" | "city";
type RawNumbers = Record<ReturnFieldKey, string>;
type RawEntity = Record<EntityFieldKey, string>;
/** upload → review → done. A saved recap reopened for editing starts at review. */
type Stage = "upload" | "review" | "done";

type SideState = {
  file: File | null;
  status: "idle" | "reading" | "done" | "error";
  message: string;
  /** Why a derivation was refused — shown under the drop zone. */
  problems: string[];
  extract: ReturnExtract | null;
  /** The entity side's read, when the file was an 1120-S. */
  entity: EntityExtract | null;
  warnings: string[];
  /** Pages in the return as printed. */
  pages: number | null;
  /** Pages actually sent to the model, after trimming. */
  sentPages: number | null;
  /** Before only: set when the column was derived rather than read. */
  derived: DerivedBefore | null;
  /** The numbers as derived, so an edited cell can be told from a derived one. */
  derivedNumbers: ReturnNumbers | null;
  /** The client's name read off the 1040 in the browser; the model never sees it. */
  localName: string | null;
  /** What the redaction did to the outgoing pages, and a thumbnail of the first one. */
  redaction: {
    redacted: boolean;
    boxes: number;
    preview: string | null;
  } | null;
};

const idleSide = (): SideState => ({
  file: null,
  status: "idle",
  message: "",
  problems: [],
  extract: null,
  entity: null,
  warnings: [],
  pages: null,
  sentPages: null,
  derived: null,
  derivedNumbers: null,
  localName: null,
  redaction: null,
});

type RawState = Record<OtherStateFieldKey, string>;

/**
 * An entity return beyond the first (engine v13: a second S corporation, a
 * partnership beside one): read on its own, edited on its own, and given
 * its own before by the engine.
 */
type MoreEntity = {
  side: SideState;
  form: EntityForm | null;
  name: string | null;
  stateCode: string | null;
  numbers: Record<"before" | "after", RawEntity>;
  /** Its before as derived, so an edited cell can be told from a derived one. */
  derived: EntityNumbers | null;
};

/** A state return beyond the main one, read off the 1040's print with its own lines and before. */
type MoreState = {
  stateCode: string;
  stateForm: string | null;
  numbers: Record<"before" | "after", RawState>;
  derived: StateNumbers | null;
};

/** A file dropped on the tool, with what its own pages say it is. */
type Picked = {
  id: string;
  file: File;
  analysis: PdfAnalysis | null;
  status: "checking" | "ready" | "unreadable";
};

/**
 * The city return's lines (NYC-3L) laid over the 1120-S's: one entity
 * record is what the engine and the review grid work from, and the city
 * reader fills only its own six lines.
 */
const withCity = (entity: EntityNumbers | null, city: EntityExtract | null): EntityNumbers | null => {
  if (!city) return entity;
  const c = numbersFromEntityExtract(city);
  const out: EntityNumbers = { ...(entity ?? emptyEntityNumbers()) };
  for (const key of CITY_FIELD_KEYS) if (c[key] !== null) out[key] = c[key];
  return out;
};

const metaOf = (extract: ReturnExtract, entityForm: EntityForm | null = null, entity: EntityExtract | null = null): DeriveMeta => ({
  taxYear: extract.taxYear,
  filingStatus: extract.filingStatus,
  stateCode: extract.stateCode,
  stateForm: extract.stateForm,
  entityForm,
  // The state the entity filed in, when it isn't the household's (a move
  // mid-year): the entity's own tax follows that state's rules.
  entityStateCode: entity?.stateCode ?? null,
  entityName: entity?.entityName ?? null,
  // Lines the page-text cross-check couldn't find: the engine may set them
  // aside when the after return only reproduces without them.
  unverified: RETURN_FIELD_KEYS.filter((k) => extract.fields[k]?.verified === false),
});

const toRaw = (n: ReturnNumbers): RawNumbers =>
  Object.fromEntries(
    RETURN_FIELD_KEYS.map((k) => [k, n[k] === null ? "" : String(n[k])]),
  ) as RawNumbers;

/**
 * The after column with the lines the engine proved misread put right
 * (`DeriveResult.afterFixes`: line 32's estimated payments moved to line
 * 31), so the recap's after side is figured the way the before was. The
 * notes say what changed; the grid shows it and can be edited back.
 */
const withAfterFixes = (raw: RawNumbers, fixes: Partial<ReturnNumbers>): RawNumbers => {
  const keys = Object.keys(fixes) as ReturnFieldKey[];
  if (!keys.length) return raw;
  return { ...raw, ...Object.fromEntries(keys.map((k) => [k, fixes[k] === null || fixes[k] === undefined ? "" : String(fixes[k])])) };
};

const toNumbers = (r: RawNumbers): ReturnNumbers =>
  Object.fromEntries(
    RETURN_FIELD_KEYS.map((k) => [
      k,
      r[k].trim() === "" ? null : asMoney(r[k]),
    ]),
  ) as ReturnNumbers;

const toRawEntity = (n: EntityNumbers | null): RawEntity =>
  Object.fromEntries(
    ENTITY_FIELD_KEYS.map((k) => [
      k,
      n === null || n[k] === null ? "" : String(n[k]),
    ]),
  ) as RawEntity;

/** Null when every cell is blank — a sole proprietor has no entity return. */
const toEntityNumbers = (r: RawEntity): EntityNumbers | null => {
  const out = Object.fromEntries(
    ENTITY_FIELD_KEYS.map((k) => [
      k,
      r[k].trim() === "" ? null : asMoney(r[k]),
    ]),
  ) as EntityNumbers;
  return ENTITY_FIELD_KEYS.some((k) => out[k] !== null) ? out : null;
};

const toRawState = (n: StateNumbers | null): RawState =>
  Object.fromEntries(OTHER_STATE_FIELD_KEYS.map((k) => [k, n === null || n[k] === null ? "" : String(n[k])])) as RawState;

const toStateNumbers = (r: RawState): StateNumbers =>
  Object.fromEntries(OTHER_STATE_FIELD_KEYS.map((k) => [k, r[k].trim() === "" ? null : asMoney(r[k])])) as StateNumbers;

/** The other state returns' fields, in the grid's order (the 1040's own state lines, the ones another state's return has). */
const OTHER_STATE_FIELDS = RETURN_FIELDS.filter((f) => (OTHER_STATE_FIELD_KEYS as readonly string[]).includes(f.key));

const stateName = (code: string | null) => (code ? (US_STATES[code] ?? code) : "State");

const moreEntityOf = (x: RecapOtherEntity, extract: EntityExtract | null, derived: boolean): MoreEntity => ({
  side: { ...idleSide(), entity: extract },
  form: x.form,
  name: x.name,
  stateCode: x.stateCode,
  numbers: { before: toRawEntity(x.before), after: toRawEntity(x.after) },
  derived: derived ? x.before : null,
});

const moreStateOf = (s: RecapOtherState, derived: boolean): MoreState => ({
  stateCode: s.stateCode,
  stateForm: s.stateForm,
  numbers: { before: toRawState(s.before), after: toRawState(s.after) },
  derived: derived ? s.before : null,
});

/** What the engine is handed beyond the 1040 and the first entity, from the grid as it stands. */
const moreFrom = (entities: MoreEntity[], states: MoreState[]): DeriveMore => ({
  // Every one, in order — one with nothing read is refused by name, so the
  // befores come back lined up with the grid's sections.
  entities: entities.map((x) => ({
    numbers: toEntityNumbers(x.numbers.after) ?? emptyEntityNumbers(),
    form: x.form,
    stateCode: x.stateCode,
    name: x.name,
  })),
  states: states.map((s) => ({ stateCode: s.stateCode, stateForm: s.stateForm, numbers: toStateNumbers(s.numbers.after) })),
});

/**
 * Where staff can put a Schedule 1 amount the reader didn't place: the
 * lines DeCypher claims as strategies, and the most common of the rest (it
 * stays on the before, but under its own name).
 */
const PLACE_ON: { key: ReturnFieldKey; label: string }[] = [
  { key: "sepDeduction", label: "SEP / solo 401(k) · line 16" },
  { key: "iraDeduction", label: "IRA · line 20" },
  { key: "hsaDeduction", label: "HSA · line 13" },
  { key: "studentLoanInterest", label: "Student loan interest · line 21" },
];

const GROUPS: { id: FieldGroup; title: string }[] = [
  { id: "income", title: "Income" },
  { id: "federal", title: "Federal" },
  { id: "credits", title: "Credits and other taxes" },
  { id: "business", title: "Schedule C" },
  { id: "coverage", title: "Health coverage" },
  { id: "state", title: "State" },
];

const ENTITY_GROUPS: { id: EntityFieldGroup; title: string }[] = [
  { id: "income", title: "Income" },
  { id: "deductions", title: "Deductions" },
  { id: "shareholder", title: "Owner (K-1)" },
  { id: "state", title: "State (the entity's return)" },
];

const btn =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-transparent px-5 py-2.5 font-display text-[14px] font-semibold no-underline transition-[transform,filter,opacity] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary = `${btn} bg-grad text-white hover:brightness-[1.07]`;
const btnGhost = `${btn} border-white/15 bg-transparent text-fog hover:border-mist`;
/** The one big action on the upload stage. */
const btnBig = `${btnPrimary} !px-8 !py-3.5 !text-[15px] shadow-[0_8px_30px_rgba(255,45,120,0.25)]`;

const fmtBytes = (b: number) =>
  b > 1024 * 1024
    ? `${(b / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(b / 1024)} KB`;

/** The 1040, a city return, the first entity return and the ones beyond it. */
const MAX_FILES = 3 + MAX_OTHER_ENTITIES;

/** Over this, a PDF is staged in pieces (see readOne). Under Vercel's ~4.5MB body cap. */
const DIRECT_MAX = 3.5 * 1024 * 1024;
/** Mirrors UPLOAD_CHUNK_BYTES / UPLOAD_MAX_BYTES in lib/tax-recap/uploads.ts. */
const CHUNK = 750 * 1024;
const PER_REQUEST = 4;
/** The originals kept with a refused return (failures-store's MAX_ORIGINALS, FAILURE_FILE_MAX_BYTES). */
const MAX_ORIGINALS = 12;
const ORIGINAL_MAX_BYTES = 24 * 1024 * 1024;
/**
 * The largest return accepted. A ProSeries export is 1–3 MB however long
 * the print; a scan is 15–20 MB, has no text layer to redact or cross-check
 * by, and takes minutes to read. The cap is the line between the two, so
 * every return that gets in can be redacted before it leaves.
 */
const FILE_MAX = 6 * 1024 * 1024;
const FILE_MAX_LABEL = "6 MB";

const kindLabel = (k: ReturnKind | null, form: EntityForm | null = null) =>
  k === "entity"
    ? `Form ${form ?? "1120-S / 1065"}`
    : k === "individual"
      ? "Form 1040"
      : k === "city"
        ? "City return (NYC-3L)"
        : "Not recognised";

/** The origin never changes while the page is open; nothing to subscribe to. */
const subscribeNever = () => () => {};

/**
 * Under a refusal: it's on record for engineering, and the redacted copies
 * can be kept with it. Both returns go in one press; each reports its own
 * outcome.
 */
function KeepLine({
  failure,
  onKeep,
  hasEntity,
}: {
  failure: {
    id: string;
    kept: Partial<Record<Kind, "keeping" | "kept" | "failed">>;
    originals?: { count: number; state: "saving" | "saved" | "failed" };
  };
  onKeep: () => void;
  hasEntity: boolean;
}) {
  const states = Object.values(failure.kept);
  const started = states.length > 0;
  const done = started && states.every((s) => s === "kept");
  const failed = states.some((s) => s === "failed");
  const o = failure.originals;
  const files = o ? `the ${o.count === 1 ? "file" : `${o.count} files`} you dropped, unchanged` : null;
  return (
    <span className="flex flex-wrap items-center gap-2 text-[12px] text-dusk">
      <span>
        Recorded for engineering (
        <Link href="/portal/tax-recap/failures" className="text-mist underline-offset-2 hover:underline">
          refused returns
        </Link>
        ): the numbers, the reader&rsquo;s notes, the reasons{files ? ` and ${files}` : ""}.
        {o?.state === "saving" ? " Saving the files…" : null}
        {o?.state === "failed" ? <span className="text-danger"> Not every file could be saved.</span> : null}
      </span>
      {!started ? (
        <button type="button" onClick={onKeep} className={btnGhost}>
          Keep the redacted cop{hasEntity ? "ies" : "y"} the reader saw too (14 days)
        </button>
      ) : (
        <span className={failed ? "text-danger" : done ? "text-teal" : ""}>
          {failed ? "Couldn't keep the copy — try again later" : done ? "Redacted copy kept for 14 days" : "Keeping…"}
        </span>
      )}
    </span>
  );
}

export default function TaxRecapBuilder({
  initial,
  tables,
  fromFailure = null,
}: {
  initial: RecapDoc | null;
  /** The year cards the engine derives with — seeds plus anything saved on the Tax Tables page. */
  tables: TableSet;
  /** Opened from a refused return that kept its files (Refused returns → "Open in builder"): they load with one click. */
  fromFailure?: { id: string; label: string; files: { index: number; name: string; size: number }[] } | null;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(initial ? "review" : "upload");
  const [failureLoad, setFailureLoad] = useState<"idle" | "loading" | "loaded" | "failed">("idle");
  /** The before drop zone, shown only once a derivation was refused and staff chose a print. */
  const [showBefore, setShowBefore] = useState(false);
  /** Every line in the review grid, blank ones included — on by default when the engine asked for a line to be typed. */
  const [showAllLines, setShowAllLines] = useState(false);

  const [clientName, setClientName] = useState(initial?.clientName ?? "");
  const [taxYear, setTaxYear] = useState(
    initial ? String(initial.taxYear) : "",
  );
  const [priorYearIncome, setPriorYearIncome] = useState(
    initial?.priorYearIncome != null ? String(initial.priorYearIncome) : "",
  );
  const [stateCode, setStateCode] = useState(initial?.stateCode ?? "");

  /** The files dropped on the tool, in the order they arrived. */
  const [picked, setPicked] = useState<Picked[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);

  const [sides, setSides] = useState<Record<Kind, SideState>>({
    before: {
      ...idleSide(),
      extract: initial?.extraction.before ?? null,
      derived: initial?.derivedBefore ?? null,
      derivedNumbers: initial?.derivedBefore ? initial.before : null,
    },
    after: { ...idleSide(), extract: initial?.extraction.after ?? null },
    entity: { ...idleSide(), entity: initial?.extraction.entity ?? null },
    city: { ...idleSide(), entity: initial?.extraction.city ?? null },
  });
  const [numbers, setNumbers] = useState<
    Record<"before" | "after", RawNumbers>
  >({
    before: toRaw(initial?.before ?? emptyNumbers()),
    after: toRaw(initial?.after ?? emptyNumbers()),
  });
  const [entityNumbers, setEntityNumbers] = useState<
    Record<"before" | "after", RawEntity>
  >({
    before: toRawEntity(initial?.entityBefore ?? null),
    after: toRawEntity(initial?.entityAfter ?? null),
  });
  /** The entity before as derived, so an edited cell can be told from a derived one. */
  const [entityDerived, setEntityDerived] = useState<EntityNumbers | null>(
    initial?.derivedBefore ? initial.entityBefore : null,
  );
  /** Entity returns beyond the first, and state returns beyond the main one (engine v13). */
  const [moreEntities, setMoreEntities] = useState<MoreEntity[]>(
    (initial?.otherEntities ?? []).map((x, i) => moreEntityOf(x, initial?.extraction.otherEntities?.[i] ?? null, !!initial?.derivedBefore)),
  );
  const [moreStates, setMoreStates] = useState<MoreState[]>(
    (initial?.otherStates ?? []).map((s) => moreStateOf(s, !!initial?.derivedBefore)),
  );
  const [analysis, setAnalysis] = useState<RecapAnalysis | null>(
    initial?.analysis ?? null,
  );
  const [strategies, setStrategies] = useState(
    (initial?.strategies ?? DEFAULT_STRATEGIES).join("\n"),
  );
  const [nextSteps, setNextSteps] = useState<RecapNextStep[]>(
    initial?.nextSteps.length ? initial.nextSteps : DEFAULT_NEXT_STEPS,
  );

  // The client's video: remade in this tab after every save whose numbers changed.
  const video = useVideoMaker(!!initial && videoIsCurrent(initial));
  const [saved, setSaved] = useState<{ id: string; token: string } | null>(
    initial ? { id: initial.id, token: initial.token } : null,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** Transient "Saved" tick next to the button, for re-saves of an open recap. */
  const [flash, setFlash] = useState(false);
  // The server has no window, and a link that exists only on the client is
  // a hydration mismatch on edit pages: "" on the server, the origin once
  // hydrated.
  const origin = useSyncExternalStore(
    subscribeNever,
    () => window.location.origin,
    () => "",
  );

  const reading =
    sides.before.status === "reading" ||
    sides.after.status === "reading" ||
    sides.entity.status === "reading" ||
    sides.city.status === "reading" ||
    moreEntities.some((x) => x.side.status === "reading");

  /**
   * A refusal is recorded the moment it happens (lib/tax-recap/failures-store):
   * what the engine was handed and what it said, and the files staff
   * dropped, unchanged, until the record is deleted (`keepOriginals`). The redacted
   * copies that went to the reader are held here in memory so staff can
   * choose to keep them with the record too.
   */
  const [failure, setFailure] = useState<{
    id: string;
    kept: Partial<Record<Kind, "keeping" | "kept" | "failed">>;
    originals?: { count: number; state: "saving" | "saved" | "failed" };
  } | null>(null);
  const preparedRef = useRef<Partial<Record<Kind, { data: Blob; name: string; pages: number }>>>({});
  const readInfoRef = useRef<Partial<Record<Kind, { warnings: string[]; total: number; sent: number }>>>({});

  const recordFailure = async (
    stage: "derive" | "rederive",
    meta: DeriveMeta,
    aNum: ReturnNumbers,
    eNum: EntityNumbers | null,
    result: { reasons: string[]; mismatches: Mismatch[] },
    afterExtract: ReturnExtract | null,
    entityExtract: EntityExtract | null,
    cityExtract: EntityExtract | null = null,
    more: DeriveMore = {},
  ) => {
    setFailure(null);
    const info = readInfoRef.current;
    // Every file dropped for this recap, the before print too, as dropped.
    const originals = [...new Set([...picked.map((p) => p.file), ...(sides.before.file ? [sides.before.file] : [])])];
    try {
      const res = await fetch("/api/portal/tax-recap/failures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          clientName: clientName.trim() || displayName(afterExtract?.taxpayerName ?? ""),
          engineVersion: DERIVE_VERSION,
          meta,
          reasons: result.reasons,
          mismatches: result.mismatches,
          after: aNum,
          entity: eNum,
          // Everything else on the 1040, so a replay hands the engine the same.
          more,
          extraction: { after: afterExtract, entity: entityExtract, city: cityExtract },
          warnings: { after: info.after?.warnings ?? [], entity: [...(info.entity?.warnings ?? []), ...(info.city?.warnings ?? []).map((w) => `City return: ${w}`)] },
          pages: {
            after: info.after ? { total: info.after.total, sent: info.after.sent } : null,
            entity: info.entity ? { total: info.entity.total, sent: info.entity.sent } : null,
          },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string };
      if (res.ok && data.ok && data.id) {
        setFailure({ id: data.id, kept: {} });
        void keepOriginals(data.id, originals);
      }
    } catch {
      /* recording a failure must never get in the reviewer's way */
    }
  };

  /**
   * Send the files staff dropped to the recorded refusal, byte for byte —
   * the PDFs as they came off the computer, not the redacted copies — so
   * the Refused returns page hands them back as they were, for as long as
   * the record is kept.
   * Runs on its own; a file that won't go is said on the refusal line and
   * never holds up the reviewer.
   */
  const keepOriginals = async (id: string, files: File[]) => {
    const sendable = files.filter((f) => f.size > 0 && f.size <= ORIGINAL_MAX_BYTES).slice(0, MAX_ORIGINALS);
    if (!sendable.length) return;
    const mark = (state: "saving" | "saved" | "failed") =>
      setFailure((f) => (f && f.id === id ? { ...f, originals: { count: sendable.length, state } } : f));
    mark("saving");
    let ok = sendable.length === files.length;
    for (const [index, file] of sendable.entries()) {
      try {
        const total = Math.ceil(file.size / CHUNK);
        for (let i = 0; i < total; i += PER_REQUEST) {
          const part = new FormData();
          part.append("index", String(index));
          part.append("total", String(total));
          part.append("size", String(file.size));
          part.append("name", file.name);
          for (let j = i; j < Math.min(total, i + PER_REQUEST); j++) {
            part.append(`chunk-${j}`, file.slice(j * CHUNK, (j + 1) * CHUNK), String(j));
          }
          let sent = false;
          for (let attempt = 0; attempt < 3 && !sent; attempt++) {
            const r = await fetch(`/api/portal/tax-recap/failures/${id}/originals`, { method: "POST", body: part }).catch(() => null);
            sent = !!r?.ok;
          }
          if (!sent) throw new Error("upload failed");
        }
      } catch {
        ok = false;
      }
    }
    mark(ok ? "saved" : "failed");
  };

  /** Keep the redacted copies that went to the reader with the recorded failure. */
  const keepReturns = async () => {
    if (!failure) return;
    const id = failure.id;
    for (const kind of ["after", "entity"] as const) {
      const p = preparedRef.current[kind];
      if (!p) continue;
      setFailure((f) => (f && f.id === id ? { ...f, kept: { ...f.kept, [kind]: "keeping" } } : f));
      try {
        const total = Math.ceil(p.data.size / CHUNK);
        for (let i = 0; i < total; i += PER_REQUEST) {
          const part = new FormData();
          part.append("kind", kind);
          part.append("total", String(total));
          part.append("size", String(p.data.size));
          part.append("name", p.name);
          part.append("pages", String(p.pages));
          for (let j = i; j < Math.min(total, i + PER_REQUEST); j++) {
            part.append(`chunk-${j}`, p.data.slice(j * CHUNK, (j + 1) * CHUNK), String(j));
          }
          // A dropped request left four kept copies with pieces missing (and
          // unreadable); each batch gets three tries before the copy fails.
          let sent = false;
          for (let attempt = 0; attempt < 3 && !sent; attempt++) {
            const r = await fetch(`/api/portal/tax-recap/failures/${id}/file`, { method: "POST", body: part }).catch(() => null);
            sent = !!r?.ok;
          }
          if (!sent) throw new Error("upload failed");
        }
        setFailure((f) => (f && f.id === id ? { ...f, kept: { ...f.kept, [kind]: "kept" } } : f));
      } catch {
        setFailure((f) => (f && f.id === id ? { ...f, kept: { ...f.kept, [kind]: "failed" } } : f));
      }
    }
  };

  /**
   * The files a refused return kept, fetched back as they were dropped and
   * dropped again — the same path a drag from the desktop takes, so they're
   * redacted and read the usual way.
   */
  const loadFailureFiles = async () => {
    if (!fromFailure) return;
    setFailureLoad("loading");
    try {
      const files = await Promise.all(
        fromFailure.files.map(async (f) => {
          const r = await fetch(`/api/portal/tax-recap/failures/${fromFailure.id}/originals?index=${f.index}`);
          if (!r.ok) throw new Error(`couldn't fetch ${f.name}`);
          return new File([await r.blob()], f.name, { type: "application/pdf" });
        }),
      );
      addFiles(files);
      setFailureLoad("loaded");
    } catch {
      setFailureLoad("failed");
    }
  };

  /* ─────────────────────────────── upload ─────────────────────────────── */

  /**
   * Take the dropped files. Each is opened in the browser right away to
   * learn what it is (a 1040 or an 1120-S) and how many pages it has, so
   * the card can say so before anything is sent.
   */
  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files).filter(
      (f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf",
    );
    if (!list.length) return;
    setPickError(null);
    const fresh: Picked[] = list.map((file) => ({
      id: crypto.randomUUID(),
      file,
      analysis: null,
      status: "checking",
    }));
    // The 1040, a city return and the entity returns: one business's or several.
    setPicked((p) => [...p, ...fresh].slice(0, MAX_FILES));
    // Reset the read sides: a new set of files means a new recap.
    setSides((s) => ({
      ...s,
      after: idleSide(),
      entity: idleSide(),
      city: idleSide(),
      before: s.before.file ? s.before : idleSide(),
    }));
    setMoreEntities([]);
    for (const item of fresh) {
      analyzePdf(item.file)
        .then((analysis) =>
          setPicked((p) =>
            p.map((x) =>
              x.id === item.id
                ? {
                    ...x,
                    analysis,
                    status: analysis.pages ? "ready" : "unreadable",
                  }
                : x,
            ),
          ),
        )
        .catch(() =>
          setPicked((p) =>
            p.map((x) =>
              x.id === item.id ? { ...x, status: "unreadable" } : x,
            ),
          ),
        );
    }
  };

  const removePicked = (id: string) => {
    setPicked((p) => p.filter((x) => x.id !== id));
    setPickError(null);
    setSides((s) => ({ ...s, after: idleSide(), entity: idleSide(), city: idleSide() }));
    setMoreEntities([]);
  };

  /**
   * A file whose pages and name say nothing about what it is (a scan, a
   * print with its text layer scrambled throughout, named without the
   * form): staff say, and the analysis carries it from there like a kind
   * the pages had given.
   */
  const setPickedKind = (id: string, kind: ReturnKind) => {
    setPickError(null);
    setPicked((p) =>
      p.map((x) =>
        x.id === id && x.analysis
          ? {
              ...x,
              analysis: {
                ...x.analysis,
                kind,
                entityForm: kind === "entity" ? (x.analysis.entityForm ?? entityFormFromFileName(x.file.name)) : null,
              },
            }
          : x,
      ),
    );
  };

  const pickBefore = (file: File | null) =>
    setSides((s) => ({ ...s, before: { ...idleSide(), file } }));

  /**
   * Read one return: prepare it here, send it, and hand back what came out.
   * `w2Pages` (the 1040 only) is which of its pages list W-2s the client's
   * own business issued, found by EIN in the unredacted text: the reader
   * is told the pages, never the number.
   */
  const readOne = async (
    kind: Kind,
    source: { file: File; analysis: PdfAnalysis | null },
    shared: { tokens: string[]; short: string[] },
    w2Pages: EntityW2Page[] | null = null,
    /** An entity return beyond the first: which of `moreEntities` it fills. */
    slot?: number,
    /**
     * The second, Schedule 1-only read of the after return (see
     * `placeAdjustments`): just these pages, or the usual selection when
     * none could be found. It leaves the side's page counts, preview and
     * kept copy as the first read set them.
     */
    focus?: { pages: number[] },
  ) => {
    const patch = (p: Partial<SideState>) =>
      slot === undefined
        ? setSides((s) => ({ ...s, [kind]: { ...s[kind], ...p } }))
        : setMoreEntities((m) => m.map((x, i) => (i === slot ? { ...x, side: { ...x.side, ...p } } : x)));
    const say = (message: string) => patch({ file: source.file, status: "reading", message });

    if (!focus) say("Opening the PDF…");
    // Reads the page text, trims the return to the pages the recap needs and
    // paints out the identity fields — all here, before anything leaves.
    const prepared = await preparePdf(source.analysis ?? source.file, {
      kind: kind === "entity" || kind === "city" ? kind : "individual",
      extraTokens: shared.tokens,
      extraShortTokens: shared.short,
      onlyPages: focus?.pages,
    });
    // A print that can't be redacted is never sent (see pdf-prepare).
    if (prepared.blocked) throw new Error(prepared.blocked);
    if (process.env.NODE_ENV !== "production") {
      // For the browser test to inspect exactly what would be sent.
      const w = window as unknown as {
        __taxRecapPrepared?: Record<string, unknown>;
      };
      w.__taxRecapPrepared = {
        ...(w.__taxRecapPrepared ?? {}),
        [focus ? `${kind}:adjustments` : kind]: prepared,
      };
    }
    if (!focus) {
      // The copies a refusal can keep are the 1040's and the first entity return's.
      if (slot === undefined) preparedRef.current[kind] = { data: prepared.data, name: source.file.name, pages: prepared.sentPages };
      patch({
        pages: prepared.totalPages,
        sentPages: prepared.sentPages,
        localName: kind === "entity" || kind === "city" ? prepared.identity.entityName : prepared.identity.name,
        redaction: {
          redacted: prepared.identity.redacted,
          boxes: prepared.identity.boxes,
          preview: prepared.preview,
        },
      });
    }

    const what =
      kind === "entity" ? `the ${source.analysis?.entityForm ?? "entity return"}` : kind === "city" ? "the city return" : "the return";
    const readingMsg = focus
      ? `Schedule 1's adjustments didn't add up to Form 1040 line 10 — reading ${prepared.sentPages === 1 ? "that page" : `those ${prepared.sentPages} pages`} again…`
      : prepared.trimmed
        ? `Reading the ${prepared.sentPages} pages of ${what} that hold the numbers, out of ${prepared.totalPages}…`
        : `Reading all ${prepared.totalPages} pages of ${what} — this takes a minute or two…`;

    const fd = new FormData();
    fd.append("kind", kind);
    if (focus) fd.append("focus", "adjustments");
    fd.append("pageTexts", JSON.stringify(prepared.pageTexts));
    // Page numbers the model cites are positions in the trimmed copy; this
    // maps them back so the reviewer sees the page of the real return.
    fd.append("pageMap", JSON.stringify(prepared.pageMap));

    // Which W-2s the business issued, by page position in the copy being
    // sent (a page the trim dropped can't be pointed at) and, on a wage
    // schedule, by the amounts printed on the row — the one thing on a
    // painted-over row the model can still match.
    const w2Hints: string[] = [];
    const w2Found: number[] = [];
    const business = "the client's own business (the S corporation or partnership whose K-1 is on Schedule E page 2)";
    for (const p of w2Pages ?? []) {
      const sent = prepared.pageMap.indexOf(p.page) + 1;
      if (!sent) continue;
      w2Found.push(p.page);
      if (p.copy) {
        w2Hints.push(
          `The W-2 on page ${sent} of this PDF was issued by ${business}: report its box 1 wages under w2TaxpayerEntity or w2SpouseEntity (whichever person it names) as well as inside w2Taxpayer / w2Spouse.`,
        );
        continue;
      }
      const list = (rows: EntityW2Page["rows"]) => rows.map((r) => `[${r.amounts.join(" · ")}]`).join(" and ");
      const ours = p.rows.filter((r) => r.ours);
      const theirs = p.rows.filter((r) => !r.ours);
      w2Hints.push(
        `On page ${sent} of this PDF, the W-2 row${ours.length > 1 ? "s" : ""} printed with the amounts ${list(ours)} ${ours.length > 1 ? "were" : "was"} issued by ${business}: report ${ours.length > 1 ? "each such row's" : "that row's"} wages under w2TaxpayerEntity or w2SpouseEntity by whose row it is (the taxpayer's has an amount in the taxpayer column, the spouse's in the spouse column), as well as inside w2Taxpayer / w2Spouse.${
          theirs.length
            ? ` The row${theirs.length > 1 ? "s" : ""} with the amounts ${list(theirs)} ${theirs.length > 1 ? "are" : "is"} from another employer: count ${theirs.length > 1 ? "them" : "it"} in w2Taxpayer / w2Spouse only.`
            : ""
        }`,
      );
    }
    if (w2Hints.length) fd.append("hints", w2Hints.join("\n"));

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
        part.append("name", source.file.name);
        for (let j = i; j < Math.min(total, i + PER_REQUEST); j++) {
          part.append(
            `chunk-${j}`,
            prepared.data.slice(j * CHUNK, (j + 1) * CHUNK),
            String(j),
          );
        }
        say(
          `Uploading ${fmtBytes(Math.min(prepared.sentBytes, (i + PER_REQUEST) * CHUNK))} of ${fmtBytes(prepared.sentBytes)}…`,
        );
        const r = await fetch("/api/portal/tax-recap/upload", {
          method: "POST",
          body: part,
        });
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { message?: string };
          throw new Error(d.message ?? "Upload failed");
        }
      }
      fd.append("uploadId", uploadId);
    } else {
      fd.append("file", prepared.data, source.file.name);
    }
    say(readingMsg);

    const res = await fetch("/api/portal/tax-recap/extract", {
      method: "POST",
      body: fd,
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      extract?: ReturnExtract | EntityExtract;
      warnings?: string[];
    };
    if (!res.ok || !data.ok || !data.extract) {
      throw new Error(data.message ?? `Couldn't read ${what}`);
    }
    const warnings = [...(data.warnings ?? [])];
    if (w2Found.length) {
      warnings.push(
        `The business's W-2s on page${w2Found.length > 1 ? "s" : ""} ${w2Found.join(", ")} were picked out here in the browser by their EIN; the reader was told the page and the amounts on the row, never the number — check the "W-2 wages from the business" lines against the print`,
      );
    } else if (w2Pages) {
      warnings.push(
        "No W-2 from the business was found in the print (no W-2 copies, and no state wage schedule listing employers), so the reader couldn't fill the \"W-2 wages from the business\" lines; if the engine asks, type them",
      );
    }
    if (prepared.garbledPages.length) {
      const g = prepared.garbledPages;
      warnings.push(
        `${g.length} page${g.length > 1 ? "s" : ""} (${g.join(", ")}) had an unreadable text layer — a ProSeries font quirk; the pages render fine — and ${
          prepared.identity.redacted && prepared.identity.dataFontFound
            ? "went with every word in the data font painted out, numbers only; the printed labels are untouched"
            : "went as printed, since no data font could be told apart to paint the words out of"
        }`,
      );
    }
    if (slot === undefined && !focus) readInfoRef.current[kind] = { warnings, total: prepared.totalPages, sent: prepared.sentPages };
    return {
      extract: data.extract,
      warnings,
      localName: prepared.identity.name,
      entityName: prepared.identity.entityName,
    };
  };

  /**
   * Schedule 1 Part II as read, against Form 1040 line 10 (line 9 less line
   * 11a). The lines add up to it on every return, so a difference is a line
   * the reader skipped or misread — once a $70,000 SEP, which the before
   * then kept, so the recap never showed it as savings. One more read of
   * the Schedule 1 pages alone; whichever read adds up better is kept, and
   * whatever still doesn't is asked about on review.
   */
  const placeAdjustments = async (
    first: ReturnExtract,
    source: { file: File; analysis: PdfAnalysis | null },
    shared: { tokens: string[]; short: string[] },
  ): Promise<{ extract: ReturnExtract; warnings: string[] }> => {
    const was = unplacedAdjustments(numbersFromExtract(first));
    if (was === null || Math.abs(was) <= ADJUSTMENTS_TOLERANCE) return { extract: first, warnings: [] };
    // Schedule 1 by its Part II (line 11's label is on no other form), the
    // 1040's first page by line 9's, and wherever the first read found a
    // Schedule 1 line. None found (a scrambled text layer): the usual pages.
    const pages = new Set<number>();
    (source.analysis?.texts ?? []).forEach((t, i) => {
      if (/educator expenses/i.test(t) || /this is your total income/i.test(t)) pages.add(i + 1);
    });
    for (const k of SCHEDULE_1_ADJUSTMENT_KEYS) {
      const p = first.fields[k]?.page;
      if (p) pages.add(p);
    }
    const gap = (u: number) => (u > 0 ? `${money(u)} of line 10 on no line read` : `the lines read ${money(-u)} more than line 10`);
    let second: ReturnExtract;
    try {
      second = (await readOne("after", source, shared, null, undefined, { pages: [...pages] })).extract as ReturnExtract;
    } catch (e) {
      return {
        extract: first,
        warnings: [`Schedule 1 doesn't add up to Form 1040 line 10 (${gap(was)}), and a second read of its page couldn't be made: ${e instanceof Error ? e.message : "it failed"}`],
      };
    }
    // The second read's Part II in place of the first's. Lines 9 and 11a stay
    // the first read's: it had the whole return in front of it.
    const merged: ReturnExtract = { ...first, fields: { ...first.fields } };
    for (const k of SCHEDULE_1_ADJUSTMENT_KEYS) merged.fields[k] = second.fields[k];
    const now = unplacedAdjustments(numbersFromExtract(merged)) ?? 0;
    if (Math.abs(now) >= Math.abs(was)) {
      return {
        extract: first,
        warnings: [`Schedule 1 doesn't add up to Form 1040 line 10 (${gap(was)}), and a second read of the Schedule 1 page didn't place it either — it's asked about above the numbers`],
      };
    }
    const label = (k: ReturnFieldKey) => RETURN_FIELDS.find((f) => f.key === k)?.label ?? k;
    const changed = SCHEDULE_1_ADJUSTMENT_KEYS.filter((k) => first.fields[k]?.value !== second.fields[k]?.value).map((k) => {
      const v = second.fields[k]?.value;
      return `${label(k)} ${v === null || v === undefined ? "blank" : money(v)}${second.fields[k]?.page ? ` (page ${second.fields[k].page})` : ""}`;
    });
    return {
      extract: merged,
      warnings: [
        `Schedule 1 didn't add up to Form 1040 line 10 on the first read (${gap(was)}); a second read of the Schedule 1 page ${
          Math.abs(now) <= ADJUSTMENTS_TOLERANCE ? "put it right" : `got it closer (${gap(now)}, asked about above the numbers)`
        }: ${changed.join(", ")}. Check against the page`,
      ],
    };
  };

  const fail = (kind: Kind, e: unknown) =>
    setSides((s) => ({
      ...s,
      [kind]: {
        ...s[kind],
        status: "error",
        message: e instanceof Error ? e.message : "Couldn't read that return",
      },
    }));

  /**
   * Sort the dropped files into the 1040, the entity returns (the first,
   * and any beyond it: a client can own several businesses) and the city's
   * return for the corporation if there is one. The S corporations go
   * first, so a city return lays over one of them.
   */
  const sortPicked = (): { after: Picked; entity: Picked | null; more: Picked[]; city: Picked | null } | null => {
    const ready = picked.filter((p) => p.status !== "checking");
    if (ready.length !== picked.length) return null;
    const individuals = ready.filter((p) => p.analysis?.kind === "individual");
    const isScorp = (p: Picked) => (p.analysis?.entityForm ?? entityFormFromFileName(p.file.name)) !== "1065";
    const entities = ready
      .filter((p) => p.analysis?.kind === "entity")
      .sort((x, y) => Number(isScorp(y)) - Number(isScorp(x)));
    const cities = ready.filter((p) => p.analysis?.kind === "city");
    const unknown = ready.filter((p) => !p.analysis?.kind);
    if (individuals.length > 1) {
      setPickError(
        "Two individual returns were dropped. Keep the final 1040 here; a before print has its own slot below once the engine asks for one.",
      );
      return null;
    }
    if (entities.length > 1 + MAX_OTHER_ENTITIES) {
      setPickError(`More than ${1 + MAX_OTHER_ENTITIES} entity returns were dropped — the recap takes up to ${1 + MAX_OTHER_ENTITIES} businesses.`);
      return null;
    }
    if (cities.length > 1) {
      setPickError("Two city returns were dropped — keep the one for this client's business.");
      return null;
    }
    if (cities.length && !entities.length) {
      setPickError(
        "A city return (NYC-3L) was dropped without the corporation's 1120-S — add it; the city's tax is read alongside the federal return.",
      );
      return null;
    }
    // A scan can't be told apart by its text; a lone unrecognised file is taken as the 1040.
    const after =
      individuals[0] ??
      (unknown.length === 1 && !individuals.length ? unknown[0] : undefined);
    if (!after) {
      setPickError(
        entities.length
          ? "Only the entity's return was dropped — add the owner's final 1040; the recap is built from both."
          : "None of these files looks like a ProSeries return.",
      );
      return null;
    }
    if (unknown.length > 1 || (unknown.length === 1 && individuals.length)) {
      setPickError(
        "One of the files couldn't be recognised as a return — remove it and try again.",
      );
      return null;
    }
    return { after, entity: entities[0] ?? null, more: entities.slice(1), city: cities[0] ?? null };
  };

  const readReturns = async () => {
    const sorted = sortPicked();
    if (!sorted) return;
    const beforeFile = sides.before.file;
    // What a previous client's run left behind for a return this run doesn't
    // have — its read warnings, page counts and the redacted copy — must not
    // be recorded with this client's refusal or kept under this client's
    // name (a 1040-only run used to carry the last client's 1120-S).
    if (!sorted.entity) {
      delete preparedRef.current.entity;
      delete readInfoRef.current.entity;
    }
    if (!sorted.city) {
      delete preparedRef.current.city;
      delete readInfoRef.current.city;
    }
    if (!beforeFile) {
      delete preparedRef.current.before;
      delete readInfoRef.current.before;
    }
    // Words learned from either return (the corporation's name, the owner's)
    // are painted out of both.
    const tokens = {
      tokens: [...new Set(picked.flatMap((p) => p.analysis?.tokens ?? []))],
      short: [...new Set(picked.flatMap((p) => p.analysis?.shortTokens ?? []))],
    };

    // A return already read for its current file isn't sent again: when a
    // derivation is refused and the before PDF then added, only that one
    // costs a read.
    const readAfter = async (): Promise<ReturnExtract | null> => {
      if (
        sides.after.status === "done" &&
        sides.after.extract &&
        sides.after.file === sorted.after.file
      ) {
        return sides.after.extract;
      }
      try {
        // The business's EIN, from the 1040's Schedule E and the entity's
        // own print, picks out the W-2s it issued; both texts are the
        // unredacted ones, which never leave the browser.
        const afterTexts = sorted.after.analysis?.texts ?? [];
        // Every entity return's: a W-2 from any of the client's businesses is theirs.
        const entityTexts = [sorted.entity, ...sorted.more].flatMap((p) => p?.analysis?.texts ?? []);
        const eins = entityEins(afterTexts, entityTexts);
        // An empty list (business known, no W-2 of its found) is reported
        // too, so the reviewer knows why the lines are blank.
        const w2Pages = eins.length ? entityW2Pages(afterTexts, eins) : null;
        const r = await readOne("after", sorted.after, tokens, w2Pages);
        const read = r.extract as ReturnExtract;
        // The Schedule 1 lines checked against line 10, read again if they
        // don't add up.
        const placed = await placeAdjustments(read, sorted.after, tokens);
        const ex = placed.extract;
        const warnings = [...r.warnings, ...placed.warnings];
        const info = readInfoRef.current.after;
        if (info) info.warnings = warnings;
        // The name is painted out before the model sees the page, so the
        // one read locally off the 1040 fills the client field.
        const named = ex.taxpayerName
          ? ex
          : { ...ex, taxpayerName: r.localName ?? "" };
        setSides((s) => ({
          ...s,
          after: {
            ...s.after,
            status: "done",
            message: "",
            problems: [],
            extract: named,
            warnings,
          },
        }));
        setNumbers((n) => ({ ...n, after: toRaw(numbersFromExtract(named)) }));
        return named;
      } catch (e) {
        fail("after", e);
        return null;
      }
    };
    const readEntity = async (): Promise<EntityExtract | null> => {
      if (!sorted.entity) return null;
      if (
        sides.entity.status === "done" &&
        sides.entity.entity &&
        sides.entity.file === sorted.entity.file
      ) {
        return sides.entity.entity;
      }
      try {
        const r = await readOne("entity", sorted.entity, tokens);
        const ex = r.extract as EntityExtract;
        const named = ex.entityName
          ? ex
          : { ...ex, entityName: r.entityName ?? "" };
        setSides((s) => ({
          ...s,
          entity: {
            ...s.entity,
            status: "done",
            message: "",
            problems: [],
            entity: named,
            warnings: r.warnings,
          },
        }));
        return named;
      } catch (e) {
        fail("entity", e);
        return null;
      }
    };
    // The entity returns beyond the first, each into its own slot. One read
    // already for the same file isn't sent again.
    const previous = moreEntities;
    const slots: MoreEntity[] = sorted.more.map((p) => {
      const was = previous.find((x) => x.side.file === p.file && x.side.status === "done" && x.side.entity);
      return (
        was ?? {
          side: { ...idleSide(), file: p.file },
          form: p.analysis?.entityForm ?? entityFormFromFileName(p.file.name),
          name: null,
          stateCode: null,
          numbers: { before: toRawEntity(null), after: toRawEntity(null) },
          derived: null,
        }
      );
    });
    setMoreEntities(slots);
    const readMore = async (i: number): Promise<EntityExtract | null> => {
      if (slots[i].side.status === "done" && slots[i].side.entity) return slots[i].side.entity;
      try {
        const r = await readOne("entity", sorted.more[i], tokens, null, i);
        const ex = r.extract as EntityExtract;
        const named = ex.entityName ? ex : { ...ex, entityName: r.entityName ?? "" };
        setMoreEntities((m) =>
          m.map((x, j) =>
            j === i
              ? {
                  ...x,
                  side: { ...x.side, status: "done", message: "", problems: [], entity: named, warnings: r.warnings },
                  form: named.returnForm ?? x.form,
                  name: named.entityName || null,
                  stateCode: named.stateCode,
                }
              : x,
          ),
        );
        return named;
      } catch (e) {
        setMoreEntities((m) =>
          m.map((x, j) =>
            j === i ? { ...x, side: { ...x.side, status: "error", message: e instanceof Error ? e.message : "Couldn't read that return" } } : x,
          ),
        );
        return null;
      }
    };
    // The city's own return for the corporation (NYC-3L): read into the
    // same entity record's city lines, laid over the 1120-S's below.
    const readCity = async (): Promise<EntityExtract | null> => {
      if (!sorted.city) return null;
      if (
        sides.city.status === "done" &&
        sides.city.entity &&
        sides.city.file === sorted.city.file
      ) {
        return sides.city.entity;
      }
      try {
        const r = await readOne("city", sorted.city, tokens);
        const ex = r.extract as EntityExtract;
        const named = ex.entityName ? ex : { ...ex, entityName: r.entityName ?? "" };
        setSides((s) => ({
          ...s,
          city: {
            ...s.city,
            status: "done",
            message: "",
            problems: [],
            entity: named,
            warnings: r.warnings,
          },
        }));
        return named;
      } catch (e) {
        fail("city", e);
        return null;
      }
    };
    const readBefore = async (): Promise<ReturnExtract | null> => {
      if (!beforeFile) return null;
      if (
        sides.before.status === "done" &&
        sides.before.extract &&
        !sides.before.derived
      )
        return sides.before.extract;
      try {
        const r = await readOne(
          "before",
          { file: beforeFile, analysis: null },
          tokens,
        );
        const ex = r.extract as ReturnExtract;
        const named = ex.taxpayerName
          ? ex
          : { ...ex, taxpayerName: r.localName ?? "" };
        setSides((s) => ({
          ...s,
          before: {
            ...s.before,
            status: "done",
            message: "",
            problems: [],
            extract: named,
            warnings: r.warnings,
          },
        }));
        setNumbers((n) => ({ ...n, before: toRaw(numbersFromExtract(named)) }));
        return named;
      } catch (e) {
        fail("before", e);
        return null;
      }
    };

    const [a, ent, city, b, extras] = await Promise.all([
      readAfter(),
      readEntity(),
      readCity(),
      readBefore(),
      Promise.all(sorted.more.map((_, i) => readMore(i))),
    ]);
    if (!a) return;
    if (sorted.entity && !ent) return;
    if (sorted.city && !city) return;
    if (extras.some((x) => !x)) return;

    // Everything else on the 1040: each other entity return with its own
    // form and state, and each other state return the reader found.
    const extraEntities: MoreEntity[] = slots.map((x, i) => {
      const ex = extras[i] as EntityExtract;
      return {
        ...x,
        side: { ...x.side, status: "done", entity: ex },
        form: ex.returnForm ?? x.form,
        name: ex.entityName || null,
        stateCode: ex.stateCode,
        numbers: { before: toRawEntity(null), after: toRawEntity(numbersFromEntityExtract(ex)) },
        derived: null,
      };
    });
    // A before print's own other states, lined up by code.
    const beforeState = (code: string) => {
      const x = b?.otherStates?.find((s) => s.stateCode === code);
      return x ? stateNumbersFromExtract(x) : null;
    };
    const extraStates: MoreState[] = (a.otherStates ?? []).map((s) => ({
      stateCode: s.stateCode,
      stateForm: s.stateForm,
      numbers: { before: toRawState(beforeState(s.stateCode)), after: toRawState(stateNumbersFromExtract(s)) },
      derived: null,
    }));
    setMoreEntities(extraEntities);
    setMoreStates(extraStates);
    const more = moreFrom(extraEntities, extraStates);

    const aNum = numbersFromExtract(a);
    let eNum: EntityNumbers | null = withCity(ent ? numbersFromEntityExtract(ent) : null, city);
    const entityForm = ent?.returnForm ?? sorted.entity?.analysis?.entityForm ?? null;
    if (
      eNum &&
      eNum.pteTax === null &&
      (aNum.statePteCreditAvailable ?? 0) > 0
    ) {
      // California prints the elective tax on Form 3804 and the credit on the
      // 1040's 3804-CR; the 100S itself may not carry it on line 29.
      eNum = { ...eNum, pteTax: aNum.statePteCreditAvailable };
      setSides((s) => ({
        ...s,
        entity: {
          ...s.entity,
          warnings: [
            ...s.entity.warnings,
            `PTE elective tax (${money(aNum.statePteCreditAvailable ?? 0)}) taken from the 1040's FTB 3804-CR — the state print doesn't carry it on its own line`,
          ],
        },
      }));
    }
    setEntityNumbers((e) => ({ ...e, after: toRawEntity(eNum) }));

    setClientName(displayName(a.taxpayerName || b?.taxpayerName || ""));
    setTaxYear(String(a.taxYear ?? b?.taxYear ?? new Date().getFullYear() - 1));
    setStateCode(a.stateCode || b?.stateCode || "");

    if (beforeFile) {
      if (!b) return;
      // A before print for the 1040 only; the corporation's before column
      // is typed, if it's wanted, from its own zero-write-off print.
      setEntityDerived(null);
      setAnalysis(attributeStrategies(aNum, metaOf(a, entityForm, ent), tables, eNum, more));
      setStage("review");
      return;
    }

    // No before PDF: derive it. A refusal keeps the reads and stays here
    // with the reasons and the two ways through.
    const result = deriveBefore(aNum, metaOf(a, entityForm, ent), tables, eNum, more);
    if (!result.ok) {
      setSides((s) => ({
        ...s,
        before: {
          ...idleSide(),
          status: "error",
          message: "The before column can't be computed from this return",
          problems: result.reasons,
        },
      }));
      void recordFailure("derive", metaOf(a, entityForm, ent), aNum, eNum, result, a, ent, city, more);
      return;
    }
    setMoreEntities(extraEntities.map((x, i) => ({ ...x, numbers: { ...x.numbers, before: toRawEntity(result.otherEntitiesBefore[i] ?? null) }, derived: result.otherEntitiesBefore[i] ?? null })));
    setMoreStates(extraStates.map((s, i) => ({ ...s, numbers: { ...s.numbers, before: toRawState(result.otherStatesBefore[i] ?? null) }, derived: result.otherStatesBefore[i] ?? null })));
    setSides((s) => ({
      ...s,
      before: {
        ...idleSide(),
        status: "done",
        derived: result.derived,
        derivedNumbers: result.before,
      },
    }));
    setNumbers((n) => ({ ...n, before: toRaw(result.before), after: withAfterFixes(n.after, result.afterFixes) }));
    setEntityNumbers((e) => ({
      ...e,
      before: toRawEntity(result.entityBefore),
    }));
    setEntityDerived(result.entityBefore);
    setAnalysis(attributeStrategies(aNum, metaOf(a, entityForm, ent), tables, eNum, more));
    setStage("review");
  };

  /**
   * The engine said no: go to review anyway with the before column empty,
   * for staff to type from a before print they have in hand. The reasons
   * ride along to the "Things to look at" list so they're not lost.
   */
  const continueTyping = () => {
    const a = sides.after.extract;
    if (!a) return;
    setSides((s) => ({
      ...s,
      before: {
        ...idleSide(),
        warnings: s.before.problems.map((p) => `Not computed — ${p}`),
      },
    }));
    setNumbers((n) => ({ ...n, before: toRaw(emptyNumbers()) }));
    setEntityNumbers((e) => ({ ...e, before: toRawEntity(null) }));
    setEntityDerived(null);
    setMoreEntities((m) => m.map((x) => ({ ...x, numbers: { ...x.numbers, before: toRawEntity(null) }, derived: null })));
    setMoreStates((m) => m.map((s) => ({ ...s, numbers: { ...s.numbers, before: toRawState(null) }, derived: null })));
    setAnalysis(null);
    setClientName(displayName(a.taxpayerName || ""));
    setTaxYear(String(a.taxYear ?? new Date().getFullYear() - 1));
    setStateCode(a.stateCode || "");
    // The line the engine asked for is almost always a blank, optional one.
    setShowAllLines(true);
    setStage("review");
  };

  /**
   * Derive again from the after column as it now stands. For when a misread
   * after line was corrected in the grid: the before was computed from the
   * wrong number and should follow the fix.
   */
  const [rederiveError, setRederiveError] = useState<string[] | null>(null);
  /** `afterRaw`: an after column just set and not yet in state (the Schedule 1 answer). */
  const rederive = (afterRaw: RawNumbers = numbers.after) => {
    const a = sides.after.extract;
    if (!a) return;
    const meta: DeriveMeta = {
      ...metaOf(a, sides.entity.entity?.returnForm ?? null, sides.entity.entity),
      taxYear: /^\d{4}$/.test(taxYear.trim()) ? Number(taxYear) : a.taxYear,
      stateCode: stateCode.trim() || a.stateCode,
    };
    const aNum = toNumbers(afterRaw);
    const eNum = toEntityNumbers(entityNumbers.after);
    const more = moreFrom(moreEntities, moreStates);
    const result = deriveBefore(aNum, meta, tables, eNum, more);
    if (!result.ok) {
      setRederiveError(result.reasons);
      void recordFailure("rederive", meta, aNum, eNum, result, a, sides.entity.entity, sides.city.entity, more);
      return;
    }
    setMoreEntities((m) => m.map((x, i) => ({ ...x, numbers: { ...x.numbers, before: toRawEntity(result.otherEntitiesBefore[i] ?? null) }, derived: result.otherEntitiesBefore[i] ?? null })));
    setMoreStates((m) => m.map((s, i) => ({ ...s, numbers: { ...s.numbers, before: toRawState(result.otherStatesBefore[i] ?? null) }, derived: result.otherStatesBefore[i] ?? null })));
    setRederiveError(null);
    setSides((s) => ({
      ...s,
      before: {
        ...idleSide(),
        status: "done",
        derived: result.derived,
        derivedNumbers: result.before,
      },
    }));
    setNumbers((n) => ({ ...n, before: toRaw(result.before), after: withAfterFixes(n.after, result.afterFixes) }));
    setEntityNumbers((e) => ({
      ...e,
      before: toRawEntity(result.entityBefore),
    }));
    setEntityDerived(result.entityBefore);
    setAnalysis(attributeStrategies(aNum, meta, tables, eNum, more));
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
    setPicked([]);
    setPickError(null);
    setSides({ before: idleSide(), after: idleSide(), entity: idleSide(), city: idleSide() });
    setNumbers({ before: toRaw(emptyNumbers()), after: toRaw(emptyNumbers()) });
    setEntityNumbers({ before: toRawEntity(null), after: toRawEntity(null) });
    setEntityDerived(null);
    setMoreEntities([]);
    setMoreStates([]);
    setAnalysis(null);
    setStrategies(DEFAULT_STRATEGIES.join("\n"));
    setNextSteps(DEFAULT_NEXT_STEPS);
    setSaved(null);
    setSaveError(null);
    setRederiveError(null);
    setShowBefore(false);
    setStage("upload");
    // An edit was opened via ?edit=<id>; drop the param so a refresh doesn't
    // reload that recap over the blank form.
    if (initial) router.push("/portal/tax-recap");
  };

  /* ─────────────────────────────── review ─────────────────────────────── */

  const parsed = useMemo(
    () => ({
      before: toNumbers(numbers.before),
      after: toNumbers(numbers.after),
      entityBefore: toEntityNumbers(entityNumbers.before),
      entityAfter: toEntityNumbers(entityNumbers.after),
      otherEntities: moreEntities.map(
        (x): RecapOtherEntity => ({
          form: x.form,
          name: x.name,
          stateCode: x.stateCode,
          before: toEntityNumbers(x.numbers.before),
          after: toEntityNumbers(x.numbers.after),
        }),
      ),
      otherStates: moreStates.map(
        (s): RecapOtherState => ({
          stateCode: s.stateCode,
          stateForm: s.stateForm,
          before: toStateNumbers(s.numbers.before),
          after: toStateNumbers(s.numbers.after),
        }),
      ),
    }),
    [numbers, entityNumbers, moreEntities, moreStates],
  );
  const computed = useMemo(
    () =>
      computeRecap({
        before: parsed.before,
        after: parsed.after,
        entityBefore: parsed.entityBefore,
        entityAfter: parsed.entityAfter,
        otherEntities: parsed.otherEntities,
        otherStates: parsed.otherStates,
        stateCode: stateCode.trim() || null,
        extraction: { before: null, after: null, entity: sides.entity.entity },
        priorYearIncome: priorYearIncome.trim()
          ? asMoney(priorYearIncome)
          : null,
        analysis,
      }),
    [parsed, priorYearIncome, analysis, stateCode, sides.entity.entity],
  );
  const warnings = useMemo(
    () =>
      validateAll(
        parsed.before,
        parsed.after,
        parsed.entityBefore,
        parsed.entityAfter,
        { otherEntities: parsed.otherEntities, otherStates: parsed.otherStates },
      ),
    [parsed],
  );
  /** The recap's state and entity rows, labelled. */
  const rows = taxRows(computed, stateName);
  const hasEntity =
    !!sides.entity.entity || !!parsed.entityAfter || !!parsed.entityBefore;
  // Which entity return this is, for the labels: what the reader said, the
  // dropped file's own pages, or the numbers (guaranteed payments mean a
  // partnership).
  const entityForm: EntityForm | null =
    sides.entity.entity?.returnForm ??
    picked.find((p) => p.analysis?.kind === "entity")?.analysis?.entityForm ??
    (hasEntity && (parsed.entityAfter?.guaranteedPayments ?? parsed.entityBefore?.guaranteedPayments ?? 0) > 0
      ? "1065"
      : hasEntity
        ? "1120-S"
        : null);
  const formLabel = entityForm ?? "1120-S";
  /** The S corporation's SE tax avoided, inside the before's total (`RecapSide.scorpSeTax`). */
  const scorpSavings = computed.before.scorpSeTax;
  /** What the two returns themselves show, without it. */
  const betweenReturns = computed.savings - scorpSavings;

  const setCell = (
    kind: "before" | "after",
    key: ReturnFieldKey,
    raw: string,
  ) => setNumbers((n) => ({ ...n, [kind]: { ...n[kind], [key]: raw } }));
  const setEntityCell = (
    kind: "before" | "after",
    key: EntityFieldKey,
    raw: string,
  ) => setEntityNumbers((n) => ({ ...n, [kind]: { ...n[kind], [key]: raw } }));

  /**
   * Lines most returns don't have (marketplace coverage, a state's own
   * lines) stay out of the grid while blank on both sides, so a plain
   * return reads as the short list it always was.
   */
  const visibleFields = RETURN_FIELDS.filter(
    (f) =>
      showAllLines ||
      !("optional" in f && f.optional) ||
      numbers.before[f.key].trim() !== "" ||
      numbers.after[f.key].trim() !== "",
  );
  const hiddenCount = RETURN_FIELDS.length - visibleFields.length;
  /**
   * One entity return's rows in the grid: the first one's, and each one's
   * beyond it, the same way — its before as derived, its after as read.
   */
  const entitySection = (o: {
    key?: string;
    title: string;
    raw: Record<"before" | "after", RawEntity>;
    derived: EntityNumbers | null;
    read: EntityExtract | null;
    onChange: (k: "before" | "after", key: EntityFieldKey, v: string) => void;
    label: string;
  }) => {
    const visible = ENTITY_FIELDS.filter(
      (f) => showAllLines || !("optional" in f && f.optional) || o.raw.before[f.key].trim() !== "" || o.raw.after[f.key].trim() !== "",
    );
    return (
      <div key={o.key}>
        <div className="grid grid-cols-2 items-end gap-3 border-b border-t-2 border-edge border-t-white/10 bg-white/[0.02] px-4 py-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <Mono className="col-span-2 font-bold text-magenta sm:col-span-1">{o.title}</Mono>
          <Mono className="text-dusk">Before · computed</Mono>
          <Mono className="text-dusk">After · the return</Mono>
        </div>
        {ENTITY_GROUPS.filter((g) => visible.some((f) => f.group === g.id)).map((g) => (
          <div key={g.id}>
            <div className="border-b border-edge bg-white/[0.02] px-4 py-2">
              <Mono className="font-bold text-mist">{g.title}</Mono>
            </div>
            {visible
              .filter((f) => f.group === g.id)
              .map((f) => (
                <GridRow key={f.key} label={f.label} source={f.source}>
                  {(["before", "after"] as const).map((k) => {
                    const derivedFrom = k === "before" ? o.derived : null;
                    return (
                      <Cell
                        key={k}
                        raw={o.raw[k][f.key]}
                        extracted={
                          derivedFrom
                            ? { value: derivedFrom[f.key], page: null, verified: null }
                            : k === "after"
                              ? (o.read?.fields[f.key] ?? null)
                              : null
                        }
                        derived={!!derivedFrom}
                        onChange={(v) => o.onChange(k, f.key, v)}
                        label={`${f.label} (${o.label}, ${k})`}
                        prefix={f.key === "ownershipPct" || f.key === "ownershipPct2" || f.key === "cityAllocationPct" ? "%" : "$"}
                      />
                    );
                  })}
                </GridRow>
              ))}
          </div>
        ))}
      </div>
    );
  };

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
      entityBefore: parsed.entityBefore,
      entityAfter: parsed.entityAfter,
      otherEntities: parsed.otherEntities,
      otherStates: parsed.otherStates,
      strategies: strategies
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      nextSteps: nextSteps.filter((s) => s.label.trim()),
      extraction: {
        before: sides.before.extract,
        after: sides.after.extract,
        entity: sides.entity.entity,
        city: sides.city.entity,
        otherEntities: moreEntities.flatMap((x) => (x.side.entity ? [x.side.entity] : [])),
      },
      derivedBefore: sides.before.derived,
      analysis,
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
      if (!res.ok || !data.ok || !data.recap)
        throw new Error(data.message ?? "Couldn't save");
      const isNew = !saved;
      setSaved({ id: data.recap.id, token: data.recap.token });
      // the server skips it when the numbers didn't change
      void video.make(data.recap.id);
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

  const anyTooBig =
    picked.some((p) => p.file.size > FILE_MAX) ||
    (!!sides.before.file && sides.before.file.size > FILE_MAX);
  // A print that can't be redacted is never read (pdf-prepare `redactionBlock`).
  const anyUnsendable = picked.some((p) => p.analysis && redactionBlock(p.analysis));
  const canRead =
    picked.length > 0 &&
    picked.every((p) => p.status !== "checking") &&
    !anyTooBig &&
    !anyUnsendable &&
    !reading;
  const deriving = !sides.before.file;
  const refusal =
    stage === "upload" && sides.before.status === "error"
      ? sides.before.problems
      : [];
  // What the reader said about the after return and how much of it was
  // sent: the two things that tell a return with no Schedule C from a
  // Schedule C the model never saw.
  const refusalContext =
    stage === "upload" && sides.before.status === "error"
      ? [
          ...(sides.after.pages
            ? [
                sides.after.sentPages && sides.after.sentPages < sides.after.pages
                  ? `Read ${sides.after.sentPages} of the return's ${sides.after.pages} pages`
                  : `Read all ${sides.after.pages} pages of the return`,
              ]
            : []),
          ...sides.after.warnings.map((w) => `After return: ${w}`),
          ...sides.entity.warnings.map((w) => `${formLabel}: ${w}`),
          ...moreEntities.flatMap((x, i) => x.side.warnings.map((w) => `${x.name ?? `Entity return ${i + 2}`}: ${w}`)),
          ...sides.city.warnings.map((w) => `City return: ${w}`),
        ]
      : [];
  /**
   * Schedule 1 Part II against Form 1040 line 10, on the after column as it
   * stands — when the before was derived (a before print isn't figured from
   * these lines). What no line accounts for stays on the before and can't
   * show as savings, so staff say which line it's on, or that it stays.
   * Saving waits for the answer; a changed amount asks again.
   */
  const [keptUnplaced, setKeptUnplaced] = useState<number | null>(null);
  const afterNow = toNumbers(numbers.after);
  const unplaced = sides.before.derived ? unplacedAdjustments(afterNow) : null;
  const askAdjustments = unplaced !== null && Math.abs(unplaced) > ADJUSTMENTS_TOLERANCE && keptUnplaced !== unplaced;
  const lineTen = (afterNow.totalIncome ?? 0) - (afterNow.agi ?? 0);
  const placeOn = (key: ReturnFieldKey) => {
    if (unplaced === null) return;
    const next = { ...numbers.after, [key]: String((afterNow[key] ?? 0) + unplaced) };
    setNumbers((n) => ({ ...n, after: next }));
    rederive(next);
  };

  const canSave =
    clientName.trim().length > 0 && /^\d{4}$/.test(taxYear.trim()) && !saving && !askAdjustments;

  /* ─────────────────────────────── done ───────────────────────────────── */

  if (stage === "done" && saved) {
    return (
      <Panel title="Saved">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <Mono className="text-teal">Ready to send</Mono>
            <h2 className="mt-1.5 font-display text-[24px] font-semibold leading-tight text-fog">
              {clientName}
              <span className="ml-2 font-mono text-[14px] font-normal text-dusk">
                {taxYear}
              </span>
            </h2>
            <p className="mt-1.5 text-[13.5px] text-muted">
              {money(computed.savings)} saved,{" "}
              {money(computed.before.totalTaxes)} down to{" "}
              {money(computed.after.totalTaxes)}
              {scorpSavings > 0
                ? ` (the before includes ${money(scorpSavings)} of self-employment tax the S corporation avoided)`
                : ""}
              .
            </p>
          </div>
          <div className="font-display text-[34px] font-bold leading-none tabular-nums text-teal">
            {money(computed.savings)}
          </div>
        </div>

        <div className="mt-5 rounded-[16px] border border-teal/40 bg-teal/[0.06] px-4 py-3.5">
          <Mono className="text-teal">Send the client</Mono>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-fog">
              {link ?? "…"}
            </code>
            <button type="button" onClick={copyLink} className={btnGhost}>
              {copied ? "Copied" : "Copy link"}
            </button>
            <Link
              href={`/recap/${saved.token}`}
              target="_blank"
              className={btnGhost}
            >
              Open
            </Link>
            <a
              href={`/api/portal/tax-recap/${saved.id}/pdf`}
              className={btnPrimary}
            >
              Download PDF
            </a>
          </div>
          <Note className="!mt-2">
            Email the PDF and the link together. Anyone with the link can see
            the recap; revoke it from the list below if it goes to the wrong
            person.
          </Note>
          <div className="mt-3 border-t border-teal/20 pt-3">
            <VideoStatus state={video.state} token={saved.token} onMake={() => void video.make(saved.id)} />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-edge pt-5">
          <button type="button" onClick={startOver} className={btnPrimary}>
            Start another recap
          </button>
          <button
            type="button"
            onClick={() => setStage("review")}
            className={btnGhost}
          >
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
        title={hasEntity ? "1 · The returns" : "1 · The return"}
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
            {fromFailure && failureLoad !== "loaded" ? (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[14px] border border-teal/30 bg-teal/[0.05] px-4 py-3 text-[13px] text-mist">
                <span>
                  From the refused return <span className="text-fog">{fromFailure.label}</span>:{" "}
                  {fromFailure.files.map((f) => f.name).join(", ")}
                </span>
                <button
                  type="button"
                  disabled={failureLoad === "loading"}
                  onClick={loadFailureFiles}
                  className={btnGhost}
                >
                  {failureLoad === "loading"
                    ? "Loading…"
                    : `Load ${fromFailure.files.length === 1 ? "the file" : `the ${fromFailure.files.length} files`}`}
                </button>
                {failureLoad === "failed" ? <span className="text-danger">Couldn&rsquo;t load them — try again</span> : null}
              </div>
            ) : null}
            <div
              className={`grid gap-4 ${showBefore ? "md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" : ""}`}
            >
              <HeroDrop
                picked={picked}
                sides={sides}
                more={moreEntities.map((x) => x.side)}
                reading={reading}
                disabled={reading}
                error={pickError}
                onAdd={addFiles}
                onRemove={removePicked}
                onKind={setPickedKind}
                action={
                  <>
                    <button
                      type="button"
                      onClick={readReturns}
                      disabled={!canRead}
                      className={btnBig}
                    >
                      {deriving || sides.after.status !== "done"
                        ? "Create tax recap"
                        : "Read the before print"}
                    </button>
                    <span className="max-w-md text-[12px] leading-snug text-dusk">
                      {deriving
                        ? "The return is read by Claude — the 1120-S or 1065 too, for an S corporation or a partnership — the before column is computed from it with every write-off at zero, the savings are split by strategy, and you check every number before anything is saved."
                        : "The before print is read by Claude instead of computing the before column. Nothing is stored until you save."}
                    </span>
                  </>
                }
              />
              {showBefore ? (
                <DropZone
                  kind="before"
                  title="Before print"
                  hint="The 1040 with income only — no write-offs, no strategies"
                  side={sides.before}
                  disabled={reading}
                  onPick={pickBefore}
                />
              ) : null}
            </div>
            {refusal.length ? (
              <div className="mt-4 rounded-[16px] border border-ember/40 bg-ember/[0.06] px-4 py-3.5">
                <Mono className="text-ember">
                  The before column can&rsquo;t be computed from this return
                </Mono>
                <ul className="mt-2 space-y-1 text-[12.5px] leading-snug text-mist">
                  {refusal.map((p, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="flex-none text-ember">·</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
                {refusalContext.length ? (
                  <ul className="mt-2 space-y-1 text-[12px] leading-snug text-dusk">
                    {refusalContext.map((w, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="flex-none">·</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={continueTyping}
                    className={btnGhost}
                  >
                    Type the before column
                  </button>
                  {!showBefore ? (
                    <button
                      type="button"
                      onClick={() => setShowBefore(true)}
                      className={btnGhost}
                    >
                      Add a before print instead
                    </button>
                  ) : null}
                  {failure ? <KeepLine failure={failure} onKeep={keepReturns} hasEntity={!!sides.entity.entity} /> : null}
                  <span className="text-[12px] text-dusk">
                    A state or year that&rsquo;s missing is added on the{" "}
                    <Link
                      href="/portal/tax-recap/tables"
                      className="text-mist underline-offset-2 hover:underline"
                    >
                      Tax Tables
                    </Link>{" "}
                    page.
                  </span>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {(["after", "entity", "city", "before"] as Kind[]).map((k) => {
                const s = sides[k];
                if (k === "city") {
                  const ex = s.entity;
                  if (!ex) return null;
                  const n = CITY_FIELD_KEYS.filter((key) => ex.fields[key].value !== null).length;
                  const unverified = CITY_FIELD_KEYS.filter((key) => ex.fields[key].verified === false).length;
                  return (
                    <Chip key={k} tone={unverified ? "warn" : "pos"}>
                      {ex.stateForm ?? "City return"} read: {n} lines
                      {s.pages ? ` from ${s.pages} pages` : ""}
                      {unverified ? `, ${unverified} to check` : ""}
                    </Chip>
                  );
                }
                if (k === "before" && s.derived) {
                  // Engine v11 on: the after return either reproduced from
                  // the tables outright, or some household lines were
                  // carried across as fixed amounts (named in the notes).
                  const proof = s.derived.proof;
                  const carried = proof && !proof.verified ? proof.residuals.length : 0;
                  return (
                    <Chip key={k} tone={carried ? "warn" : "pos"}>
                      Before column: computed
                      {moreEntities.length ? ` from all ${moreEntities.length + 2} returns` : hasEntity ? " from both returns" : " from it"},{" "}
                      {carried
                        ? `projected — ${carried} line${carried === 1 ? "" : "s"} carried`
                        : "verified to the dollar"}
                    </Chip>
                  );
                }
                if (k === "entity") {
                  const ex = s.entity;
                  if (!ex) return null;
                  const n = ENTITY_FIELD_KEYS.filter(
                    (key) => ex.fields[key].value !== null,
                  ).length;
                  const unverified = ENTITY_FIELD_KEYS.filter(
                    (key) => ex.fields[key].verified === false,
                  ).length;
                  return (
                    <Chip key={k} tone={unverified ? "warn" : "pos"}>
                      {formLabel} read: {n} lines
                      {s.pages
                        ? s.sentPages && s.sentPages < s.pages
                          ? ` from ${s.sentPages} of ${s.pages} pages`
                          : ` from ${s.pages} pages`
                        : ""}
                      {unverified ? `, ${unverified} to check` : ""}
                    </Chip>
                  );
                }
                const ex = s.extract;
                if (!ex) return null;
                const n = RETURN_FIELD_KEYS.filter(
                  (key) => ex.fields[key].value !== null,
                ).length;
                const unverified = RETURN_FIELD_KEYS.filter(
                  (key) => ex.fields[key].verified === false,
                ).length;
                return (
                  <Chip key={k} tone={unverified ? "warn" : "pos"}>
                    {k === "after"
                      ? hasEntity
                        ? "1040 read"
                        : "Return read"
                      : "Before print read"}
                    : {n} lines
                    {s.pages
                      ? s.sentPages && s.sentPages < s.pages
                        ? ` from ${s.sentPages} of ${s.pages} pages`
                        : ` from ${s.pages} pages`
                      : ""}
                    {unverified ? `, ${unverified} to check` : ""}
                  </Chip>
                );
              })}
              {moreEntities.map((x, i) => {
                const ex = x.side.entity;
                if (!ex) return null;
                const n = ENTITY_FIELD_KEYS.filter((key) => ex.fields[key].value !== null).length;
                const unverified = ENTITY_FIELD_KEYS.filter((key) => ex.fields[key].verified === false).length;
                return (
                  <Chip key={`m${i}`} tone={unverified ? "warn" : "pos"}>
                    {x.name ?? `Entity return ${i + 2}`} ({x.form ?? "1120-S / 1065"}) read: {n} lines
                    {unverified ? `, ${unverified} to check` : ""}
                  </Chip>
                );
              })}
              {moreStates.length ? (
                <Chip tone="pos">
                  {moreStates.length + 1} state returns: {[stateCode || "?", ...moreStates.map((s) => s.stateCode)].join(", ")}
                </Chip>
              ) : null}
              {sides.after.extract && !sides.before.extract ? (
                // Derived, or refused and being typed: either way the after
                // column is the source, and a corrected cell (or a W-2 line
                // the engine asked for) should flow through.
                <button
                  type="button"
                  onClick={() => rederive()}
                  className="cursor-pointer font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted hover:text-fog"
                >
                  Recompute the before column
                </button>
              ) : null}
            </div>
            {rederiveError ? (
              <ul className="mt-3 space-y-1 text-[12.5px] text-mist">
                <li className="text-danger">
                  The before column can&rsquo;t be computed from the
                  return&rsquo;s numbers as they stand:
                </li>
                {rederiveError.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-ember">·</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </Panel>

      {stage === "review" ? (
        <>
          {/* ─────────────────────── 2 · client ─────────────────────── */}
          <Panel title="2 · Client">
            <div className="grid gap-4 sm:grid-cols-[1.6fr_0.7fr_0.6fr_1fr]">
              <Field
                label="Client name"
                hint="Read from the return — as it should appear on the recap"
              >
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
                  onChange={(e) =>
                    setTaxYear(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  className="!py-2.5 !text-[14px] font-mono tabular-nums"
                />
              </Field>
              <Field label="State" hint="Blank if no state return">
                <TextInput
                  value={stateCode}
                  onChange={(e) =>
                    setStateCode(
                      e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z]/g, "")
                        .slice(0, 2),
                    )
                  }
                  placeholder="—"
                  className="!py-2.5 !text-[14px] font-mono uppercase"
                />
              </Field>
              <Field
                label="Prior-year income"
                hint="Optional. Last year's income from every source (business receipts, W-2s, interest, gains), the way this year's is figured — not in these PDFs"
              >
                <NumInput
                  value={priorYearIncome}
                  onChange={setPriorYearIncome}
                  prefix="$"
                />
              </Field>
            </div>
          </Panel>

          {/* ─────────────────────── 3 · check the numbers ─────────────────────── */}
          <Panel title="3 · Check the numbers" bodyClassName="!px-0 !py-0">
            <p className="border-b border-edge px-4 py-3 text-[12.5px] leading-relaxed text-muted">
              <span className="text-fog">After</span> is the return as filed,
              each line read from the page shown.{" "}
              <span className="text-fog">Before</span> is computed from it with
              the write-offs at zero
              {hasEntity
                ? entityForm === "1065"
                  ? " — every deduction on the 1065, the partners' guaranteed payments included"
                  : " — every deduction on the 1120-S, the owner's pay and the PTE election included"
                : ""}
              . Fix anything that&rsquo;s wrong and the recap below updates.
            </p>
            {sides.after.extract && !sides.before.extract && !sides.before.derived ? (
              // The engine refused and staff chose to type: the before is
              // empty until the after column answers what it asked.
              <div className="flex flex-wrap items-center gap-3 border-b border-ember/30 bg-ember/[0.06] px-4 py-3">
                <span className="text-[12.5px] leading-snug text-mist">
                  The before column is empty: the engine refused (the reasons are under &ldquo;Things to look at&rdquo;). Every line is shown — type what it asked for in the{" "}
                  <span className="text-fog">after</span> column, then recompute. Or type the before column by hand.
                </span>
                <button type="button" onClick={() => rederive()} className={btnGhost}>
                  Recompute the before column
                </button>
                {rederiveError ? (
                  <ul className="w-full space-y-1 text-[12.5px] text-mist">
                    {rederiveError.map((r, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="flex-none text-ember">·</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {askAdjustments && unplaced !== null ? (
              <div className="border-b border-ember/30 bg-ember/[0.06] px-4 py-3">
                <p className="text-[13px] leading-snug text-mist">
                  {unplaced > 0 ? (
                    <>
                      <span className="font-semibold text-fog">
                        {`Schedule 1 has ${money(unplaced)} the reader didn’t place on a line.`}
                      </span>{" "}
                      Its adjustments come to {money(lineTen)} (Form 1040 line 10); the lines read add up to {money(lineTen - unplaced)}. Until
                      it&rsquo;s placed the before keeps it, so it can&rsquo;t show as savings. Which line is it on?
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-fog">
                        {`The Schedule 1 lines read add up to ${money(-unplaced)} more than Form 1040 line 10 (${money(lineTen)}).`}
                      </span>{" "}
                      One of them is misread: check them against the page, fix the cell, and recompute the before column.
                    </>
                  )}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {unplaced > 0
                    ? PLACE_ON.map((p) => (
                        <button key={p.key} type="button" onClick={() => placeOn(p.key)} className={`${btnGhost} !px-4 !py-1.5 !text-[13px]`}>
                          {p.label}
                        </button>
                      ))
                    : null}
                  <button type="button" onClick={() => setKeptUnplaced(unplaced)} className={`${btnGhost} !px-4 !py-1.5 !text-[13px]`}>
                    {unplaced > 0 ? "Something else · keep it on the before" : "They're right as read"}
                  </button>
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-2 items-end gap-3 border-b border-edge px-4 py-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <Mono className="hidden text-dusk sm:block">
                {hasEntity ? "Form 1040 line" : "Line"}
              </Mono>
              <Mono className="text-dusk">Before · computed</Mono>
              <Mono className="text-dusk">After · the return</Mono>
            </div>
            {GROUPS.filter((g) =>
              visibleFields.some((f) => f.group === g.id),
            ).map((g) => (
              <div key={g.id}>
                <div className="border-b border-edge bg-white/[0.02] px-4 py-2">
                  <Mono className="font-bold text-mist">{g.title}</Mono>
                </div>
                {visibleFields
                  .filter((f) => f.group === g.id)
                  .map((f) => (
                    <GridRow key={f.key} label={f.label} source={f.source}>
                      {(["before", "after"] as const).map((k) => {
                        const derivedFrom =
                          k === "before" ? sides.before.derivedNumbers : null;
                        return (
                          <Cell
                            key={k}
                            raw={numbers[k][f.key]}
                            extracted={
                              derivedFrom
                                ? {
                                    value: derivedFrom[f.key],
                                    page: null,
                                    verified: null,
                                  }
                                : (sides[k].extract?.fields[f.key] ?? null)
                            }
                            derived={!!derivedFrom}
                            onChange={(v) => setCell(k, f.key, v)}
                            label={`${f.label} (${k})`}
                          />
                        );
                      })}
                    </GridRow>
                  ))}
              </div>
            ))}

            {moreStates.map((s, i) => (
              <div key={`state-${s.stateCode}`}>
                <div className="grid grid-cols-2 items-end gap-3 border-b border-t-2 border-edge border-t-white/10 bg-white/[0.02] px-4 py-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <Mono className="col-span-2 font-bold text-magenta sm:col-span-1">
                    {stateName(s.stateCode)} · {s.stateForm ?? "state return"}
                  </Mono>
                  <Mono className="text-dusk">Before · computed</Mono>
                  <Mono className="text-dusk">After · the return</Mono>
                </div>
                {OTHER_STATE_FIELDS.filter(
                  (f) => showAllLines || !("optional" in f && f.optional) || s.numbers.before[f.key as OtherStateFieldKey].trim() !== "" || s.numbers.after[f.key as OtherStateFieldKey].trim() !== "",
                ).map((f) => {
                  const key = f.key as OtherStateFieldKey;
                  const read = sides.after.extract?.otherStates?.find((x) => x.stateCode === s.stateCode)?.fields[key] ?? null;
                  return (
                    <GridRow key={key} label={f.label} source={`The ${stateName(s.stateCode)} return's own line`}>
                      {(["before", "after"] as const).map((k) => (
                        <Cell
                          key={k}
                          raw={s.numbers[k][key]}
                          extracted={k === "before" && s.derived ? { value: s.derived[key], page: null, verified: null } : k === "after" ? read : null}
                          derived={k === "before" && !!s.derived}
                          onChange={(v) =>
                            setMoreStates((m) => m.map((x, j) => (j === i ? { ...x, numbers: { ...x.numbers, [k]: { ...x.numbers[k], [key]: v } } } : x)))
                          }
                          label={`${f.label} (${s.stateCode}, ${k})`}
                        />
                      ))}
                    </GridRow>
                  );
                })}
              </div>
            ))}

            {hasEntity
              ? entitySection({
                  title: `${entityForm === "1065" ? "Partnership · Form 1065" : "S corporation · Form 1120-S"}${moreEntities.length && sides.entity.entity?.entityName ? ` · ${sides.entity.entity.entityName}` : ""}`,
                  raw: entityNumbers,
                  derived: entityDerived,
                  read: sides.entity.entity,
                  onChange: setEntityCell,
                  label: formLabel,
                })
              : null}
            {moreEntities.map((x, i) =>
              entitySection({
                key: `entity-${i}`,
                title: `${x.form === "1065" ? "Partnership · Form 1065" : "S corporation · Form 1120-S"}${x.name ? ` · ${x.name}` : ` · entity return ${i + 2}`}`,
                raw: x.numbers,
                derived: x.derived,
                read: x.side.entity,
                onChange: (k, key, v) =>
                  setMoreEntities((m) => m.map((y, j) => (j === i ? { ...y, numbers: { ...y.numbers, [k]: { ...y.numbers[k], [key]: v } } } : y))),
                label: x.name ?? `entity return ${i + 2}`,
              }),
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge px-4 py-3">
              <Legend />
              {hiddenCount > 0 || showAllLines ? (
                <button
                  type="button"
                  onClick={() => setShowAllLines((v) => !v)}
                  className="cursor-pointer font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted hover:text-fog"
                >
                  {showAllLines
                    ? "Hide blank lines"
                    : `Show ${hiddenCount} blank lines`}
                </button>
              ) : null}
            </div>
          </Panel>

          {warnings.length ||
          sides.before.warnings.length ||
          sides.after.warnings.length ||
          sides.entity.warnings.length ||
          moreEntities.some((x) => x.side.warnings.length) ||
          sides.before.derived ||
          analysis?.notes.length ? (
            <Panel title="Things to look at">
              <ul className="space-y-1.5 text-[13px] text-mist">
                {sides.before.derived?.notes.map((w, i) => (
                  <li key={`d${i}`} className="flex gap-2">
                    <Mono className="mt-0.5 flex-none text-teal">derived</Mono>
                    <span>{w}</span>
                  </li>
                ))}
                {analysis?.notes.map((w, i) => (
                  <li key={`n${i}`} className="flex gap-2">
                    <Mono className="mt-0.5 flex-none text-teal">split</Mono>
                    <span>{w}</span>
                  </li>
                ))}
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
                {sides.entity.warnings.map((w, i) => (
                  <li key={`e${i}`} className="flex gap-2">
                    <Mono className="mt-0.5 flex-none text-ember">{formLabel}</Mono>
                    <span>{w}</span>
                  </li>
                ))}
                {moreEntities.flatMap((x, j) =>
                  x.side.warnings.map((w, i) => (
                    <li key={`m${j}-${i}`} className="flex gap-2">
                      <Mono className="mt-0.5 flex-none text-ember">{x.name ?? x.form ?? `entity ${j + 2}`}</Mono>
                      <span>{w}</span>
                    </li>
                  )),
                )}
                {sides.city.warnings.map((w, i) => (
                  <li key={`c${i}`} className="flex gap-2">
                    <Mono className="mt-0.5 flex-none text-ember">{sides.city.entity?.stateForm ?? "city"}</Mono>
                    <span>{w}</span>
                  </li>
                ))}
                {warnings.map((w, i) => (
                  <li key={`v${i}`} className="flex gap-2">
                    <Mono className="mt-0.5 flex-none text-ember">
                      {w.side === "entity" ? formLabel : w.side}
                    </Mono>
                    <span>{w.message}</span>
                  </li>
                ))}
              </ul>
              <Note>
                None of these block saving. The checks are the arithmetic
                identities the forms have to satisfy, so a failure usually means
                one line was misread.
              </Note>
            </Panel>
          ) : null}

          {/* ─────────────────────── 4 · the recap ─────────────────────── */}
          <Panel title="4 · The recap">
            <KpiRow cols={3}>
              <Kpi
                label="Before DeCypher"
                value={money(computed.before.totalTaxes)}
                tone="neg"
              />
              <Kpi
                label="After DeCypher"
                value={money(computed.after.totalTaxes)}
              />
              <Kpi
                label="Total tax savings"
                value={money(computed.savings)}
                tone={computed.savings >= 0 ? "pos" : "neg"}
              />
            </KpiRow>
            {computed.breakdown.kids > 0 ? (
              <Note className="!mt-2">
                Before DeCypher doesn&rsquo;t claim the{" "}
                {analysis?.kids?.dependents === 1
                  ? "dependent"
                  : "dependents"}
                : {money(computed.breakdown.kids)} more than the before column
                below, which claims them the way the CPA&rsquo;s print does.
                They come back as the first line of the strategy split.
              </Note>
            ) : null}
            {scorpSavings > 0 ? (
              <Note className="!mt-2">
                Before DeCypher includes {money(scorpSavings)} of self-employment
                tax the S corporation avoided (estimated): what the K-1 income
                would carry on a Schedule C. Between the two returns
                themselves: {money(betweenReturns)}.
              </Note>
            ) : null}

            <div className="mt-5 grid gap-6 md:grid-cols-2">
              <div>
                <Mono className="text-dusk">Savings breakdown (exact)</Mono>
                <div className="mt-1">
                  {computed.breakdown.kids > 0 ? (
                    <LineRow
                      label="Dependents claimed (not on the before)"
                      value={money(computed.breakdown.kids)}
                      size="sm"
                    />
                  ) : null}
                  <LineRow
                    label="Deductions found"
                    value={money(computed.breakdown.deductionsFound)}
                    size="sm"
                  />
                  {computed.entityKind === "scorp" ? (
                    <LineRow
                      label={computed.cityTax ? "S-corp state & city tax saved" : "S-corp state tax & PTET saved"}
                      value={money(computed.breakdown.entitySaved)}
                      size="sm"
                    />
                  ) : (
                    <LineRow
                      label="Self-employment tax saved"
                      value={money(computed.breakdown.seTaxSaved)}
                      size="sm"
                    />
                  )}
                  {computed.breakdown.scorpSeTax > 0 ? (
                    <LineRow
                      label="S-corp: self-employment tax avoided (in the before)"
                      value={money(computed.breakdown.scorpSeTax)}
                      size="sm"
                    />
                  ) : null}
                  <LineRow
                    label="Federal income tax saved"
                    value={money(computed.breakdown.incomeTaxSaved)}
                    size="sm"
                  />
                  <LineRow
                    label={moreStates.length ? "State tax saved (every state)" : "State tax saved"}
                    value={money(computed.breakdown.stateSaved)}
                    size="sm"
                  />
                  {moreStates.length
                    ? rows.states.map((r) => (
                        <LineRow
                          key={r.index}
                          label={`  ${r.label}: ${money(computed.before.stateRows[r.index])} → ${money(computed.after.stateRows[r.index])}`}
                          value={money(computed.before.stateRows[r.index] - computed.after.stateRows[r.index])}
                          size="sm"
                        />
                      ))
                    : null}
                  <LineRow
                    label="Penalties avoided"
                    value={money(computed.breakdown.penaltiesSaved)}
                    size="sm"
                  />
                  <LineRow
                    label="Total"
                    value={money(computed.savings)}
                    size="sm"
                    total
                    tone="pos"
                  />
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
                  {[computed.filing.state, ...computed.filing.otherStates].map((line, i) => (
                    <LineRow
                      key={`s${i}`}
                      label={`${moreStates.length ? stateName(computed.states[i]?.code ?? null) : "State"}: ${money(line.owed)} owed − ${money(line.paid)} paid`}
                      value={dueLabel(line.due)}
                      size="sm"
                      tone={line.due > 0 ? "neg" : "pos"}
                    />
                  ))}
                  {[computed.filing.entity, ...computed.filing.otherEntities].map((line, i) =>
                    line ? (
                      <LineRow
                        key={`e${i}`}
                        label={`${rows.entities[i]?.filingLabel ?? "Entity"}: ${money(line.owed)} owed − ${money(line.paid)} paid`}
                        value={dueLabel(line.due)}
                        size="sm"
                        tone={line.due > 0 ? "neg" : "pos"}
                      />
                    ) : null,
                  )}
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

            {analysis?.attribution.length ? (
              <div className="mt-6">
                <Mono className="text-dusk">
                  Savings by strategy (in this order; adds up to the total)
                </Mono>
                <div className="mt-1">
                  {analysis.attribution.map((a, i) => (
                    <StrategyRow
                      key={i}
                      label={a.label}
                      note={a.note}
                      value={a.savings}
                    />
                  ))}
                  {analysis.scorpSavings && scorpSavings > 0 ? (
                    <>
                      <LineRow
                        label="Between the two returns"
                        value={money(betweenReturns)}
                        size="sm"
                        total
                      />
                      <StrategyRow
                        label="S corporation: self-employment tax avoided"
                        note={analysis.scorpSavings.note}
                        value={scorpSavings}
                      />
                    </>
                  ) : null}
                  <LineRow
                    label="Total tax savings"
                    value={money(computed.savings)}
                    size="sm"
                    total
                    tone="pos"
                  />
                </div>
                <Note className="!mt-2">
                  Computed by switching each strategy on in turn and re-running
                  the whole return. Edit a number above and press
                  &ldquo;Recompute the before column&rdquo; to refresh the
                  split.
                </Note>
              </div>
            ) : null}

            {analysis?.kids ? (
              <div className="mt-6">
                <Mono className="text-dusk">What the dependents are worth</Mono>
                <div className="mt-1">
                  <StrategyRow
                    label={`Before: ${analysis.kids.dependents === 1 ? "1 dependent" : `${analysis.kids.dependents} dependents`} at the before's income`}
                    note={analysis.kids.inBefore?.note ?? ""}
                    value={analysis.kids.before}
                  />
                  <StrategyRow
                    label="After: the same dependents on the return as filed"
                    note={analysis.kids.note}
                    value={analysis.kids.after}
                  />
                </div>
                <Note className="!mt-2">
                  Each side re-run without the dependents, everything else as
                  filed: no child tax credit, no child-care credit, single
                  instead of head of household.{" "}
                  {analysis.kids.inBefore
                    ? "The client’s before doesn’t claim them, so the before figure is the first line of the strategy split and part of the savings."
                    : Number(analysis.version) >= 8
                      ? "They’re worth nothing at the before’s income, so the before is unchanged and the client’s recap shows them beside the savings."
                      : "Saved before the before stopped claiming them: they sit beside the savings, not in them. Recompute the before column to bring this recap up to date."}
                </Note>
              </div>
            ) : null}

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
                <span className="-mt-0.5 mb-2 block text-[11.5px] text-dusk">
                  Survey links open our own feedback survey with the
                  client&rsquo;s name and tax year filled in.
                </span>
                <div className="space-y-2">
                  {nextSteps.map((s, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                        <input
                          value={s.label}
                          onChange={(e) =>
                            setNextSteps((all) =>
                              all.map((x, j) =>
                                j === i ? { ...x, label: e.target.value } : x,
                              ),
                            )
                          }
                          placeholder="Step"
                          className={smallInput}
                        />
                        <input
                          value={s.href ?? ""}
                          onChange={(e) =>
                            setNextSteps((all) =>
                              all.map((x, j) =>
                                j === i
                                  ? { ...x, href: e.target.value || null }
                                  : x,
                              ),
                            )
                          }
                          placeholder={
                            s.options?.length
                              ? "(links are on the choices)"
                              : "https:// (optional)"
                          }
                          disabled={!!s.options?.length}
                          className={`${smallInput} font-mono disabled:opacity-40`}
                        />
                        <button
                          type="button"
                          aria-label="Remove step"
                          onClick={() =>
                            setNextSteps((all) => all.filter((_, j) => j !== i))
                          }
                          className="cursor-pointer rounded-[10px] border border-edge-mid px-2.5 text-[14px] text-dusk hover:text-danger"
                        >
                          ×
                        </button>
                      </div>
                      {/* Choices under a step: the survey has one form per plan. */}
                      {(s.options ?? []).map((o, k) => (
                        <div
                          key={k}
                          className="ml-5 grid grid-cols-[1fr_1.4fr_auto] gap-2"
                        >
                          <input
                            value={o.label}
                            onChange={(e) =>
                              setNextSteps((all) =>
                                all.map((x, j) =>
                                  j === i
                                    ? {
                                        ...x,
                                        options: (x.options ?? []).map(
                                          (y, m) =>
                                            m === k
                                              ? { ...y, label: e.target.value }
                                              : y,
                                        ),
                                      }
                                    : x,
                                ),
                              )
                            }
                            placeholder="Choice"
                            className={smallInput}
                          />
                          <input
                            value={o.href}
                            onChange={(e) =>
                              setNextSteps((all) =>
                                all.map((x, j) =>
                                  j === i
                                    ? {
                                        ...x,
                                        options: (x.options ?? []).map(
                                          (y, m) =>
                                            m === k
                                              ? { ...y, href: e.target.value }
                                              : y,
                                        ),
                                      }
                                    : x,
                                ),
                              )
                            }
                            placeholder="https://"
                            className={`${smallInput} font-mono`}
                          />
                          <button
                            type="button"
                            aria-label="Remove choice"
                            onClick={() =>
                              setNextSteps((all) =>
                                all.map((x, j) => {
                                  if (j !== i) return x;
                                  const options = (x.options ?? []).filter(
                                    (_, m) => m !== k,
                                  );
                                  return options.length
                                    ? { ...x, options }
                                    : { label: x.label, href: x.href };
                                }),
                              )
                            }
                            className="cursor-pointer rounded-[10px] border border-edge-mid px-2.5 text-[14px] text-dusk hover:text-danger"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {(s.options?.length ?? 0) < 4 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setNextSteps((all) =>
                              all.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      href: null,
                                      options: [
                                        ...(x.options ?? []),
                                        { label: "", href: "" },
                                      ],
                                    }
                                  : x,
                              ),
                            )
                          }
                          className="ml-5 cursor-pointer font-mono text-[10px] uppercase tracking-[1.2px] text-dusk hover:text-fog"
                        >
                          + Add a choice
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {nextSteps.length < 8 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setNextSteps((all) => [
                          ...all,
                          { label: "", href: null },
                        ])
                      }
                      className="cursor-pointer font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted hover:text-fog"
                    >
                      + Add a step
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-edge pt-5">
              <button
                type="button"
                onClick={save}
                disabled={!canSave}
                className={btnPrimary}
              >
                {saving
                  ? "Saving…"
                  : saved
                    ? "Save changes"
                    : "Save & create link"}
              </button>
              {saved ? (
                <button
                  type="button"
                  onClick={() => setStage("done")}
                  className={btnGhost}
                >
                  Done
                </button>
              ) : null}
              {flash ? (
                <span className="text-[13px] font-semibold text-teal">
                  Saved
                </span>
              ) : null}
              {saveError ? (
                <span className="text-[13px] text-danger">{saveError}</span>
              ) : null}
              {!canSave && !saving ? (
                <span className="text-[12px] text-dusk">
                  {askAdjustments
                    ? "Answer the Schedule 1 question at the top of “Check the numbers” first."
                    : "Needs a client name and a four-digit year."}
                </span>
              ) : null}
            </div>
            {saved ? (
              <div className="mt-3">
                <VideoStatus state={video.state} token={saved.token} onMake={() => void video.make(saved.id)} />
              </div>
            ) : null}

            {saved && link ? (
              <div className="mt-4 rounded-[16px] border border-teal/40 bg-teal/[0.06] px-4 py-3.5">
                <Mono className="text-teal">Send the client</Mono>
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-fog">
                    {link}
                  </code>
                  <button type="button" onClick={copyLink} className={btnGhost}>
                    {copied ? "Copied" : "Copy link"}
                  </button>
                  <Link
                    href={`/recap/${saved.token}`}
                    target="_blank"
                    className={btnGhost}
                  >
                    Open
                  </Link>
                  <a
                    href={`/api/portal/tax-recap/${saved.id}/pdf`}
                    className={btnGhost}
                  >
                    Download PDF
                  </a>
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

/** One step of the strategy split: what it was, what it did, what it saved. */
function StrategyRow({
  label,
  note,
  value,
}: {
  label: string;
  note: string;
  value: number;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-edge py-2 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[13px] text-fog">{label}</div>
        {note ? (
          <div className="mt-0.5 text-[11.5px] leading-snug text-dusk">
            {note}
          </div>
        ) : null}
      </div>
      <span
        className={`flex-none font-mono text-[13px] tabular-nums ${value >= 0 ? "text-teal" : "text-danger"}`}
      >
        {value < 0 ? "−" : ""}
        {money(Math.abs(value))}
      </span>
    </div>
  );
}

/** One line of the review grid: the label and source, then the two cells. */
function GridRow({
  label,
  source,
  children,
}: {
  label: string;
  source: string;
  children: React.ReactNode;
}) {
  return (
    <div
      // Phones: label across the top, the two inputs beneath it.
      // Three columns at 390px squeeze "$123,038" into "$123,0".
      className="grid grid-cols-2 items-start gap-x-3 gap-y-1.5 border-b border-edge px-4 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3"
    >
      <div className="col-span-2 min-w-0 sm:col-span-1 sm:pt-1.5">
        <div className="text-[13px] text-fog">{label}</div>
        <div className="mt-0.5 truncate text-[11px] text-dusk" title={source}>
          {source}
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * The one place the returns go: a big target that takes a drop or a click
 * anywhere on it, then lists the chosen files with what each one is and the
 * button that reads them, then — while Claude reads them — turns into the
 * progress card. One thing on screen at a time.
 */
function HeroDrop({
  picked,
  sides,
  more,
  reading,
  disabled,
  error,
  onAdd,
  onRemove,
  onKind,
  action,
}: {
  picked: Picked[];
  sides: Record<Kind, SideState>;
  /** The entity returns beyond the first, each read on its own. */
  more: SideState[];
  reading: boolean;
  disabled: boolean;
  error: string | null;
  onAdd: (files: FileList | File[]) => void;
  onRemove: (id: string) => void;
  /** Staff saying what an unrecognised file is. */
  onKind: (id: string, kind: ReturnKind) => void;
  /** The create button, shown under the file list once there's something to read. */
  action: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const anyError =
    sides.after.status === "error" ||
    sides.entity.status === "error" ||
    sides.city.status === "error" ||
    more.some((s) => s.status === "error") ||
    !!error;
  const allDone = picked.length > 0 && sides.after.status === "done";
  const tone = anyError
    ? "border-danger/60"
    : allDone
      ? "border-teal/50"
      : reading
        ? "border-magenta/40"
        : picked.length
          ? "border-magenta/50"
          : over
            ? "border-mist bg-white/[0.04]"
            : "border-dashed border-edge-bright hover:border-mist hover:bg-white/[0.03]";

  const open = () => {
    if (!disabled) inputRef.current?.click();
  };
  const empty = !picked.length && !reading;
  const busy = [sides.after, sides.entity, sides.city, ...more].filter(
    (s) => s.status === "reading",
  );
  const preview =
    sides.after.redaction?.preview ?? sides.entity.redaction?.preview ?? null;
  const hasEntity = picked.some((p) => p.analysis?.kind === "entity");
  const hasIndividual = picked.some((p) => p.analysis?.kind === "individual");

  return (
    <div
      role={empty ? "button" : undefined}
      tabIndex={empty ? 0 : undefined}
      onClick={empty ? open : undefined}
      onKeyDown={(e) => {
        if (empty && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          open();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled && e.dataTransfer.files?.length)
          onAdd(e.dataTransfer.files);
      }}
      className={`relative overflow-hidden rounded-[20px] border bg-white/[0.02] px-6 py-10 text-center transition-colors sm:py-12 ${tone} ${
        empty ? "cursor-pointer" : ""
      }`}
    >
      {reading ? (
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-center sm:text-left">
          {preview ? (
            <div className="flex-none">
              {/* eslint-disable-next-line @next/next/no-img-element -- a data URL built in the browser */}
              <img
                src={preview}
                alt="First page as it will be sent, identity fields blacked out"
                className="w-[120px] rounded-[10px] border border-white/15 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
              />
            </div>
          ) : null}
          <div className="max-w-md">
            <div
              aria-hidden
              className="mx-auto h-12 w-12 animate-spin-grad rounded-full border-[3px] border-magenta/20 border-t-magenta sm:mx-0"
            />
            <div className="mt-5 font-display text-[19px] font-semibold text-fog">
              {busy.length > 1 ? "Reading the returns" : "Reading the return"}
            </div>
            {(["after", "entity", "city"] as Kind[]).map((k) =>
              sides[k].status === "reading" || sides[k].status === "done" ? (
                <div
                  key={k}
                  className="mt-1.5 min-h-[20px] text-[13.5px] text-teal"
                >
                  {sides[k].status === "done"
                    ? `${
                        k === "entity"
                          ? (picked.find((p) => p.analysis?.kind === "entity")?.analysis?.entityForm ?? "1120-S / 1065")
                          : k === "city"
                            ? "City return"
                            : "1040"
                      } read ✓`
                    : sides[k].message}
                </div>
              ) : null,
            )}
            {more.map((s, i) =>
              s.status === "reading" || s.status === "done" ? (
                <div key={`m${i}`} className="mt-1.5 min-h-[20px] text-[13.5px] text-teal">
                  {s.status === "done" ? `Entity return ${i + 2} read ✓` : s.message}
                </div>
              ) : null,
            )}
            <div className="relative mx-auto mt-5 h-1.5 w-56 overflow-hidden rounded-full bg-white/10 sm:mx-0">
              <div className="absolute top-0 h-full w-[45%] rounded-full bg-grad animate-beam-sweep" />
            </div>
            <div className="mt-4 truncate font-mono text-[11.5px] text-dusk">
              {picked.map((p) => p.file.name).join(" · ")}
            </div>
            {sides.after.redaction || sides.entity.redaction ? (
              <div
                className={`mt-1.5 text-[12px] ${(sides.after.redaction?.redacted ?? true) && (sides.entity.redaction?.redacted ?? true) ? "text-dusk" : "text-ember"}`}
              >
                {(sides.after.redaction?.redacted ?? true) &&
                (sides.entity.redaction?.redacted ?? true)
                  ? `Names, SSNs, EINs, addresses and account numbers painted out before sending (${(sides.after.redaction?.boxes ?? 0) + (sides.entity.redaction?.boxes ?? 0)} boxes)`
                  : "Scanned copy — identity fields can't be located, so the pages go as printed"}
              </div>
            ) : null}
          </div>
        </div>
      ) : picked.length ? (
        <div className="mx-auto max-w-lg text-left">
          <ul className="space-y-2">
            {picked.map((p) => {
              const side =
                [sides.after, sides.entity, sides.city, ...more].find((s) => s.file === p.file) ??
                (p.analysis?.kind === "entity" ? sides.entity : p.analysis?.kind === "city" ? sides.city : sides.after);
              const done = side.status === "done" && side.file === p.file;
              const errored = side.status === "error" && side.file === p.file;
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-[14px] border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <div
                    className={`flex h-10 w-10 flex-none items-center justify-center rounded-[12px] border ${errored ? "border-danger/40 text-danger" : done ? "border-teal/40 text-teal" : "border-magenta/40 text-magenta"}`}
                  >
                    <svg
                      aria-hidden
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <path d="M4 4h11l5 5v11H4zM15 4v5h5M8 13h8M8 17h5" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[14.5px] font-semibold text-fog">
                      {p.file.name}
                    </div>
                    <div className="mt-0.5 text-[12px] text-dusk">
                      {p.status === "checking" ? (
                        <>
                          <Spinner />
                          Checking…
                        </>
                      ) : (
                        <>
                          <span
                            className={
                              p.analysis?.kind ? "text-mist" : "text-ember"
                            }
                          >
                            {kindLabel(p.analysis?.kind ?? null, p.analysis?.entityForm ?? null)}
                          </span>
                          {p.analysis?.texts.length
                            ? ` · ${p.analysis.texts.length} pages`
                            : ""}
                          {" · "}
                          {fmtBytes(p.file.size)}
                          {done ? (
                            <span className="ml-2 text-teal">read ✓</span>
                          ) : null}
                          {p.file.size > FILE_MAX ? (
                            <span className="ml-2 text-danger">
                              over the {FILE_MAX_LABEL} limit
                            </span>
                          ) : null}
                        </>
                      )}
                    </div>
                    {errored ? (
                      <div className="mt-1 text-[12.5px] text-danger">
                        {side.message}
                      </div>
                    ) : null}
                    {p.status !== "checking" && p.analysis && redactionBlock(p.analysis) ? (
                      <div className="mt-1 text-[12.5px] leading-snug text-danger">
                        {redactionBlock(p.analysis)}
                      </div>
                    ) : p.status !== "checking" && p.analysis && !p.analysis.kind ? (
                      // Neither the pages nor the file's name said what this
                      // is (a scan, or a print scrambled throughout): staff do.
                      <label className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-dusk">
                        <span>Its pages can&rsquo;t say what it is. Read it as</span>
                        <select
                          disabled={disabled}
                          defaultValue=""
                          onChange={(e) => {
                            const v = e.target.value as ReturnKind | "";
                            if (v) onKind(p.id, v);
                          }}
                          className="rounded-[8px] border border-edge-mid bg-transparent px-2 py-1 text-[12px] text-fog"
                        >
                          <option value="" disabled>
                            choose…
                          </option>
                          <option value="individual">Form 1040</option>
                          <option value="entity">Form 1120-S or 1065</option>
                          <option value="city">City return (NYC-3L)</option>
                        </select>
                      </label>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${p.file.name}`}
                    disabled={disabled}
                    onClick={() => onRemove(p.id)}
                    className="cursor-pointer rounded-[10px] border border-edge-mid px-2.5 py-1 text-[14px] text-dusk hover:text-danger disabled:opacity-40"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
          {error ? (
            <div className="mt-3 text-[13px] text-danger">{error}</div>
          ) : null}
          {picked.some((p) => p.file.size > FILE_MAX) ? (
            <div className="mt-3 rounded-[10px] border border-danger/40 bg-danger/[0.06] px-3 py-2 text-[12.5px] leading-snug text-mist">
              <span className="text-danger">
                Over the {FILE_MAX_LABEL} limit.
              </span>{" "}
              A file this size is a scan. Export the return from ProSeries as a
              PDF instead: it&rsquo;s a fraction of the size, reads in seconds,
              and its identity fields get painted out before anything is sent.
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {picked.length < MAX_FILES ? (
              <button
                type="button"
                disabled={disabled}
                onClick={open}
                className={btnGhost}
              >
                {hasIndividual && !hasEntity
                  ? "+ Add the 1120-S or 1065"
                  : hasEntity && !hasIndividual
                    ? "+ Add the 1040"
                    : hasEntity
                      ? "+ Add another 1120-S or 1065"
                      : "+ Add a file"}
              </button>
            ) : null}
            <span className="text-[12px] text-dusk">
              {hasIndividual && !hasEntity
                ? "A sole proprietor needs only the 1040. For an S corporation or a partnership, drop its 1120-S or 1065 too — every one, when the client owns several."
                : hasIndividual && hasEntity
                  ? picked.filter((p) => p.analysis?.kind === "entity").length > 1
                    ? "Every business is here — each gets its own before, and the 1040 is built from them together."
                    : "Both returns are here — the recap is built from the two together. Own another business? Add its return too."
                  : ""}
            </span>
          </div>
          <div className="mt-6 flex flex-col items-center gap-3 border-t border-white/10 pt-6 text-center">
            {action}
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-lg">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-magenta/30 bg-magenta/10 text-magenta">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-8 w-8"
            >
              <path d="M12 16V4m0 0l-4 4m4-4l4 4M5 20h14" />
            </svg>
          </div>
          <div className="mt-5 font-display text-[21px] font-semibold text-fog">
            Drop the client&rsquo;s return here
          </div>
          <div className="mt-1.5 text-[13.5px] text-muted">
            The final 1040 exported from ProSeries — and the 1120-S or 1065 with
            it when the business is an S corporation or a partnership, plus the
            city&rsquo;s own return for it (NYC-3L) when there is one
          </div>
          <span className={`${btnPrimary} mt-6 !px-7 !py-3 !text-[15px]`}>
            Choose from computer
          </span>
          <div className="mt-5 text-[12px] text-dusk">
            Up to {FILE_MAX_LABEL} each.
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onAdd(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

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
    side.status === "error"
      ? "border-danger/60"
      : side.status === "done"
        ? "border-teal/50"
        : side.file
          ? "border-magenta/50"
          : over
            ? "border-mist"
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
          <div className="mt-0.5 font-display text-[15px] font-semibold text-fog">
            {title}
          </div>
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
            {side.file.name}{" "}
            <span className="text-dusk">· {fmtBytes(side.file.size)}</span>
            {side.file.size > FILE_MAX ? (
              <span className="ml-2 text-danger">
                over the {FILE_MAX_LABEL} limit — export from ProSeries instead
                of scanning
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-dusk">
            Drop the ProSeries PDF export here, up to {FILE_MAX_LABEL}.
          </span>
        )}
        {side.message ? (
          <div
            className={`mt-1 ${side.status === "error" ? "text-danger" : "text-teal"}`}
          >
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
 * from and whether that number was found in the PDF's text on that page — or
 * "derived", for a before column computed from the after return. An edited
 * cell shows "edited" so a reviewer can tell a correction from a read.
 */
function Cell({
  raw,
  extracted,
  derived = false,
  onChange,
  label,
  prefix = "$",
}: {
  raw: string;
  extracted: {
    value: number | null;
    page: number | null;
    verified: boolean | null;
    /** The printed amounts that add up to the value, when it isn't printed as one (verify.ts). */
    parts?: number[];
  } | null;
  derived?: boolean;
  onChange: (raw: string) => void;
  label: string;
  prefix?: string;
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
    tag = (
      <span className="text-faint">
        {derived ? "blank on a before return" : "blank on the return"}
      </span>
    );
  } else if (derived) {
    tag = <span className="text-teal">derived</span>;
  } else if (extracted.verified === true) {
    // A line that's a sum by definition: the amounts it was added from.
    const sum = extracted.parts && extracted.parts.length > 1 ? ` = ${extracted.parts.map(money).join(" + ")}` : "";
    tag = (
      <span className="text-teal" title={sum ? `Page ${extracted.page}: ${extracted.parts?.map(money).join(" + ")}` : undefined}>
        p. {extracted.page} ✓{sum}
      </span>
    );
  } else if (extracted.verified === false) {
    // Not printed as one number: the amounts that add up to it, when some do.
    const sum = extracted.parts && extracted.parts.length > 1 ? extracted.parts.map(money).join(" + ") : null;
    tag = sum ? (
      <span className="text-ember" title={`Not printed as one number: ${sum} on page ${extracted.page} add up to it — check that's what this line should be`}>
        p. {extracted.page} — {sum}? check
      </span>
    ) : (
      <span className="text-ember" title="Not found anywhere in the PDF's text, and no two or three amounts on the page add up to it">
        p. {extracted.page} — not found in text, check
      </span>
    );
  } else {
    tag = <span className="text-dusk">p. {extracted.page}</span>;
  }
  return (
    <div className="min-w-0">
      <NumInput
        value={raw}
        onChange={onChange}
        prefix={prefix}
        ariaLabel={label}
      />
      <div className="mt-1 truncate font-mono text-[10px] tracking-[0.4px]">
        {tag}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10px] tracking-[0.4px]">
      <span className="text-teal">p. n ✓ — found on that page of the PDF</span>
      <span className="text-teal">
        derived — computed from the return with the write-offs at zero
      </span>
      <span className="text-ember">
        not found — the number isn&rsquo;t in the PDF text, read it off the form
      </span>
      <span className="text-magenta">edited — you changed it</span>
      <span className="text-faint">
        blank — the line is empty on the return
      </span>
    </div>
  );
}
