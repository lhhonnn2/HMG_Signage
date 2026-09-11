export type ImageRow = {
  id: string;
  filename: string;
  url: string;
  created_at: string;
};

export type FontRow = {
  id: string;
  name: string;
  url: string;
};

export type TvSettingsRow = {
  tv_id: number;
  interval_seconds: number;
};

export type TvPlaylistRow = {
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

export type LineFontSizes = {
  line1: number;
  line2: number;
  line3: number;
  line4: number;
};

export type AlarmRow = {
  id: string;
  alarm_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  program_name: string;
  location: string;
  duration_seconds: number;
  font_id: string | null;
  line_font_sizes: LineFontSizes;
  tv_ids: number[];
};

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
