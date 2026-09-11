import Link from "next/link";

const NAV = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/images", label: "이미지" },
  { href: "/admin/tvs", label: "TV 설정" },
  { href: "/admin/schedules", label: "요일별 이미지" },
  { href: "/admin/alarms", label: "알람 스케줄" },
  { href: "/admin/fonts", label: "폰트" }
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 200,
          borderRight: "1px solid #dfe2e8",
          padding: "24px 16px",
          background: "#fff"
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 24, fontSize: 15 }}>TV 사이니지 관리</div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                fontSize: 14,
                color: "#16181d",
                textDecoration: "none"
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main style={{ flex: 1, padding: 32, maxWidth: 960 }}>{children}</main>
    </div>
  );
}
