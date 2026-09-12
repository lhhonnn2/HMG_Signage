"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { uploadImageWithThumbnail } from "@/lib/uploadFile";
import type { ImageRow } from "@/lib/types";

export default function ImagesPage() {
  const [images, setImages] = useState<ImageRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase.from("images").select("*").order("created_at", { ascending: false });
    setImages(data || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function onFiles(files: FileList | File[] | null) {
    const list = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setUploading(true);
    setProgress({ done: 0, total: list.length });
    try {
      for (const file of list) {
        const { url, thumbnailUrl } = await uploadImageWithThumbnail(file);
        await supabase.from("images").insert({ filename: file.name, url, thumbnail_url: thumbnailUrl });
        setProgress((p) => ({ ...p, done: p.done + 1 }));
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
      <div className="page-title">이미지</div>
      <div className="page-subtitle">여기서 올린 이미지를 TV 설정, 이미지 템플릿, 요일별 추가 이미지에서 사용할 수 있습니다.</div>

      <div
        className="card"
        style={{
          marginBottom: 20,
          borderStyle: "dashed",
          borderColor: dragOver ? "var(--accent)" : "var(--line)",
          background: dragOver ? "#eef3ff" : "#fff",
          textAlign: "center",
          padding: "36px 20px",
          cursor: "pointer"
        }}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!uploading) onFiles(e.dataTransfer.files);
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>여기로 이미지를 끌어다 놓으세요</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
          탐색기/파인더에서 파일을 바로 드래그해도 되고, 클릭해서 선택할 수도 있습니다 (여러 장 동시 선택 가능)
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          disabled={uploading}
          style={{ display: "none" }}
          onChange={(e) => onFiles(e.target.files)}
        />
        {uploading && (
          <div style={{ fontSize: 13, color: "var(--accent)", marginTop: 4 }}>
            업로드 중... ({progress.done}/{progress.total})
          </div>
        )}
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
              src={img.thumbnail_url || img.url}
              alt={img.filename}
              loading="lazy"
              decoding="async"
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
      {images.length === 0 && <div style={{ color: "var(--muted)", fontSize: 14 }}>업로드된 이미지가 없습니다.</div>}
    </div>
  );
}
