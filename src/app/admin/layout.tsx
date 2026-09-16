"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TV_IDS } from "@/lib/types";
import { useTvNames } from "@/lib/useTvNames";

const NAV = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/images", label: "이미지" },
  { href: "/admin/image-templates", label: "이미지 템플릿" },
  { href: "/admin/tvs", label: "TV 설정" },
  { href: "/admin/schedules", label: "요일별 이미지" },
  { href: "/admin/alarms", label: "알람 스케줄" },
  { href: "/admin/settings", label: "알람 서식 설정" }
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const tvNames = useTvNames();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu automatically whenever you navigate to a new page.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const sidebarContent = (
    <>
      <div>
        <div style={{ fontWeight: 700, marginBottom: 20, fontSize: 15, padding: "0 8px" }}>📺 TV 사이니지 관리</div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: "9px 10px",
                  borderRadius: 8,
                  fontSize: 13.5,
                  fontWeight: active ? 600 : 500,
                  color: active ? "#fff" : "var(--ink)",
                  background: active ? "var(--accent)" : "transparent",
                  textDecoration: "none"
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div>
        <div className="label" style={{ padding: "0 8px" }}>
          송출화면 바로가기
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 8px" }}>
          {TV_IDS.map((id) => (
            <a key={id} className="chip" href={`/player/${id}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, padding: "5px 10px" }}>
              {tvNames[id]} ↗
            </a>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <div className="admin-shell">
      <div className="admin-topbar">
        <div style={{ fontWeight: 700, fontSize: 15 }}>📺 TV 사이니지 관리</div>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="메뉴 열기"
          style={{
            border: "1px solid var(--line)",
            background: "#fff",
            borderRadius: 8,
            width: 36,
            height: 36,
            fontSize: 18,
            lineHeight: 1,
            cursor: "pointer"
          }}
        >
          {menuOpen ? "✕" : "☰"}
        </button>
      </div>

      <aside className={`admin-sidebar${menuOpen ? " open" : ""}`}>{sidebarContent}</aside>

      <main className="admin-main">{children}</main>
    </div>
  );
}
