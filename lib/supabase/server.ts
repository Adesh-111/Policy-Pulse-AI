import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerEnv, requireValue } from "@/lib/config/env";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const env = getServerEnv();

  return createServerClient(
    requireValue(env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    requireValue(
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (items) => {
          try {
            for (const { name, value, options } of items) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot always write cookies. The root proxy
            // refreshes sessions on navigation and owns response cookie writes.
          }
        },
      },
    },
  );
}

export const createClient = createServerSupabaseClient;
