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
    alarm_duration_seconds: 30,
    frequency_groups: []
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
      .filter((s) => s.weekdays.includes(weekday) && timeInWindow(now, s.start_time, s.end_time))
      .flatMap((s) => s.image_ids.map((id) => imageMap.get(id)).filter(Boolean) as ImageRow[]);
    return [...base, ...extra];
  }, [playlist, scheduledSets, imageMap, now]);

  // Frequency groups: each group contributes exactly one image per full
  // loop lap (rotating through the group's list), appended after the base
  // images. Which image that is for the *current* lap is decided inside
  // ImageLoopView (it tracks the lap count) — here we just resolve each
  // group's image ids to full ImageRow objects.
  const frequencyGroupImages = useMemo(
    () =>
      (settings.frequency_groups || [])
        .map((g) => g.image_ids.map((id) => imageMap.get(id)).filter(Boolean) as ImageRow[])
        .filter((g) => g.length > 0),
    [settings.frequency_groups, imageMap]
  );

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
        <ImageLoopView images={currentLoopImages} groups={frequencyGroupImages} intervalSeconds={settings.interval_seconds} />
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
            <AlarmView alarm={group[0]} settings={alarmSettings} font={activeFont} />
          </div>
          <div style={{ width: "100vw", height: "50vh" }}>
            <AlarmView alarm={group[1]} settings={alarmSettings} font={activeFont} />
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
  return (
    <div style={{ width: "100vw", height: "100vh", background: "#000", overflow: "hidden", margin: 0, position: "relative" }}>
      {children}
      <FullscreenButton />
    </div>
  );
}

// TVs running this in an embedded/kiosk browser usually have no keyboard,
// so F11 isn't an option — this gives a tappable way to enter/exit
// fullscreen. It stays put until you actually go fullscreen; once
// fullscreen, it fades out after a few seconds so it doesn't sit on top of
// the signage, and taps/mouse movement bring it back briefly.
function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleHide() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 4000);
  }

  useEffect(() => {
    function onChange() {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      setVisible(true);
      if (fs) scheduleHide();
      else if (hideTimer.current) clearTimeout(hideTimer.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    function wake() {
      setVisible(true);
      scheduleHide();
    }
    window.addEventListener("mousemove", wake);
    window.addEventListener("touchstart", wake);
    return () => {
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("touchstart", wake);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen]);

  async function toggle() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // some embedded/kiosk browsers don't support the Fullscreen API — nothing more we can do
    }
  }

  return (
    <button
      onClick={toggle}
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 9999,
        padding: "10px 18px",
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.25)",
        background: "rgba(0,0,0,0.55)",
        color: "#fff",
        fontSize: 14,
        cursor: "pointer",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 500ms ease"
      }}
    >
      {isFullscreen ? "전체화면 종료" : "⤢ 전체화면"}
    </button>
  );
}

function ImageLoopView({
  images,
  groups,
  intervalSeconds
}: {
  images: ImageRow[];
  groups: ImageRow[][];
  intervalSeconds: number;
}) {
  const [index, setIndex] = useState(0);
  const [lap, setLap] = useState(0);
  const idKey = images.map((i) => i.id).join(",");
  const groupsKey = groups.map((g) => g.map((i) => i.id).join(",")).join("|");

  // Each frequency group contributes exactly one image for this lap,
  // rotating to the next one every time a full lap completes.
  const fullList = useMemo(() => {
    const picks = groups.filter((g) => g.length > 0).map((g) => g[lap % g.length]);
    return [...images, ...picks];
  }, [images, groups, lap]);

  const fullListKey = fullList.map((i) => i.id).join(",");

  // Preload every image that could appear this lap up front so the browser
  // already has each one cached by the time we swap to it — without this,
  // swapping <img src> to an unfetched URL leaves a blank/black instant
  // while it loads, which is what was showing up as a flash between images.
  useEffect(() => {
    const preloaded = fullList.map((img) => {
      const el = new window.Image();
      el.src = img.url;
      return el;
    });
    return () => {
      preloaded.length = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullListKey]);

  useEffect(() => {
    setIndex(0);
    setLap(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, groupsKey]);

  useEffect(() => {
    if (fullList.length <= 1) return;
    const ms = Math.max(1, intervalSeconds) * 1000;
    const t = setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % fullList.length;
        if (next === 0) setLap((l) => l + 1);
        return next;
      });
    }, ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullList.length, intervalSeconds]);

  if (fullList.length === 0) return null;
  const current = fullList[index % fullList.length];
  return <img src={current.url} style={{ width: "100vw", height: "100vh", objectFit: "cover" }} alt="" />;
}

function AlarmView({
  alarm,
  settings,
  font
}: {
  alarm: AlarmRow;
  settings: AlarmSettingsRow;
  font?: FontRow;
}) {
  const fontFamily = font ? `alarm-font-${font.id}` : "inherit";

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
        padding: "0 24px",
        overflow: "hidden"
      }}
    >
      {font && <style>{`@font-face { font-family: '${fontFamily}'; src: url('${font.url}'); }`}</style>}
      {lines.map((text, i) => {
        const size = settings.line_font_sizes[i] ?? settings.line_font_sizes[settings.line_font_sizes.length - 1] ?? 28;
        return (
          <div key={i} style={{ fontFamily, fontSize: size, fontWeight: i === 0 ? 700 : 500, lineHeight: 1.4 }}>
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
