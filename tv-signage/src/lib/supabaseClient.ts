import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Used in the browser (admin UI + player screens). Only has access to what
// your Row Level Security policies allow — see supabase/schema.sql.
export const supabase = createClient(url, anonKey, {
  realtime: {
    params: { eventsPerSecond: 5 }
  }
});
