"use client";

import { useCallback, useEffect, useState } from "react";
import { agoText, fmtKst } from "./shared";

type RunError = { status?: number | null; message: string; program?: string; sub?: string };
type Totals = { sent: number; failed: number; removed: number };
type Status = {
  lastRunAt: string | null;
  callsToday: number;
  subscribers: number;
  today: Totals;
  yesterday: Totals;
  recent: { at: string; sent: number; failed: number; removed: number; errors: RunError[] }[];
  serverNow: number;
};

const box: React.CSSProperties = { flex: "1 1 200px", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", background: "#fff" };
const label: React.CSSProperties = { fontSize: 12, color: "var(--muted)", marginBottom: 4 };

export default function DeliveryStatus() {
  const [st, setSt] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/push/admin/status", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || "불러오지 못했습니다");
        setSt(null);
      } else {
        setError("");
        setSt(j);
      }
    } catch {
      setError("서버에 연결하지 못했습니다");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (error) {
    return (
      <div className="card" style={{ color: "#b91c1c", fontSize: 13.5 }}>
        {error}
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-outline" onClick={load}>
            다시 시도
          </button>
        </div>
      </div>
    );
  }
  if (!st) return <div style={{ color: "var(--muted)", fontSize: 13.5 }}>불러오는 중...</div>;

  const lastMin = st.lastRunAt ? (st.serverNow - new Date(st.lastRunAt).getTime()) / 60000 : Infinity;
  const cronOk = lastMin <= 5;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={box}>
          <div style={label}>서버 호출(cron-job.org) 마지막 시각</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: cronOk ? "#15803d" : "#b91c1c" }}>{agoText(st.lastRunAt, st.serverNow)}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            {st.lastRunAt ? fmtKst(st.lastRunAt) : "아직 기록이 없습니다"} · 오늘 {st.callsToday.toLocaleString()}회 호출
          </div>
          {!cronOk && (
            <div style={{ fontSize: 12.5, color: "#b91c1c", marginTop: 6 }}>
              5분 넘게 호출이 없습니다. cron-job.org 실행 기록과 주소(key)를 확인해주세요.
            </div>
          )}
        </div>
        <div style={box}>
          <div style={label}>오늘 발송</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{st.today.sent.toLocaleString()}건</div>
          <div style={{ fontSize: 12.5, marginTop: 4, color: st.today.failed > 0 ? "#b91c1c" : "var(--muted)" }}>
            실패 {st.today.failed} · 만료 삭제 {st.today.removed}
          </div>
        </div>
        <div style={box}>
          <div style={label}>어제 발송</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{st.yesterday.sent.toLocaleString()}건</div>
          <div style={{ fontSize: 12.5, marginTop: 4, color: st.yesterday.failed > 0 ? "#b91c1c" : "var(--muted)" }}>
            실패 {st.yesterday.failed} · 만료 삭제 {st.yesterday.removed}
          </div>
        </div>
        <div style={box}>
          <div style={label}>알림 받는 기기</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{st.subscribers}대</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 600 }}>최근 발송 기록 (최근 7일, 최대 40건)</div>
          <button className="btn btn-outline" style={{ fontSize: 12, padding: "5px 10px" }} onClick={load} disabled={loading}>
            {loading ? "갱신 중..." : "새로고침"}
          </button>
        </div>
        {st.recent.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>최근 7일 동안 발송된 알림이 없습니다.</div>
        ) : (
          <table className="grid-table">
            <thead>
              <tr>
                <th style={{ width: 150 }}>시각</th>
                <th style={{ width: 60 }}>성공</th>
                <th style={{ width: 60 }}>실패</th>
                <th style={{ width: 80 }}>만료 삭제</th>
                <th>실패·삭제 내용</th>
              </tr>
            </thead>
            <tbody>
              {st.recent.map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: "4px 8px" }}>{fmtKst(r.at)}</td>
                  <td style={{ padding: "4px 8px" }}>{r.sent}</td>
                  <td style={{ padding: "4px 8px", color: r.failed ? "#b91c1c" : undefined }}>{r.failed}</td>
                  <td style={{ padding: "4px 8px" }}>{r.removed}</td>
                  <td style={{ padding: "4px 8px", fontSize: 12.5 }}>
                    {r.errors.length === 0
                      ? "-"
                      : r.errors.map((e, j) => (
                          <div key={j}>
                            {e.status ? `[${e.status}] ` : ""}
                            {e.message}
                            {e.program ? ` · ${e.program}` : ""}
                            {e.sub ? ` · 기기 ${e.sub}` : ""}
                          </div>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10, lineHeight: 1.7 }}>
          이 화면은 30초마다 자동으로 갱신됩니다. 마지막 호출이 5분 넘게 멈추면 cron-job.org 문제입니다. "만료 삭제"는 폰에서 알림이 해제되어
          서버가 그 기기를 자동으로 목록에서 지운 횟수입니다.
        </div>
      </div>
    </div>
  );
}
