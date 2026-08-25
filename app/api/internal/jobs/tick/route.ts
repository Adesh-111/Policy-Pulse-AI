import { timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/lib/config/env";
import { runBackgroundJobTick } from "@/lib/jobs/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

function authorized(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return (
    supplied.byteLength === expected.byteLength &&
    timingSafeEqual(supplied, expected)
  );
}

async function tick(request: Request) {
  if (!authorized(request)) {
    return Response.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "A valid cron bearer token is required.",
        },
      },
      { status: 401 },
    );
  }
  try {
    return Response.json({ data: await runBackgroundJobTick(1) });
  } catch (error) {
    console.error("Background job tick failed", error);
    return Response.json(
      {
        error: {
          code: "JOB_TICK_FAILED",
          message: "The background worker tick failed safely.",
        },
      },
      { status: 500 },
    );
  }
}

export const GET = tick;
export const POST = tick;
