import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { pushConfigured } from "@/lib/webpush";

export const dynamic = "force-dynamic";

// Only counts (no endpoints/keys) — shown on the admin phone-alarm page.
export async function GET() {
  const { data, error } = await supabaseServer().from("push_subscriptions").select("tv_ids, category_ids");
  if (error) return NextResponse.json({ error: error.message, configured: pushConfigured() }, { status: 500 });
  const byTv: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const s of data || []) {
    for (const t of s.tv_ids || []) byTv[t] = (byTv[t] || 0) + 1;
    for (const c of s.category_ids || []) byCategory[c] = (byCategory[c] || 0) + 1;
  }
  return NextResponse.json({
    configured: pushConfigured(),
    cronSecretSet: !!process.env.CRON_SECRET,
    total: (data || []).length,
    byTv,
    byCategory
  });
}
