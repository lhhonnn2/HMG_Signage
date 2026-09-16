"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ImageRow } from "@/lib/types";
import ImageGrid from "@/components/ImageGrid";

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
        <div className="label">이미지를 클릭하면 목록 맨 뒤에 추가됩니다 (같은 이미지 여러 번 추가 가능)</div>
        <ImageGrid images={images} onAdd={add} />
      </div>

      <div>
        <div className="label">현재 순서 ({value.length}장) — 드래그해서 순서를 바꿀 수 있습니다</div>
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
