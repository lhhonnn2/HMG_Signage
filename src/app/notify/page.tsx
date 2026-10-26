"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useTvs } from "@/lib/useTvNames";
import type { PhoneCategoryRow } from "@/lib/types";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `요청 실패 (${res.status})`);
  return json;
}

type Support = "checking" | "ok" | "ios-install" | "unsupported";

export default function NotifyPage() {
  const { ids: tvIds, names: tvNames } = useTvs();
  const [cats, setCats] = useState<PhoneCategoryRow[]>([]);
  const [tvSel, setTvSel] = useState<number[]>([]);
  const [catSel, setCatSel] = useState<string[]>([]);
  const [support, setSupport] = useState<Support>("checking");
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<string>("default");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    supabase
      .from("phone_categories")
      .select("*")
      .order("name")
      .then(({ data }) => setCats((data as PhoneCategoryRow[]) || []));
  }, []);

  useEffect(() => {
    (async () => {
      const ua = navigator.userAgent;
      const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
      const standalone = (navigator as any).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
      const hasApis = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!hasApis) {
        setSupport(isIos && !standalone ? "ios-install" : "unsupported");
        return;
      }
      setSupport("ok");
      setPermission(Notification.permission);
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const r = await post("/api/push/lookup", { endpoint: sub.endpoint });
          if (r.found) {
            setSubscribed(true);
            setTvSel(r.tv_ids);
            setCatSel(r.category_ids);
          }
        }
      } catch {
        /* shows as not subscribed */
      }
    })();
  }, []);

  function toggle<T>(list: T[], v: T): T[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  async function currentSubscription(createIfMissing: boolean) {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub && createIfMissing) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID) });
    }
    return sub;
  }

  async function save() {
    setMsg(null);
    if (tvSel.length === 0 && catSel.length === 0) {
      setMsg({ text: "받을 TV나 카테고리를 하나 이상 선택해주세요.", ok: false });
      return;
    }
    if (!VAPID) {
      setMsg({ text: "서버에 알림 키가 설정되지 않았습니다. 관리자에게 문의하세요.", ok: false });
      return;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setMsg({ text: "알림 권한이 허용되지 않았습니다. 브라우저/앱 설정에서 이 사이트의 알림을 허용해주세요.", ok: false });
        return;
      }
      const sub = await currentSubscription(true);
      if (!sub) throw new Error("구독을 만들지 못했습니다");
      await post("/api/push/subscribe", { subscription: sub.toJSON(), tv_ids: tvSel, category_ids: catSel });
      setSubscribed(true);
      setMsg({ text: "저장되었습니다. 선택한 알람이 이 폰으로 전송됩니다.", ok: true });
    } catch (e: any) {
      setMsg({ text: "저장 실패: " + e.message, ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!confirm("이 폰의 알림을 끌까요?")) return;
    setBusy(true);
    setMsg(null);
    try {
      const sub = await currentSubscription(false);
      if (sub) {
        await post("/api/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setMsg({ text: "알림을 껐습니다.", ok: true });
    } catch (e: any) {
      setMsg({ text: "실패: " + e.message, ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMsg(null);
    try {
      const sub = await currentSubscription(false);
      if (!sub) throw new Error("먼저 '알림 받기'를 눌러주세요");
      await post("/api/push/test", { endpoint: sub.endpoint });
      setMsg({ text: "테스트 알림을 보냈습니다. 잠시 후 알림이 오는지 확인하세요.", ok: true });
    } catch (e: any) {
      setMsg({ text: e.message, ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "20px 16px 40px" }}>
      <div className="page-title">🔔 알림 받기</div>
      <div className="page-subtitle">받고 싶은 알람을 선택하면, 해당 알람 시각에 이 폰으로 알림이 옵니다.</div>

      {support === "ios-install" && (
        <div className="card" style={{ marginBottom: 16, fontSize: 14, lineHeight: 1.7 }}>
          <b>아이폰은 홈 화면에 추가해야 알림을 받을 수 있습니다.</b>
          <ol style={{ margin: "8px 0 0 18px" }}>
            <li>Safari로 이 페이지를 엽니다 (다른 브라우저 앱이면 Safari로 열어주세요).</li>
            <li>아래쪽 공유 버튼(□↑)을 누릅니다.</li>
            <li>"홈 화면에 추가"를 누릅니다.</li>
            <li>홈 화면에 생긴 "HMG 알림" 아이콘으로 다시 열어 이 화면에서 알림을 허용합니다.</li>
          </ol>
        </div>
      )}
      {support === "unsupported" && (
        <div className="card" style={{ marginBottom: 16, fontSize: 14 }}>
          이 브라우저는 알림을 지원하지 않습니다. 안드로이드는 크롬, 아이폰은 Safari(홈 화면에 추가)로 열어주세요.
        </div>
      )}

      {support === "ok" && permission === "denied" && (
        <div className="card" style={{ marginBottom: 16, fontSize: 14, color: "#b91c1c" }}>
          알림이 차단되어 있습니다. 브라우저(또는 폰) 설정에서 이 사이트의 알림을 허용한 뒤 다시 시도해주세요.
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>TV 알람</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>선택한 TV에 알람이 뜰 때 폰으로도 알림을 받습니다.</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tvIds.length === 0 && <span style={{ fontSize: 13, color: "var(--muted)" }}>등록된 TV가 없습니다</span>}
          {tvIds.map((id) => (
            <button key={id} type="button" className="chip" data-active={tvSel.includes(id)} onClick={() => setTvSel((p) => toggle(p, id))}>
              {tvNames[id]}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>폰 전용 알람 (카테고리)</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>TV에는 나오지 않고 폰으로만 오는 알람입니다.</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {cats.length === 0 && <span style={{ fontSize: 13, color: "var(--muted)" }}>등록된 카테고리가 없습니다</span>}
          {cats.map((c) => (
            <button key={c.id} type="button" className="chip" data-active={catSel.includes(c.id)} onClick={() => setCatSel((p) => toggle(p, c.id))}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {support === "ok" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-accent" disabled={busy} onClick={save}>
            {busy ? "처리 중..." : subscribed ? "선택 저장" : "알림 받기"}
          </button>
          {subscribed && (
            <>
              <button className="btn btn-outline" disabled={busy} onClick={sendTest}>
                테스트 알림
              </button>
              <button className="btn btn-outline" disabled={busy} style={{ color: "#dc2626" }} onClick={stop}>
                알림 끄기
              </button>
            </>
          )}
        </div>
      )}

      {subscribed && support === "ok" && (
        <div style={{ fontSize: 12.5, color: "#15803d", marginTop: 10 }}>✓ 이 폰은 알림을 받는 중입니다.</div>
      )}
      {msg && <div style={{ fontSize: 13.5, marginTop: 12, color: msg.ok ? "#15803d" : "#b91c1c" }}>{msg.text}</div>}

      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 24, lineHeight: 1.6 }}>
        일반 푸시 알림이라 폰이 무음/방해금지 모드이면 소리가 나지 않을 수 있습니다. 알림이 안 오면 폰의 알림 설정과 배터리 절전 설정을 확인해주세요.
      </div>
    </div>
  );
}
