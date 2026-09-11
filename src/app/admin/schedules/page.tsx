"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ImageRow, ScheduledImageSetRow } from "@/lib/types";
import { WEEKDAY_LABELS } from "@/lib/types";

const TV_IDS = [1, 2, 3, 4, 5];

export default function SchedulesPage() {
  const [rows, setRows] = useState<ScheduledImageSetRow[]>([]);
  const [images, setImages] = useState<ImageRow[]>([]);

  const [tvId, setTvId] = useState(1);
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [imageIds, setImageIds] = useState<string[]>([]);

  async function load() {
    const { data: sets } = await supabase.from("scheduled_image_sets").select("*").order("weekday");
    setRows(sets || []);
    const { data: imgs } = await supabase.from("images").select("*").order("created_at", { ascending: false });
    setImages(imgs || []);
  }

  useEffect(() => {
    load();
  }, []);

  function toggleImage(id: string) {
    setImageIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function add() {
    if (imageIds.length === 0) {
      alert("이미지를 1개 이상 선택해주세요");
      return;
    }
    await supabase.from("scheduled_image_sets").insert({
      tv_id: tvId,
      weekday,
      start_time: `${startTime}:00`,
      end_time: `${endTime}:00`,
      image_ids: imageIds
    });
    setImageIds([]);
    await load();
  }

  async function remove(id: string) {
    await supabase.from("scheduled_image_sets").delete().eq("id", id);
    await load();
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>요일별 추가 이미지</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
        지정한 요일·시간대 동안 선택한 이미지가 해당 TV의 기본 재생목록에 추가되어 함께 루핑됩니다.
      </p>

      <div className="card" style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div>
            <label className="label">TV</label>
            <select className="input" value={tvId} onChange={(e) => setTvId(Number(e.target.value))}>
              {TV_IDS.map((id) => (
                <option key={id} value={id}>
                  TV {id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">요일</label>
            <select className="input" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {WEEKDAY_LABELS.map((label, i) => (
                <option key={i} value={i}>
                  {label}요일
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">시작 시간</label>
            <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <label className="label">종료 시간</label>
            <input className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">함께 루핑할 이미지</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
            {images.map((img) => {
              const checked = imageIds.includes(img.id);
              return (
                <label
                  key={img.id}
                  style={{
                    border: checked ? "2px solid #2f6fed" : "1px solid #dfe2e8",
                    borderRadius: 8,
                    padding: 4,
                    cursor: "pointer"
                  }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleImage(img.id)} />
                  <img src={img.url} style={{ width: "100%", height: 60, objectFit: "cover", borderRadius: 4 }} />
                </label>
              );
            })}
          </div>
        </div>

        <button className="btn" style={{ width: 160 }} onClick={add}>
          추가
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => (
          <div key={r.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 14 }}>
              TV {r.tv_id} · {WEEKDAY_LABELS[r.weekday]}요일 · {r.start_time.slice(0, 5)}~{r.end_time.slice(0, 5)} · 이미지{" "}
              {r.image_ids.length}장
            </div>
            <button className="btn btn-outline" onClick={() => remove(r.id)}>
              삭제
            </button>
          </div>
        ))}
        {rows.length === 0 && <div style={{ color: "#6b7280", fontSize: 14 }}>등록된 스케줄이 없습니다.</div>}
      </div>
    </div>
  );
}
