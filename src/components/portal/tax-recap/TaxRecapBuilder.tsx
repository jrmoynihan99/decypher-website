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
import { computeRecap, validateAll } from "@/lib/tax-recap/compute";
import {
  attributeStrategies,
  deriveBefore,
  type DeriveMeta,
} from "@/lib/tax-recap/derive";
import type { ReturnKind } from "@/lib/tax-recap/pages";
import type { TableSet } from "@/lib/tax-recap/tables";
import {
  DEFAULT_NEXT_STEPS,
  DEFAULT_STRATEGIES,
  ENTITY_FIELDS,
  ENTITY_FIELD_KEYS,
  RETURN_FIELDS,
  RETURN_FIELD_KEYS,
  asMoney,
  displayName,
  emptyNumbers,
  numbersFromEntityExtract,
  numbersFromExtract,
  type DerivedBefore,
  type EntityExtract,
  type EntityFieldGroup,
  type EntityFieldKey,
  type EntityNumbers,
  type FieldGroup,
  type RecapAnalysis,
  type RecapDoc,
  type RecapNextStep,
  type ReturnExtract,
  type ReturnFieldKey,
  type ReturnNumbers,
} from "@/lib/tax-recap/schema";
import { analyzePdf, preparePdf, type PdfAnalysis } from "./pdf-prepare";

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

type Kind = "before" | "after" | "entity";
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

/** A file dropped on the tool, with what its own pages say it is. */
type Picked = {
  id: string;
  file: File;
  analysis: PdfAnalysis | null;
  status: "checking" | "ready" | "unreadable";
};

const metaOf = (extract: ReturnExtract): DeriveMeta => ({
  taxYear: extract.taxYear,
  filingStatus: extract.filingStatus,
  stateCode: extract.stateCode,
  stateForm: extract.stateForm,
});

const toRaw = (n: ReturnNumbers): RawNumbers =>
  Object.fromEntries(
    RETURN_FIELD_KEYS.map((k) => [k, n[k] === null ? "" : String(n[k])]),
  ) as RawNumbers;

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
  { id: "shareholder", title: "Shareholder (K-1)" },
  { id: "state", title: "State (the corporation's return)" },
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

/** Over this, a PDF is staged in pieces (see readOne). Under Vercel's ~4.5MB body cap. */
const DIRECT_MAX = 3.5 * 1024 * 1024;
/** Mirrors UPLOAD_CHUNK_BYTES / UPLOAD_MAX_BYTES in lib/tax-recap/uploads.ts. */
const CHUNK = 750 * 1024;
const PER_REQUEST = 4;
/**
 * The largest return accepted. A ProSeries export is 1–3 MB however long
 * the print; a scan is 15–20 MB, has no text layer to redact or cross-check
 * by, and takes minutes to read. The cap is the line between the two, so
 * every return that gets in can be redacted before it leaves.
 */
const FILE_MAX = 6 * 1024 * 1024;
const FILE_MAX_LABEL = "6 MB";

const kindLabel = (k: ReturnKind | null) =>
  k === "entity"
    ? "Form 1120-S"
    : k === "individual"
      ? "Form 1040"
      : "Not recognised";

/** The origin never changes while the page is open; nothing to subscribe to. */
const subscribeNever = () => () => {};

export default function TaxRecapBuilder({
  initial,
  tables,
}: {
  initial: RecapDoc | null;
  /** The year cards the engine derives with — seeds plus anything saved on the Tax Tables page. */
  tables: TableSet;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(initial ? "review" : "upload");
  /** The before drop zone, shown only once a derivation was refused and staff chose a print. */
  const [showBefore, setShowBefore] = useState(false);

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
  const [analysis, setAnalysis] = useState<RecapAnalysis | null>(
    initial?.analysis ?? null,
  );
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
    sides.entity.status === "reading";

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
    setPicked((p) => [...p, ...fresh].slice(0, 3));
    // Reset the read sides: a new set of files means a new recap.
    setSides((s) => ({
      ...s,
      after: idleSide(),
      entity: idleSide(),
      before: s.before.file ? s.before : idleSide(),
    }));
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
    setSides((s) => ({ ...s, after: idleSide(), entity: idleSide() }));
  };

  const pickBefore = (file: File | null) =>
    setSides((s) => ({ ...s, before: { ...idleSide(), file } }));

  /** Read one return: prepare it here, send it, and hand back what came out. */
  const readOne = async (
    kind: Kind,
    source: { file: File; analysis: PdfAnalysis | null },
    extraTokens: string[],
  ) => {
    const say = (message: string) =>
      setSides((s) => ({
        ...s,
        [kind]: { ...s[kind], file: source.file, status: "reading", message },
      }));

    say("Opening the PDF…");
    // Reads the page text, trims the return to the pages the recap needs and
    // paints out the identity fields — all here, before anything leaves.
    const prepared = await preparePdf(source.analysis ?? source.file, {
      kind: kind === "entity" ? "entity" : "individual",
      extraTokens,
    });
    if (process.env.NODE_ENV !== "production") {
      // For the browser test to inspect exactly what would be sent.
      const w = window as unknown as {
        __taxRecapPrepared?: Record<string, unknown>;
      };
      w.__taxRecapPrepared = {
        ...(w.__taxRecapPrepared ?? {}),
        [kind]: prepared,
      };
    }
    setSides((s) => ({
      ...s,
      [kind]: {
        ...s[kind],
        pages: prepared.totalPages,
        sentPages: prepared.sentPages,
        localName:
          kind === "entity"
            ? prepared.identity.entityName
            : prepared.identity.name,
        redaction: {
          redacted: prepared.identity.redacted,
          boxes: prepared.identity.boxes,
          preview: prepared.preview,
        },
      },
    }));

    const what = kind === "entity" ? "the 1120-S" : "the return";
    const readingMsg = prepared.trimmed
      ? `Reading the ${prepared.sentPages} pages of ${what} that hold the numbers, out of ${prepared.totalPages}…`
      : prepared.fallback === "no-text-layer"
        ? `Reading a scanned copy of ${what} — no text layer, so numbers can't be cross-checked…`
        : `Reading all ${prepared.totalPages} pages of ${what} — this takes a minute or two…`;

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
    if (!prepared.identity.redacted) {
      warnings.push(
        prepared.fallback === "no-text-layer"
          ? "Scanned copy: the identity fields couldn't be located, so the pages were sent as printed. An export from ProSeries would be redacted before sending"
          : "The identity fields couldn't be painted out on this print, so the pages were sent as printed",
      );
    }
    return {
      extract: data.extract,
      warnings,
      localName: prepared.identity.name,
      entityName: prepared.identity.entityName,
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

  /** Sort the dropped files into the 1040 and, if there is one, the 1120-S. */
  const sortPicked = (): { after: Picked; entity: Picked | null } | null => {
    const ready = picked.filter((p) => p.status !== "checking");
    if (ready.length !== picked.length) return null;
    const individuals = ready.filter((p) => p.analysis?.kind === "individual");
    const entities = ready.filter((p) => p.analysis?.kind === "entity");
    const unknown = ready.filter((p) => !p.analysis?.kind);
    if (individuals.length > 1) {
      setPickError(
        "Two individual returns were dropped. Keep the final 1040 here; a before print has its own slot below once the engine asks for one.",
      );
      return null;
    }
    if (entities.length > 1) {
      setPickError(
        "Two S corporation returns were dropped — keep the one for this client's business.",
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
          ? "Only the 1120-S was dropped — add the shareholder's final 1040; the recap is built from both."
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
    return { after, entity: entities[0] ?? null };
  };

  const readReturns = async () => {
    const sorted = sortPicked();
    if (!sorted) return;
    const beforeFile = sides.before.file;
    // Words learned from either return (the corporation's name, the owner's)
    // are painted out of both.
    const tokens = [
      ...new Set(picked.flatMap((p) => p.analysis?.tokens ?? [])),
    ];

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
        const r = await readOne("after", sorted.after, tokens);
        const ex = r.extract as ReturnExtract;
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
            warnings: r.warnings,
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

    const [a, ent, b] = await Promise.all([
      readAfter(),
      readEntity(),
      readBefore(),
    ]);
    if (!a) return;
    if (sorted.entity && !ent) return;

    const aNum = numbersFromExtract(a);
    let eNum: EntityNumbers | null = ent ? numbersFromEntityExtract(ent) : null;
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
            `PTE elective tax (${money(aNum.statePteCreditAvailable ?? 0)}) taken from the 1040's FTB 3804-CR — the 100S print doesn't carry it on line 29`,
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
      setAnalysis(attributeStrategies(aNum, metaOf(a), tables, eNum));
      setStage("review");
      return;
    }

    // No before PDF: derive it. A refusal keeps the reads and stays here
    // with the reasons and the two ways through.
    const result = deriveBefore(aNum, metaOf(a), tables, eNum);
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
      return;
    }
    setSides((s) => ({
      ...s,
      before: {
        ...idleSide(),
        status: "done",
        derived: result.derived,
        derivedNumbers: result.before,
      },
    }));
    setNumbers((n) => ({ ...n, before: toRaw(result.before) }));
    setEntityNumbers((e) => ({
      ...e,
      before: toRawEntity(result.entityBefore),
    }));
    setEntityDerived(result.entityBefore);
    setAnalysis(attributeStrategies(aNum, metaOf(a), tables, eNum));
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
    setAnalysis(null);
    setClientName(displayName(a.taxpayerName || ""));
    setTaxYear(String(a.taxYear ?? new Date().getFullYear() - 1));
    setStateCode(a.stateCode || "");
    setStage("review");
  };

  /**
   * Derive again from the after column as it now stands. For when a misread
   * after line was corrected in the grid: the before was computed from the
   * wrong number and should follow the fix.
   */
  const [rederiveError, setRederiveError] = useState<string[] | null>(null);
  const rederive = () => {
    const a = sides.after.extract;
    if (!a) return;
    const meta: DeriveMeta = {
      ...metaOf(a),
      taxYear: /^\d{4}$/.test(taxYear.trim()) ? Number(taxYear) : a.taxYear,
      stateCode: stateCode.trim() || a.stateCode,
    };
    const aNum = toNumbers(numbers.after);
    const eNum = toEntityNumbers(entityNumbers.after);
    const result = deriveBefore(aNum, meta, tables, eNum);
    if (!result.ok) {
      setRederiveError(result.reasons);
      return;
    }
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
    setNumbers((n) => ({ ...n, before: toRaw(result.before) }));
    setEntityNumbers((e) => ({
      ...e,
      before: toRawEntity(result.entityBefore),
    }));
    setEntityDerived(result.entityBefore);
    setAnalysis(attributeStrategies(aNum, meta, tables, eNum));
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
    setSides({ before: idleSide(), after: idleSide(), entity: idleSide() });
    setNumbers({ before: toRaw(emptyNumbers()), after: toRaw(emptyNumbers()) });
    setEntityNumbers({ before: toRawEntity(null), after: toRawEntity(null) });
    setEntityDerived(null);
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
    }),
    [numbers, entityNumbers],
  );
  const computed = useMemo(
    () =>
      computeRecap({
        before: parsed.before,
        after: parsed.after,
        entityBefore: parsed.entityBefore,
        entityAfter: parsed.entityAfter,
        priorYearIncome: priorYearIncome.trim()
          ? asMoney(priorYearIncome)
          : null,
      }),
    [parsed, priorYearIncome],
  );
  const warnings = useMemo(
    () =>
      validateAll(
        parsed.before,
        parsed.after,
        parsed.entityBefore,
        parsed.entityAfter,
      ),
    [parsed],
  );
  const hasEntity =
    !!sides.entity.entity || !!parsed.entityAfter || !!parsed.entityBefore;
  const scorpSavings = analysis?.scorpSavings?.amount ?? 0;

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
  const [showAllLines, setShowAllLines] = useState(false);
  const visibleFields = RETURN_FIELDS.filter(
    (f) =>
      showAllLines ||
      !("optional" in f && f.optional) ||
      numbers.before[f.key].trim() !== "" ||
      numbers.after[f.key].trim() !== "",
  );
  const hiddenCount = RETURN_FIELDS.length - visibleFields.length;
  const visibleEntityFields = ENTITY_FIELDS.filter(
    (f) =>
      showAllLines ||
      !("optional" in f && f.optional) ||
      entityNumbers.before[f.key].trim() !== "" ||
      entityNumbers.after[f.key].trim() !== "",
  );

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
      strategies: strategies
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      nextSteps: nextSteps.filter((s) => s.label.trim()),
      extraction: {
        before: sides.before.extract,
        after: sides.after.extract,
        entity: sides.entity.entity,
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
  const canRead =
    picked.length > 0 &&
    picked.every((p) => p.status !== "checking") &&
    !anyTooBig &&
    !reading;
  const deriving = !sides.before.file;
  const refusal =
    stage === "upload" && sides.before.status === "error"
      ? sides.before.problems
      : [];
  const canSave =
    clientName.trim().length > 0 && /^\d{4}$/.test(taxYear.trim()) && !saving;

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
                ? `, plus ${money(scorpSavings)} of self-employment tax the S corporation avoided`
                : ""}
              .
            </p>
          </div>
          <div className="font-display text-[34px] font-bold leading-none tabular-nums text-teal">
            {money(computed.savings + scorpSavings)}
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
            <div
              className={`grid gap-4 ${showBefore ? "md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" : ""}`}
            >
              <HeroDrop
                picked={picked}
                sides={sides}
                reading={reading}
                disabled={reading}
                error={pickError}
                onAdd={addFiles}
                onRemove={removePicked}
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
                        ? "The return is read by Claude — the 1120-S too, for an S corporation — the before column is computed from it with every write-off at zero, the savings are split by strategy, and you check every number before anything is saved."
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
              {(["after", "entity", "before"] as Kind[]).map((k) => {
                const s = sides[k];
                if (k === "before" && s.derived) {
                  return (
                    <Chip key={k} tone="pos">
                      Before column: computed
                      {hasEntity ? " from both returns" : " from it"}, engine
                      check passed
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
                      1120-S read: {n} lines
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
              {sides.before.derived && sides.after.extract ? (
                <button
                  type="button"
                  onClick={rederive}
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
                hint="Optional. From last year's return — not in these PDFs"
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
                ? " — every deduction on the 1120-S, the owner's pay and the PTE election included"
                : ""}
              . Fix anything that&rsquo;s wrong and the recap below updates.
            </p>
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

            {hasEntity ? (
              <>
                <div className="grid grid-cols-2 items-end gap-3 border-b border-t-2 border-edge border-t-white/10 bg-white/[0.02] px-4 py-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <Mono className="col-span-2 font-bold text-magenta sm:col-span-1">
                    S corporation · Form 1120-S
                  </Mono>
                  <Mono className="text-dusk">Before · computed</Mono>
                  <Mono className="text-dusk">After · the return</Mono>
                </div>
                {ENTITY_GROUPS.filter((g) =>
                  visibleEntityFields.some((f) => f.group === g.id),
                ).map((g) => (
                  <div key={g.id}>
                    <div className="border-b border-edge bg-white/[0.02] px-4 py-2">
                      <Mono className="font-bold text-mist">{g.title}</Mono>
                    </div>
                    {visibleEntityFields
                      .filter((f) => f.group === g.id)
                      .map((f) => (
                        <GridRow key={f.key} label={f.label} source={f.source}>
                          {(["before", "after"] as const).map((k) => {
                            const derivedFrom =
                              k === "before" ? entityDerived : null;
                            return (
                              <Cell
                                key={k}
                                raw={entityNumbers[k][f.key]}
                                extracted={
                                  derivedFrom
                                    ? {
                                        value: derivedFrom[f.key],
                                        page: null,
                                        verified: null,
                                      }
                                    : k === "after"
                                      ? (sides.entity.entity?.fields[f.key] ??
                                        null)
                                      : null
                                }
                                derived={!!derivedFrom}
                                onChange={(v) => setEntityCell(k, f.key, v)}
                                label={`${f.label} (1120-S, ${k})`}
                                prefix={f.key === "ownershipPct" ? "%" : "$"}
                              />
                            );
                          })}
                        </GridRow>
                      ))}
                  </div>
                ))}
              </>
            ) : null}

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
                    <Mono className="mt-0.5 flex-none text-ember">1120-S</Mono>
                    <span>{w}</span>
                  </li>
                ))}
                {warnings.map((w, i) => (
                  <li key={`v${i}`} className="flex gap-2">
                    <Mono className="mt-0.5 flex-none text-ember">
                      {w.side === "entity" ? "1120-S" : w.side}
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
                label={
                  scorpSavings > 0
                    ? "Bookkeeping + strategies"
                    : "Total tax savings"
                }
                value={money(computed.savings)}
                tone={computed.savings >= 0 ? "pos" : "neg"}
              />
            </KpiRow>
            {scorpSavings > 0 ? (
              <div className="mt-3">
                <KpiRow cols={2}>
                  <Kpi
                    label="S-corp: self-employment tax avoided (estimated)"
                    value={money(scorpSavings)}
                  />
                  <Kpi
                    label="Total tax savings"
                    value={money(computed.savings + scorpSavings)}
                    tone="pos"
                  />
                </KpiRow>
              </div>
            ) : null}

            <div className="mt-5 grid gap-6 md:grid-cols-2">
              <div>
                <Mono className="text-dusk">Savings breakdown (exact)</Mono>
                <div className="mt-1">
                  <LineRow
                    label="Deductions found"
                    value={money(computed.breakdown.deductionsFound)}
                    size="sm"
                  />
                  {computed.scorp ? (
                    <LineRow
                      label="S-corp state tax & PTET saved"
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
                  <LineRow
                    label="Federal income tax saved"
                    value={money(computed.breakdown.incomeTaxSaved)}
                    size="sm"
                  />
                  <LineRow
                    label="State tax saved"
                    value={money(computed.breakdown.stateSaved)}
                    size="sm"
                  />
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
                  <LineRow
                    label={`State: ${money(computed.filing.state.owed)} owed − ${money(computed.filing.state.paid)} paid`}
                    value={dueLabel(computed.filing.state.due)}
                    size="sm"
                    tone={computed.filing.state.due > 0 ? "neg" : "pos"}
                  />
                  {computed.filing.entity ? (
                    <LineRow
                      label={`S-corp (PTET): ${money(computed.filing.entity.owed)} owed − ${money(computed.filing.entity.paid)} paid`}
                      value={dueLabel(computed.filing.entity.due)}
                      size="sm"
                      tone={computed.filing.entity.due > 0 ? "neg" : "pos"}
                    />
                  ) : null}
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
                  <LineRow
                    label="Bookkeeping + strategies"
                    value={money(computed.savings)}
                    size="sm"
                    total
                    tone="pos"
                  />
                  {analysis.scorpSavings ? (
                    <StrategyRow
                      label="S corporation: self-employment tax avoided"
                      note={analysis.scorpSavings.note}
                      value={analysis.scorpSavings.amount}
                    />
                  ) : null}
                </div>
                <Note className="!mt-2">
                  Computed by switching each strategy on in turn and re-running
                  the whole return. Edit a number above and press
                  &ldquo;Recompute the before column&rdquo; to refresh the
                  split.
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
                  Needs a client name and a four-digit year.
                </span>
              ) : null}
            </div>

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
  reading,
  disabled,
  error,
  onAdd,
  onRemove,
  action,
}: {
  picked: Picked[];
  sides: Record<Kind, SideState>;
  reading: boolean;
  disabled: boolean;
  error: string | null;
  onAdd: (files: FileList | File[]) => void;
  onRemove: (id: string) => void;
  /** The create button, shown under the file list once there's something to read. */
  action: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const anyError =
    sides.after.status === "error" ||
    sides.entity.status === "error" ||
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
  const busy = [sides.after, sides.entity].filter(
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
              {busy.length > 1 ? "Reading both returns" : "Reading the return"}
            </div>
            {(["after", "entity"] as Kind[]).map((k) =>
              sides[k].status === "reading" || sides[k].status === "done" ? (
                <div
                  key={k}
                  className="mt-1.5 min-h-[20px] text-[13.5px] text-teal"
                >
                  {sides[k].status === "done"
                    ? `${k === "entity" ? "1120-S" : "1040"} read ✓`
                    : sides[k].message}
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
                p.analysis?.kind === "entity" ? sides.entity : sides.after;
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
                            {kindLabel(p.analysis?.kind ?? null)}
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
            {picked.length < 3 ? (
              <button
                type="button"
                disabled={disabled}
                onClick={open}
                className={btnGhost}
              >
                {hasIndividual && !hasEntity
                  ? "+ Add the 1120-S (S corporation)"
                  : hasEntity && !hasIndividual
                    ? "+ Add the 1040"
                    : "+ Add a file"}
              </button>
            ) : null}
            <span className="text-[12px] text-dusk">
              {hasIndividual && !hasEntity
                ? "A sole proprietor needs only the 1040. For an S corporation, drop the 1120-S too."
                : hasIndividual && hasEntity
                  ? "Both returns are here — the recap is built from the two together."
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
            The final 1040 exported from ProSeries — and the 1120-S with it when
            the business is an S corporation
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
    tag = <span className="text-teal">p. {extracted.page} ✓</span>;
  } else if (extracted.verified === false) {
    tag = (
      <span className="text-ember">
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
