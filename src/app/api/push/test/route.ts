import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { isGone, pushConfigured, sendPush } from "@/lib/webpush";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Sends a sample notification to the phone that asks (by its endpoint).
export async function POST(req: NextRequest) {
  if (!pushConfigured()) return NextResponse.json({ error: "서버에 푸시 키(VAPID)가 설정되지 않았습니다" }, { status: 500 });
  const { endpoint } = await req.json().catch(() => ({}));
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  const sb = supabaseServer();
  const { data } = await sb.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("endpoint", endpoint).maybeSingle();
  if (!data) return NextResponse.json({ error: "저장된 구독 정보가 없습니다. 먼저 '알림 받기'를 눌러주세요" }, { status: 404 });
  try {
    await sendPush(data, { title: "테스트 알림", body: "알림이 정상적으로 도착했습니다.", tag: "test", url: "/notify" });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (isGone(e)) await sb.from("push_subscriptions").delete().eq("id", data.id);
    return NextResponse.json({ error: "발송 실패: " + (e.statusCode || e.message) }, { status: 502 });
  }
}
