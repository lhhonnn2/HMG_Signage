export type ImageRow = {
  id: string;
  filename: string;
  url: string;
  created_at: string;
};

export type ImageTemplateRow = {
  id: string;
  name: string;
  image_ids: string[]; // ordered, may contain duplicates
};

export type FontRow = {
  id: string;
  name: string;
  url: string;
};

export type TransitionEffect = "cut" | "fade" | "slide";

export type TvSettingsRow = {
  tv_id: number;
  interval_seconds: number;
  transition_effect: TransitionEffect;
  alarm_duration_seconds: number;
};

export type TvPlaylistRow = {
  id: string;
  tv_id: number;
  image_id: string;
  sort_order: number;
};

export type ScheduledImageSetRow = {
  id: string;
  tv_id: number;
  weekday: number; // 0=Sun ... 6=Sat
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
