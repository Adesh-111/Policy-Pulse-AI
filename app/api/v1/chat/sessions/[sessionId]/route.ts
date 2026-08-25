import { apiRoute, json } from "@/lib/api/route";
import { permissions } from "@/lib/auth/roles";
import { ApiError } from "@/lib/security/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ sessionId: string }> };

export async function GET(request: Request, context: Context) {
  const { sessionId } = await context.params;
  return apiRoute({ roles: permissions.useAssistant }, async ({ session }) => {
    const supabase = await createServerSupabaseClient();
    const { data: chatSession, error } = await supabase
      .from("chat_sessions")
      .select(
        "id,title,department_filter_ids,document_filter_ids,is_archived,last_message_at,created_at,updated_at",
      )
      .eq("id", sessionId)
      .eq("organization_id", session.organizationId)
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!chatSession) throw new ApiError("Chat session not found.", 404, "NOT_FOUND");
    const { data: messages, error: messageError } = await supabase
      .from("chat_messages")
      .select("id,role,content,citations,tool_events,model,latency_ms,created_at")
      .eq("organization_id", session.organizationId)
      .eq("session_id", sessionId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true });
    if (messageError) throw messageError;
    return json({ data: { session: chatSession, messages: messages ?? [] } });
  })(request);
}

export async function DELETE(request: Request, context: Context) {
  const { sessionId } = await context.params;
  return apiRoute(
    {
      roles: permissions.useAssistant,
      rateLimit: { scope: "chat-session-delete", limit: 20, windowSeconds: 60 },
    },
    async ({ session }) => {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("chat_sessions")
        .delete()
        .eq("id", sessionId)
        .eq("organization_id", session.organizationId)
        .eq("user_id", session.user.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new ApiError("Chat session not found.", 404, "NOT_FOUND");
      return json({ data: { id: sessionId, deleted: true } });
    },
  )(request);
}
