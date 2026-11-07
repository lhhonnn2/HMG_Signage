"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtKst } from "./shared";

type Hist = { id: string; sent_at: string; title: string; body: string; recipients: number; sent: number; failed: number; removed: number };

export default function Announcements() {
  const [title, setTitle] = useState("공지");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<number | null>(null);
  const [history, setHistory] = useState<Hist[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/push/admin/announce", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || "불러오지 못했습니다");
        return;
      }
      setError("");
      setRecipients(j.recipients);
      setHistory(j.history);
    } catch {
      setError("서버에 연결하지 못했습니다");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    const text = body.trim();
    if (!text || busy) return;
    if (!confirm(`알림을 받는 기기 ${recipients ?? "?"}대 전체에 지금 바로 보냅니다.\n\n[${title.trim() || "공지"}]\n${text}\n\n보낸 알림은 취소할 수 없습니다. 보낼까요?`)) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/push/admin/announce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body: text })
      });
      const j = await r.json();
      if (!r.ok) {
        setResult({ ok: false, text: j.error || "보내지 못했습니다" });
      } else {
        setResult({
          ok: j.failed === 0,
          text: `${j.recipients}대 중 ${j.sent}대에 보냈습니다.${j.failed ? ` 실패 ${j.failed}대.` : ""}${j.removed ? ` 만료된 ${j.removed}대는 목록에서 삭제했습니다.` : ""}`
        });
        setBody("");
        await load();
      }
    } catch {
      setResult({ ok: false, text: "서버에 연결하지 못했습니다" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>전체 공지 보내기</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.7 }}>
          알림을 받는 모든 기기에 한 번에 보냅니다. 직원이 알림을 누르면 알림 페이지가 열립니다.
        </div>

        {error && <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <label style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 4 }}>제목</label>
        <input
          className="input"
          style={{ width: "100%", maxWidth: 360, marginBottom: 12 }}
          maxLength={40}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="공지"
        />

        <label style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 4 }}>
          내용 <span style={{ fontWeight: 400, color: "var(--muted)" }}>({body.length}/200)</span>
        </label>
        <textarea
          className="input"
          style={{ width: "100%", maxWidth: 520, minHeight: 90, resize: "vertical", marginBottom: 12 }}
          maxLength={200}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="예: 오늘 14:00 프로그램은 15:00로 변경되었습니다."
        />

        <div style={{ border: "1px dashed var(--line)", borderRadius: 8, padding: "10px 12px", maxWidth: 520, marginBottom: 12, background: "#fafafa" }}>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 4 }}>폰에 이렇게 보입니다</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{title.trim() || "공지"}</div>
          <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", color: body.trim() ? undefined : "var(--muted)" }}>{body.trim() || "(내용을 입력하세요)"}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button className="btn btn-accent" disabled={busy || !body.trim() || recipients === 0} onClick={send}>
            {busy ? "보내는 중..." : `전체 ${recipients ?? ""}대에 보내기`}
          </button>
          {recipients === 0 && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>알림을 받는 기기가 없습니다.</span>}
          {result && <span style={{ fontSize: 13, color: result.ok ? "#15803d" : "#b91c1c" }}>{result.text}</span>}
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 8 }}>보낸 공지 (최근 20건)</div>
        {history.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>보낸 공지가 없습니다.</div>
        ) : (
          <table className="grid-table">
            <thead>
              <tr>
                <th style={{ width: 140 }}>시각</th>
                <th>내용</th>
                <th style={{ width: 120 }}>결과</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td style={{ padding: "6px 8px", fontSize: 12.5 }}>{fmtKst(h.sent_at)}</td>
                  <td style={{ padding: "6px 8px" }}>
                    <b>{h.title}</b>
                    <div style={{ fontSize: 12.5, whiteSpace: "pre-wrap" }}>{h.body}</div>
                  </td>
                  <td style={{ padding: "6px 8px", fontSize: 12.5 }}>
                    {h.sent}/{h.recipients}대 성공
                    {h.failed > 0 && <div style={{ color: "#b91c1c" }}>실패 {h.failed}</div>}
                    {h.removed > 0 && <div style={{ color: "var(--muted)" }}>만료 삭제 {h.removed}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
