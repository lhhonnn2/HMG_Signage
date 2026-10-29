// Data-loading helpers for the TV player (/player/[tvId]).
//
// Goal: the player must keep playing when the data server (Supabase) is
// down. Two rules make that work:
//   1. A query result only replaces what's on screen when it SUCCEEDED.
//      A failed/timed-out query keeps the previous value (never blanks it).
//   2. The last good snapshot is saved in the TV browser's localStorage and
//      loaded first on startup, so a reload during an outage still plays.
//
// Everything here is plain functions (no React) so it can be unit-tested.

import type {
  AlarmRow,
  AlarmSettingsRow,
  FontRow,
  ImageRow,
  ScheduledImageSetRow,
  TvAudioRow,
  TvSettingsRow
} from "./types";

export type PlayerSnapshot = {
  images: ImageRow[];
  scheduledSets: ScheduledImageSetRow[];
  settings: TvSettingsRow | null;
  audio: TvAudioRow | null;
  alarms: AlarmRow[];
  fonts: FontRow[];
  alarmSettings: AlarmSettingsRow | null;
};

// The shape supabase-js returns: { data, error }. `null` means the request
// threw or timed out before any answer came back.
export type QueryResult<T> = { data: T | null; error: unknown } | null;

export type RawResults = {
  images: QueryResult<ImageRow[]>;
  scheduledSets: QueryResult<ScheduledImageSetRow[]>;
  settings: QueryResult<TvSettingsRow>;
  audio: QueryResult<TvAudioRow>;
  alarms: QueryResult<AlarmRow[]>;
  fonts: QueryResult<FontRow[]>;
  alarmSettings: QueryResult<AlarmSettingsRow>;
};

export function emptySnapshot(): PlayerSnapshot {
  return {
    images: [],
    scheduledSets: [],
    settings: null,
    audio: null,
    alarms: [],
    fonts: [],
    alarmSettings: null
  };
}

function ok<T>(r: QueryResult<T>): r is { data: T | null; error: null } {
  return !!r && !r.error;
}

// Apply fresh query results on top of the previous snapshot. Each piece is
// replaced only if its own query succeeded; otherwise the previous value
// (same object reference) is kept. Returns how many queries succeeded.
export function mergeResults(prev: PlayerSnapshot, r: RawResults): { next: PlayerSnapshot; okCount: number; failCount: number } {
  let okCount = 0;
  let failCount = 0;
  const count = (good: boolean) => (good ? okCount++ : failCount++);

  const next: PlayerSnapshot = { ...prev };

  count(ok(r.images));
  if (ok(r.images)) next.images = r.images.data ?? [];

  count(ok(r.scheduledSets));
  if (ok(r.scheduledSets)) next.scheduledSets = r.scheduledSets.data ?? [];

  count(ok(r.alarms));
  if (ok(r.alarms)) next.alarms = r.alarms.data ?? [];

  count(ok(r.fonts));
  if (ok(r.fonts)) next.fonts = r.fonts.data ?? [];

  // Single-row tables. For settings / alarm_settings a missing row keeps the
  // previous (or default) value — same behavior as before this change.
  count(ok(r.settings));
  if (ok(r.settings) && r.settings.data) next.settings = r.settings.data;

  count(ok(r.alarmSettings));
  if (ok(r.alarmSettings) && r.alarmSettings.data) next.alarmSettings = r.alarmSettings.data;

  // No audio row simply means "no audio configured" — that's a real answer.
  count(ok(r.audio));
  if (ok(r.audio)) next.audio = r.audio.data ?? null;

  return { next, okCount, failCount };
}

// ---- timeouts ------------------------------------------------------------

// Resolve with the query's result, or `null` if it throws or takes longer
// than `ms`. (A hung request must not stall the whole refresh loop.)
export async function safeQuery<T>(query: PromiseLike<QueryResult<T>>, ms = 15000): Promise<QueryResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([Promise.resolve(query).catch(() => null), timeout]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Runs `fn` one at a time. If it's triggered again while running, it runs
// once more right after (so a burst of realtime events never overlaps
// requests but also never gets dropped).
export function createSerializedRunner(fn: () => Promise<void>) {
  let running = false;
  let again = false;
  return async function run() {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        await fn();
      } while (again);
    } finally {
      running = false;
    }
  };
}

// ---- local snapshot cache -----------------------------------------------

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const CACHE_VERSION = 1;

export function cacheKey(tvId: number) {
  return `signage-snapshot-v${CACHE_VERSION}-tv${tvId}`;
}

export function serializeSnapshot(snap: PlayerSnapshot): string {
  return JSON.stringify({ v: CACHE_VERSION, savedAt: Date.now(), snap });
}

export function saveSnapshot(storage: StorageLike | undefined, tvId: number, serialized: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(cacheKey(tvId), serialized);
    return true;
  } catch {
    return false; // quota exceeded / private mode — playback must not depend on it
  }
}

function isArr(x: unknown): x is unknown[] {
  return Array.isArray(x);
}

export function loadSnapshot(storage: StorageLike | undefined, tvId: number): PlayerSnapshot | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(cacheKey(tvId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== CACHE_VERSION || !parsed.snap) return null;
    const s = parsed.snap;
    if (!isArr(s.images) || !isArr(s.scheduledSets) || !isArr(s.alarms) || !isArr(s.fonts)) return null;
    return {
      images: s.images,
      scheduledSets: s.scheduledSets,
      settings: s.settings && typeof s.settings === "object" ? s.settings : null,
      audio: s.audio && typeof s.audio === "object" ? s.audio : null,
      alarms: s.alarms,
      fonts: s.fonts,
      alarmSettings: s.alarmSettings && typeof s.alarmSettings === "object" ? s.alarmSettings : null
    } as PlayerSnapshot;
  } catch {
    return null;
  }
}

// ---- alarm date window ---------------------------------------------------

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Alarms are fetched for today plus the next few days (instead of today
// only) so that an outage lasting past midnight still has tomorrow
// morning's alarms available from the saved snapshot.
export function alarmDateRange(now: Date, extraDays = 3): { from: string; to: string } {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + extraDays);
  return { from: ymd(now), to: ymd(end) };
}
