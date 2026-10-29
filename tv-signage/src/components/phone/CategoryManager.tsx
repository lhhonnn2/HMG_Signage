"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { PhoneCategoryRow } from "@/lib/types";
import { BRANDS, DIVISIONS } from "@/lib/facets";
import { sortCats } from "./shared";

export default function CategoryManager({ cats, reload, hideAdd }: { cats: PhoneCategoryRow[]; reload: () => Promise<void>; hideAdd?: boolean }) {
  const [division, setDivision] = useState(DIVISIONS[0]);
  const [brand, setBrand] = useState(BRANDS[0]);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  async function add() {
    const n = name.trim();
    if (!n) return;
    const { error } = await supabase.from("phone_categories").insert({ division, brand, name: n });
    if (error) {
      alert("추가 실패: " + (error.message.includes("duplicate") ? "같은 구분·브랜드에 같은 이름의 카테고리가 이미 있습니다" : error.message));
      return;
    }
    setName("");
    await reload();
  }

  async function rename() {
    if (!editing) return;
    const n = editing.name.trim();
    if (!n) return;
    const { error } = await supabase.from("phone_categories").update({ name: n }).eq("id", editing.id);
    if (error) {
      alert("이름 변경 실패: " + (error.message.includes("duplicate") ? "같은 이름이 이미 있습니다" : error.message));
      return;
    }
    setEditing(null);
    await reload();
  }

  async function remove(c: PhoneCategoryRow) {
    if (!confirm(`'${c.division} · ${c.brand} · ${c.name}'을(를) 삭제할까요?\n이 카테고리로 분류된 프로그램은 '미분류'가 됩니다.`)) return;
    const { error } = await supabase.from("phone_categories").delete().eq("id", c.id);
    if (error) {
      alert("삭제 실패: " + error.message);
      return;
    }
    await reload();
  }

  const grouped = new Map<string, PhoneCategoryRow[]>();
  for (const c of sortCats(cats)) {
    const k = `${c.division} · ${c.brand}`;
    grouped.set(k, [...(grouped.get(k) || []), c]);
  }

  return (
    <div>
      {!hideAdd && (
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>카테고리 추가</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select className="input" style={{ width: 90 }} value={division} onChange={(e) => setDivision(e.target.value)}>
            {DIVISIONS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <select className="input" style={{ width: 120 }} value={brand} onChange={(e) => setBrand(e.target.value)}>
            {BRANDS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <input
            className="input"
            style={{ width: 230 }}
            value={name}
            placeholder="예: 레벨1, 베이직 드라이브 lite"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button className="btn btn-accent" disabled={!name.trim()} onClick={add}>
            + 추가
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
          구분(DX/DP) → 브랜드 → 카테고리 순입니다. 같은 이름(예: 베이직 드라이브)을 브랜드별로 각각 추가할 수 있고, 직원 화면에서는 브랜드를 고르면 그 브랜드에 있는 카테고리만 보입니다.
        </div>
      </div>
      )}

      {cats.length === 0 && <div className="card" style={{ color: "var(--muted)", fontSize: 14 }}>등록된 카테고리가 없습니다.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {Array.from(grouped.entries()).map(([k, list]) => (
          <div key={k} className="card">
            <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>{k}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {list.map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {editing?.id === c.id ? (
                    <>
                      <input
                        className="input"
                        style={{ width: 220 }}
                        value={editing.name}
                        onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && rename()}
                      />
                      <button className="btn btn-accent" style={{ fontSize: 12, padding: "5px 10px" }} onClick={rename}>
                        저장
                      </button>
                      <button className="btn btn-outline" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => setEditing(null)}>
                        취소
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 14, minWidth: 160 }}>{c.name}</span>
                      <button className="btn btn-outline" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => setEditing({ id: c.id, name: c.name })}>
                        이름 변경
                      </button>
                      <button className="btn btn-danger" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => remove(c)}>
                        삭제
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
