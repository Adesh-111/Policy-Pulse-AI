import "server-only";

import postgres, { type Sql } from "postgres";
import { getServerEnv, requireValue } from "@/lib/config/env";

let sqlClient: Sql | undefined;

export function getDatabase(): Sql {
  if (!sqlClient) {
    const url = requireValue(getServerEnv().DATABASE_URL, "DATABASE_URL");
    sqlClient = postgres(url, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      ssl: "require",
    });
  }
  return sqlClient;
}

export async function closeDatabaseForTests() {
  if (sqlClient) {
    await sqlClient.end({ timeout: 2 });
    sqlClient = undefined;
  }
}
