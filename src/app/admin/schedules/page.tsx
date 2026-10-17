"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ImageRow, ScheduledImageSetRow } from "@/lib/types";
import { WEEKDAY_LABELS } from "@/lib/types";
import { useTvs } from "@/lib/useTvNames";
import ImageMultiSelectGrid from "@/components/ImageMultiSelectGrid";

export default function SchedulesPage() {
  const { ids: tvIds, names: tvNames } = useTvs();
  const [rows, setRows] = useState<ScheduledImageSetRow[]>([]);
  const [images, setImages] = useState<ImageRow[]>([]);

  const [tvId, setTvId] = useState(1);
  // Keep the selected TV valid when the TV list loads or a TV is deleted.
  useEffect(() => {
    if (tvIds.length > 0 && !tvIds.includes(tvId)) setTvId(tvIds[0]);
  }, [tvIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [imageIds, setImageIds] = useState<string[]>([]);

  async function load() {
    const { data: sets } = await supabase.from("scheduled_image_sets").select("*").order("tv_id");
    setRows((sets as ScheduledImageSetRow[]) || []);
    const { data: imgs } = await supabase.from("images").select("*").order("created_at", { ascending: false });
    setImages(imgs || []);
  }

  useEffect(() => {
    load();
  }, []);

  function toggleWeekday(d: number) {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function toggleImage(id: string) {
    setImageIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function add() {
    if (weekdays.length === 0) {
      alert("요일을 1개 이상 선택해주세요");
      return;
    }
    if (imageIds.length === 0) {
      alert("이미지를 1장 이상 선택해주세요");
      return;
    }
    await supabase.from("scheduled_image_sets").insert({
      tv_id: tvId,
      weekdays: [...weekdays].sort(),
      start_time: `${startTime}:00`,
      end_time: `${endTime}:00`,
      image_ids: imageIds
    });
    setWeekdays([]);
    setImageIds([]);
    await load();
  }

  async function toggleEnabled(r: ScheduledImageSetRow) {
    const next = r.enabled === false;
    // optimistic update so the switch responds instantly
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: next } : x)));
    const { error } = await supabase.from("scheduled_image_sets").update({ enabled: next }).eq("id", r.id);
    if (error) {
      alert("변경 실패: " + error.message + "\n(supabase/migration_v11.sql 을 실행했는지 확인하세요)");
      await load();
    }
  }

  async function remove(id: string) {
    await supabase.from("scheduled_image_sets").delete().eq("id", id);
    await load();
  }

  const imageMap = new Map(images.map((i) => [i.id, i]));

  return (
    <div>
      <div className="page-title">요일별 추가 이미지</div>
      <div className="page-subtitle">지정한 요일·시간대 동안 선택한 이미지가 해당 TV의 기본 재생목록에 추가되어 함께 루핑됩니다.</div>

      <div className="card" style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div>
            <label className="label">TV</label>
            <select className="input" value={tvId} onChange={(e) => setTvId(Number(e.target.value))}>
              {tvIds.map((id) => (
                <option key={id} value={id}>
                  {tvNames[id]}
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
          <label className="label">요일 (여러 개 선택 가능 — 예: 토+일을 같이 선택)</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {WEEKDAY_LABELS.map((label, i) => (
              <button key={i} type="button" className="chip" data-active={weekdays.includes(i)} onClick={() => toggleWeekday(i)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">함께 루핑할 이미지</label>
          <ImageMultiSelectGrid images={images} selectedIds={imageIds} onToggle={toggleImage} />
        </div>

        <button className="btn btn-accent" style={{ width: 160 }} onClick={add}>
          추가
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => (
          <div key={r.id} className="card" style={{ opacity: r.enabled === false ? 0.55 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 13.5 }}>
                <b>{tvNames[r.tv_id]}</b> · {r.weekdays.map((d) => WEEKDAY_LABELS[d]).join("·")}요일 · {r.start_time.slice(0, 5)}~
                {r.end_time.slice(0, 5)}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={r.enabled !== false}
                  onClick={() => toggleEnabled(r)}
                  title={r.enabled === false ? "꺼짐 — 눌러서 켜기" : "켜짐 — 눌러서 끄기"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    color: r.enabled === false ? "var(--muted)" : "var(--accent, #16a34a)",
                    opacity: 1
                  }}
                >
                  <span
                    style={{
                      width: 34,
                      height: 20,
                      borderRadius: 10,
                      background: r.enabled === false ? "#cbd5e1" : "#16a34a",
                      position: "relative",
                      transition: "background .15s"
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        left: r.enabled === false ? 2 : 16,
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        background: "#fff",
                        transition: "left .15s"
                      }}
                    />
                  </span>
                  {r.enabled === false ? "OFF" : "ON"}
                </button>
                <button className="btn btn-danger" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => remove(r.id)}>
                  삭제
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {r.image_ids.map((imgId, i) => {
                const img = imageMap.get(imgId);
                return img ? (
                  <img
                    key={`${imgId}-${i}`}
                    src={img.thumbnail_url || img.url}
                    alt={img.filename}
                    loading="lazy"
                    decoding="async"
                    title={img.filename}
                    style={{ width: 44, height: 32, objectFit: "cover", borderRadius: 4, border: "1px solid var(--line)" }}
                  />
                ) : null;
              })}
            </div>
          </div>
        ))}
        {rows.length === 0 && <div style={{ color: "var(--muted)", fontSize: 14 }}>등록된 스케줄이 없습니다.</div>}
      </div>
    </div>
  );
}
