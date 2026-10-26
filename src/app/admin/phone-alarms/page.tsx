"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { PhoneCategoryRow, PhoneProgramRow } from "@/lib/types";
import { normalizeProgram } from "@/lib/pushLogic";
import PhoneTimetable from "@/components/phone/PhoneTimetable";
import ProgramClassifier from "@/components/phone/ProgramClassifier";

type Tab = "timetable" | "programs";
type Stats = { configured: boolean; cronSecretSet: boolean; total: number };

export default function PhoneAlarmsPage() {
  const [tab, setTab] = useState<Tab>("timetable");
  const [cats, setCats] = useState<PhoneCategoryRow[]>([]);
  const [progMap, setProgMap] = useState<Map<string, string | null>>(new Map());
  const [stats, setStats] = useState<Stats | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function loadCats() {
    const { data, error } = await supabase.from("phone_categories").select("*");
    if (error) alert("카테고리를 불러오지 못했습니다: " + error.message + "\n(supabase/migration_v13.sql 을 실행했는지 확인하세요)");
    setCats((data as PhoneCategoryRow[]) || []);
  }

  async function loadPrograms() {
    const { data } = await supabase.from("phone_programs").select("*");
    setProgMap(new Map(((data as PhoneProgramRow[]) || []).map((p) => [normalizeProgram(p.name), p.category_id])));
  }

  useEffect(() => {
    loadCats();
    loadPrograms();
    fetch("/api/push/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  const notifyUrl = typeof window !== "undefined" ? `${window.location.origin}/notify` : "/notify";

  return (
    <div>
      <div className="page-title">폰 알람</div>
      <div className="page-subtitle">
        TV와 별개로 폰으로만 보내는 알림입니다. 타임테이블을 넣고, "프로그램 분류"에서 프로그램마다 구분 → 브랜드 → 상세를 한 번 지정해 두면 직원이 원하는 범위를 골라 받습니다.
      </div>

      <div className="card" style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.7 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>직원 알림 받기 주소</div>
        <a href="/notify" target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>
          {notifyUrl}
        </a>
        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
          직원에게 이 주소를 공유하세요(비밀번호 없이 열립니다). 직원은 받을 카테고리와 "몇 분 전"(한 가지)을 직접 고릅니다. 알림 문구: "[프로그램] 시작 N분 전 입니다. [장소]로 와주세요."
          (장소가 비어 있으면 생략). 같은 시각에 프로그램이 여러 개면 프로그램마다 알림이 각각 갑니다.
        </div>
        <div style={{ marginTop: 8, fontSize: 12.5 }}>
          {stats ? (
            <>
              <span>
                알림 받는 폰: <b>{stats.total}대</b>
              </span>
              {!stats.configured && <span style={{ color: "#b91c1c", marginLeft: 10 }}>⚠ 서버에 푸시 키(VAPID)가 설정되지 않았습니다</span>}
              {!stats.cronSecretSet && <span style={{ color: "#b91c1c", marginLeft: 10 }}>⚠ CRON_SECRET이 설정되지 않았습니다</span>}
            </>
          ) : (
            <span style={{ color: "var(--muted)" }}>구독 현황을 불러오지 못했습니다 (migration 실행 여부를 확인하세요)</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="chip" data-active={tab === "timetable"} onClick={() => setTab("timetable")}>
          타임테이블
        </button>
        <button className="chip" data-active={tab === "programs"} onClick={() => setTab("programs")}>
          프로그램 분류
        </button>
      </div>

      {tab === "timetable" && (
        <PhoneTimetable cats={cats} progMap={progMap} reloadPrograms={loadPrograms} onChanged={() => setRefreshKey((k) => k + 1)} />
      )}
      {tab === "programs" && (
        <ProgramClassifier cats={cats} progMap={progMap} reloadCats={loadCats} reloadPrograms={loadPrograms} refreshKey={refreshKey} />
      )}
    </div>
  );
}
