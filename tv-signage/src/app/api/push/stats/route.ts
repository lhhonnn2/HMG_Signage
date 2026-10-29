import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { pushConfigured } from "@/lib/webpush";

export const dynamic = "force-dynamic";

// Only a count (no endpoints/keys) — shown on the admin phone-alarm page.
export async function GET() {
  const { count, error } = await supabaseServer().from("push_subscriptions").select("id", { count: "exact", head: true });
  if (error) return NextResponse.json({ error: error.message, configured: pushConfigured() }, { status: 500 });
  return NextResponse.json({ configured: pushConfigured(), cronSecretSet: !!process.env.CRON_SECRET, total: count ?? 0 });
}
