import type { Metadata } from "next";
import { ActionPlans } from "@/components/operations/action-plans";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Action plans" };
export default function ActionPlansPage() { return <div className="space-y-7"><PageHeader eyebrow="Implementation" title="Department action plans" description="Turn approved findings into owned work. Update progress, status, and implementation notes without losing the originating analysis." /><ActionPlans /></div>; }
