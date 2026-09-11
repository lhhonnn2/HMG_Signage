"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { uploadFile } from "@/lib/uploadFile";
import type { ImageRow } from "@/lib/types";

export default function ImagesPage() {
  const [images, setImages] = useState<ImageRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase.from("images").select("*").order("created_at", { ascending: false });
    setImages(data || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const url = await uploadFile(file, "images");
        await supabase.from("images").insert({ filename: file.name, url });
      }
      await load();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(id: string) {
    if (!confirm("이 이미지를 삭제할까요? (재생목록에서도 함께 제거됩니다)")) return;
    await supabase.from("images").delete().eq("id", id);
    await load();
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>이미지</h1>

      <div className="card" style={{ marginBottom: 20 }}>
        <label className="label">이미지 업로드 (여러 장 선택 가능)</label>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          disabled={uploading}
          onChange={(e) => onFiles(e.target.files)}
        />
        {uploading && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>업로드 중...</div>}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 12
        }}
      >
        {images.map((img) => (
          <div key={img.id} className="card" style={{ padding: 8 }}>
            <img
              src={img.url}
              alt={img.filename}
              style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 6 }}
            />
            <div style={{ fontSize: 12, marginTop: 6, wordBreak: "break-all" }}>{img.filename}</div>
            <button
              className="btn btn-outline"
              style={{ marginTop: 6, width: "100%", fontSize: 12 }}
              onClick={() => remove(img.id)}
            >
              삭제
            </button>
          </div>
        ))}
      </div>
      {images.length === 0 && <div style={{ color: "#6b7280", fontSize: 14 }}>업로드된 이미지가 없습니다.</div>}
    </div>
  );
}
