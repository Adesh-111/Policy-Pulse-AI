import { apiRoute, json } from "@/lib/api/route";
import { settingsSchema } from "@/lib/api/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { writeAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

const settingMap = {
  chunkSize: "ingestion.chunk_size",
  chunkOverlap: "ingestion.chunk_overlap",
  qualityThreshold: "workflow.quality_threshold",
  maxAutomaticRevisions: "workflow.max_automatic_revisions",
  defaultRetrievalLimit: "retrieval.default_limit",
} as const;

export const GET = apiRoute({}, async ({ session }) => {
  const supabase = await createServerSupabaseClient();
  let builder = supabase
    .from("settings")
    .select("key,value,description,is_client_visible,updated_at")
    .eq("organization_id", session.organizationId)
    .order("key");
  if (session.role !== "administrator") {
    builder = builder.eq("is_client_visible", true);
  }
  const { data, error } = await builder;
  if (error) throw error;
  return json({ data });
});

export const PATCH = apiRoute(
  { roles: ["administrator"], body: settingsSchema },
  async ({ body, session, requestId }) => {
    const supabase = await createServerSupabaseClient();
    const rows = Object.entries(settingMap).map(([field, key]) => ({
      organization_id: session.organizationId,
      key,
      value: body[field as keyof typeof body],
      updated_by: session.user.id,
      is_client_visible: key.startsWith("retrieval."),
    }));
    const { data, error } = await supabase
      .from("settings")
      .upsert(rows, { onConflict: "organization_id,key" })
      .select();
    if (error) throw error;
    await writeAuditEvent({
      organizationId: session.organizationId,
      actorId: session.user.id,
      action: "settings.updated",
      targetType: "settings",
      requestId,
      after: body,
    });
    return json({ data });
  },
);
