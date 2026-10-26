"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import { uploadFile } from "@/lib/uploadFile";
import type { AlarmSettingsRow, FontRow } from "@/lib/types";
import { DEFAULT_TEMPLATE, renderAlarmLines, contrastTextColor } from "@/lib/types";

const SAMPLE = { program_name: "현대 베이직 드라이브 Lite", location: "1번 렉처룸", scheduled_time: "10:00" };
const SAMPLE_2 = { program_name: "기아 레벨 1", location: "2번 렉처룸", scheduled_time: "10:05" };

// Real screen sizes (CSS px) the previews are drawn at, then scaled down to fit
// the box — so a font size here looks on the preview exactly as proportioned
// as it does on the TV.
const LANDSCAPE_SIZES = [
  { value: "1920x1080", w: 1920, h: 1080, label: "1920×1080 (FHD, 기본)" },
  { value: "1280x720", w: 1280, h: 720, label: "1280×720" },
  { value: "3840x2160", w: 3840, h: 2160, label: "3840×2160 (4K)" }
];
const PORTRAIT_SIZES = [
  { value: "1080x1920", w: 1080, h: 1920, label: "1080×1920 (SERO 4K 43형, 기본)" },
  { value: "565x1228", w: 565, h: 1228, label: "565×1228" },
  { value: "2160x3840", w: 2160, h: 3840, label: "2160×3840 (4K 실제 해상도)" }
];

// Draws `children` on a virtual screen of width×height real pixels and shrinks
// it to fit the available width (and optional max height).
function ScaledScreen({ width, height, maxHeight, children }: { width: number; height: number; maxHeight?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setBoxW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  let scale = boxW > 0 ? boxW / width : 0.2;
  if (maxHeight) scale = Math.min(scale, maxHeight / height);
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <div style={{ width: width * scale, height: height * scale, margin: "0 auto", overflow: "hidden", borderRadius: 12, position: "relative" }}>
        <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", top: 0, left: 0 }}>{children}</div>
      </div>
    </div>
  );
}

type PreviewMode = "landscape" | "portrait" | "split";

const PREVIEW_MODES: { value: PreviewMode; label: string }[] = [
  { value: "landscape", label: "가로 (16:9)" },
  { value: "portrait", label: "세로 (SERO)" },
  { value: "split", label: "알람 2개 (2분할)" }
];

export default function AlarmSettingsPage() {
  const [fonts, setFonts] = useState<FontRow[]>([]);
  const [fontId, setFontId] = useState<string>("");
  const [newFontName, setNewFontName] = useState("");
  const [uploadingFont, setUploadingFont] = useState(false);
  const fontInputRef = useRef<HTMLInputElement>(null);

  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [sizes, setSizes] = useState<number[]>([40, 28, 28, 24]);
  const [backgroundColor, setBackgroundColor] = useState("#000000");
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("landscape");
  const [landscapeSize, setLandscapeSize] = useState(LANDSCAPE_SIZES[0].value);
  const [portraitSize, setPortraitSize] = useState(PORTRAIT_SIZES[0].value);

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
      setBackgroundColor(s.background_color || "#000000");
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
        line_font_sizes: lines.map((_, i) => sizeFor(i)),
        background_color: backgroundColor
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
  const previewFamily = previewFont ? `preview-font-${previewFont.id}` : "inherit";
  const textColor = contrastTextColor(backgroundColor);

  const PS = PORTRAIT_SIZES.find((x) => x.value === portraitSize) ?? PORTRAIT_SIZES[0];
  const LS = LANDSCAPE_SIZES.find((x) => x.value === landscapeSize) ?? LANDSCAPE_SIZES[0];

  // Same markup/sizes the player uses (see AlarmView): real px font sizes, gap 16, side padding 24.
  function renderLines(vars: typeof SAMPLE) {
    return renderAlarmLines(template, vars).map((text, i) => (
      <div key={i} style={{ fontFamily: previewFamily, fontSize: sizeFor(i), fontWeight: i === 0 ? 700 : 500, lineHeight: 1.4 }}>
        {text}
      </div>
    ));
  }

  const screenStyle = {
    width: "100%",
    height: "100%",
    background: backgroundColor,
    color: textColor,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    textAlign: "center" as const,
    padding: "0 24px",
    overflow: "hidden"
  };

  return (
    <div>
      <div className="page-title">알람 서식 설정</div>
      <div className="page-subtitle">모든 TV의 알람 화면에 공통으로 적용되는 문구, 줄별 글자 크기, 배경색, 폰트입니다.</div>

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
            <div style={{ fontWeight: 600, marginBottom: 10 }}>배경색</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                style={{ width: 44, height: 34, padding: 2, border: "1px solid var(--line)", borderRadius: 6, cursor: "pointer" }}
              />
              <input
                className="input"
                style={{ width: 120 }}
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
              />
              <span style={{ fontSize: 12, color: "var(--muted)" }}>글자색은 배경 밝기에 맞춰 검정/흰색으로 자동 전환됩니다</span>
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
            실시간 미리보기 (예시 값 기준 · 실제 TV와 같은 비율)
          </div>
          <div className="chip-row" style={{ marginBottom: 10 }}>
            {PREVIEW_MODES.map((m) => (
              <button key={m.value} className="chip" data-active={previewMode === m.value} onClick={() => setPreviewMode(m.value)}>
                {m.label}
              </button>
            ))}
          </div>

          {previewFont && <style>{`@font-face { font-family: '${previewFamily}'; src: url('${previewFont.url}'); }`}</style>}

          {previewMode === "landscape" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12, color: "var(--muted)", flexWrap: "wrap" }}>
                TV 화면 크기 기준
                <select className="input" style={{ width: 190, padding: "4px 8px", fontSize: 12 }} value={landscapeSize} onChange={(e) => setLandscapeSize(e.target.value)}>
                  {LANDSCAPE_SIZES.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </div>
              <ScaledScreen width={LS.w} height={LS.h}>
                <div style={screenStyle}>{renderLines(SAMPLE)}</div>
              </ScaledScreen>
            </>
          )}

          {previewMode === "portrait" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12, color: "var(--muted)", flexWrap: "wrap" }}>
                세로 TV 화면 크기 기준
                <select className="input" style={{ width: 240, padding: "4px 8px", fontSize: 12 }} value={portraitSize} onChange={(e) => setPortraitSize(e.target.value)}>
                  {PORTRAIT_SIZES.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </div>
              <ScaledScreen width={PS.w} height={PS.h} maxHeight={560}>
                <div style={screenStyle}>{renderLines(SAMPLE)}</div>
              </ScaledScreen>
            </>
          )}

          {previewMode === "split" && (
            <div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>
                같은 시각에 알람이 2개 겹치면 화면이 이렇게 위/아래로 나뉘어 각각 표시됩니다 (글자 크기는 줄이지 않고 그대로 적용됩니다 —
                칸이 좁아 넘칠 수 있다면 여기서 바로 확인하고 크기를 조절하세요).
              </div>
              <ScaledScreen width={LS.w} height={LS.h}>
                <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
                  <div style={{ width: "100%", height: "50%", borderBottom: "1px solid #222" }}>
                    <div style={screenStyle}>{renderLines(SAMPLE)}</div>
                  </div>
                  <div style={{ width: "100%", height: "50%" }}>
                    <div style={screenStyle}>{renderLines(SAMPLE_2)}</div>
                  </div>
                </div>
              </ScaledScreen>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
