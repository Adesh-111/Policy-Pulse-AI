import { z } from "zod";

import { OpenAIService, SupabaseUsageLogger } from "@/lib/openai";
import { streamPolicyAnswer, SupabaseHybridSearchProvider } from "@/lib/rag";
import { apiRoute } from "@/lib/api/route";
import { permissions } from "@/lib/auth/roles";
import { ApiError } from "@/lib/security/errors";
import { assessPromptInjection } from "@/lib/security/prompt-injection";
import { loadOrganizationRuntimeSettings } from "@/lib/config/organization-settings";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const chatBodySchema = z
  .object({
    question: z.string().trim().min(3).max(4_000).optional(),
    message: z.string().trim().min(3).max(4_000).optional(),
    sessionId: z.uuid().optional(),
    history: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().trim().min(1).max(8_000),
        }),
      )
      .max(12)
      .default([]),
    documentIds: z.array(z.uuid()).max(20).default([]),
    departmentIds: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    versionFilters: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
    filters: z
      .object({
        documentIds: z.array(z.uuid()).max(20).default([]),
        departmentIds: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
        versions: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
        category: z.string().trim().min(1).max(80).nullable().default(null),
      })
      .default({ documentIds: [], departmentIds: [], versions: [], category: null }),
  })
  .refine((value) => Boolean(value.question ?? value.message), {
    message: "A policy question is required.",
    path: ["question"],
  });

function sse(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export const POST = apiRoute(
  {
    roles: permissions.useAssistant,
    body: chatBodySchema,
    rateLimit: { scope: "policy-chat", limit: 20, windowSeconds: 60 },
  },
  async ({ body, request, session }) => {
    const supabase = await createServerSupabaseClient();
    const admin = createAdminSupabaseClient();
    const assessment = assessPromptInjection(body.question ?? body.message ?? "");
    if (!assessment.sanitized) {
      throw new ApiError("A policy question is required.", 400, "QUESTION_REQUIRED");
    }

    const rawDocumentIds = body.documentIds.length
      ? body.documentIds
      : body.filters.documentIds;
    const rawDepartmentFilters = body.departmentIds.length
      ? body.departmentIds
      : body.filters.departmentIds;
    const versions = body.versionFilters.length
      ? body.versionFilters
      : body.filters.versions;

    let departmentIds: string[] = [];
    if (rawDepartmentFilters.length) {
      const uuidValues = rawDepartmentFilters.filter((value) => z.uuid().safeParse(value).success);
      const labels = rawDepartmentFilters.filter((value) => !uuidValues.includes(value));
      let departmentQuery = supabase
        .from("departments")
        .select("id,name,code")
        .eq("organization_id", session.organizationId);
      if (labels.length) {
        const terms = labels
          .map((value) => value.replace(/[%_,()]/g, ""))
          .filter(Boolean)
          .flatMap((value) => [`name.ilike.%${value}%`, `code.ilike.%${value}%`]);
        if (terms.length) departmentQuery = departmentQuery.or(terms.join(","));
      } else {
        departmentQuery = departmentQuery.in("id", uuidValues);
      }
      const { data: matchingDepartments, error: departmentError } = await departmentQuery;
      if (departmentError) throw departmentError;
      departmentIds = [
        ...new Set([
          ...uuidValues,
          ...(matchingDepartments ?? []).map((department) => department.id),
        ]),
      ];
    }

    let sessionId = body.sessionId;
    if (sessionId) {
      const { data: existing } = await supabase
        .from("chat_sessions")
        .select("id")
        .eq("id", sessionId)
        .eq("organization_id", session.organizationId)
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!existing) throw new ApiError("Chat session not found.", 404, "CHAT_NOT_FOUND");
    } else {
      const { data: created, error } = await supabase
        .from("chat_sessions")
        .insert({
          organization_id: session.organizationId,
          user_id: session.user.id,
          title: assessment.sanitized.slice(0, 120),
          department_filter_ids: departmentIds,
          document_filter_ids: rawDocumentIds,
        })
        .select("id")
        .single();
      if (error) throw error;
      sessionId = created.id;
    }

    const { error: messageError } = await supabase.from("chat_messages").insert({
      organization_id: session.organizationId,
      session_id: sessionId,
      role: "user",
      content: assessment.sanitized,
      tool_events: assessment.suspicious
        ? [{ tool: "prompt_injection_guard", signals: assessment.matchedSignals.length }]
        : [],
    });
    if (messageError) throw messageError;

    const usageLogger = new SupabaseUsageLogger(admin);
    const openAI = new OpenAIService({
      defaultOrganizationId: session.organizationId,
      defaultUserId: session.user.id,
      usageHook: usageLogger.log,
    });
    const provider = new SupabaseHybridSearchProvider(supabase);
    const settings = await loadOrganizationRuntimeSettings(supabase, session.organizationId);
    const recentContext = body.history
      .slice(-6)
      .map((item) => `${item.role}: ${item.content}`)
      .join("\n");
    const groundedQuery = recentContext
      ? `Conversation context:\n${recentContext}\n\nCurrent policy question:\n${assessment.sanitized}`
      : assessment.sanitized;

    const encoder = new TextEncoder();
    const stableSessionId = sessionId;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let answer = "";
        let citations: unknown[] = [];
        const startedAt = performance.now();
        controller.enqueue(encoder.encode(sse({ type: "session", sessionId: stableSessionId })));
        try {
          for await (const event of streamPolicyAnswer(
            groundedQuery,
            {
              organizationId: session.organizationId,
              documentIds: rawDocumentIds,
              departmentIds,
              versions,
              category: body.filters.category,
            },
            { openAI, provider },
            {
              limit: settings.defaultRetrievalLimit,
              candidateLimit: Math.min(100, Math.max(20, settings.defaultRetrievalLimit * 2)),
              rewriteQuery: true,
              rerank: true,
            },
            { userId: session.user.id, signal: request.signal },
          )) {
            if (event.type === "sources") citations = event.citations;
            if (event.type === "text-delta") answer += event.delta;
            controller.enqueue(encoder.encode(sse(event)));
          }
          if (answer.trim()) {
            await admin.from("chat_messages").insert({
              organization_id: session.organizationId,
              session_id: stableSessionId,
              role: "assistant",
              content: answer.trim(),
              citations,
              tool_events: [
                {
                  tool: "hybrid_policy_search",
                  evidence_found: citations.length,
                  decision_summary: citations.length
                    ? "Generated a grounded answer from authorized evidence."
                    : "Returned the insufficient-evidence response.",
                },
              ],
              model: openAI.chatModel,
              latency_ms: Math.round(performance.now() - startedAt),
            });
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (error) {
          if (!request.signal.aborted) {
            console.error("Policy chat stream failed", error);
            controller.enqueue(
              encoder.encode(
                sse({
                  type: "error",
                  message: "The grounded answer could not be completed. Please retry.",
                }),
              ),
            );
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  },
);
