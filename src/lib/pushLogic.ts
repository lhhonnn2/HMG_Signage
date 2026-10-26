// Pure logic for phone push notifications (no network, easy to test).

export type PushAlarm = {
  source: "tv" | "phone";
  group: number | string; // tv_id (tv) or category_id (phone)
  alarm_date: string; // YYYY-MM-DD
  alarm_time: string; // HH:MM[:SS]
  scheduled_time: string; // HH:MM[:SS]
  program_name: string;
  location: string;
};

export type PushSub = {
  id: string;
  tv_ids: number[];
  category_ids: string[];
};

function toSec(t: string) {
  const [h, m, s] = t.split(":").map((x) => Number(x));
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

// Minutes between the alarm and the announced start, rounded.
export function minutesBefore(alarm_time: string, scheduled_time: string): number {
  return Math.round((toSec(scheduled_time) - toSec(alarm_time)) / 60);
}

export function buildMessage(a: Pick<PushAlarm, "program_name" | "location" | "alarm_time" | "scheduled_time">) {
  const name = (a.program_name || "").trim() || "프로그램";
  const loc = (a.location || "").trim();
  const n = minutesBefore(a.alarm_time, a.scheduled_time);
  const head = n > 0 ? `${name} 시작 ${n}분 전 입니다.` : `${name} 곧 시작됩니다.`;
  const body = loc ? `${head} ${loc}로 와주세요.` : head;
  return { title: "시작 알림", body };
}

// Same program announced on several TVs / categories must reach a phone once.
export function dedupeKey(a: PushAlarm) {
  return [a.alarm_date, a.alarm_time.slice(0, 5), a.scheduled_time.slice(0, 5), a.program_name.trim(), a.location.trim()].join("|");
}

// "Now" in Korea (UTC+9) as comparable parts, regardless of server timezone.
export function kstParts(nowMs: number) {
  const d = new Date(nowMs + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  const y = new Date(nowMs + 9 * 3600 * 1000 - 24 * 3600 * 1000);
  const yesterday = `${y.getUTCFullYear()}-${p(y.getUTCMonth() + 1)}-${p(y.getUTCDate())}`;
  return { date, yesterday, secOfDay: d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds() };
}

// Absolute epoch-ms of an alarm interpreted as Korean local time.
export function alarmEpochMs(date: string, time: string) {
  const [y, mo, d] = date.split("-").map(Number);
  return Date.UTC(y, mo - 1, d) + toSec(time) * 1000 - 9 * 3600 * 1000;
}

// Alarms that should go out now: started within the last `windowSec`.
export function dueAlarms(alarms: PushAlarm[], nowMs: number, windowSec = 180) {
  return alarms.filter((a) => {
    const t = alarmEpochMs(a.alarm_date, a.alarm_time);
    return t <= nowMs && nowMs < t + windowSec * 1000;
  });
}

export function recipientsFor(alarm: PushAlarm, subs: PushSub[]): PushSub[] {
  return subs.filter((s) =>
    alarm.source === "tv" ? s.tv_ids.includes(Number(alarm.group)) : s.category_ids.includes(String(alarm.group))
  );
}

// One entry per (subscription, dedupe key), merging TV + phone sources.
export function planSends(alarms: PushAlarm[], subs: PushSub[]) {
  const out = new Map<string, { sub: PushSub; key: string; alarm: PushAlarm }>();
  for (const a of alarms) {
    const key = dedupeKey(a);
    for (const s of recipientsFor(a, subs)) {
      const k = `${s.id}#${key}`;
      if (!out.has(k)) out.set(k, { sub: s, key, alarm: a });
    }
  }
  return Array.from(out.values());
}
