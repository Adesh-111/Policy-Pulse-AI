import "server-only";

import { randomUUID } from "node:crypto";
import type { ZodType } from "zod";
import { requireSession, type SessionContext } from "@/lib/auth/session";
import type { AppRole } from "@/lib/auth/roles";
import { assertTrustedOrigin } from "@/lib/security/origin";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { ApiError, secureJsonError } from "@/lib/security/errors";

export interface ApiContext<TBody = unknown> {
  request: Request;
  requestId: string;
  session: SessionContext;
  body: TBody;
}

interface ApiOptions<TBody> {
  roles?: readonly AppRole[];
  body?: ZodType<TBody>;
  rateLimit?: { scope: string; limit: number; windowSeconds: number };
}

export function apiRoute<TBody = undefined>(
  options: ApiOptions<TBody>,
  handler: (context: ApiContext<TBody>) => Promise<Response>,
) {
  return async (request: Request) => {
    const requestId = request.headers.get("x-request-id") || randomUUID();
    try {
      assertTrustedOrigin(request);
      const session = await requireSession(options.roles);
      if (options.rateLimit) {
        await enforceRateLimit({
          ...options.rateLimit,
          identifier: `${session.organizationId}:${session.user.id}`,
        });
      }

      let body: TBody = undefined as TBody;
      if (options.body) {
        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          throw new ApiError(
            "Expected an application/json request body.",
            415,
            "UNSUPPORTED_MEDIA_TYPE",
          );
        }
        body = options.body.parse(await request.json());
      }

      const response = await handler({
        request,
        requestId,
        session,
        body,
      });
      response.headers.set("x-request-id", requestId);
      response.headers.set("cache-control", "no-store");
      return response;
    } catch (error) {
      if (process.env.NODE_ENV !== "test") {
        console.error("API request failed", { requestId, error });
      }
      return secureJsonError(error, requestId);
    }
  };
}

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, init);
}
