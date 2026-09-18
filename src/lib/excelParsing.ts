// Parses date/time values out of cells read via XLSX.utils.sheet_to_json.
//
// IMPORTANT: callers must read the workbook WITHOUT `cellDates: true`
// (i.e. `XLSX.read(buf, { type: "array" })`, no cellDates option). With
// cellDates enabled, SheetJS converts date/time-formatted cells into JS
// Date objects itself — and for cells that sit on Excel's 1899-12-30
// epoch (which is every pure time-of-day cell, and the basis for the
// whole serial-date system), that conversion can go through a local-
// timezone-aware code path. In the Asia/Seoul timezone specifically,
// JavaScript's tz database resolves *December 1899* to Korea's old Local
// Mean Time offset (~+8:27:52) rather than today's +9:00, because that's
// what was historically in effect — so every date/time silently comes out
// ~32 minutes and/or a timezone's worth off. This bit an admin uploading
// a schedule from a Korean browser: times and dates both came out wrong.
//
// Reading raw (no cellDates) gives us plain numeric Excel serials instead,
// which we convert ourselves below using `new Date(milliseconds)` — the
// single-argument form, which is always a pure UTC point in time with no
// timezone or historical-calendar lookup involved. That sidesteps the bug
// entirely. The `instanceof Date` branches below are kept only as a
// harmless fallback for callers that end up with a real Date some other way.

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function normalizeDateCell(v: any): string {
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  }
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}[./]\d{1,2}[./]\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split(/[./]/).map(Number);
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  if (/^\d+(\.\d+)?$/.test(s)) {
    // Excel serial date (days since 1899-12-30, matching Excel's own — buggy — epoch)
    const serial = Number(s);
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())}`;
  }
  return s; // let Supabase reject it clearly rather than silently guessing
}

export function normalizeTimeCell(v: any): string {
  if (v instanceof Date) {
    return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
  }
  const s = String(v ?? "").trim();
  if (/^\d{1,2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return s;
  const asNumber = Number(s);
  if (!Number.isNaN(asNumber) && asNumber >= 0) {
    // Excel time-of-day serial: fractional part is the time; a value >= 1
    // means the cell also carries a date, so we only care about what's
    // left after dropping whole days.
    const fraction = asNumber - Math.floor(asNumber);
    const totalSeconds = Math.round(fraction * 24 * 60 * 60);
    return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor((totalSeconds % 3600) / 60))}:${pad(totalSeconds % 60)}`;
  }
  return "09:00:00";
}

// Subtracts `minutes` from an "HH:MM:SS" time string, wrapping around
// midnight if needed (e.g. 00:03:00 minus 5 minutes -> 23:58:00).
export function subtractMinutes(time: string, minutes: number): string {
  const [h, m, s] = time.split(":").map(Number);
  let total = h * 60 + m - minutes;
  total = ((total % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}:${pad(s || 0)}`;
}
