"use client";

import type { FrequencyGroup, ImageRow } from "@/lib/types";
import OrderedImagePicker from "@/components/OrderedImagePicker";

export default function FrequencyGroupsEditor({
  images,
  groups,
  onChange
}: {
  images: ImageRow[];
  groups: FrequencyGroup[];
  onChange: (next: FrequencyGroup[]) => void;
}) {
  function addGroup() {
    onChange([...groups, { image_ids: [] }]);
  }

  function updateGroup(index: number, imageIds: string[]) {
    const next = [...groups];
    next[index] = { image_ids: imageIds };
    onChange(next);
  }

  function removeGroup(index: number) {
    onChange(groups.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="label">
        빈도 설정 — 그룹에 넣은 이미지는 한 바퀴에 1장씩 번갈아가며 재생목록 끝에 추가됩니다 (예: 기본목록 1·2·3 + 이 그룹 4·5 → 1바퀴째
        1,2,3,4 / 2바퀴째 1,2,3,5 / 3바퀴째 다시 1,2,3,4...)
      </div>

      {groups.map((g, i) => (
        <div key={i} className="card" style={{ marginBottom: 10, background: "#fafbfc" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>빈도 그룹 {i + 1}</div>
            <button className="btn btn-danger" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => removeGroup(i)}>
              그룹 삭제
            </button>
          </div>
          <OrderedImagePicker images={images} value={g.image_ids} onChange={(ids) => updateGroup(i, ids)} />
        </div>
      ))}

      <button className="btn btn-outline" onClick={addGroup}>
        + 빈도 그룹 추가
      </button>
    </div>
  );
}
