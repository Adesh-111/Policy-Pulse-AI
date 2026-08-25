"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv, requireValue } from "@/lib/config/env";

export function createBrowserSupabaseClient() {
  const env = getPublicEnv();
  return createBrowserClient(
    requireValue(env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    requireValue(
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ),
  );
}
