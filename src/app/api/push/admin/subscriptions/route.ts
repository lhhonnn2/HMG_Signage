import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { isAdmin } from "@/lib/adminAuth";
import { describeUA, pushServiceLabel } from "@/lib/ua";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

// Lists subscribed phones for the admin screen. Never returns endpoints or keys.
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  const { data, error } = await supabaseServer()
    .from("push_subscriptions")
    .select("id, endpoint, user_agent, divisions, brands, category_names, excluded_programs, extra_programs, lead_minutes, created_at, updated_at")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });

  const subs = (data || []).map((r: any) => {
    const { device, browser } = describeUA(r.user_agent);
    return {
      id: r.id as string,
      device,
      browser,
      service: pushServiceLabel(r.endpoint),
      lead: r.lead_minutes as number,
      divisions: (r.divisions || []) as string[],
      brands: (r.brands || []) as string[],
      names: (r.category_names || []) as string[],
      extra: (r.extra_programs || []).length as number,
      excluded: (r.excluded_programs || []).length as number,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string
    };
  });
  return NextResponse.json({ subs }, { headers: noStore });
}

// Removes one subscription (the phone can subscribe again from /notify).
export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400, headers: noStore });
  const { error } = await supabaseServer().from("push_subscriptions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
