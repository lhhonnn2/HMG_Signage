"use client";

import { memo } from "react";
import type { ImageRow } from "@/lib/types";

// Memoized so it only re-renders when the image library itself changes —
// not on every drag-over event from an order list next to it, which
// otherwise re-renders (and re-lays-out) the entire grid dozens of times
// per second while dragging.
export default memo(function ImageGrid({ images, onAdd }: { images: ImageRow[]; onAdd: (id: string) => void }) {
  if (images.length === 0) {
    return <div style={{ color: "var(--muted)", fontSize: 13 }}>먼저 이미지 메뉴에서 이미지를 업로드해주세요.</div>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 6 }}>
      {images.map((img) => (
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
  );
});
