"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { uploadImagesWithThumbnails, backfillThumbnailsInBatches } from "@/lib/uploadFile";
import type { ImageRow } from "@/lib/types";

export default function ImagesPage() {
  const [images, setImages] = useState<ImageRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [dragOver, setDragOver] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState({ done: 0, total: 0 });
  const [backfillError, setBackfillError] = useState<string | null>(null);
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
      await uploadImagesWithThumbnails(list, async ({ file, url, thumbnailUrl }) => {
        await supabase.from("images").insert({ filename: file.name, url, thumbnail_url: thumbnailUrl });
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      });
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

  const missingThumbs = images.filter((i) => !i.thumbnail_url);

  async function backfillThumbnails() {
    if (missingThumbs.length === 0) return;
    setBackfilling(true);
    setBackfillError(null);
    setBackfillProgress({ done: 0, total: missingThumbs.length });
    let successCount = 0;
    let firstError: string | null = null;
    try {
      await backfillThumbnailsInBatches(
        missingThumbs.map((i) => ({ id: i.id, url: i.url, filename: i.filename })),
        async ({ id, thumbnailUrl, error }) => {
          if (thumbnailUrl) {
            await supabase.from("images").update({ thumbnail_url: thumbnailUrl }).eq("id", id);
            successCount++;
          } else if (error && !firstError) {
            firstError = error;
            console.error("썸네일 생성 실패:", error);
          }
          setBackfillProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      );
      await load();
      if (successCount === 0 && firstError) {
        setBackfillError(firstError);
      } else if (firstError) {
        setBackfillError(`${successCount}장 성공, 일부 실패 (예: ${firstError})`);
      }
    } finally {
      setBackfilling(false);
    }
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

      {missingThumbs.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13 }}>
              썸네일이 없는 이미지 <b>{missingThumbs.length}장</b>이 있습니다 — 그리드가 버벅이는 가장 흔한 원인입니다.
            </div>
            <button className="btn btn-accent" style={{ marginLeft: "auto" }} disabled={backfilling} onClick={backfillThumbnails}>
              {backfilling ? `생성 중... (${backfillProgress.done}/${backfillProgress.total})` : "썸네일 일괄 생성"}
            </button>
          </div>
          {backfillError && (
            <div style={{ fontSize: 12.5, color: "#e5484d", marginTop: 10, wordBreak: "break-all" }}>
              오류: {backfillError}
              <br />
              대부분 Cloudflare R2 버킷의 CORS 설정에 GET이 허용돼 있지 않거나 AllowedOrigins가 지금 도메인과 다를 때 발생합니다. R2
              버킷 Settings → CORS Policy를 확인해주세요.
            </div>
          )}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
          gap: 8
        }}
      >
        {images.map((img) => (
          <div key={img.id} className="card" style={{ padding: 6 }}>
            <img
              src={img.thumbnail_url || img.url}
              alt={img.filename}
              loading="lazy"
              decoding="async"
              style={{ width: "100%", height: 66, objectFit: "cover", borderRadius: 5 }}
            />
            <div style={{ fontSize: 10.5, marginTop: 4, wordBreak: "break-all" }}>{img.filename}</div>
            <button
              className="btn btn-outline"
              style={{ marginTop: 4, width: "100%", fontSize: 11, padding: "4px 8px" }}
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
