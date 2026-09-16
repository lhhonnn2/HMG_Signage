"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { uploadFile } from "@/lib/uploadFile";
import type { FrequencyGroup, ImageRow, ImageTemplateRow, PlaylistEntry, TvAudioRow, TvSettingsRow } from "@/lib/types";
import { TV_IDS, newLocalId } from "@/lib/types";
import { useTvNames } from "@/lib/useTvNames";
import PlaylistEditor from "@/components/PlaylistEditor";

export default function TvsPage() {
  const [activeTv, setActiveTv] = useState(1);
  const tvNames = useTvNames();
  const [tvName, setTvName] = useState("");
  const [images, setImages] = useState<ImageRow[]>([]);
  const [templates, setTemplates] = useState<ImageTemplateRow[]>([]);
  const [templateChoice, setTemplateChoice] = useState("");
  const [entries, setEntries] = useState<PlaylistEntry[]>([]);
  const [groups, setGroups] = useState<FrequencyGroup[]>([]);
  const [interval, setIntervalSec] = useState(5);
  const [audio, setAudio] = useState<TvAudioRow>({ tv_id: activeTv, audio_url: null, audio_enabled: false });
  const [saving, setSaving] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  async function loadTvSpecific() {
    const { data: tvRow } = await supabase.from("tvs").select("*").eq("id", activeTv).maybeSingle();
    setTvName((tvRow as any)?.name ?? `TV ${activeTv}`);

    const { data: settings } = await supabase.from("tv_settings").select("*").eq("tv_id", activeTv).maybeSingle();
    const s = settings as TvSettingsRow | null;
    setIntervalSec(s?.interval_seconds ?? 5);
    setEntries(s?.playlist_entries ?? []);
    setGroups(s?.frequency_groups ?? []);

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
      .then(({ data }) => setTemplates((data as ImageTemplateRow[]) || []));
  }, []);

  useEffect(() => {
    loadTvSpecific();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTv]);

  function applyTemplate() {
    const t = templates.find((x) => x.id === templateChoice);
    if (!t) return;
    // Give the template's groups fresh ids so applying the same template
    // twice (or to multiple TVs) doesn't collide.
    const idMap = new Map<string, string>();
    const newGroups = (t.frequency_groups || []).map((g) => {
      const newId = newLocalId();
      idMap.set(g.id, newId);
      return { id: newId, image_ids: g.image_ids };
    });
    const newEntries = (t.entries || []).map((e) =>
      e.type === "group" ? { id: newLocalId(), type: "group" as const, group_id: idMap.get(e.group_id) ?? e.group_id } : { ...e, id: newLocalId() }
    );
    setEntries((prev) => [...prev, ...newEntries]);
    setGroups((prev) => [...prev, ...newGroups]);
    setTemplateChoice("");
  }

  async function save() {
    setSaving(true);
    try {
      await supabase.from("tvs").update({ name: tvName.trim() || `TV ${activeTv}` }).eq("id", activeTv);
      await supabase.from("tv_settings").upsert({
        tv_id: activeTv,
        interval_seconds: interval,
        playlist_entries: entries,
        frequency_groups: groups.filter((g) => g.image_ids.length > 0)
      });

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

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>재생목록</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select className="input" style={{ width: 220 }} value={templateChoice} onChange={(e) => setTemplateChoice(e.target.value)}>
              <option value="">템플릿에서 추가...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.entries?.length ?? 0}개)
                </option>
              ))}
            </select>
            <button className="btn btn-outline" disabled={!templateChoice} onClick={applyTemplate}>
              뒤에 추가
            </button>
            {entries.length > 0 && (
              <button
                className="btn btn-outline"
                onClick={() => {
                  setEntries([]);
                  setGroups([]);
                }}
              >
                전체 비우기
              </button>
            )}
          </div>
        </div>

        <PlaylistEditor
          images={images}
          entries={entries}
          groups={groups}
          onChange={(e, g) => {
            setEntries(e);
            setGroups(g);
          }}
        />
      </div>

      <button className="btn btn-accent" disabled={saving} onClick={save}>
        {saving ? "저장 중..." : "저장"}
      </button>
    </div>
  );
}
