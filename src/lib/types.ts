export type ImageRow = {
  id: string;
  filename: string;
  url: string;
  thumbnail_url: string | null;
  created_at: string;
};

export type TvRow = {
  id: number;
  name: string;
};

// A frequency group is defined separately from where it sits in a
// playlist — its `id` is referenced by a PlaylistEntry of type "group" so
// it can be dragged around and positioned anywhere in the list, just like
// a single image.
export type FrequencyGroup = {
  id: string;
  image_ids: string[]; // rotates one image per full loop lap
};

export type PlaylistImageEntry = { id: string; type: "image"; image_id: string };
export type PlaylistGroupEntry = { id: string; type: "group"; group_id: string };
export type PlaylistEntry = PlaylistImageEntry | PlaylistGroupEntry;

export type ImageTemplateRow = {
  id: string;
  name: string;
  entries: PlaylistEntry[];
  frequency_groups: FrequencyGroup[];
};

export type FontRow = {
  id: string;
  name: string;
  url: string;
};

export type TvSettingsRow = {
  tv_id: number;
  interval_seconds: number;
  alarm_duration_seconds: number;
  playlist_entries: PlaylistEntry[];
  frequency_groups: FrequencyGroup[];
};

export type ScheduledImageSetRow = {
  id: string;
  tv_id: number;
  weekdays: number[]; // 0=Sun ... 6=Sat, can be several days at once
  start_time: string; // HH:MM:SS
  end_time: string; // HH:MM:SS
  image_ids: string[];
};

export type TvAudioRow = {
  tv_id: number;
  audio_url: string | null;
  audio_enabled: boolean;
};

export type AlarmRow = {
  id: string;
  tv_id: number;
  alarm_date: string; // YYYY-MM-DD
  alarm_time: string; // HH:MM:SS — when the alarm screen starts showing
  scheduled_time: string; // HH:MM:SS — the announced program start time shown in the text
  program_name: string;
  location: string;
};

export type AlarmSettingsRow = {
  id: number;
  font_id: string | null;
  line_font_sizes: number[];
  template: string;
};

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
export const TV_IDS = [1, 2, 3, 4, 5];

export const DEFAULT_TEMPLATE = `ANNOUNCEMENT
[프로그램명],[장소]에서 시작됩니다.
해당 장소 앞으로 이동해주세요.
시작 시간 : [시작시간]`;

export function renderAlarmLines(
  template: string,
  vars: { program_name: string; location: string; scheduled_time: string }
): string[] {
  return template.split("\n").map((line) =>
    line
      .replaceAll("[프로그램명]", vars.program_name)
      .replaceAll("[장소]", vars.location)
      .replaceAll("[시작시간]", vars.scheduled_time)
  );
}

// Small random id for client-generated entries/groups (not a DB primary
// key — just needs to be unique within one playlist/template).
export function newLocalId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
