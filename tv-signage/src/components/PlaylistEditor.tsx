"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { FrequencyGroup, ImageRow, PlaylistEntry } from "@/lib/types";
import { newLocalId } from "@/lib/types";
import ImageGrid from "@/components/ImageGrid";
import OrderedImagePicker from "@/components/OrderedImagePicker";

export default function PlaylistEditor({
  images,
  entries,
  groups,
  onChange
}: {
  images: ImageRow[];
  entries: PlaylistEntry[];
  groups: FrequencyGroup[];
  onChange: (entries: PlaylistEntry[], groups: FrequencyGroup[]) => void;
}) {
  const imageMap = useMemo(() => new Map(images.map((i) => [i.id, i])), [images]);
  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  // Refs so addImage/addGroup stay stable identities (keeps ImageGrid's
  // memoization effective) even though they need the latest entries/groups.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const addImage = useCallback(
    (imageId: string) => {
      onChange([...entriesRef.current, { id: newLocalId(), type: "image", image_id: imageId }], groupsRef.current);
    },
    [onChange]
  );

  function addGroup() {
    const groupId = newLocalId();
    onChange(
      [...entries, { id: newLocalId(), type: "group", group_id: groupId }],
      [...groups, { id: groupId, image_ids: [] }]
    );
    setEditingGroupId(groupId);
  }

  function removeAt(index: number) {
    const entry = entries[index];
    const nextEntries = entries.filter((_, i) => i !== index);
    const nextGroups = entry.type === "group" ? groups.filter((g) => g.id !== entry.group_id) : groups;
    onChange(nextEntries, nextGroups);
  }

  function updateGroupImages(groupId: string, imageIds: string[]) {
    onChange(
      entries,
      groups.map((g) => (g.id === groupId ? { ...g, image_ids: imageIds } : g))
    );
  }

  function handleDrop(dropIndex: number) {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...entries];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIndex, 0, moved);
    onChange(next, groups);
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div className="label">
          이미지를 클릭하면 목록 맨 뒤에 추가됩니다. "빈도 그룹 추가"로 그룹을 만든 뒤, 아래 목록에서 원하는 위치로 드래그하세요.
        </div>
        <button className="btn btn-outline" style={{ marginBottom: 8 }} onClick={addGroup}>
          🔁 빈도 그룹 추가
        </button>
        <ImageGrid images={images} onAdd={addImage} />
      </div>

      <div>
        <div className="label">현재 재생 순서 ({entries.length}개) — 드래그해서 순서를 바꿀 수 있습니다</div>
        {entries.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            아직 추가된 항목이 없습니다. 위에서 이미지를 클릭하거나 빈도 그룹을 추가하세요.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {entries.map((entry, index) => {
              const dragProps = {
                draggable: true,
                onDragStart: () => setDragIndex(index),
                onDragOver: (e: React.DragEvent) => {
                  e.preventDefault();
                  if (overIndex !== index) setOverIndex(index);
                },
                onDragLeave: () => setOverIndex((cur) => (cur === index ? null : cur)),
                onDrop: () => handleDrop(index),
                onDragEnd: () => {
                  setDragIndex(null);
                  setOverIndex(null);
                }
              };
              const rowStyle: React.CSSProperties = {
                border: overIndex === index ? "1px solid var(--accent)" : "1px solid var(--line)",
                background: dragIndex === index ? "#f3f4f6" : "#fff",
                borderRadius: 8,
                padding: "4px 8px",
                cursor: "grab"
              };

              if (entry.type === "image") {
                const img = imageMap.get(entry.image_id);
                return (
                  <div key={entry.id} {...dragProps} style={{ display: "flex", alignItems: "center", gap: 10, ...rowStyle }}>
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
              }

              // group entry
              const group = groupMap.get(entry.group_id);
              const isEditing = editingGroupId === entry.group_id;
              return (
                <div
                  key={entry.id}
                  {...(isEditing ? {} : dragProps)}
                  style={{ ...rowStyle, cursor: isEditing ? "default" : "grab", background: isEditing ? "#fafbfc" : rowStyle.background }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {!isEditing && <span style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1 }}>⠿</span>}
                    <div style={{ fontSize: 10.5, color: "var(--muted)", width: 16 }}>{index + 1}</div>
                    <div
                      style={{
                        width: 36,
                        height: 24,
                        borderRadius: 3,
                        background: "#eef1f6",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13
                      }}
                    >
                      🔁
                    </div>
                    <div style={{ fontSize: 12, flex: 1 }}>
                      빈도 그룹 · {group?.image_ids.length ?? 0}장 번갈아
                    </div>
                    <button
                      className="btn btn-outline"
                      style={{ padding: "3px 8px", fontSize: 11 }}
                      onClick={() => setEditingGroupId(isEditing ? null : entry.group_id)}
                    >
                      {isEditing ? "완료" : "편집"}
                    </button>
                    <button className="btn btn-danger" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => removeAt(index)}>
                      제외
                    </button>
                  </div>
                  {isEditing && (
                    <div style={{ marginTop: 10, paddingLeft: 20, borderLeft: "2px solid var(--line)" }}>
                      <OrderedImagePicker
                        images={images}
                        value={group?.image_ids ?? []}
                        onChange={(ids) => updateGroupImages(entry.group_id, ids)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
