/**
 * A minimal .xlsx writer — just enough SpreadsheetML to hand a client a
 * working tracker, without shipping SheetJS (≈900 KB) to every portal visit
 * for one button.
 *
 * What it writes: text (inline strings), numbers, formulas with an optional
 * cached result, a handful of cell styles, column widths, row heights and
 * merged ranges. What it doesn't: shared strings, dates, charts, compression.
 * The archive is STORED (no deflate) — a tracker is a few KB either way, and
 * a stored zip is small enough to get exactly right by hand.
 *
 * The workbook sets `fullCalcOnLoad`, so Excel recomputes every formula on
 * open; Google Sheets and Numbers compute formulas themselves. Cached `<v>`
 * results are still worth passing when known — Quick Look and phone previews
 * show the cache rather than calculate.
 *
 * Pure and isomorphic (TextEncoder and DataView only), with type-only
 * TypeScript, so a plain `node` can run it for a smoke test.
 */

/** Named cell styles; the index is the cellXfs position in styles.xml. */
export type CellStyle = "bold" | "money" | "moneyBold" | "rate" | "int" | "wrap";

const STYLE_INDEX: Record<CellStyle, number> = {
  bold: 1,
  money: 2,
  moneyBold: 3,
  rate: 4,
  int: 5,
  wrap: 6,
};

/**
 * One cell. A bare string or number is a value; the object form adds a style
 * or a formula. `f` is written without the leading "=". An object with only
 * `s` is a blank, pre-formatted cell — an input column that should show money
 * the moment someone types into it.
 */
export type Cell =
  | string
  | number
  | null
  | undefined
  | { v?: string | number | null; f?: string; s?: CellStyle };

export type Range = { s: { r: number; c: number }; e: { r: number; c: number } };

export type Sheet = {
  name: string;
  /** Row-major, zero-based. Ragged rows are fine. */
  rows: Cell[][];
  /** Column widths in characters, by column index. */
  cols?: number[];
  /** Zero-based inclusive ranges. */
  merges?: Range[];
  /** Row heights in points, by row index. */
  heights?: Record<number, number>;
};

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/* ──────────────────────────── references ──────────────────────────── */

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function colName(c: number): string {
  let n = c + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Zero-based (row, col) → "B5". */
export function cellRef(r: number, c: number): string {
  return colName(c) + (r + 1);
}

/**
 * A sheet name as a formula prefix: `'Mom''s Car'!`. Always quoted — quoting
 * is legal for every name, and the unquoted rules (no spaces, no leading
 * digit, nothing that reads as a cell reference) aren't worth re-deriving.
 */
export function sheetRef(name: string): string {
  return `'${name.replace(/'/g, "''")}'!`;
}

/** Why Excel would refuse this sheet name, or null if it's fine. */
export function sheetNameProblem(name: string): string | null {
  if (!name || name.length > 31) return "must be 1–31 characters";
  if (/[:\\/?*[\]]/.test(name)) return "can't contain : \\ / ? * [ ]";
  if (name.startsWith("'") || name.endsWith("'")) return "can't start or end with an apostrophe";
  if (name.toLowerCase() === "history") return "“History” is reserved by Excel";
  return null;
}

/* ───────────────────────────── escaping ───────────────────────────── */

/**
 * Drop what XML 1.0 can't carry at all — C0 controls other than tab/LF/CR,
 * U+FFFE/U+FFFF, and unpaired surrogates. One stray control character pasted
 * into a vehicle label would otherwise make Excel call the whole file corrupt.
 */
function cleanXmlText(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        out += s[i] + s[i + 1];
        i++;
      }
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) continue;
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) continue;
    if (c === 0xfffe || c === 0xffff) continue;
    out += s[i];
  }
  return out;
}

function escXml(s: string): string {
  return cleanXmlText(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* ───────────────────────────── parts ───────────────────────────── */

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";

function contentTypesXml(sheetCount: number): string {
  let sheets = "";
  for (let i = 1; i <= sheetCount; i++) {
    sheets += `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  }
  return (
    XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    "</Types>"
  );
}

function rootRelsXml(): string {
  return (
    XML_HEAD +
    `<Relationships xmlns="${NS_PKG_REL}">` +
    `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
    "</Relationships>"
  );
}

function workbookXml(names: string[]): string {
  const sheets = names
    .map((n, i) => `<sheet name="${escXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  return (
    XML_HEAD +
    `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    "<bookViews><workbookView/></bookViews>" +
    `<sheets>${sheets}</sheets>` +
    '<calcPr calcId="191029" fullCalcOnLoad="1"/>' +
    "</workbook>"
  );
}

function workbookRelsXml(sheetCount: number): string {
  let rels = "";
  for (let i = 1; i <= sheetCount; i++) {
    rels += `<Relationship Id="rId${i}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i}.xml"/>`;
  }
  rels += `<Relationship Id="rId${sheetCount + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>`;
  return XML_HEAD + `<Relationships xmlns="${NS_PKG_REL}">${rels}</Relationships>`;
}

/**
 * Seven formats, in STYLE_INDEX order: default, bold, money, bold money,
 * mileage rate (three decimals — $0.725 must not display as $0.73), whole
 * number, and wrapped text for the long note rows.
 */
function stylesXml(): string {
  const xf = (numFmt: number, font: number, extra = "") =>
    `<xf numFmtId="${numFmt}" fontId="${font}" fillId="0" borderId="0" xfId="0"` +
    (numFmt ? ' applyNumberFormat="1"' : "") +
    (font ? ' applyFont="1"' : "") +
    (extra ? ` applyAlignment="1">${extra}</xf>` : "/>");
  const cellXfs = [
    xf(0, 0),
    xf(0, 1),
    xf(164, 0),
    xf(164, 1),
    xf(165, 0),
    xf(3, 0),
    xf(0, 0, '<alignment wrapText="1" vertical="top"/>'),
  ];
  return (
    XML_HEAD +
    `<styleSheet xmlns="${NS_MAIN}">` +
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="$#,##0.00"/><numFmt numFmtId="165" formatCode="$#,##0.000"/></numFmts>' +
    '<fonts count="2">' +
    '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    "</fonts>" +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${cellXfs.length}">${cellXfs.join("")}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    "</styleSheet>"
  );
}

function cellXml(ref: string, cell: Cell): string {
  if (cell == null) return "";
  const o = typeof cell === "object" ? cell : { v: cell };
  const s = o.s ? ` s="${STYLE_INDEX[o.s]}"` : "";
  const blank = s ? `<c r="${ref}"${s}/>` : "";
  if (o.f) {
    const cached = typeof o.v === "number" && isFinite(o.v) ? `<v>${o.v}</v>` : "";
    return `<c r="${ref}"${s}><f>${escXml(o.f)}</f>${cached}</c>`;
  }
  if (typeof o.v === "number") {
    return isFinite(o.v) ? `<c r="${ref}"${s}><v>${o.v}</v></c>` : blank;
  }
  if (typeof o.v === "string" && o.v !== "") {
    // Excel's per-cell text ceiling.
    const text = o.v.slice(0, 32767);
    const keep = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : "";
    return `<c r="${ref}"${s} t="inlineStr"><is><t${keep}>${escXml(text)}</t></is></c>`;
  }
  return blank;
}

function sheetXml(sheet: Sheet): string {
  let maxCol = 0;
  let rowsXml = "";
  sheet.rows.forEach((row, r) => {
    let cells = "";
    row.forEach((cell, c) => {
      const x = cellXml(cellRef(r, c), cell);
      if (x) {
        cells += x;
        if (c > maxCol) maxCol = c;
      }
    });
    const ht = sheet.heights?.[r];
    if (!cells && !ht) return;
    const htAttr = ht ? ` ht="${ht}" customHeight="1"` : "";
    rowsXml += `<row r="${r + 1}"${htAttr}>${cells}</row>`;
  });

  const lastRow = Math.max(1, sheet.rows.length);
  const dimension = `<dimension ref="A1:${cellRef(lastRow - 1, maxCol)}"/>`;

  const cols = (sheet.cols ?? [])
    .map((w, i) =>
      w > 0
        ? // +0.71 is the cell padding Excel adds to a character count.
          `<col min="${i + 1}" max="${i + 1}" width="${(w + 0.7109375).toFixed(4)}" customWidth="1"/>`
        : "",
    )
    .join("");

  const merges = sheet.merges ?? [];
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">` +
      merges
        .map((m) => `<mergeCell ref="${cellRef(m.s.r, m.s.c)}:${cellRef(m.e.r, m.e.c)}"/>`)
        .join("") +
      "</mergeCells>"
    : "";

  return (
    XML_HEAD +
    `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    dimension +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${rowsXml}</sheetData>` +
    mergeXml +
    "</worksheet>"
  );
}

/* ─────────────────────────────── zip ─────────────────────────────── */

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS packed time and date, local time — what every zip tool expects. */
function dosStamp(d: Date): { time: number; date: number } {
  const year = Math.min(2107, Math.max(1980, d.getFullYear()));
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** Bit 11: names are UTF-8. Ours are ASCII, but saying so costs nothing. */
const UTF8_FLAG = 0x0800;

/**
 * A STORED (method 0) zip: per entry a local header + the bytes, then the
 * central directory, then the end record. Every multi-byte field is
 * little-endian. No data descriptors — sizes and CRCs are known up front.
 */
function zipStored(files: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const { time, date } = dosStamp(new Date());
  const entries = files.map((f) => ({
    name: enc.encode(f.name),
    data: f.data,
    crc: crc32(f.data),
  }));

  const localSize = entries.reduce((s, e) => s + 30 + e.name.length + e.data.length, 0);
  const centralSize = entries.reduce((s, e) => s + 46 + e.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  const offsets: number[] = [];
  let p = 0;

  for (const e of entries) {
    offsets.push(p);
    view.setUint32(p, 0x04034b50, true); // local file header signature
    view.setUint16(p + 4, 20, true); // version needed (2.0)
    view.setUint16(p + 6, UTF8_FLAG, true);
    view.setUint16(p + 8, 0, true); // method: stored
    view.setUint16(p + 10, time, true);
    view.setUint16(p + 12, date, true);
    view.setUint32(p + 14, e.crc, true);
    view.setUint32(p + 18, e.data.length, true); // compressed size
    view.setUint32(p + 22, e.data.length, true); // uncompressed size
    view.setUint16(p + 26, e.name.length, true);
    view.setUint16(p + 28, 0, true); // extra field length
    out.set(e.name, p + 30);
    out.set(e.data, p + 30 + e.name.length);
    p += 30 + e.name.length + e.data.length;
  }

  const centralStart = p;
  entries.forEach((e, i) => {
    view.setUint32(p, 0x02014b50, true); // central directory signature
    view.setUint16(p + 4, 20, true); // version made by
    view.setUint16(p + 6, 20, true); // version needed
    view.setUint16(p + 8, UTF8_FLAG, true);
    view.setUint16(p + 10, 0, true); // method: stored
    view.setUint16(p + 12, time, true);
    view.setUint16(p + 14, date, true);
    view.setUint32(p + 16, e.crc, true);
    view.setUint32(p + 20, e.data.length, true);
    view.setUint32(p + 24, e.data.length, true);
    view.setUint16(p + 28, e.name.length, true);
    view.setUint16(p + 30, 0, true); // extra length
    view.setUint16(p + 32, 0, true); // comment length
    view.setUint16(p + 34, 0, true); // disk number start
    view.setUint16(p + 36, 0, true); // internal attributes
    view.setUint32(p + 38, 0, true); // external attributes
    view.setUint32(p + 42, offsets[i], true); // local header offset
    out.set(e.name, p + 46);
    p += 46 + e.name.length;
  });

  view.setUint32(p, 0x06054b50, true); // end of central directory signature
  view.setUint16(p + 4, 0, true); // this disk
  view.setUint16(p + 6, 0, true); // disk with the central directory
  view.setUint16(p + 8, entries.length, true); // entries on this disk
  view.setUint16(p + 10, entries.length, true); // entries in total
  view.setUint32(p + 12, centralSize, true);
  view.setUint32(p + 16, centralStart, true);
  view.setUint16(p + 20, 0, true); // comment length
  return out;
}

/* ───────────────────────────── entry ───────────────────────────── */

/**
 * Build the .xlsx bytes. Throws on a sheet name Excel would refuse or a
 * duplicate (Excel compares names case-insensitively) — callers sanitize
 * user-supplied names first; this is the backstop that keeps a bad name from
 * shipping as a "repair this file?" prompt.
 */
export function buildXlsx(sheets: Sheet[]): Uint8Array<ArrayBuffer> {
  if (!sheets.length) throw new Error("A workbook needs at least one sheet");
  const seen = new Set<string>();
  for (const s of sheets) {
    const problem = sheetNameProblem(s.name);
    if (problem) throw new Error(`Sheet name "${s.name}" ${problem}`);
    const key = s.name.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate sheet name "${s.name}"`);
    seen.add(key);
  }

  const enc = new TextEncoder();
  const files = [
    { name: "[Content_Types].xml", data: enc.encode(contentTypesXml(sheets.length)) },
    { name: "_rels/.rels", data: enc.encode(rootRelsXml()) },
    { name: "xl/workbook.xml", data: enc.encode(workbookXml(sheets.map((s) => s.name))) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(workbookRelsXml(sheets.length)) },
    { name: "xl/styles.xml", data: enc.encode(stylesXml()) },
    ...sheets.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: enc.encode(sheetXml(s)),
    })),
  ];
  return zipStored(files);
}
