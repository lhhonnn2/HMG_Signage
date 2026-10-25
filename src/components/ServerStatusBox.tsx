"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const CHECK_EVERY_MS = 30_000;
const TIMEOUT_MS = 8_000;
const FAILS_TO_ALERT = 2; // one blip is ignored; two in a row = outage

async function pingOnce(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((r) => {
    timer = setTimeout(() => r(false), TIMEOUT_MS);
  });
  try {
    const q = Promise.resolve(supabase.from("tvs").select("id").limit(1)).then((res: any) => !res.error).catch(() => false);
    return await Promise.race([q, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default function ServerStatusBox() {
  const [status, setStatus] = useState<"checking" | "ok" | "down">("checking");
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const fails = useRef(0);

  useEffect(() => {
    let stopped = false;
    async function check() {
      if (document.hidden) return; // don't poll from background tabs
      const good = await pingOnce();
      if (stopped) return;
      fails.current = good ? 0 : fails.current + 1;
      setCheckedAt(new Date());
      if (good) setStatus("ok");
      else if (fails.current >= FAILS_TO_ALERT) setStatus("down");
      else setStatus((s) => (s === "checking" ? "checking" : s));
    }
    check();
    const t = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => !document.hidden && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const down = status === "down";
  const ok = status === "ok";
  const color = down ? "#b91c1c" : ok ? "#15803d" : "#6b7280";
  const bg = down ? "#fef2f2" : ok ? "#f0fdf4" : "#f3f4f6";
  const label = down ? "장애 발생" : ok ? "정상 작동 중" : "확인 중...";
  const time = checkedAt
    ? `${String(checkedAt.getHours()).padStart(2, "0")}:${String(checkedAt.getMinutes()).padStart(2, "0")}:${String(checkedAt.getSeconds()).padStart(2, "0")}`
    : "";

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        marginBottom: 14,
        borderRadius: 8,
        border: `1px solid ${color}`,
        background: bg,
        color,
        fontSize: 13,
        fontWeight: 600
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label}
      {down && <span style={{ fontWeight: 400 }}>· 서버 응답 없음 (TV는 저장된 내용으로 계속 재생됩니다)</span>}
      {time && <span style={{ marginLeft: "auto", fontWeight: 400, fontSize: 11.5 }}>마지막 확인 {time}</span>}
    </div>
  );
}
