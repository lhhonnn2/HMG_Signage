import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { normalizeProgram } from "@/lib/pushLogic";

export const dynamic = "force-dynamic";

const strs = (v: unknown, max = 200): string[] =>
  Array.isArray(v) ? Array.from(new Set(v.map((x) => normalizeProgram(String(x))).filter(Boolean))).slice(0, max) : [];

// Saves (or updates) a phone's push subscription and its choices.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sub = body?.subscription;
    const endpoint: string | undefined = sub?.endpoint;
    const p256dh: string | undefined = sub?.keys?.p256dh;
    const auth: string | undefined = sub?.keys?.auth;
    if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: "invalid subscription" }, { status: 400 });

    const lead = Math.round(Number(body.lead_minutes));
    const lead_minutes = Number.isFinite(lead) && lead >= 1 && lead <= 120 ? lead : 5;

    const { error } = await supabaseServer()
      .from("push_subscriptions")
      .upsert(
        {
          endpoint,
          p256dh,
          auth,
          divisions: strs(body.divisions),
          brands: strs(body.brands),
          category_names: strs(body.category_names),
          excluded_programs: strs(body.excluded_programs),
          extra_programs: strs(body.extra_programs),
          lead_minutes,
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
