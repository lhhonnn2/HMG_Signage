"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { FrequencyGroup, ImageRow, ImageTemplateRow } from "@/lib/types";
import OrderedImagePicker from "@/components/OrderedImagePicker";
import FrequencyGroupsEditor from "@/components/FrequencyGroupsEditor";

export default function ImageTemplatesPage() {
  const [images, setImages] = useState<ImageRow[]>([]);
  const [templates, setTemplates] = useState<ImageTemplateRow[]>([]);
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [frequencyGroups, setFrequencyGroups] = useState<FrequencyGroup[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    const { data: imgs } = await supabase.from("images").select("*").order("created_at", { ascending: false });
    setImages(imgs || []);
    const { data: tpls } = await supabase.from("image_templates").select("*").order("name");
    setTemplates((tpls as ImageTemplateRow[]) || []);
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(t: ImageTemplateRow) {
    setEditingId(t.id);
    setName(t.name);
    setSelectedIds(t.image_ids);
    setFrequencyGroups(t.frequency_groups || []);
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setSelectedIds([]);
    setFrequencyGroups([]);
  }

  async function save() {
    if (!name.trim()) {
      alert("템플릿 이름을 입력해주세요");
      return;
    }
    if (selectedIds.length === 0) {
      alert("이미지를 1장 이상 선택해주세요");
      return;
    }
    const payload = {
      name: name.trim(),
      image_ids: selectedIds,
      frequency_groups: frequencyGroups.filter((g) => g.image_ids.length > 0)
    };
    if (editingId) {
      await supabase.from("image_templates").update(payload).eq("id", editingId);
    } else {
      await supabase.from("image_templates").insert(payload);
    }
    resetForm();
    await load();
  }

  async function remove(id: string) {
    if (!confirm("이 템플릿을 삭제할까요? (TV에 이미 적용된 이미지는 그대로 남습니다)")) return;
    await supabase.from("image_templates").delete().eq("id", id);
    if (editingId === id) resetForm();
    await load();
  }

  return (
    <div>
      <div className="page-title">이미지 템플릿</div>
      <div className="page-subtitle">
        자주 함께 쓰는 이미지들을 묶어두면, TV 설정 화면에서 하나씩 고르지 않고 템플릿 이름만 선택해 한 번에 재생목록(빈도 그룹 포함)에 추가할
        수 있습니다.
      </div>

      <div className="card" style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label className="label">템플릿 이름</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 평일 오전 기본 세트" />
        </div>

        <OrderedImagePicker images={images} value={selectedIds} onChange={setSelectedIds} />

        <FrequencyGroupsEditor images={images} groups={frequencyGroups} onChange={setFrequencyGroups} />

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-accent" onClick={save}>
            {editingId ? "템플릿 수정 저장" : "템플릿 만들기"}
          </button>
          {editingId && (
            <button className="btn btn-outline" onClick={resetForm}>
              취소
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {templates.map((t) => (
          <div key={t.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 14 }}>
              <div style={{ fontWeight: 600 }}>{t.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                이미지 {t.image_ids.length}장{t.frequency_groups?.length ? ` · 빈도그룹 ${t.frequency_groups.length}개` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-outline" onClick={() => startEdit(t)}>
                수정
              </button>
              <button className="btn btn-danger" onClick={() => remove(t.id)}>
                삭제
              </button>
            </div>
          </div>
        ))}
        {templates.length === 0 && <div style={{ color: "var(--muted)", fontSize: 14 }}>등록된 템플릿이 없습니다.</div>}
      </div>
    </div>
  );
}
