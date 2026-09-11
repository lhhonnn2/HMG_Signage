"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { uploadFile } from "@/lib/uploadFile";
import type { ImageRow, TvAudioRow, TvSettingsRow } from "@/lib/types";

const TV_IDS = [1, 2, 3, 4, 5];

export default function TvsPage() {
  const [activeTv, setActiveTv] = useState(1);
  const [images, setImages] = useState<ImageRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [interval, setIntervalSec] = useState(5);
  const [audio, setAudio] = useState<TvAudioRow>({ tv_id: activeTv, audio_url: null, audio_enabled: false });
  const [saving, setSaving] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  async function loadAll() {
    const { data: imgs } = await supabase.from("images").select("*").order("created_at", { ascending: false });
    setImages(imgs || []);

    const { data: playlist } = await supabase
      .from("tv_playlists")
      .select("image_id, sort_order")
      .eq("tv_id", activeTv)
      .order("sort_order");
    setSelectedIds((playlist || []).map((p) => p.image_id));

    const { data: settings } = await supabase
      .from("tv_settings")
      .select("*")
      .eq("tv_id", activeTv)
      .maybeSingle();
    setIntervalSec((settings as TvSettingsRow | null)?.interval_seconds ?? 5);

    const { data: audioRow } = await supabase
      .from("tv_audio")
      .select("*")
      .eq("tv_id", activeTv)
      .maybeSingle();
    setAudio((audioRow as TvAudioRow | null) ?? { tv_id: activeTv, audio_url: null, audio_enabled: false });
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTv]);

  function toggleImage(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    setSaving(true);
    try {
      await supabase.from("tv_settings").upsert({ tv_id: activeTv, interval_seconds: interval });

      await supabase.from("tv_playlists").delete().eq("tv_id", activeTv);
      if (selectedIds.length > 0) {
        await supabase.from("tv_playlists").insert(
          selectedIds.map((image_id, i) => ({ tv_id: activeTv, image_id, sort_order: i }))
        );
      }

      await supabase.from("tv_audio").upsert({
        tv_id: activeTv,
        audio_url: audio.audio_url,
        audio_enabled: audio.audio_enabled
      });

      alert("저장되었습니다");
    } finally {
      setSaving(false);
    }
  }

  async function onAudioUpload() {
    const file = audioInputRef.current?.files?.[0];
    if (!file) return;
    const url = await uploadFile(file, "audio");
    setAudio((a) => ({ ...a, audio_url: url }));
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>TV 설정</h1>

      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {TV_IDS.map((id) => (
          <button
            key={id}
            className={activeTv === id ? "btn" : "btn btn-outline"}
            onClick={() => setActiveTv(id)}
          >
            TV {id}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <label className="label">이미지 전환 속도 (초)</label>
        <input
          className="input"
          type="number"
          min={1}
          style={{ width: 120 }}
          value={interval}
          onChange={(e) => setIntervalSec(Number(e.target.value))}
        />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>알람 음원</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={audio.audio_enabled}
            onChange={(e) => setAudio((a) => ({ ...a, audio_enabled: e.target.checked }))}
          />
          이 TV는 알람 노출 중 음원을 반복 재생함
        </label>
        <input ref={audioInputRef} type="file" accept="audio/*" />
        <button className="btn btn-outline" style={{ marginLeft: 8 }} onClick={onAudioUpload}>
          음원 업로드
        </button>
        {audio.audio_url && (
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8, wordBreak: "break-all" }}>
            현재 설정된 파일: {audio.audio_url}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>재생목록 (선택한 이미지가 이 TV에서 루핑됩니다)</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 10
          }}
        >
          {images.map((img) => {
            const checked = selectedIds.includes(img.id);
            return (
              <label
                key={img.id}
                style={{
                  border: checked ? "2px solid #2f6fed" : "1px solid #dfe2e8",
                  borderRadius: 8,
                  padding: 6,
                  cursor: "pointer"
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleImage(img.id)}
                  style={{ marginBottom: 4 }}
                />
                <img src={img.url} alt={img.filename} style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 4 }} />
              </label>
            );
          })}
        </div>
        {images.length === 0 && (
          <div style={{ color: "#6b7280", fontSize: 14 }}>먼저 이미지 메뉴에서 이미지를 업로드해주세요.</div>
        )}
      </div>

      <button className="btn" disabled={saving} onClick={save}>
        {saving ? "저장 중..." : "저장"}
      </button>
    </div>
  );
}
