"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { AlarmSettingsRow, FontRow } from "@/lib/types";
import { DEFAULT_TEMPLATE } from "@/lib/types";

export default function AlarmSettingsPage() {
  const [fonts, setFonts] = useState<FontRow[]>([]);
  const [fontId, setFontId] = useState<string>("");
  const [duration, setDuration] = useState(30);
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
      setDuration(s.duration_seconds);
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
        duration_seconds: duration,
        template,
        line_font_sizes: lines.map((_, i) => sizeFor(i))
      });
      alert("저장되었습니다. 모든 TV의 알람 화면에 즉시 반영됩니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-title">알람 서식 설정</div>
      <div className="page-subtitle">모든 TV의 알람 화면에 공통으로 적용되는 문구, 줄별 글자 크기, 폰트, 기본 노출 시간입니다.</div>

      <div className="card" style={{ marginBottom: 16 }}>
        <label className="label">알람 문구 템플릿</label>
        <textarea
          className="input"
          style={{ minHeight: 120, fontFamily: "monospace", resize: "vertical" }}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        />
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
          [프로그램명], [장소], [시작시간] 자리에 알람 등록 시 입력한 값이 자동으로 들어갑니다. 줄을 추가하거나 지워도 됩니다 — 아래 글자
          크기도 줄 수에 맞춰 늘어납니다.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>줄별 글자 크기 (px)</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {lines.map((line, i) => (
            <div key={i}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
        <label className="label">폰트</label>
        <select className="input" style={{ maxWidth: 280 }} value={fontId} onChange={(e) => setFontId(e.target.value)}>
          <option value="">기본 폰트</option>
          {fonts.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <label className="label">기본 노출 시간 (초)</label>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
          새 알람을 추가하거나 엑셀로 불러올 때 이 값이 기본으로 채워집니다. 알람 스케줄 표에서 알람별로 다시 조절할 수 있습니다.
        </div>
        <input className="input" type="number" style={{ width: 120 }} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
      </div>

      <button className="btn btn-accent" disabled={saving} onClick={save}>
        {saving ? "저장 중..." : "저장"}
      </button>
    </div>
  );
}
