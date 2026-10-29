"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { uploadFile } from "@/lib/uploadFile";
import type { FrequencyGroup, ImageRow, ImageTemplateRow, PlaylistEntry, TvAudioRow, TvSettingsRow } from "@/lib/types";
import { newLocalId } from "@/lib/types";
import { useTvs, notifyTvsChanged } from "@/lib/useTvNames";
import PlaylistEditor from "@/components/PlaylistEditor";

export default function TvsPage() {
  const [activeTv, setActiveTv] = useState(1);
  const { ids: tvIds, names: tvNames, loaded: tvsLoaded } = useTvs();
  // Keep the selected TV valid when the TV list loads or a TV is deleted.
  useEffect(() => {
    if (tvIds.length > 0 && !tvIds.includes(activeTv)) setActiveTv(tvIds[0]);
  }, [tvIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!tvsLoaded || !tvIds.includes(activeTv)) return;
    loadTvSpecific();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTv, tvsLoaded, tvIds.join(",")]);

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

  async function addTv() {
    const nextId = (tvIds.length ? Math.max(...tvIds) : 0) + 1;
    const { error } = await supabase.from("tvs").insert({ id: nextId, name: `TV ${nextId}` });
    if (error) {
      alert("TV 추가 실패: " + error.message + "\n(supabase/migration_v10.sql 을 실행했는지 확인하세요)");
      return;
    }
    await supabase.from("tv_settings").upsert({ tv_id: nextId });
    notifyTvsChanged();
    setActiveTv(nextId);
  }

  async function deleteTv() {
    if (!confirm(`'${tvNames[activeTv]}'을(를) 삭제할까요?\n이 TV의 재생목록, 알람 스케줄, 요일별 이미지, 음원 설정이 모두 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    const { error } = await supabase.from("tvs").delete().eq("id", activeTv);
    if (error) {
      alert("삭제 실패: " + error.message);
      return;
    }
    notifyTvsChanged();
  }

  async function save() {
    setSaving(true);
    try {
      await supabase.from("tvs").update({ name: tvName.trim() || `TV ${activeTv}` }).eq("id", activeTv);
      notifyTvsChanged();
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
        {tvIds.map((id) => (
          <button key={id} className="chip" data-active={activeTv === id} onClick={() => setActiveTv(id)}>
            {tvNames[id]}
          </button>
        ))}
        <button className="chip" onClick={addTv}>
          + TV 추가
        </button>
        {tvIds.includes(activeTv) && (
          <a className="chip" href={`/player/${activeTv}`} target="_blank" rel="noreferrer" style={{ marginLeft: "auto" }}>
            {tvNames[activeTv]} 화면 미리보기 ↗
          </a>
        )}
      </div>

      {tvsLoaded && tvIds.length === 0 && (
        <div className="card" style={{ marginBottom: 16, fontSize: 13 }}>
          등록된 TV가 없습니다. 위의 "+ TV 추가"를 눌러 TV를 만드세요.
        </div>
      )}
      {tvIds.length > 0 && (
      <>

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

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-accent" disabled={saving} onClick={save}>
          {saving ? "저장 중..." : "저장"}
        </button>
        <button className="btn btn-outline" style={{ color: "#dc2626", marginLeft: "auto" }} onClick={deleteTv}>
          이 TV 삭제
        </button>
      </div>
      </>
      )}
    </div>
  );
}
