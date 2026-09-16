import Link from "next/link";

const CARDS = [
  { href: "/admin/images", title: "이미지 업로드", desc: "이미지를 올리고 라이브러리에 등록합니다" },
  { href: "/admin/image-templates", title: "이미지 템플릿", desc: "자주 쓰는 이미지 묶음을 만들어두고 TV 재생목록에 한 번에 적용" },
  { href: "/admin/tvs", title: "TV별 설정", desc: "TV 1~5 재생목록, 전환속도, 알람 음원" },
  { href: "/admin/schedules", title: "요일별 추가 이미지", desc: "특정 요일·시간대에만 함께 루핑될 이미지 세트" },
  { href: "/admin/alarms", title: "알람 스케줄", desc: "TV별·날짜별 알람 표, 직접 입력 또는 엑셀 업로드" },
  { href: "/admin/settings", title: "알람 서식 설정", desc: "알람 문구 템플릿, 줄별 글자 크기, 폰트 업로드, 실시간 미리보기" }
];

export default function AdminHome() {
  return (
    <div>
      <div className="page-title">대시보드</div>
      <div className="page-subtitle">필요한 항목을 선택해 설정을 관리하세요.</div>
      <div className="responsive-grid-2" style={{ gap: 14 }}>
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="card" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14.5 }}>{c.title}</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
