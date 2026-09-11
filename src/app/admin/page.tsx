import Link from "next/link";

export default function AdminHome() {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>대시보드</h1>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Link href="/admin/images" className="card" style={{ textDecoration: "none", color: "inherit" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>이미지 업로드</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>이미지를 올리고 라이브러리에 등록합니다</div>
        </Link>
        <Link href="/admin/tvs" className="card" style={{ textDecoration: "none", color: "inherit" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>TV별 설정</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>TV 1~5 재생목록, 전환속도, 알람 음원</div>
        </Link>
        <Link href="/admin/schedules" className="card" style={{ textDecoration: "none", color: "inherit" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>요일별 추가 이미지</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>특정 요일·시간대에만 함께 루핑될 이미지 세트</div>
        </Link>
        <Link href="/admin/alarms" className="card" style={{ textDecoration: "none", color: "inherit" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>알람 스케줄</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>알람 등록, 엑셀 업로드, 폰트/글자크기</div>
        </Link>
        <Link href="/admin/fonts" className="card" style={{ textDecoration: "none", color: "inherit" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>폰트 관리</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>알람 화면에 쓸 폰트 파일 업로드</div>
        </Link>
      </div>
    </div>
  );
}
