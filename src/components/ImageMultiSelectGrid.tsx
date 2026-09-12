"use client";

import { memo } from "react";
import type { ImageRow } from "@/lib/types";

export default memo(function ImageMultiSelectGrid({
  images,
  selectedIds,
  onToggle
}: {
  images: ImageRow[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  if (images.length === 0) {
    return <div style={{ color: "var(--muted)", fontSize: 13 }}>먼저 이미지 메뉴에서 이미지를 업로드해주세요.</div>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 6 }}>
      {images.map((img) => {
        const checked = selectedIds.includes(img.id);
        return (
          <label
            key={img.id}
            style={{
              border: checked ? "2px solid var(--accent)" : "1px solid var(--line)",
              borderRadius: 6,
              padding: 3,
              cursor: "pointer"
            }}
          >
            <input type="checkbox" checked={checked} onChange={() => onToggle(img.id)} style={{ marginBottom: 2 }} />
            <img
              src={img.thumbnail_url || img.url}
              alt={img.filename}
              loading="lazy"
              decoding="async"
              style={{ width: "100%", height: 42, objectFit: "cover", borderRadius: 3, display: "block" }}
            />
            <div
              style={{
                fontSize: 9.5,
                color: "var(--muted)",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {img.filename}
            </div>
          </label>
        );
      })}
    </div>
  );
});
