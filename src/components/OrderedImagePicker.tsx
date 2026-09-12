"use client";

import type { ImageRow } from "@/lib/types";

// Click a thumbnail in the grid to append it to `value` (duplicates allowed).
// The ordered list underneath shows the actual playback order and lets you
// remove any single occurrence with "제외" — this is not a select/deselect
// toggle, it's an append-only picker plus a remove-from-list action.
export default function OrderedImagePicker({
  images,
  value,
  onChange
}: {
  images: ImageRow[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const imageMap = new Map(images.map((i) => [i.id, i]));

  function add(id: string) {
    onChange([...value, id]);
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div className="label">이미지를 클릭하면 재생목록 맨 뒤에 추가됩니다 (같은 이미지 여러 번 추가 가능)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
          {images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => add(img.id)}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: 4,
                cursor: "pointer",
                background: "#fff"
              }}
            >
              <img src={img.url} alt={img.filename} style={{ width: "100%", height: 70, objectFit: "cover", borderRadius: 4 }} />
            </button>
          ))}
        </div>
        {images.length === 0 && (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>먼저 이미지 메뉴에서 이미지를 업로드해주세요.</div>
        )}
      </div>

      <div>
        <div className="label">현재 재생 순서 ({value.length}장)</div>
        {value.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>아직 추가된 이미지가 없습니다. 위에서 이미지를 클릭해 추가하세요.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
            {value.map((id, index) => {
              const img = imageMap.get(id);
              return (
                <div
                  key={`${id}-${index}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    padding: "6px 10px"
                  }}
                >
                  <div style={{ fontSize: 12, color: "var(--muted)", width: 22 }}>{index + 1}</div>
                  {img && <img src={img.url} alt={img.filename} style={{ width: 44, height: 30, objectFit: "cover", borderRadius: 4 }} />}
                  <div style={{ fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {img?.filename ?? "(삭제된 이미지)"}
                  </div>
                  <button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => removeAt(index)}>
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
