"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { PhoneCategoryRow, PhoneProgramRow, PhoneTimetableRow } from "@/lib/types";
import {
  LEAD_OPTIONS,
  catLabel,
  catMatches,
  clearRow,
  emptyFacets,
  facetActive,
  facetOptions,
  pruneFacets,
  selectAllInRow,
  selectEverything,
  toggleFacet,
  type FacetKey,
  type Facets
} from "@/lib/facets";
import { normalizeProgram } from "@/lib/pushLogic";

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

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Support = "checking" | "ok" | "ios-install" | "unsupported";

const ROWS: { key: FacetKey; step: number; title: string; color: string; tint: string }[] = [
  { key: "divisions", step: 1, title: "구분", color: "#2563eb", tint: "#eff6ff" },
  { key: "brands", step: 2, title: "브랜드", color: "#7c3aed", tint: "#f5f3ff" },
  { key: "names", step: 3, title: "카테고리", color: "#059669", tint: "#ecfdf5" }
];

// Square option button (selected = filled with the section color).
function OptionButton({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        minHeight: 40,
        padding: "8px 10px",
        borderRadius: 6,
        border: `1.5px solid ${active ? color : "#d1d5db"}`,
        background: active ? color : "#fff",
        color: active ? "#fff" : "var(--ink)",
        fontSize: 13.5,
        fontWeight: active ? 700 : 500,
        lineHeight: 1.25,
        textAlign: "center",
        cursor: "pointer",
        wordBreak: "keep-all"
      }}
    >
      {label}
    </button>
  );
}

// Small text-style action (전체 / 해제): visually unlike the option buttons.
function TextAction({ label, onClick, color }: { label: string; onClick: () => void; color: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: "none", border: "none", padding: "4px 2px", fontSize: 12.5, fontWeight: 600, color, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
    >
      {label}
    </button>
  );
}

export default function NotifyPage() {
  const [cats, setCats] = useState<PhoneCategoryRow[]>([]);
  const [progMap, setProgMap] = useState<Map<string, string | null>>(new Map());
  const [facets, setFacets] = useState<Facets>(emptyFacets());
  const [lead, setLead] = useState(5);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [extra, setExtra] = useState<string[]>([]);
  const [date, setDate] = useState(todayStr());
  const [dayRows, setDayRows] = useState<PhoneTimetableRow[]>([]);

  const [support, setSupport] = useState<Support>("checking");
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<string>("default");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    supabase
      .from("phone_categories")
      .select("*")
      .then(({ data }) => setCats((data as PhoneCategoryRow[]) || []));
    supabase
      .from("phone_programs")
      .select("*")
      .then(({ data }) => setProgMap(new Map(((data as PhoneProgramRow[]) || []).map((p) => [normalizeProgram(p.name), p.category_id]))));
  }, []);

  useEffect(() => {
    supabase
      .from("phone_timetable")
      .select("*")
      .eq("alarm_date", date)
      .order("start_time")
      .then(({ data }) => setDayRows((data as PhoneTimetableRow[]) || []));
  }, [date]);

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
            setFacets({ divisions: r.divisions, brands: r.brands, names: r.category_names });
            setExcluded(r.excluded_programs);
            setExtra(r.extra_programs);
            setLead(r.lead_minutes);
          }
        }
      } catch {
        /* shows as not subscribed */
      }
    })();
  }, []);

  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const options = useMemo(() => facetOptions(cats, facets), [cats, facets]);
  const matchedCount = useMemo(() => cats.filter((c) => catMatches(c, facets)).length, [cats, facets]);

  function categoryOf(program: string) {
    const id = progMap.get(normalizeProgram(program));
    return id ? catById.get(id) : undefined;
  }

  // Would this program be received, and is that because of the categories?
  function status(program: string) {
    const key = normalizeProgram(program);
    const cat = categoryOf(program);
    const byCategory = !!cat && catMatches(cat, facets);
    const on = excluded.includes(key) ? false : extra.includes(key) ? true : byCategory;
    return { key, cat, byCategory, on };
  }

  function toggleProgram(program: string) {
    const { key, byCategory, on } = status(program);
    if (on) {
      if (byCategory) setExcluded((p) => (p.includes(key) ? p : [...p, key]));
      setExtra((p) => p.filter((x) => x !== key));
    } else {
      if (byCategory) setExcluded((p) => p.filter((x) => x !== key));
      else setExtra((p) => (p.includes(key) ? p : [...p, key]));
    }
  }

  // Programs the user switched on/off by hand only make sense relative to the
  // chosen categories; a changed category choice keeps them (they are per program).
  function changeFacets(next: Facets) {
    setFacets(pruneFacets(cats, next));
  }

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
    if (!facetActive(facets) && extra.length === 0) {
      setMsg({ text: "받을 구분·브랜드·카테고리를 하나 이상 선택해주세요.", ok: false });
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
      await post("/api/push/subscribe", {
        subscription: sub.toJSON(),
        divisions: facets.divisions,
        brands: facets.brands,
        category_names: facets.names,
        excluded_programs: excluded,
        extra_programs: extra,
        lead_minutes: lead
      });
      setSubscribed(true);
      setMsg({ text: "저장되었습니다. 선택한 프로그램이 시작 " + lead + "분 전에 이 폰으로 전송됩니다.", ok: true });
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
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 40px" }}>
      <div className="page-title">🔔 알림 받기</div>
      <div className="page-subtitle">받고 싶은 프로그램을 고르면, 시작 전에 이 폰으로 알림이 옵니다.</div>

      {support === "ios-install" && (
        <div className="card" style={{ marginBottom: 16, fontSize: 14, lineHeight: 1.7 }}>
          <b>아이폰은 홈 화면에 추가해야 알림을 받을 수 있습니다.</b>
          <ol style={{ margin: "8px 0 0 0", paddingLeft: 22, listStyle: "decimal" }}>
            <li>Safari로 이 페이지를 엽니다 (카카오톡 등 다른 앱 안에서 열었다면 Safari로 다시 열어주세요).</li>
            <li>화면 아래 주소창의 왼쪽 끝 <b>≡</b> 버튼(또는 <b>⋯</b>, 공유 버튼 □↑이 보이면 그 버튼)을 누릅니다.</li>
            <li>메뉴에서 <b>공유</b>를 누르고, 아래로 넘겨서 <b>홈 화면에 추가</b>를 누른 뒤 <b>추가</b>를 누릅니다.</li>
            <li>홈 화면에 생긴 <b>HMG 알림</b> 아이콘을 눌러 다시 열고, 이 화면에서 프로그램을 선택한 뒤 <b>알림 받기</b>로 알림을 허용합니다.</li>
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
        <div style={{ fontWeight: 600, marginBottom: 6 }}>몇 분 전에 받을까요?</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {LEAD_OPTIONS.map((m) => (
            <button key={m} type="button" className="chip" data-active={lead === m} onClick={() => setLead(m)}>
              {m}분 전
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
          예: "[프로그램] 시작 {lead}분 전 입니다. [장소]로 와주세요."
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>받을 카테고리</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => changeFacets(selectEverything(cats))}
              style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #9ca3af", background: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
            >
              전체선택
            </button>
            <button
              type="button"
              onClick={() => setFacets(emptyFacets())}
              style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff", color: "#b91c1c", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
            >
              전체해제
            </button>
          </div>
        </div>

        {cats.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>등록된 카테고리가 없습니다.</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {cats.length > 0 &&
            ROWS.map(({ key, step, title, color, tint }) => (
              <div key={key} style={{ background: tint, border: "1px solid #e5e7eb", borderLeft: `4px solid ${color}`, borderRadius: 8, padding: "10px 12px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{ width: 20, height: 20, borderRadius: 4, background: color, color: "#fff", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    >
                      {step}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 14, color }}>{title}</span>
                    {facets[key].length > 0 && <span style={{ fontSize: 12, color: "var(--muted)" }}>{facets[key].length}개 선택</span>}
                  </div>
                  <div style={{ display: "flex", gap: 14 }}>
                    <TextAction label="전체" color={color} onClick={() => changeFacets(selectAllInRow(cats, facets, key))} />
                    <TextAction label="해제" color="#6b7280" onClick={() => setFacets(clearRow(facets, key))} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 8 }}>
                  {options[key].map((v) => (
                    <OptionButton key={v} label={v} color={color} active={facets[key].includes(v)} onClick={() => changeFacets(toggleFacet(cats, facets, key, v))} />
                  ))}
                  {options[key].length === 0 && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>해당 없음</span>}
                </div>
              </div>
            ))}
        </div>

        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, lineHeight: 1.6 }}>
          {facetActive(facets)
            ? `선택한 조건에 맞는 카테고리 ${matchedCount}개의 프로그램을 받습니다. 한 구역에서 여러 개를 고르면 "또는", 구역끼리는 "그리고"로 적용됩니다. 고르지 않은 구역은 제한이 없습니다.`
            : "구분·브랜드·카테고리를 눌러 받을 범위를 정하세요. 브랜드나 카테고리를 먼저 골라도 됩니다."}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>프로그램별로 켜고 끄기</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
          날짜를 고르면 그날 타임테이블이 나옵니다. 끈 프로그램은 매일 같은 이름이면 계속 꺼진 상태로 유지됩니다.
        </div>
        <input className="input" type="date" style={{ width: 170, marginBottom: 10 }} value={date} onChange={(e) => setDate(e.target.value || todayStr())} />

        {dayRows.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>이 날짜에 등록된 프로그램이 없습니다.</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {dayRows.map((r) => {
            const s = status(r.program_name);
            return (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  opacity: s.on ? 1 : 0.55
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13.5, width: 44, flexShrink: 0 }}>{r.start_time.slice(0, 5)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, wordBreak: "keep-all" }}>{r.program_name || "(이름 없음)"}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    {r.location ? `${r.location} · ` : ""}
                    {s.cat ? catLabel(s.cat) : "미분류"}
                  </div>
                </div>
                <button type="button" className="chip" data-active={s.on} onClick={() => toggleProgram(r.program_name)} style={{ flexShrink: 0 }}>
                  {s.on ? "받는 중" : "안 받음"}
                </button>
              </div>
            );
          })}
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

      {subscribed && support === "ok" && <div style={{ fontSize: 12.5, color: "#15803d", marginTop: 10 }}>✓ 이 폰은 알림을 받는 중입니다. 선택을 바꿨다면 "선택 저장"을 눌러야 적용됩니다.</div>}
      {msg && <div style={{ fontSize: 13.5, marginTop: 12, color: msg.ok ? "#15803d" : "#b91c1c" }}>{msg.text}</div>}

      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 24, lineHeight: 1.6 }}>
        일반 푸시 알림이라 폰이 무음/방해금지 모드이면 소리가 나지 않을 수 있습니다. 알림이 안 오면 폰의 알림 설정과 배터리 절전 설정을 확인해주세요.
      </div>
    </div>
  );
}
