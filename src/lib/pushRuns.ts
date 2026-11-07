import type { SupabaseClient } from "@supabase/supabase-js";

export type RunError = { status?: number | null; message: string; program?: string; sub?: string };

// Best-effort: a missing table (migration_v14 not run yet) must never break sending.
export async function recordRun(
  sb: SupabaseClient,
  r: { planned?: number; sent?: number; failed?: number; removed?: number; errors?: RunError[] }
) {
  try {
    await sb.from("push_runs").insert({
      planned: r.planned ?? 0,
      sent: r.sent ?? 0,
      failed: r.failed ?? 0,
      removed: r.removed ?? 0,
      errors: (r.errors || []).slice(0, 10)
    });
  } catch {
    /* ignore */
  }
}

export async function pruneRuns(sb: SupabaseClient, nowMs: number) {
  try {
    await sb.from("push_runs").delete().lt("ran_at", new Date(nowMs - 7 * 24 * 3600 * 1000).toISOString());
  } catch {
    /* ignore */
  }
}
