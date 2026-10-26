import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

// A phone asks "what did I choose last time?" (by its own endpoint).
export async function POST(req: NextRequest) {
  const { endpoint } = await req.json().catch(() => ({}));
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  const { data, error } = await supabaseServer()
    .from("push_subscriptions")
    .select("tv_ids, category_ids")
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ found: !!data, tv_ids: data?.tv_ids ?? [], category_ids: data?.category_ids ?? [] });
}
