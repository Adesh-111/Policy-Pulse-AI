import "server-only";

import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/security/errors";

export interface RateLimitOptions {
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
}

function bucketKey({ scope, identifier }: RateLimitOptions) {
  return createHash("sha256")
    .update(`${scope}:${identifier}`)
    .digest("hex");
}

export async function enforceRateLimit(options: RateLimitOptions) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("check_rate_limit", {
    p_bucket_key: bucketKey(options),
    p_limit: options.limit,
    p_window_seconds: options.windowSeconds,
  });

  if (error) {
    throw new ApiError(
      "Rate limit service is temporarily unavailable.",
      503,
      "RATE_LIMIT_UNAVAILABLE",
    );
  }
  if (data !== true) {
    throw new ApiError(
      "Too many requests. Please try again shortly.",
      429,
      "RATE_LIMITED",
    );
  }
}
