import type { Metadata } from "next";
import { UploadPolicyForm } from "@/components/policies/upload-policy-form";
import { PageHeader } from "@/components/ui";
import { requirePageSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Upload policy" };
export default async function UploadPolicyPage() { await requirePageSession(["administrator", "policy_manager"]); return <div className="space-y-7"><PageHeader eyebrow="Private document ingestion" title="Upload a policy" description="Add one policy version at a time. The source is validated and stored privately before extraction, chunking, embedding, and indexing." /><UploadPolicyForm /></div>; }
