import { createClient } from "@supabase/supabase-js";

// Server-only client (service role key). Never import this from a
// client component — it bypasses Row Level Security.
export function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false }
  });
}
