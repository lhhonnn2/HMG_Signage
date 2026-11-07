"use client";

import { useCallback, useEffect, useState } from "react";
import { agoText, fmtKst } from "./shared";

type Sub = {
  id: string;
  device: string;
  browser: string;
  service: string;
  lead: number;
  divisions: string[];
  brands: string[];
  names: string[];
  extra: number;
  excluded: number;
  createdAt: string;
  updatedAt: string;
};

function scope(s: Sub) {
  const parts: string[] = [];
  if (s.divisions.length) parts.push(s.divisions.join("·"));
  if (s.brands.length) parts.push(s.brands.join("·"));
  if (s.names.length) parts.push(s.names.length <= 2 ? s.names.join("·") : `${s.names[0]} 외 ${s.names.length - 1}`);
  return parts.length ? parts.join(" / ") : "범위 선택 없음";
}

export default function SubscriberList({ onChanged }: { onChanged?: () => void }) {
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/push/admin/subscriptions", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || "불러오지 못했습니다");
        return;
      }
      setError("");
      setSubs(j.subs);
    } catch {
      setError("서버에 연결하지 못했습니다");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(s: Sub) {
    const name = `${s.device} · ${s.browser}`;
    if (!confirm(`"${name}" 기기를 목록에서 삭제할까요?\n\n삭제하면 이 기기는 알림을 받지 못합니다. (폰에서 /notify로 다시 "알림 받기"를 누르면 복구됩니다)`)) return;
    setBusyId(s.id);
    try {
      const r = await fetch(`/api/push/admin/subscriptions?id=${encodeURIComponent(s.id)}`, { method: "DELETE" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert("삭제하지 못했습니다: " + (j.error || r.status));
      }
      await load();
      onChanged?.();
    } finally {
      setBusyId("");
    }
  }

  if (error) return <div className="card" style={{ color: "#b91c1c", fontSize: 13.5 }}>{error}</div>;
  if (!subs) return <div style={{ color: "var(--muted)", fontSize: 13.5 }}>불러오는 중...</div>;

  const count = (d: string) => subs.filter((s) => s.device === d).length;

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 600 }}>
          알림 받는 기기 {subs.length}대
          <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 12.5, marginLeft: 8 }}>
            아이폰 {count("아이폰")} · 안드로이드 {count("안드로이드")} · PC {count("Windows PC") + count("Mac")}
          </span>
        </div>
        <button className="btn btn-outline" style={{ fontSize: 12, padding: "5px 10px" }} onClick={load}>
          새로고침
        </button>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, lineHeight: 1.7 }}>
        직원 한 명이 폰과 PC, 또는 브라우저 여러 개로 등록하면 여러 대로 보입니다. 더 이상 쓰지 않는 기기는 삭제해 정리하세요.
      </div>

      {subs.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>등록된 기기가 없습니다.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="grid-table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th style={{ width: 150 }}>기기</th>
                <th style={{ width: 90 }}>푸시 서비스</th>
                <th style={{ width: 70 }}>몇 분 전</th>
                <th>받는 범위</th>
                <th style={{ width: 80 }}>개별 설정</th>
                <th style={{ width: 130 }}>등록</th>
                <th style={{ width: 130 }}>마지막 저장</th>
                <th style={{ width: 64 }}></th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id}>
                  <td style={{ padding: "6px 8px" }}>
                    <b>{s.device}</b> · {s.browser}
                    {s.browser === "삼성 인터넷" && <div style={{ fontSize: 11.5, color: "#b45309" }}>알림이 표시되지 않는 경우가 있음</div>}
                  </td>
                  <td style={{ padding: "6px 8px" }}>{s.service}</td>
                  <td style={{ padding: "6px 8px" }}>{s.lead}분</td>
                  <td style={{ padding: "6px 8px", fontSize: 12.5 }}>{scope(s)}</td>
                  <td style={{ padding: "6px 8px", fontSize: 12.5 }}>
                    {s.extra || s.excluded ? `켬 ${s.extra} / 끔 ${s.excluded}` : "-"}
                  </td>
                  <td style={{ padding: "6px 8px", fontSize: 12.5 }}>{fmtKst(s.createdAt)}</td>
                  <td style={{ padding: "6px 8px", fontSize: 12.5 }}>
                    {fmtKst(s.updatedAt)}
                    <div style={{ color: "var(--muted)", fontSize: 11.5 }}>{agoText(s.updatedAt, now)}</div>
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    <button className="btn btn-danger" style={{ fontSize: 12, padding: "5px 10px" }} disabled={busyId === s.id} onClick={() => remove(s)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
