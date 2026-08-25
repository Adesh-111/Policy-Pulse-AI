import { configurationStatus } from "@/lib/config/env";
import { getDatabase } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const configuration = configurationStatus();
  let databaseReachable = false;
  if (configuration.database) {
    try {
      const [result] = await getDatabase()<[{ ok: number }]>`select 1 as ok`;
      databaseReachable = result?.ok === 1;
    } catch {
      databaseReachable = false;
    }
  }
  const ready = configuration.supabase && databaseReachable;
  return Response.json(
    {
      service: "policypulse-ai",
      status: ready ? "ready" : "configuration_required",
      timestamp: new Date().toISOString(),
      configuration,
      checks: { transactionPooler: databaseReachable },
    },
    {
      status: ready ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
