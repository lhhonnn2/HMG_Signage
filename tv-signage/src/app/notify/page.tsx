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

const ROWS: { key: FacetKey; title: string }[] = [
  { key: "divisions", title: "구분" },
  { key: "brands", title: "브랜드" },
  { key: "names", title: "카테고리" }
];

export default function NotifyPage() {
  const [cats, setCats] = useState<PhoneCategoryRow[]>([]);
  const [progMap, setProgMap] = useState<Map<string, string | null>>(new Map());
  const [facets, setFacets] = useState<Facets>(emptyFacets());
  const [lead, setLead] = useState(5);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [extra, setExtra] = useState<string[]>([]);
  const [date, setDate] = useState(todayStr());
  const [dayRows, setDayRows] = useState<PhoneTimetableRow[]>([]);
  const [tab, setTab] = useState<"settings" | "timetable">("settings");
  const [onlyMine, setOnlyMine] = useState(false);

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

  const shownRows = onlyMine ? dayRows.filter((r) => status(r.program_name).on) : dayRows;

  return (
    <div className="nt">
      <div className="nt-head">
        <h1>HMG 알림</h1>
        <p>받을 프로그램을 정해 두면 시작 전에 이 폰으로 알림이 갑니다.</p>
      </div>

      {support === "ios-install" && (
        <div className="nt-notice">
          <b>아이폰은 홈 화면에 추가해야 알림을 받을 수 있습니다.</b>
          <ol>
            <li>Safari로 이 페이지를 엽니다. 카카오톡 등 다른 앱 안에서 열었다면 Safari로 다시 열어주세요.</li>
            <li>화면 아래 주소창의 왼쪽 끝 <b>≡</b> 버튼(또는 <b>⋯</b>, 공유 버튼 □↑이 보이면 그 버튼)을 누릅니다.</li>
            <li>메뉴에서 <b>공유</b>를 누르고, 아래로 넘겨서 <b>홈 화면에 추가</b>를 누른 뒤 <b>추가</b>를 누릅니다. 안 보이면 맨 아래 <b>더 보기</b>(⋯) 안을 확인하세요.</li>
            <li>홈 화면에 생긴 <b>HMG 알림</b> 아이콘으로 다시 열고, 프로그램을 선택한 뒤 <b>알림 받기</b>를 눌러 알림을 허용합니다.</li>
          </ol>
        </div>
      )}
      {support === "unsupported" && (
        <div className="nt-notice">이 브라우저는 알림을 지원하지 않습니다. 안드로이드는 크롬, 아이폰은 Safari(홈 화면에 추가)로 열어주세요.</div>
      )}
      {support === "ok" && permission === "denied" && (
        <div className="nt-notice warn">알림이 차단되어 있습니다. 브라우저(또는 폰) 설정에서 이 사이트의 알림을 허용한 뒤 다시 시도해주세요.</div>
      )}

      <div className="nt-tabs" role="tablist">
        <button type="button" role="tab" className="nt-tab" aria-selected={tab === "settings"} onClick={() => setTab("settings")}>
          알림 설정
        </button>
        <button type="button" role="tab" className="nt-tab" aria-selected={tab === "timetable"} onClick={() => setTab("timetable")}>
          타임테이블 확인
        </button>
      </div>

      <div className="nt-body">
        {tab === "settings" && (
          <>
            <div className="nt-row">
              <label htmlFor="lead">몇 분 전에 받을까요?</label>
              <select id="lead" className="nt-select" value={lead} onChange={(e) => setLead(Number(e.target.value))}>
                {LEAD_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}분 전
                  </option>
                ))}
              </select>
            </div>

            <div className="nt-bar">
              <h2>받을 카테고리</h2>
              <div className="nt-links">
                <button type="button" className="nt-link strong" onClick={() => changeFacets(selectEverything(cats))}>
                  전체선택
                </button>
                <button type="button" className="nt-link" onClick={() => setFacets(emptyFacets())}>
                  전체해제
                </button>
              </div>
            </div>

            {cats.length === 0 && <div className="nt-empty" style={{ padding: "10px 0" }}>등록된 카테고리가 없습니다.</div>}

            {cats.length > 0 &&
              ROWS.map(({ key, title }) => (
                <div className="nt-group" key={key}>
                  <div className="nt-group-head">
                    <span className="nt-group-title">
                      {title}
                      {facets[key].length > 0 && <small>{facets[key].length}개 선택</small>}
                    </span>
                    <span className="nt-links">
                      <button type="button" className="nt-link" onClick={() => changeFacets(selectAllInRow(cats, facets, key))}>
                        전체
                      </button>
                      <button type="button" className="nt-link" onClick={() => setFacets(clearRow(facets, key))}>
                        해제
                      </button>
                    </span>
                  </div>
                  <div className="nt-opts">
                    {options[key].map((v) => (
                      <button
                        key={v}
                        type="button"
                        className="nt-opt"
                        aria-pressed={facets[key].includes(v)}
                        onClick={() => changeFacets(toggleFacet(cats, facets, key, v))}
                      >
                        {v}
                      </button>
                    ))}
                    {options[key].length === 0 && <span className="nt-empty">해당 없음</span>}
                  </div>
                </div>
              ))}

            <p className="nt-help">
              {facetActive(facets)
                ? `선택한 조건에 맞는 카테고리 ${matchedCount}개의 프로그램을 받습니다. 한 줄에서 여러 개를 고르면 "또는", 줄끼리는 "그리고"로 적용되며, 고르지 않은 줄은 제한이 없습니다.`
                : "구분·브랜드·카테고리를 눌러 받을 범위를 정하세요. 브랜드나 카테고리부터 골라도 됩니다."}
            </p>
          </>
        )}

        {tab === "timetable" && (
          <>
            <div className="nt-tt-tools">
              <input className="nt-date" type="date" value={date} onChange={(e) => setDate(e.target.value || todayStr())} />
              <label className="nt-check">
                <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
                내가 받는 것만 보기
              </label>
            </div>

            {dayRows.length === 0 && <div className="nt-empty" style={{ padding: "8px 0" }}>이 날짜에 등록된 프로그램이 없습니다.</div>}
            {dayRows.length > 0 && shownRows.length === 0 && <div className="nt-empty" style={{ padding: "8px 0" }}>이 날짜에 받는 프로그램이 없습니다.</div>}

            <div>
              {shownRows.map((r) => {
                const s = status(r.program_name);
                return (
                  <div key={r.id} className={"nt-item" + (s.on ? "" : " off")}>
                    <div className="nt-time">{r.start_time.slice(0, 5)}</div>
                    <div className="nt-item-main">
                      <div className="nt-item-name">{r.program_name || "(이름 없음)"}</div>
                      <div className="nt-item-meta">
                        {r.location ? `${r.location} · ` : ""}
                        {s.cat ? catLabel(s.cat) : "미분류"}
                      </div>
                    </div>
                    <button type="button" className="nt-toggle" aria-pressed={s.on} onClick={() => toggleProgram(r.program_name)}>
                      {s.on ? "받는 중" : "안 받음"}
                    </button>
                  </div>
                );
              })}
            </div>

            <p className="nt-help" style={{ marginTop: 12 }}>
              오른쪽 버튼으로 프로그램별로 켜고 끌 수 있습니다. 끈 프로그램은 같은 이름이면 다른 날에도 꺼진 상태로 유지됩니다. 바꾼 뒤에는 아래 "선택 저장"을 눌러주세요.
            </p>
          </>
        )}
      </div>

      {subscribed && support === "ok" && <div className="nt-msg ok">이 폰은 알림을 받는 중입니다. 선택을 바꿨다면 "선택 저장"을 눌러야 적용됩니다.</div>}
      {msg && <div className={"nt-msg " + (msg.ok ? "ok" : "err")}>{msg.text}</div>}

      <div className="nt-foot">
        알림 예시: "[프로그램] 시작 {lead}분 전 입니다. [장소]로 와주세요."
        <br />
        일반 푸시 알림이라 폰이 무음/방해금지 모드이면 소리가 나지 않을 수 있습니다. 알림이 안 오면 폰의 알림 설정과 배터리 절전 설정을 확인해주세요.
      </div>

      {support === "ok" && (
        <div className="nt-actions">
          <button className="nt-btn primary" disabled={busy} onClick={save}>
            {busy ? "처리 중..." : subscribed ? "선택 저장" : "알림 받기"}
          </button>
          {subscribed && (
            <>
              <button className="nt-btn" disabled={busy} onClick={sendTest}>
                테스트
              </button>
              <button className="nt-btn danger" disabled={busy} onClick={stop}>
                끄기
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
