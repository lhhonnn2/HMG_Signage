"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { uploadFile } from "@/lib/uploadFile";
import type { AlarmSettingsRow, FontRow } from "@/lib/types";
import { DEFAULT_TEMPLATE, renderAlarmLines } from "@/lib/types";

const SAMPLE = { program_name: "오프로드 체험", location: "1번 트랙 앞", scheduled_time: "10:00" };

export default function AlarmSettingsPage() {
  const [fonts, setFonts] = useState<FontRow[]>([]);
  const [fontId, setFontId] = useState<string>("");
  const [newFontName, setNewFontName] = useState("");
  const [uploadingFont, setUploadingFont] = useState(false);
  const fontInputRef = useRef<HTMLInputElement>(null);

  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [sizes, setSizes] = useState<number[]>([40, 28, 28, 24]);
  const [saving, setSaving] = useState(false);

  const lines = template.split("\n");

  async function load() {
    const { data: f } = await supabase.from("fonts").select("*").order("name");
    setFonts(f || []);

    const { data } = await supabase.from("alarm_settings").select("*").eq("id", 1).maybeSingle();
    const s = data as AlarmSettingsRow | null;
    if (s) {
      setFontId(s.font_id || "");
      setTemplate(s.template);
      setSizes(s.line_font_sizes);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function sizeFor(i: number) {
    return sizes[i] ?? sizes[sizes.length - 1] ?? 28;
  }

  function setSizeFor(i: number, value: number) {
    setSizes((prev) => {
      const next = [...prev];
      while (next.length <= i) next.push(next[next.length - 1] ?? 28);
      next[i] = value;
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await supabase.from("alarm_settings").upsert({
        id: 1,
        font_id: fontId || null,
        template,
        line_font_sizes: lines.map((_, i) => sizeFor(i))
      });
      alert("저장되었습니다. 모든 TV의 알람 화면에 즉시 반영됩니다.");
    } finally {
      setSaving(false);
    }
  }

  async function onFontUpload() {
    const file = fontInputRef.current?.files?.[0];
    if (!file) return;
    if (!newFontName.trim()) {
      alert("폰트 이름을 입력해주세요");
      return;
    }
    setUploadingFont(true);
    try {
      const url = await uploadFile(file, file.name, "fonts");
      const { data } = await supabase.from("fonts").insert({ name: newFontName.trim(), url }).select().single();
      setNewFontName("");
      if (fontInputRef.current) fontInputRef.current.value = "";
      await load();
      if (data) setFontId(data.id);
    } finally {
      setUploadingFont(false);
    }
  }

  async function removeFont(id: string) {
    if (!confirm("이 폰트를 삭제할까요?")) return;
    await supabase.from("fonts").delete().eq("id", id);
    if (fontId === id) setFontId("");
    await load();
  }

  const previewFont = fonts.find((f) => f.id === fontId);
  const previewLines = renderAlarmLines(template, SAMPLE);
  const previewFamily = previewFont ? `preview-font-${previewFont.id}` : "inherit";

  return (
    <div>
      <div className="page-title">알람 서식 설정</div>
      <div className="page-subtitle">모든 TV의 알람 화면에 공통으로 적용되는 문구, 줄별 글자 크기, 폰트입니다.</div>

      <div className="responsive-grid-2" style={{ alignItems: "start" }}>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <label className="label">알람 문구 템플릿</label>
            <textarea
              className="input"
              style={{ minHeight: 120, fontFamily: "monospace", resize: "vertical" }}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
              [프로그램명], [장소], [시작시간] 자리에 알람 등록 시 입력한 값이 자동으로 들어갑니다. 줄을 추가하거나 지워도 됩니다 — 아래
              글자 크기도 줄 수에 맞춰 늘어납니다.
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>줄별 글자 크기 (px)</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {lines.map((line, i) => (
                <div key={i}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      marginBottom: 4,
                      maxWidth: 140,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {i + 1}번째 줄: {line || "(빈 줄)"}
                  </div>
                  <input
                    className="input"
                    type="number"
                    style={{ width: 90 }}
                    value={sizeFor(i)}
                    onChange={(e) => setSizeFor(i, Number(e.target.value))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>폰트</div>
            <select className="input" style={{ marginBottom: 14 }} value={fontId} onChange={(e) => setFontId(e.target.value)}>
              <option value="">기본 폰트</option>
              {fonts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {fonts.map((f) => (
                <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                  <span>{f.name}</span>
                  <button className="btn btn-danger" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => removeFont(f.id)}>
                    삭제
                  </button>
                </div>
              ))}
            </div>

            <div style={{ borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 12 }}>
              <label className="label">새 폰트 업로드</label>
              <input
                className="input"
                style={{ marginBottom: 8 }}
                placeholder="폰트 이름 (예: 프리텐다드 볼드)"
                value={newFontName}
                onChange={(e) => setNewFontName(e.target.value)}
              />
              <input ref={fontInputRef} type="file" accept=".woff,.woff2,.ttf,.otf" />
              <button className="btn btn-outline" style={{ marginLeft: 8 }} disabled={uploadingFont} onClick={onFontUpload}>
                {uploadingFont ? "업로드 중..." : "업로드"}
              </button>
            </div>
          </div>

          <button className="btn btn-accent" disabled={saving} onClick={save}>
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>

        <div style={{ position: "sticky", top: 32 }}>
          <div className="label" style={{ marginBottom: 8 }}>
            실시간 미리보기 (예시 값 기준)
          </div>
          {previewFont && <style>{`@font-face { font-family: '${previewFamily}'; src: url('${previewFont.url}'); }`}</style>}
          <div
            style={{
              background: "#000",
              color: "#fff",
              borderRadius: 12,
              aspectRatio: "16 / 9",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "1.2%",
              textAlign: "center",
              padding: "4%",
              overflow: "hidden"
            }}
          >
            {previewLines.map((text, i) => {
              const size = sizeFor(i);
              // scale down to fit the smaller preview box (full TV screen ≈ 1080px tall)
              const scaled = Math.max(6, Math.round(size * 0.42));
              return (
                <div
                  key={i}
                  style={{
                    fontFamily: previewFamily,
                    fontSize: scaled,
                    fontWeight: i === 0 ? 700 : 500,
                    lineHeight: 1.4
                  }}
                >
                  {text}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
