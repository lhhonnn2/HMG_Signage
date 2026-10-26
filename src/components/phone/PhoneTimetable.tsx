"use client";

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";
import type { DayPlanRow, PhoneCategoryRow, PhoneProgramRow, PhoneTimetableRow } from "@/lib/types";
import { normalizeDateCell, normalizeTimeCell } from "@/lib/excelParsing";
import { normalizeProgram } from "@/lib/pushLogic";
import { optionLabel, sortCats, todayStr } from "./shared";

type Props = {
  cats: PhoneCategoryRow[];
  progMap: Map<string, string | null>;
  reloadPrograms: () => Promise<void>;
  onChanged: () => void;
};

export default function PhoneTimetable({ cats, progMap, reloadPrograms, onChanged }: Props) {
  const [rows, setRows] = useState<PhoneTimetableRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [newDate, setNewDate] = useState(todayStr());
  const [plans, setPlans] = useState<DayPlanRow[]>([]);
  const [planDate, setPlanDate] = useState(todayStr());
  const [planChoice, setPlanChoice] = useState("");
  const [applyingPlan, setApplyingPlan] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);

  const [copyOpen, setCopyOpen] = useState(false);
  const [copyDates, setCopyDates] = useState<string[]>([]);
  const [copyPick, setCopyPick] = useState(todayStr());
  const [copyMode, setCopyMode] = useState<"overwrite" | "append">("overwrite");
  const [copying, setCopying] = useState(false);

  const sorted = sortCats(cats);
  const catById = new Map(cats.map((c) => [c.id, c]));

  async function load(preferDate?: string) {
    const { data } = await supabase.from("phone_timetable").select("*").order("alarm_date").order("start_time");
    const list = (data as PhoneTimetableRow[]) || [];
    setRows(list);
    const dateList = Array.from(new Set(list.map((r) => r.alarm_date))).sort();
    setSelectedDate((cur) => {
      if (preferDate && dateList.includes(preferDate)) return preferDate;
      if (cur && dateList.includes(cur)) return cur;
      const t = todayStr();
      return dateList.find((d) => d >= t) ?? dateList[dateList.length - 1] ?? null;
    });
  }

  useEffect(() => {
    load();
    supabase
      .from("day_plans")
      .select("*")
      .order("name")
      .then(({ data }) => setPlans((data as DayPlanRow[]) || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function unclassifiedIn(names: string[]) {
    const set = new Set(names.map(normalizeProgram).filter(Boolean));
    return Array.from(set).filter((n) => !progMap.get(n));
  }

  async function applyPlan() {
    const plan = plans.find((p) => p.id === planChoice);
    if (!plan) return;
    if (plan.rows.length === 0) {
      alert("이 플랜에 항목이 없습니다");
      return;
    }
    setApplyingPlan(true);
    try {
      const toInsert = plan.rows.map((r) => ({
        alarm_date: planDate,
        start_time: r.start_time,
        program_name: r.program_name,
        location: r.location
      }));
      const { error } = await supabase.from("phone_timetable").insert(toInsert);
      if (error) throw error;
      const un = unclassifiedIn(toInsert.map((r) => r.program_name));
      alert(`${planDate}에 "${plan.name}" 플랜 ${toInsert.length}건을 생성했습니다` + (un.length ? `\n\n미분류 프로그램 ${un.length}개가 있습니다. "프로그램 분류" 탭에서 카테고리를 지정해주세요.` : ""));
      await load(planDate);
      onChanged();
    } catch (e: any) {
      alert("생성 중 오류: " + e.message);
    } finally {
      setApplyingPlan(false);
    }
  }

  function updateLocal(id: string, patch: Partial<PhoneTimetableRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function commit(id: string, patch: Partial<PhoneTimetableRow>) {
    await supabase.from("phone_timetable").update(patch).eq("id", id);
    if ("program_name" in patch) onChanged();
  }

  async function addRow(dateStr: string) {
    setAdding(true);
    try {
      const { data, error } = await supabase
        .from("phone_timetable")
        .insert({ alarm_date: dateStr, start_time: "10:00:00", program_name: "", location: "" })
        .select()
        .single();
      if (error) throw error;
      setRows((prev) => [...prev, data as PhoneTimetableRow]);
      setSelectedDate(dateStr);
    } catch (e: any) {
      alert("추가 실패: " + e.message);
    } finally {
      setAdding(false);
    }
  }

  async function removeRow(id: string) {
    if (!confirm("이 프로그램을 삭제할까요?")) return;
    await supabase.from("phone_timetable").delete().eq("id", id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function removeDate(dateStr: string) {
    if (!confirm(`${dateStr}의 프로그램을 모두 삭제할까요?`)) return;
    await supabase.from("phone_timetable").delete().eq("alarm_date", dateStr);
    const remaining = rows.filter((r) => r.alarm_date !== dateStr);
    setRows(remaining);
    const dateList = Array.from(new Set(remaining.map((r) => r.alarm_date))).sort();
    setSelectedDate(dateList[0] ?? null);
  }

  // Classification is by program NAME, so changing it here changes every row with that name.
  async function setCategoryFor(programName: string, categoryId: string) {
    const name = normalizeProgram(programName);
    if (!name) {
      alert("프로그램명을 먼저 입력해주세요");
      return;
    }
    try {
      if (!categoryId) {
        const { error } = await supabase.from("phone_programs").delete().eq("name", name);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("phone_programs").upsert({ name, category_id: categoryId } as PhoneProgramRow, { onConflict: "name" });
        if (error) throw error;
      }
      await reloadPrograms();
      onChanged();
    } catch (e: any) {
      alert("카테고리 저장 실패: " + e.message);
    }
  }

  async function copyToDates() {
    const source = rows.filter((r) => r.alarm_date === selectedDate);
    if (source.length === 0 || copyDates.length === 0) return;
    const targets = copyDates.filter((d) => d !== selectedDate);
    if (targets.length === 0) return;
    const modeText =
      copyMode === "overwrite"
        ? `${targets.join(", ")}의 기존 프로그램은 삭제되고 ${selectedDate} 내용으로 교체됩니다.`
        : `${targets.join(", ")}의 기존 프로그램은 그대로 두고 뒤에 추가됩니다. (같은 프로그램이 있으면 중복됩니다)`;
    if (!confirm(`${selectedDate}의 프로그램 ${source.length}건을 복사할까요?\n\n${modeText}`)) return;
    setCopying(true);
    try {
      if (copyMode === "overwrite") {
        const { error: delErr } = await supabase.from("phone_timetable").delete().in("alarm_date", targets);
        if (delErr) throw delErr;
      }
      const toInsert = targets.flatMap((d) =>
        source.map((r) => ({ alarm_date: d, start_time: r.start_time, program_name: r.program_name, location: r.location }))
      );
      const { error } = await supabase.from("phone_timetable").insert(toInsert);
      if (error) throw error;
      alert(`${targets.length}개 날짜에 ${source.length}건씩 복사했습니다`);
      setCopyOpen(false);
      setCopyDates([]);
      await load(targets[0]);
    } catch (e: any) {
      alert("복사 중 오류: " + e.message);
    } finally {
      setCopying(false);
    }
  }

  async function onExcelFile(file: File) {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      // Deliberately NOT using cellDates:true — see excelParsing.ts.
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const excelRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const toInsert = excelRows
        .filter((row) => String(row["날짜"] ?? "").trim() !== "" || row["날짜"] instanceof Date)
        .map((row) => ({
          alarm_date: normalizeDateCell(row["날짜"]),
          start_time: normalizeTimeCell(row["시작예정시각"] ?? row["시작시각"] ?? row["시작"]),
          program_name: String(row["프로그램명"] ?? "").trim(),
          location: String(row["렉처룸"] ?? row["장소"] ?? "").trim()
        }));
      if (toInsert.length === 0) {
        alert("읽을 수 있는 행이 없습니다. 열 이름(날짜, 시작예정시각, 프로그램명, 렉처룸)을 확인해주세요.");
        return;
      }

      const { error } = await supabase.from("phone_timetable").insert(toInsert);
      if (error) throw error;
      const un = unclassifiedIn(toInsert.map((r) => r.program_name));
      alert(`${toInsert.length}건 등록되었습니다` + (un.length ? `\n\n미분류 프로그램 ${un.length}개가 있습니다. "프로그램 분류" 탭에서 카테고리를 지정해주세요.` : ""));
      await load(toInsert[0]?.alarm_date);
      onChanged();
    } catch (e: any) {
      alert("엑셀 업로드 중 오류: " + e.message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function downloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { 날짜: "2026-09-20", 시작예정시각: "10:00", 프로그램명: "오프로드 체험", 렉처룸: "1번 트랙 앞" },
      { 날짜: "2026-09-20", 시작예정시각: "14:00", 프로그램명: "짐카나 체험", 렉처룸: "" },
      { 날짜: "2026-09-21", 시작예정시각: "10:00", 프로그램명: "오프로드 체험", 렉처룸: "1번 트랙 앞" }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "폰 타임테이블");
    XLSX.writeFile(wb, `폰타임테이블_템플릿.xlsx`);
  }

  const dates = Array.from(new Set(rows.map((r) => r.alarm_date))).sort();
  const dateRows = rows.filter((r) => r.alarm_date === selectedDate);

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>엑셀로 일괄 등록</div>
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
          엑셀 열: 날짜 · 시작예정시각 · 프로그램명 · 렉처룸(비워도 됨). 알람시각은 필요 없습니다(직원이 고른 "N분 전"으로 자동 계산). 카테고리는
          프로그램 이름으로 자동 분류됩니다.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>플랜에서 일괄 생성</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
          "플랜 관리"의 마스터 타임테이블을 날짜에 적용합니다. 플랜에는 장소가 있는 프로그램만 들어 있으므로, 장소 없는 프로그램은 아래에서 따로 추가하세요.
        </div>
        {plans.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            등록된 플랜이 없습니다. <a href="/admin/day-plans">플랜 관리</a>에서 먼저 마스터 타임테이블을 업로드해주세요.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input className="input" type="date" style={{ width: 160 }} value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
            <select className="input" style={{ width: 200 }} value={planChoice} onChange={(e) => setPlanChoice(e.target.value)}>
              <option value="">플랜 선택...</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.rows.length}개)
                </option>
              ))}
            </select>
            <button className="btn btn-accent" disabled={!planChoice || applyingPlan} onClick={applyPlan}>
              {applyingPlan ? "생성 중..." : "이 날짜에 적용"}
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>새 날짜에 프로그램 추가</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input className="input" type="date" style={{ width: 180 }} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <button className="btn btn-accent" disabled={adding} onClick={() => addRow(newDate)}>
            {adding ? "추가 중..." : "+ 이 날짜로 추가"}
          </button>
        </div>
      </div>

      {dates.length === 0 ? (
        <div className="card" style={{ color: "var(--muted)", fontSize: 14 }}>등록된 프로그램이 없습니다. 위에서 플랜을 적용하거나 엑셀을 올리거나 직접 추가하세요.</div>
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
              {copyOpen && (
                <div
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 12,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    background: "var(--bg, #f8fafc)"
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{selectedDate}의 프로그램을 다른 날짜로 복사</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <input className="input" type="date" style={{ width: 160 }} value={copyPick} onChange={(e) => setCopyPick(e.target.value)} />
                    <button
                      className="btn btn-outline"
                      style={{ fontSize: 12, padding: "5px 10px" }}
                      onClick={() => copyPick && !copyDates.includes(copyPick) && setCopyDates((p) => [...p, copyPick].sort())}
                    >
                      + 날짜 추가
                    </button>
                    {copyDates.map((d) => (
                      <button key={d} className="chip" data-active={true} onClick={() => setCopyDates((p) => p.filter((x) => x !== d))} title="누르면 제거">
                        {d} ✕
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
                    <label style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      <input type="radio" checked={copyMode === "overwrite"} onChange={() => setCopyMode("overwrite")} />
                      대상 날짜의 기존 프로그램을 지우고 교체 (권장)
                    </label>
                    <label style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      <input type="radio" checked={copyMode === "append"} onChange={() => setCopyMode("append")} />
                      기존 프로그램 뒤에 추가
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-accent" disabled={copying || copyDates.length === 0} onClick={copyToDates}>
                      {copying ? "복사 중..." : "복사하기"}
                    </button>
                    <button className="btn btn-outline" onClick={() => setCopyOpen(false)}>
                      닫기
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{selectedDate}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-outline" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => addRow(selectedDate)}>
                    + 이 날짜에 추가
                  </button>
                  <button className="btn btn-outline" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => setCopyOpen((v) => !v)}>
                    다른 날짜로 복사
                  </button>
                  <button className="btn btn-danger" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => removeDate(selectedDate)}>
                    이 날짜 전체 삭제
                  </button>
                </div>
              </div>

              <table className="grid-table">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>시작시각</th>
                    <th>프로그램명</th>
                    <th>장소(선택)</th>
                    <th style={{ width: 230 }}>카테고리 (이름 기준 자동)</th>
                    <th style={{ width: 60 }} />
                  </tr>
                </thead>
                <tbody>
                  {dateRows.map((r) => {
                    const cid = progMap.get(normalizeProgram(r.program_name)) || "";
                    return (
                      <tr key={r.id}>
                        <td>
                          <input
                            type="time"
                            value={r.start_time.slice(0, 5)}
                            onChange={(e) => updateLocal(r.id, { start_time: `${e.target.value}:00` })}
                            onBlur={(e) => commit(r.id, { start_time: `${e.target.value}:00` })}
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
                          <select className="input" value={cid && catById.has(cid) ? cid : ""} onChange={(e) => setCategoryFor(r.program_name, e.target.value)}>
                            <option value="">— 미분류 —</option>
                            {sorted.map((c) => (
                              <option key={c.id} value={c.id}>
                                {optionLabel(c)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button className="btn btn-danger" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => removeRow(r.id)}>
                            삭제
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>
                카테고리는 프로그램 이름 기준입니다. 여기서 바꾸면 같은 이름의 모든 프로그램(다른 날짜 포함)에 적용됩니다.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
