"use client";

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";
import type { AlarmRow, FontRow, LineFontSizes } from "@/lib/types";

const TV_IDS = [1, 2, 3, 4, 5];
const DEFAULT_SIZES: LineFontSizes = { line1: 40, line2: 28, line3: 28, line4: 24 };

export default function AlarmsPage() {
  const [alarms, setAlarms] = useState<AlarmRow[]>([]);
  const [fonts, setFonts] = useState<FontRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [programName, setProgramName] = useState("");
  const [location, setLocation] = useState("");
  const [duration, setDuration] = useState(30);
  const [fontId, setFontId] = useState<string>("");
  const [sizes, setSizes] = useState<LineFontSizes>(DEFAULT_SIZES);
  const [tvIds, setTvIds] = useState<number[]>([1, 2, 3, 4, 5]);

  async function load() {
    const { data: al } = await supabase.from("alarms").select("*").order("alarm_date").order("start_time");
    setAlarms(al || []);
    const { data: f } = await supabase.from("fonts").select("*").order("name");
    setFonts(f || []);
  }

  useEffect(() => {
    load();
  }, []);

  function toggleTv(id: number) {
    setTvIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function add() {
    if (!date || !startTime || !programName || !location || tvIds.length === 0) {
      alert("날짜, 시작시간, 프로그램명, 장소, 송출 TV를 모두 입력해주세요");
      return;
    }
    await supabase.from("alarms").insert({
      alarm_date: date,
      start_time: `${startTime}:00`,
      program_name: programName,
      location,
      duration_seconds: duration,
      font_id: fontId || null,
      line_font_sizes: sizes,
      tv_ids: tvIds
    });
    setProgramName("");
    setLocation("");
    await load();
  }

  async function remove(id: string) {
    await supabase.from("alarms").delete().eq("id", id);
    await load();
  }

  async function onExcelFile(file: File) {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const toInsert = rows.map((row) => {
        const tvField = String(row["TV"] ?? row["tv"] ?? "1,2,3,4,5");
        const tv_ids = tvField
          .split(/[,\s]+/)
          .filter(Boolean)
          .map((n: string) => Number(n))
          .filter((n: number) => TV_IDS.includes(n));

        return {
          alarm_date: String(row["날짜"] ?? row["date"]).trim(),
          start_time: normalizeTime(String(row["시작시간"] ?? row["start_time"])),
          program_name: String(row["프로그램명"] ?? row["program_name"] ?? ""),
          location: String(row["장소"] ?? row["location"] ?? ""),
          duration_seconds: Number(row["노출시간(초)"] ?? row["duration_seconds"] ?? 30),
          line_font_sizes: {
            line1: Number(row["줄1크기"] ?? 40),
            line2: Number(row["줄2크기"] ?? 28),
            line3: Number(row["줄3크기"] ?? 28),
            line4: Number(row["줄4크기"] ?? 24)
          },
          tv_ids: tv_ids.length > 0 ? tv_ids : [1, 2, 3, 4, 5]
        };
      });

      const { error } = await supabase.from("alarms").insert(toInsert);
      if (error) throw error;

      alert(`${toInsert.length}건 등록되었습니다`);
      await load();
    } catch (e: any) {
      alert("엑셀 업로드 중 오류: " + e.message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function downloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      {
        날짜: "2026-09-20",
        시작시간: "10:00",
        프로그램명: "오프로드 체험",
        장소: "1번 트랙 앞",
        "노출시간(초)": 30,
        TV: "1,2,3",
        줄1크기: 40,
        줄2크기: 28,
        줄3크기: 28,
        줄4크기: 24
      }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "알람스케줄");
    XLSX.writeFile(wb, "알람스케줄_템플릿.xlsx");
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>알람 스케줄</h1>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>엑셀로 일괄 등록</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" disabled={importing} />
          <button
            className="btn"
            disabled={importing}
            onClick={() => fileRef.current?.files?.[0] && onExcelFile(fileRef.current.files[0])}
          >
            {importing ? "업로드 중..." : "업로드"}
          </button>
          <button className="btn btn-outline" onClick={downloadTemplate}>
            템플릿 다운로드
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontWeight: 600 }}>직접 입력</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div>
            <label className="label">날짜</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">시작 시간</label>
            <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <label className="label">노출 시간(초)</label>
            <input
              className="input"
              type="number"
              style={{ width: 100 }}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label className="label">프로그램명</label>
            <input className="input" value={programName} onChange={(e) => setProgramName(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label className="label">장소</label>
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">송출 TV</label>
          <div style={{ display: "flex", gap: 10 }}>
            {TV_IDS.map((id) => (
              <label key={id} style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 4 }}>
                <input type="checkbox" checked={tvIds.includes(id)} onChange={() => toggleTv(id)} />
                TV {id}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="label">폰트</label>
          <select className="input" value={fontId} onChange={(e) => setFontId(e.target.value)}>
            <option value="">기본 폰트</option>
            {fonts.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">줄별 글자 크기 (px)</label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["line1", "line2", "line3", "line4"] as const).map((key, i) => (
              <div key={key}>
                <div style={{ fontSize: 11, color: "#6b7280" }}>{i + 1}번째 줄</div>
                <input
                  className="input"
                  type="number"
                  style={{ width: 70 }}
                  value={sizes[key]}
                  onChange={(e) => setSizes((s) => ({ ...s, [key]: Number(e.target.value) }))}
                />
              </div>
            ))}
          </div>
        </div>

        <button className="btn" style={{ width: 160 }} onClick={add}>
          알람 추가
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {alarms.map((a) => (
          <div key={a.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 14 }}>
              {a.alarm_date} {a.start_time.slice(0, 5)} · {a.program_name} · {a.location} · {a.duration_seconds}초 · TV{" "}
              {a.tv_ids.join(",")}
            </div>
            <button className="btn btn-outline" onClick={() => remove(a.id)}>
              삭제
            </button>
          </div>
        ))}
        {alarms.length === 0 && <div style={{ color: "#6b7280", fontSize: 14 }}>등록된 알람이 없습니다.</div>}
      </div>
    </div>
  );
}

function normalizeTime(v: string): string {
  const trimmed = v.trim();
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  // Excel sometimes stores times as a fraction of a day
  const asNumber = Number(trimmed);
  if (!Number.isNaN(asNumber) && asNumber > 0 && asNumber < 1) {
    const totalSeconds = Math.round(asNumber * 24 * 60 * 60);
    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const s = String(totalSeconds % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }
  return "00:00:00";
}
