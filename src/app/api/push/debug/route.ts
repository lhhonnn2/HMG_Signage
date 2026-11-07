import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

// Temporary diagnostic: what does the SERVER see in push_subscriptions?
// Protected by CRON_SECRET (?key=...). Shows no endpoints/keys. Delete after use.
// Replies as plain text (no-transform) and also writes the same text to the Vercel logs.
function text(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "Content-Encoding": "identity"
    }
  });
}

export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    const key = req.nextUrl.searchParams.get("key");
    if (!secret || key !== secret) return text("unauthorized", 401);

    const sb = supabaseServer();
    const head = await sb.from("push_subscriptions").select("id", { count: "exact", head: true });
    const list = await sb.from("push_subscriptions").select("*");

    let host = "";
    try {
      host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").host;
    } catch {
      host = "(invalid url)";
    }

    const lines: string[] = [];
    lines.push(`supabase_host=${host}`);
    lines.push(`vercel_env=${process.env.VERCEL_ENV || ""}`);
    lines.push(`head_count=${head.count} head_error=${head.error?.message || ""}`);
    lines.push(`list_length=${((list.data as any[]) || []).length} list_error=${list.error?.message || ""}`);
    for (const r of ((list.data as any[]) || [])) {
      let pushHost = "?";
      try {
        pushHost = new URL(r.endpoint).host;
      } catch {}
      lines.push(
        [
          `id=${String(r.id).slice(0, 8)}`,
          `service=${pushHost}`,
          `lead=${r.lead_minutes}`,
          `created=${r.created_at}`,
          `updated=${r.updated_at}`,
          `ua=${String(r.user_agent || "").slice(0, 80)}`
        ].join(" | ")
      );
    }
    const out = lines.join("\n");
    console.log("PUSH_DEBUG\n" + out);
    return text(out);
  } catch (e: any) {
    console.log("PUSH_DEBUG_ERROR " + (e?.message || e));
    return text("error: " + (e?.message || e), 500);
  }
}
