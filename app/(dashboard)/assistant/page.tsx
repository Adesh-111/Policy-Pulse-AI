import type { Metadata } from "next";
import { PolicyChat } from "@/components/assistant/policy-chat";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Policy assistant" };
export default function AssistantPage() { return <div className="space-y-7"><PageHeader eyebrow="Grounded RAG chat" title="Policy assistant" description="Ask questions across policies you are authorized to access. Every supported answer includes retrievable source context." /><PolicyChat /></div>; }
