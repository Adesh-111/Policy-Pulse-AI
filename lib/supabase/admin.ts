import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getServerEnv, requireValue } from "@/lib/config/env";

export function createAdminSupabaseClient() {
  const env = getServerEnv();
  return createClient(
    requireValue(env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    requireValue(env.SUPABASE_SECRET_KEY, "SUPABASE_SECRET_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
