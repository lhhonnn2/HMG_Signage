"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { renderAlarmLines, DEFAULT_TEMPLATE } from "@/lib/types";
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

const ROTATE_EVERY_MS = 5000; // how long each pair/leftover of overlapping alarms shows before rotating
const TRANSITION_MS = 700;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function alarmStart(a: AlarmRow) {
  return new Date(`${a.alarm_date}T${a.alarm_time}`);
}

function isAlarmActive(a: AlarmRow, now: Date, durationSeconds: number) {
  const start = alarmStart(a);
  const end = new Date(start.getTime() + durationSeconds * 1000);
  return now >= start && now <= end;
}

function timeInWindow(now: Date, startHHMMSS: string, endHHMMSS: string) {
  const [sh, sm] = startHHMMSS.split(":").map(Number);
  const [eh, em] = endHHMMSS.split(":").map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= sh * 60 + sm && nowMin <= eh * 60 + em;
}

function pairsOf<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) out.push(arr.slice(i, i + 2));
  return out;
}

export default function PlayerPage({ params }: { params: { tvId: string } }) {
  const tvId = Number(params.tvId);

  const [images, setImages] = useState<ImageRow[]>([]);
  const [playlist, setPlaylist] = useState<TvPlaylistRow[]>([]);
  const [scheduledSets, setScheduledSets] = useState<ScheduledImageSetRow[]>([]);
  const [settings, setSettings] = useState<TvSettingsRow>({
    tv_id: tvId,
    interval_seconds: 5,
    transition_effect: "cut",
    alarm_duration_seconds: 30
  });
  const [audio, setAudio] = useState<TvAudioRow | null>(null);
  const [alarms, setAlarms] = useState<AlarmRow[]>([]);
  const [alarmSettings, setAlarmSettings] = useState<AlarmSettingsRow>({
    id: 1,
    font_id: null,
    line_font_sizes: [40, 28, 28, 24],
    template: DEFAULT_TEMPLATE
  });
  const [fonts, setFonts] = useState<FontRow[]>([]);
  const [now, setNow] = useState(new Date());
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
    const dataTimer = setInterval(loadData, 60_000);

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
    return [...base, ...extra];
  }, [playlist, scheduledSets, imageMap, now]);

  const activeAlarms = useMemo(
    () => alarms.filter((a) => isAlarmActive(a, now, settings.alarm_duration_seconds)),
    [alarms, now, settings.alarm_duration_seconds]
  );

  useEffect(() => {
    const groupCount = Math.ceil(activeAlarms.length / 2);
    if (groupCount <= 1) {
      setRotateIndex(0);
      return;
    }
    const t = setInterval(() => setRotateIndex((i) => (i + 1) % groupCount), ROTATE_EVERY_MS);
    return () => clearInterval(t);
  }, [activeAlarms.length]);

  const shouldPlayAudio = activeAlarms.length > 0 && !!audio?.audio_enabled && !!audio?.audio_url;
  const activeFont = fonts.find((f) => f.id === alarmSettings.font_id);

  if (activeAlarms.length === 0) {
    return (
      <FullBleed>
        <ImageLoopView images={currentLoopImages} intervalSeconds={settings.interval_seconds} transition={settings.transition_effect} />
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

  const groups = pairsOf(activeAlarms);
  const group = groups[rotateIndex % groups.length];

  return (
    <FullBleed>
      {group.length === 2 ? (
        <div style={{ display: "flex", flexDirection: "column", width: "100vw", height: "100vh" }}>
          <div style={{ width: "100vw", height: "50vh", borderBottom: "1px solid #222" }}>
            <AlarmView alarm={group[0]} settings={alarmSettings} font={activeFont} compact />
          </div>
          <div style={{ width: "100vw", height: "50vh" }}>
            <AlarmView alarm={group[1]} settings={alarmSettings} font={activeFont} compact />
          </div>
        </div>
      ) : (
        <AlarmView alarm={group[0]} settings={alarmSettings} font={activeFont} />
      )}
      {shouldPlayAudio && <LoopAudio src={audio!.audio_url!} />}
    </FullBleed>
  );
}

function FullBleed({ children }: { children: React.ReactNode }) {
  return <div style={{ width: "100vw", height: "100vh", background: "#000", overflow: "hidden", margin: 0 }}>{children}</div>;
}

function ImageLoopView({
  images,
  intervalSeconds,
  transition
}: {
  images: ImageRow[];
  intervalSeconds: number;
  transition: "cut" | "fade" | "slide";
}) {
  const [index, setIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    setIndex(0);
    setPrevIndex(null);
  }, [images.length]);

  useEffect(() => {
    if (images.length <= 1) return;
    const ms = Math.max(1, intervalSeconds) * 1000;
    const t = setInterval(() => {
      setIndex((i) => {
        setPrevIndex(i);
        return (i + 1) % images.length;
      });
    }, ms);
    return () => clearInterval(t);
  }, [images.length, intervalSeconds]);

  useEffect(() => {
    if (prevIndex === null) return;
    setEntered(false);
    const raf = requestAnimationFrame(() => setEntered(true));
    const timeout = setTimeout(() => setPrevIndex(null), TRANSITION_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (images.length === 0) return null;
  const current = images[index % images.length];
  const prev = prevIndex !== null ? images[prevIndex % images.length] : null;

  if (transition === "cut" || !prev) {
    return <img src={current.url} style={{ width: "100vw", height: "100vh", objectFit: "cover" }} alt="" />;
  }

  const baseImgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover"
  };

  const prevStyle: React.CSSProperties =
    transition === "fade"
      ? { ...baseImgStyle, opacity: entered ? 0 : 1, transition: `opacity ${TRANSITION_MS}ms ease` }
      : { ...baseImgStyle, transform: entered ? "translateX(-100%)" : "translateX(0)", transition: `transform ${TRANSITION_MS}ms ease` };

  const currentStyle: React.CSSProperties =
    transition === "fade"
      ? { ...baseImgStyle, opacity: entered ? 1 : 0, transition: `opacity ${TRANSITION_MS}ms ease` }
      : { ...baseImgStyle, transform: entered ? "translateX(0)" : "translateX(100%)", transition: `transform ${TRANSITION_MS}ms ease` };

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <img src={prev.url} style={prevStyle} alt="" />
      <img src={current.url} style={currentStyle} alt="" />
    </div>
  );
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
          <div key={i} style={{ fontFamily, fontSize: Math.max(10, Math.round(size * scale)), fontWeight: i === 0 ? 700 : 500, lineHeight: 1.4 }}>
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
    ref.current?.play().catch(() => {});
  }, [src]);
  return <audio ref={ref} src={src} loop autoPlay style={{ display: "none" }} />;
}
