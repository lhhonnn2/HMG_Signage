"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { uploadFile } from "@/lib/uploadFile";
import type { ImageRow, ImageTemplateRow, TvAudioRow, TvSettingsRow } from "@/lib/types";
import { TV_IDS } from "@/lib/types";
import { useTvNames } from "@/lib/useTvNames";
import OrderedImagePicker from "@/components/OrderedImagePicker";

export default function TvsPage() {
  const [activeTv, setActiveTv] = useState(1);
  const tvNames = useTvNames();
  const [tvName, setTvName] = useState("");
  const [images, setImages] = useState<ImageRow[]>([]);
  const [templates, setTemplates] = useState<ImageTemplateRow[]>([]);
  const [templateChoice, setTemplateChoice] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [interval, setIntervalSec] = useState(5);
  const [audio, setAudio] = useState<TvAudioRow>({ tv_id: activeTv, audio_url: null, audio_enabled: false });
  const [saving, setSaving] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  async function loadTvSpecific() {
    const { data: tvRow } = await supabase.from("tvs").select("*").eq("id", activeTv).maybeSingle();
    setTvName((tvRow as any)?.name ?? `TV ${activeTv}`);

    const { data: playlist } = await supabase
      .from("tv_playlists")
      .select("image_id, sort_order")
      .eq("tv_id", activeTv)
      .order("sort_order");
    setSelectedIds((playlist || []).map((p) => p.image_id));

    const { data: settings } = await supabase.from("tv_settings").select("*").eq("tv_id", activeTv).maybeSingle();
    setIntervalSec((settings as TvSettingsRow | null)?.interval_seconds ?? 5);

    const { data: audioRow } = await supabase.from("tv_audio").select("*").eq("tv_id", activeTv).maybeSingle();
    setAudio((audioRow as TvAudioRow | null) ?? { tv_id: activeTv, audio_url: null, audio_enabled: false });
  }

  useEffect(() => {
    supabase
      .from("images")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setImages(data || []));
    supabase
      .from("image_templates")
      .select("*")
      .order("name")
      .then(({ data }) => setTemplates(data || []));
  }, []);

  useEffect(() => {
    loadTvSpecific();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTv]);

  function applyTemplate() {
    const t = templates.find((x) => x.id === templateChoice);
    if (!t) return;
    setSelectedIds((prev) => [...prev, ...t.image_ids]);
    setTemplateChoice("");
  }

  async function save() {
    setSaving(true);
    try {
      await supabase.from("tvs").update({ name: tvName.trim() || `TV ${activeTv}` }).eq("id", activeTv);
      await supabase.from("tv_settings").upsert({ tv_id: activeTv, interval_seconds: interval });

      await supabase.from("tv_playlists").delete().eq("tv_id", activeTv);
      if (selectedIds.length > 0) {
        await supabase
          .from("tv_playlists")
          .insert(selectedIds.map((image_id, i) => ({ tv_id: activeTv, image_id, sort_order: i })));
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
    const url = await uploadFile(file, file.name, "audio");
    setAudio((a) => ({ ...a, audio_url: url }));
  }

  return (
    <div>
      <div className="page-title">TV 설정</div>
      <div className="page-subtitle">TV별로 이름, 재생목록, 전환 속도, 알람 음원을 따로 설정합니다.</div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {TV_IDS.map((id) => (
          <button key={id} className="chip" data-active={activeTv === id} onClick={() => setActiveTv(id)}>
            {tvNames[id]}
          </button>
        ))}
        <a className="chip" href={`/player/${activeTv}`} target="_blank" rel="noreferrer" style={{ marginLeft: "auto" }}>
          {tvNames[activeTv]} 화면 미리보기 ↗
        </a>
      </div>

      <div className="card" style={{ marginBottom: 12, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label className="label">이름</label>
          <input
            className="input"
            style={{ width: 180 }}
            value={tvName}
            onChange={(e) => setTvName(e.target.value)}
            placeholder={`TV ${activeTv}`}
          />
        </div>
        <div>
          <label className="label">이미지 전환 속도 (초)</label>
          <input
            className="input"
            type="number"
            min={1}
            style={{ width: 90 }}
            value={interval}
            onChange={(e) => setIntervalSec(Number(e.target.value))}
          />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={audio.audio_enabled}
              onChange={(e) => setAudio((a) => ({ ...a, audio_enabled: e.target.checked }))}
            />
            알람 노출 중 음원 반복 재생
          </label>
        </div>
        <div>
          <input ref={audioInputRef} type="file" accept="audio/*" style={{ fontSize: 12, maxWidth: 160 }} />
          <button className="btn btn-outline" style={{ marginLeft: 6, fontSize: 12, padding: "6px 10px" }} onClick={onAudioUpload}>
            음원 업로드
          </button>
        </div>
      </div>
      {audio.audio_url && (
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 12, wordBreak: "break-all" }}>
          현재 음원: {audio.audio_url}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>재생목록</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <select className="input" style={{ width: 220 }} value={templateChoice} onChange={(e) => setTemplateChoice(e.target.value)}>
            <option value="">템플릿에서 추가...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.image_ids.length}장)
              </option>
            ))}
          </select>
          <button className="btn btn-outline" disabled={!templateChoice} onClick={applyTemplate}>
            뒤에 추가
          </button>
          {selectedIds.length > 0 && (
            <button className="btn btn-outline" onClick={() => setSelectedIds([])} style={{ marginLeft: "auto" }}>
              전체 비우기
            </button>
          )}
        </div>

        <OrderedImagePicker images={images} value={selectedIds} onChange={setSelectedIds} />
      </div>

      <button className="btn btn-accent" disabled={saving} onClick={save}>
        {saving ? "저장 중..." : "저장"}
      </button>
    </div>
  );
}
