"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLogin />
    </Suspense>
  );
}

function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const params = useSearchParams();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    if (res.ok) {
      router.push(params.get("next") || "/admin");
      router.refresh();
    } else {
      setError("비밀번호가 틀렸습니다");
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: "120px auto", padding: "0 20px" }}>
      <form className="card" onSubmit={submit}>
        <div style={{ fontWeight: 700, marginBottom: 16 }}>관리자 로그인</div>
        <label className="label">비밀번호</label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <div style={{ color: "#e04747", fontSize: 13, marginTop: 8 }}>{error}</div>}
        <button className="btn" style={{ marginTop: 16, width: "100%" }} type="submit">
          입장
        </button>
      </form>
    </main>
  );
}
