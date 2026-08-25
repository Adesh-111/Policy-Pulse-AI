import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export interface OrganizationRuntimeSettings {
  chunkSize: number;
  chunkOverlap: number;
  qualityThreshold: number;
  maxAutomaticRevisions: number;
  defaultRetrievalLimit: number;
}

export const DEFAULT_ORGANIZATION_SETTINGS: OrganizationRuntimeSettings = {
  chunkSize: 800,
  chunkOverlap: 120,
  qualityThreshold: 0.8,
  maxAutomaticRevisions: 2,
  defaultRetrievalLimit: 12,
};

const settingDefinitions = {
  "ingestion.chunk_size": z.number().int().min(200).max(2_000),
  "ingestion.chunk_overlap": z.number().int().min(0).max(500),
  "workflow.quality_threshold": z.number().min(0.5).max(1),
  "workflow.max_automatic_revisions": z.number().int().min(0).max(5),
  "retrieval.default_limit": z.number().int().min(3).max(50),
} as const;

function parsedSetting<K extends keyof typeof settingDefinitions>(
  rows: Map<string, unknown>,
  key: K,
  fallback: number,
): number {
  const parsed = settingDefinitions[key].safeParse(rows.get(key));
  return parsed.success ? parsed.data : fallback;
}

export async function loadOrganizationRuntimeSettings(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<OrganizationRuntimeSettings> {
  const { data, error } = await supabase
    .from("settings")
    .select("key,value")
    .eq("organization_id", organizationId)
    .in("key", Object.keys(settingDefinitions));
  if (error) throw new Error(`Unable to load organization settings: ${error.message}`);
  const rows = new Map(
    ((data ?? []) as Array<{ key: string; value: unknown }>).map((row) => [row.key, row.value]),
  );
  const chunkSize = parsedSetting(
    rows,
    "ingestion.chunk_size",
    DEFAULT_ORGANIZATION_SETTINGS.chunkSize,
  );
  const configuredOverlap = parsedSetting(
    rows,
    "ingestion.chunk_overlap",
    DEFAULT_ORGANIZATION_SETTINGS.chunkOverlap,
  );
  return {
    chunkSize,
    chunkOverlap: Math.min(configuredOverlap, chunkSize - 1),
    qualityThreshold: parsedSetting(
      rows,
      "workflow.quality_threshold",
      DEFAULT_ORGANIZATION_SETTINGS.qualityThreshold,
    ),
    maxAutomaticRevisions: parsedSetting(
      rows,
      "workflow.max_automatic_revisions",
      DEFAULT_ORGANIZATION_SETTINGS.maxAutomaticRevisions,
    ),
    defaultRetrievalLimit: parsedSetting(
      rows,
      "retrieval.default_limit",
      DEFAULT_ORGANIZATION_SETTINGS.defaultRetrievalLimit,
    ),
  };
}
