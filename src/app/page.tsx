import Link from "next/link";
import { TV_IDS } from "@/lib/types";

export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>📺 TV 사이니지 시스템</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="label">관리자</div>
        <Link className="btn" href="/admin">
          관리자 페이지 열기
        </Link>
      </div>

      <div className="card">
        <div className="label">송출 화면 (각 TV에서 이 링크를 전체화면으로 열어두세요)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {TV_IDS.map((id) => (
            <Link key={id} className="btn btn-outline" href={`/player/${id}`}>
              TV {id} 송출화면
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
