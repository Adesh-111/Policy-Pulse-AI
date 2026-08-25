import "server-only";

import type postgres from "postgres";

import { getDatabase } from "@/lib/db/client";

function databaseJson(value: Record<string, unknown>): postgres.JSONValue {
  return JSON.parse(JSON.stringify(value)) as postgres.JSONValue;
}

export interface LeasedBackgroundJob {
  id: string;
  organization_id: string;
  workflow_run_id: string | null;
  job_type: string;
  subject_id: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export async function claimBackgroundJobs(
  workerId: string,
  limit: number,
  leaseSeconds: number,
): Promise<LeasedBackgroundJob[]> {
  const sql = getDatabase();
  return sql<LeasedBackgroundJob[]>`
    select *
    from public.claim_background_jobs(
      ${workerId}::uuid,
      ${limit}::integer,
      ${leaseSeconds}::integer
    )
  `;
}

export async function heartbeatBackgroundJob(
  jobId: string,
  workerId: string,
  leaseSeconds: number,
): Promise<boolean> {
  const sql = getDatabase();
  const [result] = await sql<{ renewed: boolean }[]>`
    select public.heartbeat_background_job(
      ${jobId}::uuid,
      ${workerId}::uuid,
      ${leaseSeconds}::integer
    ) as renewed
  `;
  return result?.renewed === true;
}

export async function completeBackgroundJob(
  jobId: string,
  workerId: string,
  result: Record<string, unknown>,
): Promise<boolean> {
  const sql = getDatabase();
  const [row] = await sql<{ completed: boolean }[]>`
    select public.complete_background_job(
      ${jobId}::uuid,
      ${workerId}::uuid,
      ${sql.json(databaseJson(result))}::jsonb
    ) as completed
  `;
  return row?.completed === true;
}

export async function failBackgroundJob(
  jobId: string,
  workerId: string,
  error: Record<string, unknown>,
  retryDelaySeconds: number,
): Promise<boolean> {
  const sql = getDatabase();
  const [row] = await sql<{ failed: boolean }[]>`
    select public.fail_background_job(
      ${jobId}::uuid,
      ${workerId}::uuid,
      ${sql.json(databaseJson(error))}::jsonb,
      ${retryDelaySeconds}::integer
    ) as failed
  `;
  return row?.failed === true;
}
