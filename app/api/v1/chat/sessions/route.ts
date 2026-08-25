import { z } from "zod";

import { apiRoute, json } from "@/lib/api/route";
import { parsePagination } from "@/lib/api/pagination";
import { permissions } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const createSessionSchema = z.object({
  title: z.string().trim().min(1).max(200).default("New policy question"),
  documentIds: z.array(z.uuid()).max(20).default([]),
  departmentIds: z.array(z.uuid()).max(20).default([]),
});

export const GET = apiRoute(
  { roles: permissions.useAssistant },
  async ({ request, session }) => {
    const { page, pageSize } = parsePagination(request.url);
    const supabase = await createServerSupabaseClient();
    const { data, error, count } = await supabase
      .from("chat_sessions")
      .select(
        "id,title,department_filter_ids,document_filter_ids,is_archived,last_message_at,created_at,updated_at",
        { count: "exact" },
      )
      .eq("organization_id", session.organizationId)
      .eq("user_id", session.user.id)
      .eq("is_archived", false)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) throw error;
    return json({ data, pagination: { page, pageSize, total: count ?? 0 } });
  },
);

export const POST = apiRoute(
  {
    roles: permissions.useAssistant,
    body: createSessionSchema,
    rateLimit: { scope: "chat-session-create", limit: 20, windowSeconds: 60 },
  },
  async ({ body, session }) => {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("chat_sessions")
      .insert({
        organization_id: session.organizationId,
        user_id: session.user.id,
        title: body.title,
        document_filter_ids: body.documentIds,
        department_filter_ids: body.departmentIds,
      })
      .select(
        "id,title,department_filter_ids,document_filter_ids,is_archived,last_message_at,created_at,updated_at",
      )
      .single();
    if (error) throw error;
    return json({ data }, { status: 201 });
  },
);
