import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { isGone, pushConfigured, sendPush } from "@/lib/webpush";
import { buildMessage, kstDates, normalizeProgram, planSends, type PushSub, type TimetableRow } from "@/lib/pushLogic";
import type { CatInfo } from "@/lib/facets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Called every minute by an external scheduler (cron-job.org).
// For every phone: finds programs whose (start time − that phone's chosen lead)
// fell within the last 3 minutes and that the phone wants, and pushes them once.
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  const given = req.nextUrl.searchParams.get("key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (given !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "VAPID keys not set" }, { status: 500 });

  const sb = supabaseServer();
  const nowMs = Date.now();
  const { today, tomorrow } = kstDates(nowMs);

  const [ttRes, progRes, catRes, subRes] = await Promise.all([
    sb.from("phone_timetable").select("alarm_date, start_time, program_name, location").in("alarm_date", [today, tomorrow]),
    sb.from("phone_programs").select("name, category_id"),
    sb.from("phone_categories").select("id, division, brand, name"),
    sb
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, divisions, brands, category_names, excluded_programs, extra_programs, lead_minutes")
  ]);
  const err = ttRes.error || progRes.error || catRes.error || subRes.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  const catById = new Map<string, CatInfo>((catRes.data || []).map((c: any) => [c.id, { division: c.division, brand: c.brand, name: c.name }]));
  const catByProgram = new Map<string, CatInfo>();
  for (const p of progRes.data || []) {
    const c = p.category_id ? catById.get(p.category_id) : undefined;
    if (c) catByProgram.set(normalizeProgram(p.name), c);
  }

  const subs = (subRes.data || []) as (PushSub & { endpoint: string; p256dh: string; auth: string })[];
  const subById = new Map(subs.map((s) => [s.id, s]));
  const plan = planSends((ttRes.data || []) as TimetableRow[], subs, catByProgram, nowMs);

  let sent = 0;
  let failed = 0;
  let removed = 0;

  if (plan.length > 0) {
    // Claim first: only rows that are newly inserted get sent (dedupe).
    const { data: claimed, error } = await sb
      .from("push_log")
      .upsert(
        plan.map((p) => ({ subscription_id: p.sub.id, dedupe_key: p.key })),
        { onConflict: "subscription_id,dedupe_key", ignoreDuplicates: true }
      )
      .select("id, subscription_id, dedupe_key");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const planMap = new Map(plan.map((p) => [`${p.sub.id}#${p.key}`, p]));
    await Promise.all(
      (claimed || []).map(async (c: any) => {
        const p = planMap.get(`${c.subscription_id}#${c.dedupe_key}`);
        const sub = subById.get(c.subscription_id);
        if (!p || !sub) return;
        const msg = buildMessage({ program_name: p.row.program_name, location: p.row.location, lead: sub.lead_minutes });
        try {
          await sendPush(sub, { ...msg, tag: c.dedupe_key, url: "/notify" });
          sent++;
        } catch (e: any) {
          if (isGone(e)) {
            await sb.from("push_subscriptions").delete().eq("id", sub.id);
            removed++;
          } else {
            // transient failure: release the claim so the next minute retries
            await sb.from("push_log").delete().eq("id", c.id);
            failed++;
          }
        }
      })
    );
  }

  await sb.from("push_log").delete().lt("sent_at", new Date(nowMs - 7 * 24 * 3600 * 1000).toISOString());

  return NextResponse.json({ ok: true, planned: plan.length, sent, failed, removed });
}

export const GET = handle;
export const POST = handle;
