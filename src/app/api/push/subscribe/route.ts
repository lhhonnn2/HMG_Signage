import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

// Saves (or updates) a phone's push subscription and chosen TVs/categories.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sub = body?.subscription;
    const endpoint: string | undefined = sub?.endpoint;
    const p256dh: string | undefined = sub?.keys?.p256dh;
    const auth: string | undefined = sub?.keys?.auth;
    if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: "invalid subscription" }, { status: 400 });

    const tv_ids = Array.isArray(body.tv_ids) ? body.tv_ids.map(Number).filter((n: number) => Number.isFinite(n)) : [];
    const category_ids = Array.isArray(body.category_ids) ? body.category_ids.map(String) : [];

    const { error } = await supabaseServer()
      .from("push_subscriptions")
      .upsert(
        {
          endpoint,
          p256dh,
          auth,
          tv_ids,
          category_ids,
          user_agent: (req.headers.get("user-agent") || "").slice(0, 200),
          updated_at: new Date().toISOString()
        },
        { onConflict: "endpoint" }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
