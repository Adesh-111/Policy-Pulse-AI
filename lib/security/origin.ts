import { ApiError } from "@/lib/security/errors";
import { getServerEnv } from "@/lib/config/env";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function assertTrustedOrigin(request: Request) {
  if (safeMethods.has(request.method.toUpperCase())) return;

  const origin = request.headers.get("origin");
  if (!origin) return;

  const configured = new URL(getServerEnv().NEXT_PUBLIC_SITE_URL).origin;
  const requestOrigin = new URL(request.url).origin;
  if (origin !== configured && origin !== requestOrigin) {
    throw new ApiError("Untrusted request origin.", 403, "INVALID_ORIGIN");
  }
}
