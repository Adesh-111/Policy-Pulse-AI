import type { Metadata } from "next";
import { FileUp } from "lucide-react";
import { PolicyLibrary } from "@/components/policies/policy-library";
import { ButtonLink, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Policy library" };
export default function PoliciesPage() { return <div className="space-y-7"><PageHeader eyebrow="Source of truth" title="Policy library" description="Browse every policy and version you are authorized to access, including its private processing and indexing state." actions={<ButtonLink href="/policies/upload"><FileUp className="size-4" /> Upload policy</ButtonLink>} /><PolicyLibrary /></div>; }
