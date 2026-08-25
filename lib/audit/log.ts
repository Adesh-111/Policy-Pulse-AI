import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export interface AuditEvent {
  organizationId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  requestId: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

const sensitiveKeys = new Set([
  "password",
  "token",
  "authorization",
  "apiKey",
  "secret",
  "cookie",
]);

export function redactAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sensitiveKeys.has(key) ? "[REDACTED]" : redactAuditValue(item),
      ]),
    );
  }
  return value;
}

export async function writeAuditEvent(event: AuditEvent): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("audit_logs").insert({
    organization_id: event.organizationId,
    actor_user_id: event.actorId,
    action: event.action,
    entity_type: event.targetType,
    entity_id: event.targetId ?? null,
    request_id: event.requestId,
    old_values: redactAuditValue(event.before),
    new_values: redactAuditValue(event.after),
    metadata: redactAuditValue(event.metadata ?? {}),
  });
  if (error) throw new Error(`Audit write failed: ${error.code}`);
}
