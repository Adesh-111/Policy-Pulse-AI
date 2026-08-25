import { ZodError } from "zod";
import {
  AuthenticationError,
  AuthorizationError,
} from "@/lib/auth/session";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function toSafeError(error: unknown) {
  if (error instanceof AuthenticationError) {
    return { status: 401, code: "UNAUTHENTICATED", message: error.message };
  }
  if (error instanceof AuthorizationError) {
    return { status: 403, code: "FORBIDDEN", message: error.message };
  }
  if (error instanceof ApiError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "The request did not pass validation.",
      details: error.flatten(),
    };
  }
  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "The request could not be completed.",
  };
}

export function secureJsonError(error: unknown, requestId: string) {
  const safe = toSafeError(error);
  return Response.json(
    {
      error: {
        code: safe.code,
        message: safe.message,
        requestId,
        ...(safe.details ? { details: safe.details } : {}),
      },
    },
    { status: safe.status },
  );
}
