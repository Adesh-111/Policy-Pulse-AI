import type { Metadata } from "next";
import { PolicyDetail } from "@/components/policies/policy-detail";
import { ButtonLink, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Policy details" };
export default async function PolicyDetailPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <div className="space-y-7"><PageHeader eyebrow="Policy record" title="Policy details" description="Review source metadata, processing checkpoints, and index readiness for this policy version." actions={<ButtonLink href="/policies" variant="secondary">Back to library</ButtonLink>} /><PolicyDetail id={id} /></div>; }
