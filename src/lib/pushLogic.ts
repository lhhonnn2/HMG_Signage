// Pure logic for phone push notifications (no network, easy to test).
import { catMatches, type CatInfo } from "./facets";

export type TimetableRow = {
  alarm_date: string; // YYYY-MM-DD (Korean local)
  start_time: string; // HH:MM[:SS]
  program_name: string;
  location: string;
};

export type PushSub = {
  id: string;
  divisions: string[];
  brands: string[];
  category_names: string[];
  excluded_programs: string[];
  extra_programs: string[];
  lead_minutes: number;
};

export function normalizeProgram(s: string) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function toSec(t: string) {
  const [h, m, s] = t.split(":").map((x) => Number(x));
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

// Absolute epoch-ms of a Korean-local date + time.
export function epochMsKst(date: string, time: string) {
  const [y, mo, d] = date.split("-").map(Number);
  return Date.UTC(y, mo - 1, d) + toSec(time) * 1000 - 9 * 3600 * 1000;
}

// "Now" in Korea as date strings (today / tomorrow), regardless of server timezone.
export function kstDates(nowMs: number) {
  const p = (n: number) => String(n).padStart(2, "0");
  const fmt = (ms: number) => {
    const d = new Date(ms + 9 * 3600 * 1000);
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  };
  return { today: fmt(nowMs), tomorrow: fmt(nowMs + 24 * 3600 * 1000) };
}

export function buildMessage(a: { program_name: string; location: string; lead: number }) {
  const name = normalizeProgram(a.program_name) || "프로그램";
  const loc = normalizeProgram(a.location);
  const head = `${name} 시작 ${a.lead}분 전 입니다.`;
  return { title: "시작 알림", body: loc ? `${head} ${loc}로 와주세요.` : head };
}

// Does this phone want this program? Per-program choices (by name) beat categories.
export function wantsProgram(sub: PushSub, programName: string, cat: CatInfo | null | undefined) {
  const key = normalizeProgram(programName);
  if (sub.excluded_programs.includes(key)) return false;
  if (sub.extra_programs.includes(key)) return true;
  if (!cat) return false;
  return catMatches(cat, { divisions: sub.divisions, brands: sub.brands, names: sub.category_names });
}

export function dedupeKey(r: TimetableRow, lead: number) {
  return [r.alarm_date, r.start_time.slice(0, 5), normalizeProgram(r.program_name), normalizeProgram(r.location), lead].join("|");
}

// One entry per (phone, timetable row) whose notification time (start − lead)
// fell within the last `windowSec`.
export function planSends(
  rows: TimetableRow[],
  subs: PushSub[],
  catByProgram: Map<string, CatInfo>,
  nowMs: number,
  windowSec = 180
) {
  const out: { sub: PushSub; key: string; row: TimetableRow }[] = [];
  const seen = new Set<string>();
  for (const sub of subs) {
    const lead = sub.lead_minutes > 0 ? sub.lead_minutes : 5;
    for (const row of rows) {
      const at = epochMsKst(row.alarm_date, row.start_time) - lead * 60 * 1000;
      if (!(at <= nowMs && nowMs < at + windowSec * 1000)) continue;
      if (!wantsProgram(sub, row.program_name, catByProgram.get(normalizeProgram(row.program_name)))) continue;
      const key = dedupeKey(row, lead);
      const id = `${sub.id}#${key}`;
      if (seen.has(id)) continue; // same program listed twice at the same time
      seen.add(id);
      out.push({ sub, key, row });
    }
  }
  return out;
}
