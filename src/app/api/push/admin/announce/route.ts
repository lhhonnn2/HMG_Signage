import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { isAdmin } from "@/lib/adminAuth";
import { isGone, pushConfigured, sendPush } from "@/lib/webpush";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const maxDuration = 30;

const noStore = { "Cache-Control": "no-store" };

// Recent announcements + how many phones would receive one now.
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  const sb = supabaseServer();
  const [histRes, countRes] = await Promise.all([
    sb.from("push_announcements").select("id, sent_at, title, body, recipients, sent, failed, removed").order("sent_at", { ascending: false }).limit(20),
    sb.from("push_subscriptions").select("id", { count: "exact", head: true })
  ]);
  if (histRes.error) {
    const missing = /push_announcements/.test(histRes.error.message) || (histRes.error as any).code === "42P01";
    return NextResponse.json(
      { error: missing ? "push_announcements 테이블이 없습니다. supabase/migration_v14.sql 을 실행해주세요." : histRes.error.message },
      { status: 500, headers: noStore }
    );
  }
  return NextResponse.json({ history: histRes.data || [], recipients: countRes.count ?? 0 }, { headers: noStore });
}

// Sends one notification to every subscribed phone.
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  if (!pushConfigured()) return NextResponse.json({ error: "서버에 푸시 키(VAPID)가 설정되지 않았습니다" }, { status: 500, headers: noStore });

  const b = await req.json().catch(() => ({}));
  const title = String(b?.title ?? "").trim().slice(0, 40) || "공지";
  const body = String(b?.body ?? "").trim().slice(0, 200);
  if (!body) return NextResponse.json({ error: "내용을 입력해주세요" }, { status: 400, headers: noStore });

  const sb = supabaseServer();
  const { data, error } = await sb.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
  const subs = (data || []) as { id: string; endpoint: string; p256dh: string; auth: string }[];

  const tag = "announce-" + Date.now();
  let sent = 0;
  let failed = 0;
  let removed = 0;
  for (let i = 0; i < subs.length; i += 25) {
    await Promise.all(
      subs.slice(i, i + 25).map(async (s) => {
        try {
          await sendPush(s, { title, body, tag, url: "/notify" });
          sent++;
        } catch (e: any) {
          if (isGone(e)) {
            await sb.from("push_subscriptions").delete().eq("id", s.id);
            removed++;
          } else {
            failed++;
          }
        }
      })
    );
  }

  try {
    await sb.from("push_announcements").insert({ title, body, recipients: subs.length, sent, failed, removed });
  } catch {
    /* history is best-effort */
  }
  return NextResponse.json({ ok: true, recipients: subs.length, sent, failed, removed }, { headers: noStore });
}
