"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { DayPlanRow } from "@/lib/types";
import { parseTimetableWorkbook } from "@/lib/timetable";

export default function DayPlansPage() {
  const [plans, setPlans] = useState<DayPlanRow[]>([]);
  const [detected, setDetected] = useState<{ name: string; rows: { program_name: string; location: string; start_time: string }[] }[]>(
    []
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase.from("day_plans").select("*").order("name");
    setPlans((data as DayPlanRow[]) || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function onFile(file: File) {
    setParsing(true);
    setDetected([]);
    try {
      const buf = await file.arrayBuffer();
      const sheets = parseTimetableWorkbook(buf);
      if (sheets.length === 0) {
        alert("타임테이블로 인식되는 시트를 찾지 못했습니다. 각 시트에 시작(예정)시각·프로그램명·렉처룸(장소) 열이 있는지 확인해주세요.");
        return;
      }
      setDetected(sheets);
      setSelected(new Set(sheets.map((s) => s.name)));
    } catch (e: any) {
      alert("엑셀을 읽는 중 오류: " + e.message);
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function toggleSelected(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function importSelected() {
    const toImport = detected.filter((s) => selected.has(s.name));
    if (toImport.length === 0) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("day_plans")
        .upsert(
          toImport.map((s) => ({ name: s.name, rows: s.rows })),
          { onConflict: "name" }
        );
      if (error) throw error;
      alert(`${toImport.length}개 플랜을 저장했습니다`);
      setDetected([]);
      await load();
    } catch (e: any) {
      alert("저장 중 오류: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("이 플랜을 삭제할까요?")) return;
    await supabase.from("day_plans").delete().eq("id", id);
    await load();
  }

  return (
    <div>
      <div className="page-title">플랜 관리</div>
      <div className="page-subtitle">
        프로그램·시작예정시각·렉처룸이 정리된 마스터 타임테이블 엑셀을 한 번만 업로드해두면, 알람 스케줄 탭에서 날짜에 플랜을 바로 적용해
        알람을 자동 생성할 수 있습니다. 시트 하나 = 플랜 하나입니다.
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>마스터 타임테이블 업로드</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
          시트마다 시작(예정)시각 · 프로그램명 · 렉처룸(장소) 열이 있으면 자동으로 인식됩니다. 같은 이름의 플랜이 이미 있으면 내용을
          덮어씁니다.
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" disabled={parsing} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        {parsing && <div style={{ fontSize: 13, color: "var(--accent)", marginTop: 8 }}>분석 중...</div>}
      </div>

      {detected.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>감지된 플랜 {detected.length}개 — 저장할 것을 선택하세요</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {detected.map((s) => (
              <label key={s.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                <input type="checkbox" checked={selected.has(s.name)} onChange={() => toggleSelected(s.name)} />
                <b>{s.name}</b>
                <span style={{ color: "var(--muted)" }}>· {s.rows.length}개 항목</span>
                {plans.some((p) => p.name === s.name) && (
                  <span style={{ color: "#e5484d", fontSize: 11 }}>(기존 플랜 덮어쓰기)</span>
                )}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-accent" disabled={saving || selected.size === 0} onClick={importSelected}>
              {saving ? "저장 중..." : `선택한 ${selected.size}개 저장`}
            </button>
            <button className="btn btn-outline" onClick={() => setDetected([])}>
              취소
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {plans.map((p) => (
          <div key={p.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14 }}>
                <b>{p.name}</b>
                <span style={{ color: "var(--muted)", marginLeft: 8, fontSize: 12 }}>{p.rows.length}개 항목</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-outline" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                  {expanded === p.id ? "접기" : "미리보기"}
                </button>
                <button className="btn btn-danger" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => remove(p.id)}>
                  삭제
                </button>
              </div>
            </div>
            {expanded === p.id && (
              <table className="grid-table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>시작예정</th>
                    <th>프로그램명</th>
                    <th>장소</th>
                  </tr>
                </thead>
                <tbody>
                  {p.rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: "4px 8px" }}>{r.start_time.slice(0, 5)}</td>
                      <td style={{ padding: "4px 8px" }}>{r.program_name}</td>
                      <td style={{ padding: "4px 8px" }}>{r.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
        {plans.length === 0 && <div style={{ color: "var(--muted)", fontSize: 14 }}>저장된 플랜이 없습니다. 위에서 엑셀을 업로드해보세요.</div>}
      </div>
    </div>
  );
}
