import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

// Temporary diagnostic: what does the SERVER see in push_subscriptions?
// Protected by CRON_SECRET (?key=...). Shows no endpoints/keys. Delete after use.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const key = req.nextUrl.searchParams.get("key");
  if (!secret || key !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = supabaseServer();
  const head = await sb.from("push_subscriptions").select("id", { count: "exact", head: true });
  const list = await sb.from("push_subscriptions").select("*");

  let host = "";
  try {
    host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").host;
  } catch {
    host = "(invalid url)";
  }

  const rows = ((list.data as any[]) || []).map((r) => {
    let pushHost = "";
    try {
      pushHost = new URL(r.endpoint).host;
    } catch {
      pushHost = "?";
    }
    return {
      id: String(r.id).slice(0, 8),
      push_service: pushHost,
      user_agent: String(r.user_agent || "").slice(0, 90),
      lead_minutes: r.lead_minutes,
      created_at: r.created_at,
      updated_at: r.updated_at
    };
  });

  return NextResponse.json(
    {
      supabase_host: host,
      vercel_env: process.env.VERCEL_ENV || null,
      head_count: head.count,
      head_error: head.error?.message || null,
      list_length: rows.length,
      list_error: list.error?.message || null,
      rows
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
