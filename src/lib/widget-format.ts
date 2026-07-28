/**
 * Number formatting shared by the portal widgets.
 *
 * These are the display helpers the standalone HTML prototypes each carried
 * their own copy of. One copy here so a rounding or paren convention can't
 * drift between two tools sitting on the same page.
 */

/** "$1,234" — rounded, no cents. Negatives read as "($1,234)" in ledgers. */
export function money(n: number): string {
  if (!isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Accounting-style money: negatives in parentheses, optional decimals. */
export function money2(v: number, dec = 0): string {
  if (!isFinite(v)) return "—";
  const neg = v < 0;
  const s = Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
  return (neg ? "($" : "$") + s + (neg ? ")" : "");
}

/** 0.0625 → "6.3%" */
export function pct(v: number, dec = 1): string {
  return isFinite(v) ? `${(v * 100).toFixed(dec)}%` : "—";
}

/** 1.25 → "1.25×" */
export function times(v: number, dec = 2): string {
  return isFinite(v) ? `${v.toFixed(dec)}×` : "—";
}

/** "$1.2M" / "$340K" / "$820" — for chart axes, where width is scarce. */
export function moneyShort(v: number): string {
  const n = Math.round(v);
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
}

/** Parse a display string back to a number: "1,234.5" → 1234.5, "" → 0. */
export function toNum(s: string | number): number {
  const n = parseFloat(String(s).replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
}

/**
 * Strip a typed string to digits, one decimal point and an optional leading
 * minus. Kept separate from `withCommas` so a controlled input can hold the
 * raw value and render the grouped one.
 */
export function toRaw(s: string | number): string {
  let str = String(s);
  const neg = str.trim().startsWith("-");
  str = str.replace(/[^\d.]/g, "");
  const i = str.indexOf(".");
  if (i !== -1) str = str.slice(0, i + 1) + str.slice(i + 1).replace(/\./g, "");
  return (neg ? "-" : "") + str;
}

/** Group a raw numeric string for display, preserving decimals mid-typing. */
export function withCommas(s: string | number | null | undefined): string {
  if (s === "" || s == null) return "";
  const str = String(s);
  const neg = str.startsWith("-");
  const body = neg ? str.slice(1) : str;
  const hasDot = body.includes(".");
  const [intp, ...rest] = body.split(".");
  const intFmt = (intp || "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + intFmt + (hasDot ? `.${rest.join("")}` : "");
}

/** "Jul 28, 2026" */
export function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Round an axis maximum up to a readable 1/1.5/2/2.5/3/4/5/7.5/10 × 10ⁿ. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m =
    n <= 1 ? 1
    : n <= 1.5 ? 1.5
    : n <= 2 ? 2
    : n <= 2.5 ? 2.5
    : n <= 3 ? 3
    : n <= 4 ? 4
    : n <= 5 ? 5
    : n <= 7.5 ? 7.5
    : 10;
  return m * p;
}
