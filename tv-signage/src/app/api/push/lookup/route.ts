import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

// A phone asks "what did I choose last time?" (by its own endpoint).
export async function POST(req: NextRequest) {
  const { endpoint } = await req.json().catch(() => ({}));
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  const { data, error } = await supabaseServer()
    .from("push_subscriptions")
    .select("divisions, brands, category_names, excluded_programs, extra_programs, lead_minutes")
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    found: !!data,
    divisions: data?.divisions ?? [],
    brands: data?.brands ?? [],
    category_names: data?.category_names ?? [],
    excluded_programs: data?.excluded_programs ?? [],
    extra_programs: data?.extra_programs ?? [],
    lead_minutes: data?.lead_minutes ?? 5
  });
}
