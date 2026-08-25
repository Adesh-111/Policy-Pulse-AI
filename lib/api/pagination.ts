import { z } from "zod";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  query: z.string().trim().max(200).default(""),
});

export function parsePagination(url: string) {
  const params = new URL(url).searchParams;
  return paginationSchema.parse({
    page: params.get("page") ?? undefined,
    pageSize: params.get("pageSize") ?? undefined,
    query: params.get("query") ?? undefined,
  });
}
