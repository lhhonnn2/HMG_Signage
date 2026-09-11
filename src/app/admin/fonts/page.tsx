"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { uploadFile } from "@/lib/uploadFile";
import type { FontRow } from "@/lib/types";

export default function FontsPage() {
  const [fonts, setFonts] = useState<FontRow[]>([]);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase.from("fonts").select("*").order("name");
    setFonts(data || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function onUpload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    if (!name.trim()) {
      alert("폰트 이름을 입력해주세요 (알람 등록 시 선택할 이름입니다)");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadFile(file, "fonts");
      await supabase.from("fonts").insert({ name: name.trim(), url });
      setName("");
      if (inputRef.current) inputRef.current.value = "";
      await load();
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("삭제할까요?")) return;
    await supabase.from("fonts").delete().eq("id", id);
    await load();
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>폰트</h1>

      <div className="card" style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <label className="label">폰트 이름</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 프리텐다드 볼드" />
        </div>
        <div>
          <label className="label">폰트 파일 (.woff, .woff2, .ttf, .otf)</label>
          <input ref={inputRef} type="file" accept=".woff,.woff2,.ttf,.otf" />
        </div>
        <button className="btn" disabled={uploading} onClick={onUpload} style={{ width: 160 }}>
          {uploading ? "업로드 중..." : "업로드"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {fonts.map((f) => (
          <div key={f.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{f.name}</div>
              <div style={{ fontSize: 12, color: "#6b7280", wordBreak: "break-all" }}>{f.url}</div>
            </div>
            <button className="btn btn-outline" onClick={() => remove(f.id)}>
              삭제
            </button>
          </div>
        ))}
        {fonts.length === 0 && <div style={{ color: "#6b7280", fontSize: 14 }}>업로드된 폰트가 없습니다.</div>}
      </div>
    </div>
  );
}
