"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  renderAlarmLines,
  DEFAULT_TEMPLATE
} from "@/lib/types";
import type {
  AlarmRow,
  AlarmSettingsRow,
  FontRow,
  ImageRow,
  ScheduledImageSetRow,
  TvAudioRow,
  TvPlaylistRow,
  TvSettingsRow
} from "@/lib/types";

const ROTATE_EVERY_MS = 5000; // when 3+ alarms overlap, how long each one shows before rotating

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function alarmStart(a: AlarmRow) {
  return new Date(`${a.alarm_date}T${a.alarm_time}`);
}

function isAlarmActive(a: AlarmRow, now: Date) {
  const start = alarmStart(a);
  const end = new Date(start.getTime() + a.duration_seconds * 1000);
  return now >= start && now <= end;
}

function timeInWindow(now: Date, startHHMMSS: string, endHHMMSS: string) {
  const [sh, sm] = startHHMMSS.split(":").map(Number);
  const [eh, em] = endHHMMSS.split(":").map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= sh * 60 + sm && nowMin <= eh * 60 + em;
}

export default function PlayerPage({ params }: { params: { tvId: string } }) {
  const tvId = Number(params.tvId);

  const [images, setImages] = useState<ImageRow[]>([]);
  const [playlist, setPlaylist] = useState<TvPlaylistRow[]>([]);
  const [scheduledSets, setScheduledSets] = useState<ScheduledImageSetRow[]>([]);
  const [settings, setSettings] = useState<TvSettingsRow>({ tv_id: tvId, interval_seconds: 5 });
  const [audio, setAudio] = useState<TvAudioRow | null>(null);
  const [alarms, setAlarms] = useState<AlarmRow[]>([]);
  const [alarmSettings, setAlarmSettings] = useState<AlarmSettingsRow>({
    id: 1,
    font_id: null,
    line_font_sizes: [40, 28, 28, 24],
    duration_seconds: 30,
    template: DEFAULT_TEMPLATE
  });
  const [fonts, setFonts] = useState<FontRow[]>([]);
  const [now, setNow] = useState(new Date());
  const [imgIndex, setImgIndex] = useState(0);
  const [rotateIndex, setRotateIndex] = useState(0);

  async function loadData() {
    const [imgsRes, playlistRes, setsRes, settingsRes, audioRes, fontsRes, alarmsRes, alarmSettingsRes] = await Promise.all([
      supabase.from("images").select("*"),
      supabase.from("tv_playlists").select("*").eq("tv_id", tvId).order("sort_order"),
      supabase.from("scheduled_image_sets").select("*").eq("tv_id", tvId),
      supabase.from("tv_settings").select("*").eq("tv_id", tvId).maybeSingle(),
      supabase.from("tv_audio").select("*").eq("tv_id", tvId).maybeSingle(),
      supabase.from("fonts").select("*"),
      supabase.from("alarms").select("*").eq("alarm_date", todayStr()).eq("tv_id", tvId),
      supabase.from("alarm_settings").select("*").eq("id", 1).maybeSingle()
    ]);

    setImages(imgsRes.data || []);
    setPlaylist(playlistRes.data || []);
    setScheduledSets(setsRes.data || []);
    if (settingsRes.data) setSettings(settingsRes.data as TvSettingsRow);
    setAudio((audioRes.data as TvAudioRow) || null);
    setFonts(fontsRes.data || []);
    setAlarms((alarmsRes.data as AlarmRow[]) || []);
    if (alarmSettingsRes.data) setAlarmSettings(alarmSettingsRes.data as AlarmSettingsRow);
  }

  useEffect(() => {
    loadData();
    const dataTimer = setInterval(loadData, 60_000); // pick up admin changes without manual refresh

    const channel = supabase
      .channel(`tv-${tvId}-updates`)
      .on("postgres_changes", { event: "*", schema: "public", table: "alarms" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "tv_playlists" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "scheduled_image_sets" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "tv_settings" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "tv_audio" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "alarm_settings" }, loadData)
      .subscribe();

    return () => {
      clearInterval(dataTimer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tvId]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const imageMap = useMemo(() => new Map(images.map((i) => [i.id, i])), [images]);

  const currentLoopImages = useMemo(() => {
    const base = playlist.map((p) => imageMap.get(p.image_id)).filter(Boolean) as ImageRow[];
    const weekday = now.getDay();
    const extra = scheduledSets
      .filter((s) => s.weekday === weekday && timeInWindow(now, s.start_time, s.end_time))
      .flatMap((s) => s.image_ids.map((id) => imageMap.get(id)).filter(Boolean) as ImageRow[]);

    const merged = [...base, ...extra];
    const seen = new Set<string>();
    return merged.filter((img) => (seen.has(img.id) ? false : (seen.add(img.id), true)));
  }, [playlist, scheduledSets, imageMap, now]);

  useEffect(() => {
    if (currentLoopImages.length === 0) return;
    const ms = Math.max(1, settings.interval_seconds) * 1000;
    const t = setInterval(() => {
      setImgIndex((i) => (i + 1) % currentLoopImages.length);
    }, ms);
    return () => clearInterval(t);
  }, [currentLoopImages.length, settings.interval_seconds]);

  useEffect(() => {
    setImgIndex(0);
  }, [currentLoopImages.length]);

  const activeAlarms = useMemo(() => alarms.filter((a) => isAlarmActive(a, now)), [alarms, now]);

  useEffect(() => {
    if (activeAlarms.length <= 2) {
      setRotateIndex(0);
      return;
    }
    const t = setInterval(() => {
      setRotateIndex((i) => (i + 1) % activeAlarms.length);
    }, ROTATE_EVERY_MS);
    return () => clearInterval(t);
  }, [activeAlarms.length]);

  const shouldPlayAudio = activeAlarms.length > 0 && !!audio?.audio_enabled && !!audio?.audio_url;
  const activeFont = fonts.find((f) => f.id === alarmSettings.font_id);

  if (activeAlarms.length === 0) {
    const img = currentLoopImages[imgIndex % Math.max(1, currentLoopImages.length)];
    return (
      <FullBleed>
        {img ? <img src={img.url} style={{ width: "100vw", height: "100vh", objectFit: "cover" }} alt="" /> : null}
      </FullBleed>
    );
  }

  if (activeAlarms.length === 1) {
    return (
      <FullBleed>
        <AlarmView alarm={activeAlarms[0]} settings={alarmSettings} font={activeFont} />
        {shouldPlayAudio && <LoopAudio src={audio!.audio_url!} />}
      </FullBleed>
    );
  }

  if (activeAlarms.length === 2) {
    return (
      <FullBleed>
        <div style={{ display: "flex", width: "100vw", height: "100vh" }}>
          <div style={{ width: "50vw", height: "100vh", borderRight: "1px solid #222" }}>
            <AlarmView alarm={activeAlarms[0]} settings={alarmSettings} font={activeFont} compact />
          </div>
          <div style={{ width: "50vw", height: "100vh" }}>
            <AlarmView alarm={activeAlarms[1]} settings={alarmSettings} font={activeFont} compact />
          </div>
        </div>
        {shouldPlayAudio && <LoopAudio src={audio!.audio_url!} />}
      </FullBleed>
    );
  }

  const current = activeAlarms[rotateIndex % activeAlarms.length];
  return (
    <FullBleed>
      <AlarmView alarm={current} settings={alarmSettings} font={activeFont} />
      {shouldPlayAudio && <LoopAudio src={audio!.audio_url!} />}
    </FullBleed>
  );
}

function FullBleed({ children }: { children: React.ReactNode }) {
  return <div style={{ width: "100vw", height: "100vh", background: "#000", overflow: "hidden", margin: 0 }}>{children}</div>;
}

function AlarmView({
  alarm,
  settings,
  font,
  compact
}: {
  alarm: AlarmRow;
  settings: AlarmSettingsRow;
  font?: FontRow;
  compact?: boolean;
}) {
  const fontFamily = font ? `alarm-font-${font.id}` : "inherit";
  const scale = compact ? 0.55 : 1;

  const lines = renderAlarmLines(settings.template, {
    program_name: alarm.program_name,
    location: alarm.location,
    scheduled_time: alarm.scheduled_time.slice(0, 5)
  });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#000",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        textAlign: "center",
        padding: "0 24px"
      }}
    >
      {font && <style>{`@font-face { font-family: '${fontFamily}'; src: url('${font.url}'); }`}</style>}
      {lines.map((text, i) => {
        const size = settings.line_font_sizes[i] ?? settings.line_font_sizes[settings.line_font_sizes.length - 1] ?? 28;
        return (
          <div
            key={i}
            style={{
              fontFamily,
              fontSize: Math.max(10, Math.round(size * scale)),
              fontWeight: i === 0 ? 700 : 500,
              lineHeight: 1.4
            }}
          >
            {text}
          </div>
        );
      })}
    </div>
  );
}

function LoopAudio({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    ref.current?.play().catch(() => {
      // autoplay blocked until the browser registers a user gesture once —
      // kiosk browsers are typically launched with autoplay allowed
    });
  }, [src]);
  return <audio ref={ref} src={src} loop autoPlay style={{ display: "none" }} />;
}
