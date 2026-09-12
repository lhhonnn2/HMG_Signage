"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import type { ImageRow } from "@/lib/types";

// Click a thumbnail in the grid to append it to `value` (duplicates allowed).
// The list underneath shows the actual playback order — drag rows to
// reorder, or hit "제외" to remove a single occurrence.
export default function OrderedImagePicker({
  images,
  value,
  onChange
}: {
  images: ImageRow[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const imageMap = useMemo(() => new Map(images.map((i) => [i.id, i])), [images]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Reads `value` via a ref instead of a closure dependency so this
  // callback's identity stays stable across renders — that's what lets
  // ImageGrid below stay memoized (and skip re-rendering) while the order
  // list underneath re-renders constantly during a drag.
  const valueRef = useRef(value);
  valueRef.current = value;
  const add = useCallback(
    (id: string) => {
      onChange([...valueRef.current, id]);
    },
    [onChange]
  );

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function handleDrop(dropIndex: number) {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...value];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIndex, 0, moved);
    onChange(next);
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div className="label">이미지를 클릭하면 재생목록 맨 뒤에 추가됩니다 (같은 이미지 여러 번 추가 가능)</div>
        <ImageGrid images={images} onAdd={add} />
      </div>

      <div>
        <div className="label">현재 재생 순서 ({value.length}장) — 드래그해서 순서를 바꿀 수 있습니다</div>
        {value.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>아직 추가된 이미지가 없습니다. 위에서 이미지를 클릭해 추가하세요.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {value.map((id, index) => {
              const img = imageMap.get(id);
              return (
                <div
                  key={`${id}-${index}`}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (overIndex !== index) setOverIndex(index);
                  }}
                  onDragLeave={() => setOverIndex((cur) => (cur === index ? null : cur))}
                  onDrop={() => handleDrop(index)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    border: overIndex === index ? "1px solid var(--accent)" : "1px solid var(--line)",
                    background: dragIndex === index ? "#f3f4f6" : "#fff",
                    borderRadius: 8,
                    padding: "4px 8px",
                    cursor: "grab"
                  }}
                >
                  <span style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1 }}>⠿</span>
                  <div style={{ fontSize: 10.5, color: "var(--muted)", width: 16 }}>{index + 1}</div>
                  {img && (
                    <img
                      src={img.thumbnail_url || img.url}
                      alt={img.filename}
                      loading="lazy"
                      decoding="async"
                      style={{ width: 36, height: 24, objectFit: "cover", borderRadius: 3 }}
                    />
                  )}
                  <div style={{ fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {img?.filename ?? "(삭제된 이미지)"}
                  </div>
                  <button className="btn btn-danger" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => removeAt(index)}>
                    제외
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Memoized separately so it only re-renders when the image library itself
// changes — not on every drag-over event from the order list above, which
// otherwise re-renders (and re-downloads nothing, but re-lays-out) the
// entire grid dozens of times per second while dragging.
const ImageGrid = memo(function ImageGrid({ images, onAdd }: { images: ImageRow[]; onAdd: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const filtered = search.trim()
    ? images.filter((i) => i.filename.toLowerCase().includes(search.trim().toLowerCase()))
    : images;

  if (images.length === 0) {
    return <div style={{ color: "var(--muted)", fontSize: 13 }}>먼저 이미지 메뉴에서 이미지를 업로드해주세요.</div>;
  }
  return (
    <div>
      {images.length > 12 && (
        <input
          className="input"
          style={{ marginBottom: 8, maxWidth: 240 }}
          placeholder="파일명으로 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 6 }}>
        {filtered.map((img) => (
        <button
          key={img.id}
          type="button"
          onClick={() => onAdd(img.id)}
          style={{
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: 4,
            cursor: "pointer",
            background: "#fff",
            textAlign: "left"
          }}
        >
          <img
            src={img.thumbnail_url || img.url}
            alt={img.filename}
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: 46, objectFit: "cover", borderRadius: 4 }}
          />
          <div
            style={{
              fontSize: 11,
              color: "var(--muted)",
              marginTop: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {img.filename}
          </div>
        </button>
      ))}
      </div>
    </div>
  );
});
