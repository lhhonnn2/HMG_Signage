"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { TV_IDS } from "@/lib/types";
import type { TvRow } from "@/lib/types";

// Returns a { [tvId]: displayName } map, falling back to "TV n" until
// loaded or if a row is missing. Used anywhere a TV needs a human label.
export function useTvNames() {
  const [names, setNames] = useState<Record<number, string>>(() =>
    Object.fromEntries(TV_IDS.map((id) => [id, `TV ${id}`]))
  );

  useEffect(() => {
    let active = true;
    supabase
      .from("tvs")
      .select("*")
      .then(({ data }) => {
        if (!active || !data) return;
        const map: Record<number, string> = {};
        (data as TvRow[]).forEach((t) => {
          map[t.id] = t.name;
        });
        setNames((prev) => ({ ...prev, ...map }));
      });
    return () => {
      active = false;
    };
  }, []);

  return names;
}
