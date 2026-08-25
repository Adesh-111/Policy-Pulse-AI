import type { SupabaseClient } from "@supabase/supabase-js";

import { OpenAIService, type OpenAIServiceOptions } from "@/lib/openai/client";
import {
  SupabaseUsageLogger,
  composeUsageHooks,
  type AIUsageHook,
} from "@/lib/openai/usage";

import { SupabaseHybridSearchProvider } from "./supabase";
import type { HybridRAGServices } from "./pipeline";

export interface CreateSupabaseAIStackOptions {
  supabase: SupabaseClient;
  organizationId: string;
  userId?: string;
  usageHook?: AIUsageHook;
  openAI?: Omit<OpenAIServiceOptions, "usageHook" | "defaultOrganizationId" | "defaultUserId">;
}

export interface SupabaseAIStack {
  openAI: OpenAIService;
  provider: SupabaseHybridSearchProvider;
  rag: HybridRAGServices;
}

export function createSupabaseAIStack(options: CreateSupabaseAIStackOptions): SupabaseAIStack {
  if (!options.organizationId) throw new Error("An organization ID is required for tracked AI services");
  const usageLogger = new SupabaseUsageLogger(options.supabase);
  const openAI = new OpenAIService({
    ...options.openAI,
    defaultOrganizationId: options.organizationId,
    defaultUserId: options.userId,
    usageHook: composeUsageHooks(usageLogger.log, options.usageHook),
  });
  const provider = new SupabaseHybridSearchProvider(options.supabase);
  return { openAI, provider, rag: { openAI, provider } };
}
