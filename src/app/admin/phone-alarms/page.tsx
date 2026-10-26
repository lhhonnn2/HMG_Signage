"use client";

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";
import type { DayPlanRow, PhoneAlarmRow, PhoneCategoryRow } from "@/lib/types";
import { normalizeDateCell, normalizeTimeCell, subtractMinutes } from "@/lib/excelParsing";
import { minutesBefore } from "@/lib/pushLogic";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type Stats = { configured: boolean; cronSecretSet: boolean; total: number; byTv: Record<string, number>; byCategory: Record<string, number> };

export default function PhoneAlarmsPage() {
  const [cats, setCats] = useState<PhoneCategoryRow[]>([]);
  const [catsLoaded, setCatsLoaded] = useState(false);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);

  const [rows, setRows] = useState<PhoneAlarmRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [newDate, setNewDate] = useState(todayStr());
  const [plans, setPlans] = useState<DayPlanRow[]>([]);
  const [planDate, setPlanDate] = useState(todayStr());
  const [planChoice, setPlanChoice] = useState("");
  const [planOffset, setPlanOffset] = useState(5);
  const [applyingPlan, setApplyingPlan] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);

  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState<string[]>([]);
  const [copyScope, setCopyScope] = useState<"date" | "all">("date");
  const [copyMode, setCopyMode] = useState<"overwrite" | "append">("overwrite");
  const [copying, setCopying] = useState(false);

  const activeName = cats.find((c) => c.id === activeCat)?.name ?? "";

  async function loadCats(preferId?: string) {
    const { data, error } = await supabase.from("phone_categories").select("*").order("name");
    if (error) {
      alert("카테고리를 불러오지 못했습니다: " + error.message + "\n(supabase/migration_v12.sql 을 실행했는지 확인하세요)");
    }
    const list = (data as PhoneCategoryRow[]) || [];
    setCats(list);
    setCatsLoaded(true);
    setActiveCat((cur) => {
      if (preferId && list.some((c) => c.id === preferId)) return preferId;
      if (cur && list.some((c) => c.id === cur)) return cur;
      return list[0]?.id ?? null;
    });
  }

  async function loadRows(preferDate?: string) {
    if (!activeCat) {
      setRows([]);
      setSelectedDate(null);
      return;
    }
    const { data } = await supabase
      .from("phone_alarms")
      .select("*")
      .eq("category_id", activeCat)
      .order("alarm_date")
      .order("alarm_time");
    const list = (data as PhoneAlarmRow[]) || [];
    setRows(list);
    const dateList = Array.from(new Set(list.map((r) => r.alarm_date))).sort();
    setSelectedDate((cur) => {
      if (preferDate && dateList.includes(preferDate)) return preferDate;
      if (cur && dateList.includes(cur)) return cur;
      return dateList[0] ?? null;
    });
  }

  async function loadStats() {
    try {
      const r = await fetch("/api/push/stats");
      setStats(await r.json());
    } catch {
      setStats(null);
    }
  }

  useEffect(() => {
    loadCats();
    loadStats();
    supabase
      .from("day_plans")
      .select("*")
      .order("name")
      .then(({ data }) => setPlans((data as DayPlanRow[]) || []));
  }, []);

  useEffect(() => {
    setSelectedDate(null);
    setCopyOpen(false);
    setCopyTargets([]);
    setRenameName(cats.find((c) => c.id === activeCat)?.name ?? "");
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCat]);

  useEffect(() => {
    setRenameName(activeName);
  }, [activeName]);

  // ---- categories -------------------------------------------------------
  async function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    const { data, error } = await supabase.from("phone_categories").insert({ name }).select().single();
    if (error) {
      alert("추가 실패: " + (error.message.includes("duplicate") ? "같은 이름의 카테고리가 이미 있습니다" : error.message));
      return;
    }
    setNewCatName("");
    await loadCats((data as PhoneCategoryRow).id);
  }

  async function renameCategory() {
    const name = renameName.trim();
    if (!activeCat || !name || name === activeName) return;
    const { error } = await supabase.from("phone_categories").update({ name }).eq("id", activeCat);
    if (error) {
      alert("이름 변경 실패: " + error.message);
      return;
    }
    await loadCats(activeCat);
  }

  async function deleteCategory() {
    if (!activeCat) return;
    const subs = stats?.byCategory?.[activeCat] ?? 0;
    if (
      !confirm(
        `'${activeName}' 카테고리를 삭제할까요?\n이 카테고리의 알람 ${rows.length}건이 모두 함께 삭제됩니다.` +
          (subs > 0 ? `\n(이 카테고리를 선택한 직원 ${subs}명은 더 이상 이 카테고리 알림을 받지 못합니다)` : "")
      )
    )
      return;
    const { error } = await supabase.from("phone_categories").delete().eq("id", activeCat);
    if (error) {
      alert("삭제 실패: " + error.message);
      return;
    }
    setActiveCat(null);
    await loadCats();
  }

  // ---- alarms (same behaviors as the TV alarm page) ----------------------
  async function applyPlan() {
    const plan = plans.find((p) => p.id === planChoice);
    if (!plan || !activeCat) return;
    if (plan.rows.length === 0) {
      alert("이 플랜에 항목이 없습니다");
      return;
    }
    setApplyingPlan(true);
    try {
      const toInsert = plan.rows.map((r) => ({
        category_id: activeCat,
        alarm_date: planDate,
        alarm_time: subtractMinutes(r.start_time, planOffset),
        scheduled_time: r.start_time,
        program_name: r.program_name,
        location: r.location
      }));
      const { error } = await supabase.from("phone_alarms").insert(toInsert);
      if (error) throw error;
      alert(`${activeName} · ${planDate}에 "${plan.name}" 플랜 ${toInsert.length}건을 생성했습니다`);
      await loadRows(planDate);
    } catch (e: any) {
      alert("생성 중 오류: " + e.message);
    } finally {
      setApplyingPlan(false);
    }
  }

  function updateLocal(id: string, patch: Partial<PhoneAlarmRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function commit(id: string, patch: Partial<PhoneAlarmRow>) {
    await supabase.from("phone_alarms").update(patch).eq("id", id);
  }

  async function addRow(dateStr: string) {
    if (!activeCat) return;
    setAdding(true);
    try {
      const { data, error } = await supabase
        .from("phone_alarms")
        .insert({
          category_id: activeCat,
          alarm_date: dateStr,
          alarm_time: "09:55:00",
          scheduled_time: "10:00:00",
          program_name: "",
          location: ""
        })
        .select()
        .single();
      if (error) throw error;
      setRows((prev) => [...prev, data as PhoneAlarmRow]);
      setSelectedDate(dateStr);
    } catch (e: any) {
      alert("추가 실패: " + e.message);
    } finally {
      setAdding(false);
    }
  }

  async function removeRow(id: string) {
    if (!confirm("이 알람을 삭제할까요?")) return;
    await supabase.from("phone_alarms").delete().eq("id", id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function removeDate(dateStr: string) {
    if (!activeCat || !confirm(`${dateStr}의 알람을 모두 삭제할까요?`)) return;
    await supabase.from("phone_alarms").delete().eq("category_id", activeCat).eq("alarm_date", dateStr);
    const remaining = rows.filter((r) => r.alarm_date !== dateStr);
    setRows(remaining);
    const dateList = Array.from(new Set(remaining.map((r) => r.alarm_date))).sort();
    setSelectedDate(dateList[0] ?? null);
  }

  async function copyToOtherCategories() {
    const source = copyScope === "date" ? rows.filter((r) => r.alarm_date === selectedDate) : rows;
    if (source.length === 0 || copyTargets.length === 0) return;
    const dateList = Array.from(new Set(source.map((r) => r.alarm_date))).sort();
    const targetNames = copyTargets.map((id) => cats.find((c) => c.id === id)?.name).join(", ");
    const scopeText = copyScope === "date" ? dateList[0] : `${dateList.length}개 날짜 전체`;
    const modeText =
      copyMode === "overwrite"
        ? `${targetNames}의 해당 날짜(${dateList.length}일) 기존 알람은 삭제되고 아래 내용으로 교체됩니다.`
        : `${targetNames}의 기존 알람은 그대로 두고 뒤에 추가됩니다. (이미 같은 알람이 있으면 중복됩니다)`;
    if (!confirm(`${activeName}의 ${scopeText} 알람 ${source.length}건을 복사할까요?\n\n${modeText}`)) return;

    setCopying(true);
    try {
      if (copyMode === "overwrite") {
        const { error: delErr } = await supabase.from("phone_alarms").delete().in("category_id", copyTargets).in("alarm_date", dateList);
        if (delErr) throw delErr;
      }
      const toInsert = copyTargets.flatMap((cid) =>
        source.map((r) => ({
          category_id: cid,
          alarm_date: r.alarm_date,
          alarm_time: r.alarm_time,
          scheduled_time: r.scheduled_time,
          program_name: r.program_name,
          location: r.location
        }))
      );
      const { error } = await supabase.from("phone_alarms").insert(toInsert);
      if (error) throw error;
      alert(`${targetNames}에 알람 ${source.length}건씩 복사했습니다`);
      setCopyOpen(false);
      setCopyTargets([]);
    } catch (e: any) {
      alert("복사 중 오류: " + e.message);
    } finally {
      setCopying(false);
    }
  }

  async function onExcelFile(file: File) {
    if (!activeCat) return;
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
          category_id: activeCat,
          alarm_date: normalizeDateCell(row["날짜"]),
          alarm_time: normalizeTimeCell(row["알람시각"]),
          scheduled_time: normalizeTimeCell(row["시작예정시각"]),
          program_name: String(row["프로그램명"] ?? ""),
          location: String(row["렉처룸"] ?? row["장소"] ?? "")
        }));

      const { error } = await supabase.from("phone_alarms").insert(toInsert);
      if (error) throw error;
      alert(`${activeName}에 ${toInsert.length}건 등록되었습니다`);
      await loadRows(toInsert[0]?.alarm_date);
    } catch (e: any) {
      alert("엑셀 업로드 중 오류: " + e.message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function downloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { 날짜: "2026-09-20", 알람시각: "9:55", 시작예정시각: "10:00", 프로그램명: "오프로드 체험", 렉처룸: "1번 트랙 앞" },
      { 날짜: "2026-09-20", 알람시각: "13:50", 시작예정시각: "14:00", 프로그램명: "짐카나 체험", 렉처룸: "" },
      { 날짜: "2026-09-21", 알람시각: "9:55", 시작예정시각: "10:00", 프로그램명: "오프로드 체험", 렉처룸: "1번 트랙 앞" }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "폰 알람");
    XLSX.writeFile(wb, `폰알람_템플릿.xlsx`);
  }

  const dates = Array.from(new Set(rows.map((r) => r.alarm_date))).sort();
  const dateRows = rows.filter((r) => r.alarm_date === selectedDate);
  const notifyUrl = typeof window !== "undefined" ? `${window.location.origin}/notify` : "/notify";

  return (
    <div>
      <div className="page-title">폰 알람</div>
      <div className="page-subtitle">
        TV와 무관하게 폰으로만 보내는 알람입니다. 카테고리별로 알람을 관리하면, 직원이 알림 받기 화면에서 받을 카테고리를 선택합니다.
      </div>

      <div className="card" style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.7 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>직원 알림 받기 주소</div>
        <a href="/notify" target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>
          {notifyUrl}
        </a>
        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
          이 주소를 직원들에게 공유하세요(비밀번호 없이 열립니다). TV에 나오는 알람과 이 화면의 폰 전용 알람 모두 여기서 선택한 것만 받습니다.
          알림 문구: "[프로그램] 시작 N분 전 입니다. [장소]로 와주세요." (N은 알람시각과 시작예정시각의 차이로 자동 계산, 장소가 비어 있으면 생략)
        </div>
        <div style={{ marginTop: 8, fontSize: 12.5 }}>
          {stats ? (
            <>
              <span>알림 받는 폰: <b>{stats.total}대</b></span>
              {!stats.configured && <span style={{ color: "#b91c1c", marginLeft: 10 }}>⚠ 서버에 푸시 키(VAPID)가 설정되지 않았습니다</span>}
              {!stats.cronSecretSet && <span style={{ color: "#b91c1c", marginLeft: 10 }}>⚠ CRON_SECRET이 설정되지 않았습니다</span>}
            </>
          ) : (
            <span style={{ color: "var(--muted)" }}>구독 현황을 불러오지 못했습니다 (migration_v12.sql 실행 여부를 확인하세요)</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {cats.map((c) => (
          <button key={c.id} className="chip" data-active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>
            {c.name}
            {stats?.byCategory?.[c.id] ? ` · ${stats.byCategory[c.id]}명` : ""}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label className="label">새 카테고리</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              className="input"
              style={{ width: 180 }}
              value={newCatName}
              placeholder="예: 안전요원, 진행팀"
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
            />
            <button className="btn btn-accent" disabled={!newCatName.trim()} onClick={addCategory}>
              + 추가
            </button>
          </div>
        </div>
        {activeCat && (
          <>
            <div>
              <label className="label">선택한 카테고리 이름 변경</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input className="input" style={{ width: 180 }} value={renameName} onChange={(e) => setRenameName(e.target.value)} />
                <button className="btn btn-outline" disabled={!renameName.trim() || renameName.trim() === activeName} onClick={renameCategory}>
                  변경
                </button>
              </div>
            </div>
            <button className="btn btn-outline" style={{ color: "#dc2626", marginLeft: "auto" }} onClick={deleteCategory}>
              이 카테고리 삭제
            </button>
          </>
        )}
      </div>

      {catsLoaded && cats.length === 0 && (
        <div className="card" style={{ fontSize: 14, color: "var(--muted)" }}>
          카테고리가 없습니다. 위에서 카테고리를 먼저 추가하세요.
        </div>
      )}

      {activeCat && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>{activeName} — 엑셀로 일괄 등록</div>
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
              엑셀 열: 날짜 · 알람시각 · 시작예정시각 · 프로그램명 · 렉처룸. 여러 날짜를 한 시트에 이어서 넣어도 날짜별 탭으로 나뉩니다.
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>플랜에서 일괄 생성</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
              "플랜 관리"에 등록해 둔 하루치 타임테이블을 날짜에 적용합니다. TV 알람에 쓰는 것과 같은 플랜입니다.
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
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>알림 시차</span>
                  <input className="input" type="number" style={{ width: 64 }} value={planOffset} onChange={(e) => setPlanOffset(Number(e.target.value))} />
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>분 전</span>
                </div>
                <button className="btn btn-accent" disabled={!planChoice || applyingPlan} onClick={applyPlan}>
                  {applyingPlan ? "생성 중..." : "이 날짜에 적용"}
                </button>
              </div>
            )}
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
              {activeName}에 등록된 알람이 없습니다. 위에서 날짜를 고르고 알람을 추가하거나 엑셀을 업로드하세요.
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
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{activeName}의 알람을 다른 카테고리로 복사</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>복사할 카테고리</span>
                        {cats
                          .filter((c) => c.id !== activeCat)
                          .map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="chip"
                              data-active={copyTargets.includes(c.id)}
                              onClick={() => setCopyTargets((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]))}
                            >
                              {c.name}
                            </button>
                          ))}
                      </div>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
                        <label style={{ display: "flex", gap: 5, alignItems: "center" }}>
                          <input type="radio" checked={copyScope === "date"} onChange={() => setCopyScope("date")} />
                          {selectedDate} 하루만
                        </label>
                        <label style={{ display: "flex", gap: 5, alignItems: "center" }}>
                          <input type="radio" checked={copyScope === "all"} onChange={() => setCopyScope("all")} />
                          이 카테고리의 모든 날짜 ({dates.length}일, {rows.length}건)
                        </label>
                      </div>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
                        <label style={{ display: "flex", gap: 5, alignItems: "center" }}>
                          <input type="radio" checked={copyMode === "overwrite"} onChange={() => setCopyMode("overwrite")} />
                          대상 카테고리의 해당 날짜 알람을 지우고 교체 (권장)
                        </label>
                        <label style={{ display: "flex", gap: 5, alignItems: "center" }}>
                          <input type="radio" checked={copyMode === "append"} onChange={() => setCopyMode("append")} />
                          기존 알람 뒤에 추가
                        </label>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn btn-accent" disabled={copying || copyTargets.length === 0} onClick={copyToOtherCategories}>
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
                      <button
                        className="btn btn-outline"
                        style={{ fontSize: 12, padding: "5px 10px" }}
                        disabled={cats.length < 2}
                        onClick={() => setCopyOpen((v) => !v)}
                      >
                        다른 카테고리로 복사
                      </button>
                      <button className="btn btn-danger" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => removeDate(selectedDate)}>
                        이 날짜 전체 삭제
                      </button>
                    </div>
                  </div>

                  <table className="grid-table">
                    <thead>
                      <tr>
                        <th style={{ width: 100 }}>알림시각</th>
                        <th style={{ width: 100 }}>시작예정시각</th>
                        <th>프로그램명</th>
                        <th>장소(선택)</th>
                        <th style={{ width: 70 }}>문구 N분</th>
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
                          <td style={{ fontSize: 12.5, color: "var(--muted)", textAlign: "center" }}>
                            {minutesBefore(r.alarm_time, r.scheduled_time)}분 전
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
        </>
      )}
    </div>
  );
}
