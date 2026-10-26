import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { isGone, pushConfigured, sendPush } from "@/lib/webpush";
import { buildMessage, dueAlarms, kstParts, planSends, type PushAlarm, type PushSub } from "@/lib/pushLogic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Called every minute by an external scheduler (cron-job.org).
// Finds alarms that started within the last 3 minutes and pushes them to
// subscribed phones, once per phone per alarm.
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  const given = req.nextUrl.searchParams.get("key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (given !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "VAPID keys not set" }, { status: 500 });

  const sb = supabaseServer();
  const nowMs = Date.now();
  const { date, yesterday } = kstParts(nowMs);

  const [tvRes, phRes, subRes] = await Promise.all([
    sb.from("alarms").select("tv_id, alarm_date, alarm_time, scheduled_time, program_name, location").in("alarm_date", [yesterday, date]),
    sb.from("phone_alarms").select("category_id, alarm_date, alarm_time, scheduled_time, program_name, location").in("alarm_date", [yesterday, date]),
    sb.from("push_subscriptions").select("id, endpoint, p256dh, auth, tv_ids, category_ids")
  ]);
  if (tvRes.error || phRes.error || subRes.error) {
    return NextResponse.json({ error: (tvRes.error || phRes.error || subRes.error)!.message }, { status: 500 });
  }

  const all: PushAlarm[] = [
    ...(tvRes.data || []).map((r: any) => ({ source: "tv" as const, group: r.tv_id, ...r })),
    ...(phRes.data || []).map((r: any) => ({ source: "phone" as const, group: r.category_id, ...r }))
  ];
  const due = dueAlarms(all, nowMs);
  const subs = (subRes.data || []) as (PushSub & { endpoint: string; p256dh: string; auth: string })[];
  const subById = new Map(subs.map((s) => [s.id, s]));
  const plan = planSends(due, subs);

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
        const msg = buildMessage(p.alarm);
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

  // housekeeping: keep a week of log
  await sb.from("push_log").delete().lt("sent_at", new Date(nowMs - 7 * 24 * 3600 * 1000).toISOString());

  return NextResponse.json({ ok: true, due: due.length, planned: plan.length, sent, failed, removed });
}

export const GET = handle;
export const POST = handle;
