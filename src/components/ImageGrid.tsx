"use client";

import { memo, useRef, useState } from "react";
import type { ImageRow } from "@/lib/types";

// Memoized so it only re-renders when the image library itself changes —
// not on every drag-over event from an order list next to it, which
// otherwise re-renders (and re-lays-out) the entire grid dozens of times
// per second while dragging.
export default memo(function ImageGrid({ images, onAdd }: { images: ImageRow[]; onAdd: (id: string) => void }) {
  const [flashId, setFlashId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleClick(id: string) {
    onAdd(id);
    setFlashId(id);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 500);
  }

  if (images.length === 0) {
    return <div style={{ color: "var(--muted)", fontSize: 13 }}>먼저 이미지 메뉴에서 이미지를 업로드해주세요.</div>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 6 }}>
      {images.map((img) => {
        const flashing = flashId === img.id;
        return (
          <button
            key={img.id}
            type="button"
            onClick={() => handleClick(img.id)}
            style={{
              position: "relative",
              border: flashing ? "2px solid #22c55e" : "1px solid var(--line)",
              borderRadius: 8,
              padding: flashing ? 3 : 4,
              cursor: "pointer",
              background: "#fff",
              textAlign: "left",
              transform: flashing ? "scale(0.95)" : "scale(1)",
              transition: "transform 120ms ease, border-color 120ms ease, padding 120ms ease"
            }}
          >
            <img
              src={img.thumbnail_url || img.url}
              alt={img.filename}
              loading="lazy"
              decoding="async"
              style={{ width: "100%", height: 46, objectFit: "cover", borderRadius: 4, display: "block" }}
            />
            {flashing && (
              <div
                style={{
                  position: "absolute",
                  top: 4,
                  left: 4,
                  right: 4,
                  height: 46,
                  borderRadius: 4,
                  background: "rgba(34,197,94,0.82)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 20,
                  fontWeight: 700,
                  pointerEvents: "none"
                }}
              >
                ✓
              </div>
            )}
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
        );
      })}
    </div>
  );
});
