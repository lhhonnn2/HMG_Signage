import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { isAdmin } from "@/lib/adminAuth";
import type { RunError } from "@/lib/pushRuns";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };
const DAY = 24 * 3600 * 1000;
const KST = 9 * 3600 * 1000;

// 00:00 KST of the day containing `ms`, as epoch ms.
function kstDayStart(ms: number) {
  return Math.floor((ms + KST) / DAY) * DAY - KST;
}

type Totals = { sent: number; failed: number; removed: number };

// Delivery overview for the admin screen: last cron call, today/yesterday totals, recent problems.
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  const sb = supabaseServer();
  const now = Date.now();
  const todayStart = kstDayStart(now);
  const yesterdayStart = todayStart - DAY;
  const weekAgo = new Date(now - 7 * DAY).toISOString();

  const [lastRes, callsRes, eventsRes, subsRes] = await Promise.all([
    sb.from("push_runs").select("ran_at").order("ran_at", { ascending: false }).limit(1),
    sb.from("push_runs").select("id", { count: "exact", head: true }).gte("ran_at", new Date(todayStart).toISOString()),
    sb
      .from("push_runs")
      .select("ran_at, sent, failed, removed, errors")
      .gte("ran_at", weekAgo)
      .or("sent.gt.0,failed.gt.0,removed.gt.0")
      .order("ran_at", { ascending: false })
      .limit(1000),
    sb.from("push_subscriptions").select("id", { count: "exact", head: true })
  ]);

  const err = lastRes.error || callsRes.error || eventsRes.error;
  if (err) {
    const missing = /push_runs/.test(err.message) || (err as any).code === "42P01";
    return NextResponse.json(
      { error: missing ? "push_runs 테이블이 없습니다. supabase/migration_v14.sql 을 실행해주세요." : err.message },
      { status: 500, headers: noStore }
    );
  }

  const today: Totals = { sent: 0, failed: 0, removed: 0 };
  const yesterday: Totals = { sent: 0, failed: 0, removed: 0 };
  for (const r of (eventsRes.data || []) as any[]) {
    const t = new Date(r.ran_at).getTime();
    const target = t >= todayStart ? today : t >= yesterdayStart ? yesterday : null;
    if (!target) continue;
    target.sent += r.sent;
    target.failed += r.failed;
    target.removed += r.removed;
  }

  const recent = ((eventsRes.data || []) as any[]).slice(0, 40).map((r) => ({
    at: r.ran_at as string,
    sent: r.sent as number,
    failed: r.failed as number,
    removed: r.removed as number,
    errors: (r.errors || []) as RunError[]
  }));

  return NextResponse.json(
    {
      lastRunAt: ((lastRes.data || [])[0] as any)?.ran_at ?? null,
      callsToday: callsRes.count ?? 0,
      subscribers: subsRes.count ?? 0,
      today,
      yesterday,
      recent,
      serverNow: now
    },
    { headers: noStore }
  );
}
