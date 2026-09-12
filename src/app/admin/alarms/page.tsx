"use client";

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";
import type { AlarmRow, AlarmSettingsRow } from "@/lib/types";
import { TV_IDS } from "@/lib/types";

export default function AlarmsPage() {
  const [activeTv, setActiveTv] = useState(1);
  const [rows, setRows] = useState<AlarmRow[]>([]);
  const [defaultDuration, setDefaultDuration] = useState(30);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("alarms")
      .select("*")
      .eq("tv_id", activeTv)
      .order("alarm_date")
      .order("alarm_time");
    setRows((data as AlarmRow[]) || []);

    const { data: settings } = await supabase.from("alarm_settings").select("*").eq("id", 1).maybeSingle();
    setDefaultDuration((settings as AlarmSettingsRow | null)?.duration_seconds ?? 30);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTv]);

  function updateLocal(id: string, patch: Partial<AlarmRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function commit(id: string, patch: Partial<AlarmRow>) {
    await supabase.from("alarms").update(patch).eq("id", id);
  }

  async function addRow() {
    setAdding(true);
    try {
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
        today.getDate()
      ).padStart(2, "0")}`;
      const { data, error } = await supabase
        .from("alarms")
        .insert({
          tv_id: activeTv,
          alarm_date: dateStr,
          alarm_time: "09:00:00",
          scheduled_time: "09:00:00",
          program_name: "",
          location: "",
          duration_seconds: defaultDuration
        })
        .select()
        .single();
      if (error) throw error;
      setRows((prev) => [...prev, data as AlarmRow]);
    } finally {
      setAdding(false);
    }
  }

  async function removeRow(id: string) {
    if (!confirm("이 알람을 삭제할까요?")) return;
    await supabase.from("alarms").delete().eq("id", id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function onExcelFile(file: File) {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const excelRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const toInsert = excelRows.map((row) => ({
        tv_id: activeTv,
        alarm_date: String(row["날짜"] ?? "").trim(),
        alarm_time: normalizeTime(String(row["알람시각"] ?? "")),
        scheduled_time: normalizeTime(String(row["시작예정시각"] ?? "")),
        program_name: String(row["프로그램명"] ?? ""),
        location: String(row["렉처룸"] ?? row["장소"] ?? ""),
        duration_seconds: defaultDuration
      }));

      const { error } = await supabase.from("alarms").insert(toInsert);
      if (error) throw error;

      alert(`TV ${activeTv}에 ${toInsert.length}건 등록되었습니다`);
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
        알람시각: "9:50",
        시작예정시각: "10:00",
        프로그램명: "오프로드 체험",
        렉처룸: "1번 트랙 앞"
      }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `TV${activeTv} 알람`);
    XLSX.writeFile(wb, `알람스케줄_템플릿.xlsx`);
  }

  return (
    <div>
      <div className="page-title">알람 스케줄</div>
      <div className="page-subtitle">TV별로 완전히 독립된 알람 목록입니다. 표를 엑셀처럼 바로 편집할 수 있습니다.</div>

      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {TV_IDS.map((id) => (
          <button key={id} className="chip" data-active={activeTv === id} onClick={() => setActiveTv(id)}>
            TV {id}
          </button>
        ))}
        <a className="chip" href={`/player/${activeTv}`} target="_blank" rel="noreferrer" style={{ marginLeft: "auto" }}>
          TV {activeTv} 화면 미리보기 ↗
        </a>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>TV {activeTv} — 엑셀로 일괄 등록</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" disabled={importing} />
          <button
            className="btn btn-accent"
            disabled={importing}
            onClick={() => fileRef.current?.files?.[0] && onExcelFile(fileRef.current.files[0])}
          >
            {importing ? "업로드 중..." : "업로드"}
          </button>
          <button className="btn btn-outline" onClick={downloadTemplate}>
            템플릿 다운로드
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
          엑셀 열: 날짜 · 알람시각 · 시작예정시각 · 프로그램명 · 렉처룸. TV와 글자 크기/폰트는 여기서(현재 선택된 TV {activeTv})와
          "알람 서식 설정"에서 각각 적용되므로 엑셀에는 넣지 않습니다.
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 600 }}>TV {activeTv} 알람 목록</div>
          <button className="btn btn-accent" disabled={adding} onClick={addRow}>
            {adding ? "추가 중..." : "+ 알람 추가"}
          </button>
        </div>

        <table className="grid-table">
          <thead>
            <tr>
              <th style={{ width: 130 }}>날짜</th>
              <th style={{ width: 100 }}>알람시각</th>
              <th style={{ width: 100 }}>시작예정시각</th>
              <th>프로그램명</th>
              <th>장소(렉처룸)</th>
              <th style={{ width: 90 }}>노출(초)</th>
              <th style={{ width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <input
                    type="date"
                    value={r.alarm_date}
                    onChange={(e) => updateLocal(r.id, { alarm_date: e.target.value })}
                    onBlur={(e) => commit(r.id, { alarm_date: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    value={r.alarm_time.slice(0, 5)}
                    onChange={(e) => updateLocal(r.id, { alarm_time: `${e.target.value}:00` })}
                    onBlur={(e) => commit(r.id, { alarm_time: `${e.target.value}:00` })}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    value={r.scheduled_time.slice(0, 5)}
                    onChange={(e) => updateLocal(r.id, { scheduled_time: `${e.target.value}:00` })}
                    onBlur={(e) => commit(r.id, { scheduled_time: `${e.target.value}:00` })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={r.program_name}
                    onChange={(e) => updateLocal(r.id, { program_name: e.target.value })}
                    onBlur={(e) => commit(r.id, { program_name: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={r.location}
                    onChange={(e) => updateLocal(r.id, { location: e.target.value })}
                    onBlur={(e) => commit(r.id, { location: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={r.duration_seconds}
                    onChange={(e) => updateLocal(r.id, { duration_seconds: Number(e.target.value) })}
                    onBlur={(e) => commit(r.id, { duration_seconds: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <button className="btn btn-danger" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => removeRow(r.id)}>
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div style={{ color: "var(--muted)", fontSize: 14, padding: "16px 4px" }}>
            TV {activeTv}에 등록된 알람이 없습니다. "+ 알람 추가"를 눌러 시작하세요.
          </div>
        )}
      </div>
    </div>
  );
}

function normalizeTime(v: string): string {
  const trimmed = v.trim();
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  const asNumber = Number(trimmed);
  if (!Number.isNaN(asNumber) && asNumber > 0 && asNumber < 1) {
    const totalSeconds = Math.round(asNumber * 24 * 60 * 60);
    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const s = String(totalSeconds % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }
  return "09:00:00";
}
