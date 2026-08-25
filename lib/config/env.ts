import { z } from "zod";

const optionalUrl = z.string().url().optional();

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
});

const serverSchema = publicSchema.extend({
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_CHAT_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  OPENAI_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(24).optional(),
  LANGSMITH_API_KEY: z.string().min(1).optional(),
  LANGSMITH_PROJECT: z.string().min(1).default("policypulse-ai"),
  LANGSMITH_TRACING: z.enum(["true", "false"]).default("true"),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

export function getPublicEnv(): PublicEnv {
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || undefined,
    NEXT_PUBLIC_SITE_URL:
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  });
}

export function getServerEnv(): ServerEnv {
  return serverSchema.parse({
    ...getPublicEnv(),
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || undefined,
    OPENAI_CHAT_MODEL: process.env.OPENAI_CHAT_MODEL || "gpt-4.1-mini",
    OPENAI_EMBEDDING_MODEL:
      process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || undefined,
    DATABASE_URL: process.env.DATABASE_URL || undefined,
    CRON_SECRET: process.env.CRON_SECRET || undefined,
    LANGSMITH_API_KEY: process.env.LANGSMITH_API_KEY || undefined,
    LANGSMITH_PROJECT: process.env.LANGSMITH_PROJECT || "policypulse-ai",
    LANGSMITH_TRACING: process.env.LANGSMITH_TRACING || "true",
  });
}

export function configurationStatus() {
  const env = getServerEnv();
  return {
    supabase: Boolean(
      env.NEXT_PUBLIC_SUPABASE_URL &&
        env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
        env.SUPABASE_SECRET_KEY,
    ),
    database: Boolean(env.DATABASE_URL),
    openai: Boolean(env.OPENAI_API_KEY),
    langsmith: Boolean(env.LANGSMITH_API_KEY),
    cron: Boolean(env.CRON_SECRET),
  };
}

export function requireValue(
  value: string | undefined,
  name: keyof NodeJS.ProcessEnv,
): string {
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}
