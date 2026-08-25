"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/components/api";

export function useApi<T = unknown>(path: string | null, options?: { pollMs?: number }) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(path));
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!path) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      if (!data) setLoading(true);
      try {
        const response = await apiRequest<T>(path!);
        if (active) { setData(response); setError(""); }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "An unexpected error occurred.");
      } finally {
        if (active) setLoading(false);
        if (active && options?.pollMs) timer = setTimeout(load, options.pollMs);
      }
    }
    void load();
    return () => { active = false; if (timer) clearTimeout(timer); };
    // revision intentionally triggers a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, revision, options?.pollMs]);

  return { data, error, loading, refresh, setData };
}
