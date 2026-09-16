"use client";

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";
import type { AlarmRow, TvSettingsRow } from "@/lib/types";
import { TV_IDS } from "@/lib/types";
import { useTvNames } from "@/lib/useTvNames";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Handles: real Date objects (when the source sheet has real date/time
// formatting), "YYYY-MM-DD" / "H:MM[:SS]" strings, and raw Excel serial
// numbers (what you get when a cell holds a date/time but isn't tagged as
// one — this is what caused "invalid input syntax for type date: 46277").
function normalizeDateCell(v: any): string {
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  }
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}[./]\d{1,2}[./]\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split(/[./]/).map(Number);
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())}`;
  }
  return s;
}

function normalizeTimeCell(v: any): string {
  if (v instanceof Date) {
    return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
  }
  const s = String(v ?? "").trim();
  if (/^\d{1,2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return s;
  const asNumber = Number(s);
  if (!Number.isNaN(asNumber) && asNumber >= 0 && asNumber < 1) {
    const totalSeconds = Math.round(asNumber * 24 * 60 * 60);
    return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor((totalSeconds % 3600) / 60))}:${pad(totalSeconds % 60)}`;
  }
  return "09:00:00";
}

export default function AlarmsPage() {
  const [activeTv, setActiveTv] = useState(1);
  const tvNames = useTvNames();
  const [rows, setRows] = useState<AlarmRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [duration, setDuration] = useState(30);
  const [savingDuration, setSavingDuration] = useState(false);
  const [newDate, setNewDate] = useState(todayStr());
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);

  async function load(preferDate?: string) {
    const { data } = await supabase
      .from("alarms")
      .select("*")
      .eq("tv_id", activeTv)
      .order("alarm_date")
      .order("alarm_time");
    const list = (data as AlarmRow[]) || [];
    setRows(list);

    const dateList = Array.from(new Set(list.map((r) => r.alarm_date))).sort();
    setSelectedDate((cur) => {
      if (preferDate && dateList.includes(preferDate)) return preferDate;
      if (cur && dateList.includes(cur)) return cur;
      return dateList[0] ?? null;
    });

    const { data: settings } = await supabase.from("tv_settings").select("*").eq("tv_id", activeTv).maybeSingle();
    setDuration((settings as TvSettingsRow | null)?.alarm_duration_seconds ?? 30);
  }

  useEffect(() => {
    setSelectedDate(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTv]);

  function updateLocal(id: string, patch: Partial<AlarmRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function commit(id: string, patch: Partial<AlarmRow>) {
    await supabase.from("alarms").update(patch).eq("id", id);
  }

  async function saveDuration() {
    setSavingDuration(true);
    try {
      await supabase.from("tv_settings").upsert({ tv_id: activeTv, alarm_duration_seconds: duration });
      alert(`${tvNames[activeTv]}의 모든 알람에 노출 시간 ${duration}초가 적용됩니다`);
    } finally {
      setSavingDuration(false);
    }
  }

  async function addRow(dateStr: string) {
    setAdding(true);
    try {
      const { data, error } = await supabase
        .from("alarms")
        .insert({
          tv_id: activeTv,
          alarm_date: dateStr,
          alarm_time: "09:00:00",
          scheduled_time: "09:00:00",
          program_name: "",
          location: ""
        })
        .select()
        .single();
      if (error) throw error;
      setRows((prev) => [...prev, data as AlarmRow]);
      setSelectedDate(dateStr);
    } finally {
      setAdding(false);
    }
  }

  async function removeRow(id: string) {
    if (!confirm("이 알람을 삭제할까요?")) return;
    await supabase.from("alarms").delete().eq("id", id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function removeDate(dateStr: string) {
    if (!confirm(`${dateStr}의 알람을 모두 삭제할까요?`)) return;
    await supabase.from("alarms").delete().eq("tv_id", activeTv).eq("alarm_date", dateStr);
    const remaining = rows.filter((r) => r.alarm_date !== dateStr);
    setRows(remaining);
    const dateList = Array.from(new Set(remaining.map((r) => r.alarm_date))).sort();
    setSelectedDate(dateList[0] ?? null);
  }

  async function onExcelFile(file: File) {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const excelRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const toInsert = excelRows
        .filter((row) => String(row["날짜"] ?? "").trim() !== "" || row["날짜"] instanceof Date)
        .map((row) => ({
          tv_id: activeTv,
          alarm_date: normalizeDateCell(row["날짜"]),
          alarm_time: normalizeTimeCell(row["알람시각"]),
          scheduled_time: normalizeTimeCell(row["시작예정시각"]),
          program_name: String(row["프로그램명"] ?? ""),
          location: String(row["렉처룸"] ?? row["장소"] ?? "")
        }));

      const { error } = await supabase.from("alarms").insert(toInsert);
      if (error) throw error;

      alert(`${tvNames[activeTv]}에 ${toInsert.length}건 등록되었습니다`);
      await load(toInsert[0]?.alarm_date);
    } catch (e: any) {
      alert("엑셀 업로드 중 오류: " + e.message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function downloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { 날짜: "2026-09-20", 알람시각: "9:50", 시작예정시각: "10:00", 프로그램명: "오프로드 체험", 렉처룸: "1번 트랙 앞" },
      { 날짜: "2026-09-20", 알람시각: "13:50", 시작예정시각: "14:00", 프로그램명: "짐카나 체험", 렉처룸: "2번 트랙 앞" },
      { 날짜: "2026-09-21", 알람시각: "9:50", 시작예정시각: "10:00", 프로그램명: "오프로드 체험", 렉처룸: "1번 트랙 앞" }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `TV${activeTv} 알람`);
    XLSX.writeFile(wb, `알람스케줄_템플릿.xlsx`);
  }

  const dates = Array.from(new Set(rows.map((r) => r.alarm_date))).sort();
  const dateRows = rows.filter((r) => r.alarm_date === selectedDate);

  return (
    <div>
      <div className="page-title">알람 스케줄</div>
      <div className="page-subtitle">TV별로 완전히 독립된 알람 목록입니다. 날짜 탭을 선택해서 편집하세요.</div>

      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {TV_IDS.map((id) => (
          <button key={id} className="chip" data-active={activeTv === id} onClick={() => setActiveTv(id)}>
            {tvNames[id]}
          </button>
        ))}
        <a className="chip" href={`/player/${activeTv}`} target="_blank" rel="noreferrer" style={{ marginLeft: "auto" }}>
          {tvNames[activeTv]} 화면 미리보기 ↗
        </a>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{tvNames[activeTv]} 알람 노출 시간</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
          이 TV의 모든 알람에 공통으로 적용됩니다. 알람마다 따로 설정하지 않습니다.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input className="input" type="number" style={{ width: 100 }} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          <span style={{ fontSize: 13, color: "var(--muted)" }}>초</span>
          <button className="btn btn-outline" disabled={savingDuration} onClick={saveDuration}>
            {savingDuration ? "저장 중..." : "적용"}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>{tvNames[activeTv]} — 엑셀로 일괄 등록</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" disabled={importing} />
          <button className="btn btn-accent" disabled={importing} onClick={() => fileRef.current?.files?.[0] && onExcelFile(fileRef.current.files[0])}>
            {importing ? "업로드 중..." : "업로드"}
          </button>
          <button className="btn btn-outline" onClick={downloadTemplate}>
            템플릿 다운로드
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
          엑셀 열: 날짜 · 알람시각 · 시작예정시각 · 프로그램명 · 렉처룸. 여러 날짜를 한 시트에 이어서 넣어도 올리고 나면 자동으로 날짜별 탭으로
          나뉩니다. TV와 글자 크기/폰트는 여기(현재 {tvNames[activeTv]})와 "알람 서식 설정"에서 각각 적용되므로 엑셀에는 넣지 않습니다.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>새 날짜에 알람 추가</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input className="input" type="date" style={{ width: 180 }} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <button className="btn btn-accent" disabled={adding} onClick={() => addRow(newDate)}>
            {adding ? "추가 중..." : "+ 이 날짜로 알람 추가"}
          </button>
        </div>
      </div>

      {dates.length === 0 ? (
        <div className="card" style={{ color: "var(--muted)", fontSize: 14 }}>
          {tvNames[activeTv]}에 등록된 알람이 없습니다. 위에서 날짜를 고르고 알람을 추가하거나 엑셀을 업로드하세요.
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {dates.map((d) => (
              <button key={d} className="chip" data-active={selectedDate === d} onClick={() => setSelectedDate(d)}>
                {d} ({rows.filter((r) => r.alarm_date === d).length})
              </button>
            ))}
          </div>

          {selectedDate && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{selectedDate}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-outline" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => addRow(selectedDate)}>
                    + 이 날짜에 추가
                  </button>
                  <button className="btn btn-danger" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => removeDate(selectedDate)}>
                    이 날짜 전체 삭제
                  </button>
                </div>
              </div>

              <table className="grid-table">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>알람시각</th>
                    <th style={{ width: 100 }}>시작예정시각</th>
                    <th>프로그램명</th>
                    <th>장소(렉처룸)</th>
                    <th style={{ width: 60 }} />
                  </tr>
                </thead>
                <tbody>
                  {dateRows.map((r) => (
                    <tr key={r.id}>
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
                        <button className="btn btn-danger" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => removeRow(r.id)}>
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
