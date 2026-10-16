"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { TvRow } from "@/lib/types";

const EVENT = "tvs-changed";

// Call after adding/deleting/renaming a TV so every mounted hook reloads.
export function notifyTvsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

// DB-driven TV list: { tvs (sorted by id), ids, names, loaded, refresh }.
export function useTvs() {
  const [tvs, setTvs] = useState<TvRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const { data } = await supabase.from("tvs").select("*").order("id");
    if (data) setTvs(data as TvRow[]);
    setLoaded(true);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(EVENT, refresh);
    return () => window.removeEventListener(EVENT, refresh);
  }, [refresh]);

  const ids = tvs.map((t) => t.id);
  const names: Record<number, string> = {};
  tvs.forEach((t) => {
    names[t.id] = t.name;
  });
  return { tvs, ids, names, loaded, refresh };
}
