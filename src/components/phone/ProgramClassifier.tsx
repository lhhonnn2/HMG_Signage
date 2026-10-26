"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { DayPlanRow, PhoneCategoryRow, PhoneProgramRow } from "@/lib/types";
import { normalizeProgram } from "@/lib/pushLogic";
import { optionLabel, sortCats } from "./shared";

type Props = {
  cats: PhoneCategoryRow[];
  progMap: Map<string, string | null>;
  reloadPrograms: () => Promise<void>;
  refreshKey: number;
};

// Program name → category, set once. Names come from the saved plans (master
// timetables), the phone timetable and anything already classified.
export default function ProgramClassifier({ cats, progMap, reloadPrograms, refreshKey }: Props) {
  const [names, setNames] = useState<Map<string, number>>(new Map());
  const [onlyUnclassified, setOnlyUnclassified] = useState(false);
  const [q, setQ] = useState("");
  const [savingName, setSavingName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const count = new Map<string, number>();
      const add = (n: string, inc: number) => {
        const k = normalizeProgram(n);
        if (k) count.set(k, (count.get(k) || 0) + inc);
      };
      const [{ data: plans }, { data: tt }] = await Promise.all([
        supabase.from("day_plans").select("rows"),
        supabase.from("phone_timetable").select("program_name")
      ]);
      for (const p of (plans as Pick<DayPlanRow, "rows">[]) || []) for (const r of p.rows || []) add(r.program_name, 0);
      for (const r of (tt as { program_name: string }[]) || []) add(r.program_name, 1);
      for (const k of progMap.keys()) if (!count.has(k)) count.set(k, 0);
      setNames(count);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, progMap.size]);

  const sorted = useMemo(() => sortCats(cats), [cats]);

  async function assign(name: string, categoryId: string) {
    setSavingName(name);
    try {
      if (!categoryId) {
        const { error } = await supabase.from("phone_programs").delete().eq("name", name);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("phone_programs").upsert({ name, category_id: categoryId } as PhoneProgramRow, { onConflict: "name" });
        if (error) throw error;
      }
      await reloadPrograms();
    } catch (e: any) {
      alert("저장 실패: " + e.message);
    } finally {
      setSavingName(null);
    }
  }

  const list = Array.from(names.keys())
    .sort((a, b) => a.localeCompare(b, "ko"))
    .filter((n) => (onlyUnclassified ? !progMap.get(n) : true))
    .filter((n) => (q.trim() ? n.includes(q.trim()) : true));
  const unclassifiedCount = Array.from(names.keys()).filter((n) => !progMap.get(n)).length;

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.7 }}>
        프로그램 이름마다 카테고리를 <b>한 번만</b> 지정하면, 이후 타임테이블(플랜 적용·엑셀·직접 입력)에 같은 이름의 프로그램이 들어올 때 자동으로 그 카테고리로 분류됩니다.
        분류되지 않은 프로그램은 카테고리로는 알림이 가지 않습니다(직원이 개별로 켤 수는 있음).
        <div style={{ marginTop: 6, color: unclassifiedCount > 0 ? "#b45309" : "#15803d" }}>
          {unclassifiedCount > 0 ? `미분류 프로그램 ${unclassifiedCount}개` : "모든 프로그램이 분류되어 있습니다"}
        </div>
      </div>

      {cats.length === 0 && (
        <div className="card" style={{ marginBottom: 16, color: "#b45309", fontSize: 13 }}>카테고리가 없습니다. "카테고리" 탭에서 먼저 추가해주세요.</div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input className="input" style={{ width: 200 }} placeholder="프로그램 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={onlyUnclassified} onChange={(e) => setOnlyUnclassified(e.target.checked)} />
          미분류만 보기
        </label>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="grid-table">
          <thead>
            <tr>
              <th>프로그램명</th>
              <th style={{ width: 260 }}>카테고리 (구분 · 브랜드 · 이름)</th>
            </tr>
          </thead>
          <tbody>
            {list.map((n) => {
              const cur = progMap.get(n) || "";
              return (
                <tr key={n}>
                  <td style={{ padding: "6px 10px", fontSize: 13.5 }}>
                    {n}
                    {!cur && <span style={{ color: "#b45309", fontSize: 11, marginLeft: 8 }}>미분류</span>}
                  </td>
                  <td>
                    <select className="input" disabled={savingName === n} value={cur} onChange={(e) => assign(n, e.target.value)}>
                      <option value="">— 미분류 —</option>
                      {sorted.map((c) => (
                        <option key={c.id} value={c.id}>
                          {optionLabel(c)}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={2} style={{ padding: 12, color: "var(--muted)", fontSize: 13 }}>
                  표시할 프로그램이 없습니다. 플랜을 등록하거나 타임테이블에 프로그램을 추가하면 여기에 나타납니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
