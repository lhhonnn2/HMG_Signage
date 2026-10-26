"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { DayPlanRow, PhoneCategoryRow } from "@/lib/types";
import { BRANDS, DIVISIONS } from "@/lib/facets";
import { normalizeProgram } from "@/lib/pushLogic";
import CategoryManager from "./CategoryManager";

type Props = {
  cats: PhoneCategoryRow[];
  progMap: Map<string, string | null>;
  reloadCats: () => Promise<void>;
  reloadPrograms: () => Promise<void>;
  refreshKey: number;
};

type Draft = { division: string; brand: string; detail: string };

// Splits "기아 레벨 1" into brand "기아" + detail "레벨 1" (when the name starts with a brand).
function parseBrand(name: string): { brand: string; rest: string } | null {
  const lower = name.toLowerCase();
  for (const b of BRANDS) {
    if (lower.startsWith(b.toLowerCase())) return { brand: b, rest: name.slice(b.length).trim() };
  }
  return null;
}

const catKey = (d: string, b: string, n: string) => `${d}|${b}|${n}`;

// Program name → (구분, 브랜드, 상세). Typing the category here creates it if
// it doesn't exist yet, so there is no separate category step.
export default function ProgramClassifier({ cats, progMap, reloadCats, reloadPrograms, refreshKey }: Props) {
  const [usage, setUsage] = useState<Map<string, { inPlan: boolean; tt: number }>>(new Map());
  const [onlyUnclassified, setOnlyUnclassified] = useState(false);
  const [q, setQ] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkDivision, setBulkDivision] = useState(DIVISIONS[0]);
  const [bulkBrand, setBulkBrand] = useState("auto");
  const [bulkDetailMode, setBulkDetailMode] = useState<"auto" | "text">("auto");
  const [bulkDetail, setBulkDetail] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);

  useEffect(() => {
    (async () => {
      const u = new Map<string, { inPlan: boolean; tt: number }>();
      const bump = (n: string, f: (x: { inPlan: boolean; tt: number }) => void) => {
        const k = normalizeProgram(n);
        if (!k) return;
        const cur = u.get(k) || { inPlan: false, tt: 0 };
        f(cur);
        u.set(k, cur);
      };
      const [{ data: plans }, { data: tt }] = await Promise.all([
        supabase.from("day_plans").select("rows"),
        supabase.from("phone_timetable").select("program_name")
      ]);
      for (const p of (plans as Pick<DayPlanRow, "rows">[]) || []) for (const r of p.rows || []) bump(r.program_name, (x) => (x.inPlan = true));
      for (const r of (tt as { program_name: string }[]) || []) bump(r.program_name, (x) => x.tt++);
      for (const k of progMap.keys()) if (!u.has(k)) u.set(k, { inPlan: false, tt: 0 });
      setUsage(u);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, progMap.size]);

  function draftOf(name: string): Draft {
    if (drafts[name]) return drafts[name];
    const c = progMap.get(name) ? catById.get(progMap.get(name)!) : undefined;
    return c ? { division: c.division, brand: c.brand, detail: c.name } : { division: "", brand: "", detail: "" };
  }

  function setDraft(name: string, patch: Partial<Draft>) {
    const next = { ...draftOf(name), ...patch };
    setDrafts((p) => ({ ...p, [name]: next }));
    return next;
  }

  // Find the category (division, brand, detail) or create it; returns its id.
  async function ensureCategory(division: string, brand: string, detail: string) {
    const found = cats.find((c) => c.division === division && c.brand === brand && c.name === detail);
    if (found) return found.id;
    const { data, error } = await supabase
      .from("phone_categories")
      .upsert({ division, brand, name: detail }, { onConflict: "division,brand,name" })
      .select()
      .single();
    if (error) throw error;
    return (data as PhoneCategoryRow).id;
  }

  async function commit(name: string, d: Draft) {
    const division = d.division.trim();
    const brand = d.brand.trim();
    const detail = d.detail.trim();
    if (!division && !brand && !detail) {
      // all cleared → back to unclassified
      setBusy(name);
      try {
        const { error } = await supabase.from("phone_programs").upsert({ name, category_id: null }, { onConflict: "name" });
        if (error) throw error;
        await reloadPrograms();
        setDrafts((p) => {
          const n = { ...p };
          delete n[name];
          return n;
        });
      } catch (e: any) {
        alert("저장 실패: " + e.message);
      } finally {
        setBusy(null);
      }
      return;
    }
    if (!division || !brand || !detail) return; // wait until all three are filled
    setBusy(name);
    try {
      const id = await ensureCategory(division, brand, detail);
      const { error } = await supabase.from("phone_programs").upsert({ name, category_id: id }, { onConflict: "name" });
      if (error) throw error;
      await reloadCats();
      await reloadPrograms();
      setDrafts((p) => {
        const n = { ...p };
        delete n[name];
        return n;
      });
    } catch (e: any) {
      alert("저장 실패: " + e.message);
    } finally {
      setBusy(null);
    }
  }

  async function addProgram() {
    const name = normalizeProgram(newName);
    if (!name) return;
    const { error } = await supabase.from("phone_programs").upsert({ name, category_id: progMap.get(name) ?? null }, { onConflict: "name" });
    if (error) {
      alert("추가 실패: " + error.message);
      return;
    }
    setNewName("");
    setQ("");
    setOnlyUnclassified(false);
    await reloadPrograms();
  }

  async function removeProgram(name: string) {
    if (!confirm(`'${name}'을(를) 목록에서 지울까요? (카테고리 지정도 함께 사라집니다)`)) return;
    const { error } = await supabase.from("phone_programs").delete().eq("name", name);
    if (error) {
      alert("삭제 실패: " + error.message);
      return;
    }
    await reloadPrograms();
  }

  async function applyBulk() {
    const targets = Array.from(picked);
    if (targets.length === 0) return;
    if (bulkDetailMode === "text" && !bulkDetail.trim()) {
      alert("상세 이름을 입력해주세요");
      return;
    }
    const plan: { name: string; division: string; brand: string; detail: string }[] = [];
    const skipped: string[] = [];
    for (const name of targets) {
      let brand = bulkBrand;
      let detail = bulkDetailMode === "text" ? bulkDetail.trim() : "";
      const parsed = parseBrand(name);
      if (bulkBrand === "auto") {
        if (!parsed) {
          skipped.push(name);
          continue;
        }
        brand = parsed.brand;
      }
      if (bulkDetailMode === "auto") {
        // strip the brand prefix only when it matches the brand being applied
        detail = parsed && parsed.brand === brand && parsed.rest ? parsed.rest : name;
      }
      if (!detail) {
        skipped.push(name);
        continue;
      }
      plan.push({ name, division: bulkDivision, brand, detail });
    }
    if (plan.length === 0) {
      alert("적용할 수 있는 프로그램이 없습니다." + (skipped.length ? `\n브랜드를 이름에서 알 수 없는 프로그램: ${skipped.join(", ")}` : ""));
      return;
    }
    if (!confirm(`${plan.length}개 프로그램에 카테고리를 지정할까요?\n\n예) ${plan[0].name} → ${plan[0].division} · ${plan[0].brand} · ${plan[0].detail}` + (skipped.length ? `\n\n건너뜀 ${skipped.length}개: ${skipped.join(", ")}` : ""))) return;
    setBulkBusy(true);
    try {
      const combos = new Map<string, { division: string; brand: string; name: string }>();
      for (const p of plan) combos.set(catKey(p.division, p.brand, p.detail), { division: p.division, brand: p.brand, name: p.detail });
      const { data, error } = await supabase
        .from("phone_categories")
        .upsert(Array.from(combos.values()), { onConflict: "division,brand,name" })
        .select();
      if (error) throw error;
      const idByKey = new Map(((data as PhoneCategoryRow[]) || []).map((c) => [catKey(c.division, c.brand, c.name), c.id]));
      const { error: e2 } = await supabase
        .from("phone_programs")
        .upsert(plan.map((p) => ({ name: p.name, category_id: idByKey.get(catKey(p.division, p.brand, p.detail)) ?? null })), { onConflict: "name" });
      if (e2) throw e2;
      setPicked(new Set());
      setDrafts({});
      await reloadCats();
      await reloadPrograms();
    } catch (e: any) {
      alert("일괄 지정 실패: " + e.message);
    } finally {
      setBulkBusy(false);
    }
  }

  const names = Array.from(usage.keys()).sort((a, b) => a.localeCompare(b, "ko"));
  const list = names
    .filter((n) => (onlyUnclassified ? !progMap.get(n) : true))
    .filter((n) => (q.trim() ? n.includes(q.trim()) : true));
  const unclassifiedCount = names.filter((n) => !progMap.get(n)).length;
  const allPicked = list.length > 0 && list.every((n) => picked.has(n));

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.7 }}>
        프로그램마다 <b>구분 · 브랜드 · 상세</b>를 한 번만 입력하면, 이후 같은 이름의 프로그램은 자동으로 그 카테고리로 분류됩니다. 상세는 직접 입력하면 되고, 없는 카테고리는 입력하는 순간
        자동으로 만들어집니다(직원 화면에도 바로 나타납니다). 분류되지 않은 프로그램은 카테고리로는 알림이 가지 않습니다(직원이 개별로 켤 수는 있음).
        <div style={{ marginTop: 6, color: unclassifiedCount > 0 ? "#b45309" : "#15803d" }}>
          {unclassifiedCount > 0 ? `미분류 프로그램 ${unclassifiedCount}개` : "모든 프로그램이 분류되어 있습니다"}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>프로그램 직접 추가</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ width: 280 }}
            placeholder="프로그램 이름"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addProgram()}
          />
          <button className="btn btn-accent" disabled={!normalizeProgram(newName)} onClick={addProgram}>
            + 추가
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>타임테이블에 넣기 전에 미리 분류해 두고 싶은 프로그램을 추가하세요. 추가하면 아래 목록에 나타납니다.</div>
      </div>

      {picked.size > 0 && (
        <div className="card" style={{ marginBottom: 12, borderColor: "var(--accent, #2563eb)" }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13.5 }}>선택한 {picked.size}개를 한 번에 지정</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select className="input" style={{ width: 90 }} value={bulkDivision} onChange={(e) => setBulkDivision(e.target.value)}>
              {DIVISIONS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <select className="input" style={{ width: 150 }} value={bulkBrand} onChange={(e) => setBulkBrand(e.target.value)}>
              <option value="auto">브랜드: 이름에서 자동</option>
              {BRANDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <select className="input" style={{ width: 200 }} value={bulkDetailMode} onChange={(e) => setBulkDetailMode(e.target.value as "auto" | "text")}>
              <option value="auto">상세: 이름에서 브랜드 뺀 나머지</option>
              <option value="text">상세: 직접 입력(모두 같은 값)</option>
            </select>
            {bulkDetailMode === "text" && <input className="input" style={{ width: 160 }} placeholder="상세" value={bulkDetail} onChange={(e) => setBulkDetail(e.target.value)} />}
            <button className="btn btn-accent" disabled={bulkBusy} onClick={applyBulk}>
              {bulkBusy ? "적용 중..." : "적용"}
            </button>
            <button className="btn btn-outline" onClick={() => setPicked(new Set())}>
              선택 해제
            </button>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
            예: "기아 레벨 1" → 브랜드 자동 = 기아, 상세 자동 = "레벨 1". 지정한 뒤 각 행에서 개별로 고칠 수 있습니다.
          </div>
        </div>
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
              <th style={{ width: 34 }}>
                <input
                  type="checkbox"
                  checked={allPicked}
                  onChange={(e) => setPicked(e.target.checked ? new Set(list) : new Set())}
                  title="목록 전체 선택"
                />
              </th>
              <th>프로그램명</th>
              <th style={{ width: 90 }}>구분</th>
              <th style={{ width: 120 }}>브랜드</th>
              <th style={{ width: 200 }}>상세 (직접 입력)</th>
              <th style={{ width: 50 }} />
            </tr>
          </thead>
          <tbody>
            {list.map((n, idx) => {
              const d = draftOf(n);
              const saved = !!progMap.get(n);
              const partial = !!drafts[n] && !!(d.division || d.brand || d.detail) && !(d.division && d.brand && d.detail);
              const suggestions = Array.from(
                new Set(cats.filter((c) => (!d.division || c.division === d.division) && (!d.brand || c.brand === d.brand)).map((c) => c.name))
              );
              const u = usage.get(n);
              const removable = u && !u.inPlan && u.tt === 0;
              return (
                <tr key={n}>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={picked.has(n)}
                      onChange={(e) =>
                        setPicked((p) => {
                          const nx = new Set(p);
                          e.target.checked ? nx.add(n) : nx.delete(n);
                          return nx;
                        })
                      }
                    />
                  </td>
                  <td style={{ padding: "6px 10px", fontSize: 13.5 }}>
                    {n}
                    {!saved && !partial && <span style={{ color: "#b45309", fontSize: 11, marginLeft: 8 }}>미분류</span>}
                    {partial && <span style={{ color: "#b45309", fontSize: 11, marginLeft: 8 }}>구분·브랜드·상세를 모두 입력해야 저장됩니다</span>}
                  </td>
                  <td>
                    <select
                      className="input"
                      disabled={busy === n}
                      value={d.division}
                      onChange={(e) => {
                        const next = setDraft(n, { division: e.target.value });
                        commit(n, next);
                      }}
                    >
                      <option value="">—</option>
                      {DIVISIONS.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="input"
                      disabled={busy === n}
                      value={d.brand}
                      onChange={(e) => {
                        const next = setDraft(n, { brand: e.target.value });
                        commit(n, next);
                      }}
                    >
                      <option value="">—</option>
                      {BRANDS.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="input"
                      list={`dl-${idx}`}
                      disabled={busy === n}
                      value={d.detail}
                      placeholder="예: 레벨1"
                      onChange={(e) => setDraft(n, { detail: e.target.value })}
                      onBlur={() => commit(n, draftOf(n))}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    />
                    <datalist id={`dl-${idx}`}>
                      {suggestions.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </td>
                  <td>
                    {removable && (
                      <button className="btn btn-danger" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => removeProgram(n)} title="어디에도 쓰이지 않는 프로그램을 목록에서 지웁니다">
                        삭제
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 12, color: "var(--muted)", fontSize: 13 }}>
                  표시할 프로그램이 없습니다. 위에서 직접 추가하거나, 플랜을 등록하거나 타임테이블에 프로그램을 추가하면 여기에 나타납니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <details style={{ marginTop: 20 }}>
        <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 600 }}>등록된 카테고리 {cats.length}개 — 이름 수정 · 삭제</summary>
        <div style={{ marginTop: 10 }}>
          <CategoryManager cats={cats} reload={reloadCats} hideAdd />
        </div>
      </details>
    </div>
  );
}
