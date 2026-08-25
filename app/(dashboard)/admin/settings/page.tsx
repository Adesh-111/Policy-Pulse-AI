import type { Metadata } from "next";
import { SettingsPanel } from "@/components/admin/management";
import { PageHeader } from "@/components/ui";
import { requirePageSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Settings" };
export default async function SettingsPage() { await requirePageSession(["administrator"]); return <div className="space-y-7"><PageHeader eyebrow="Administrator configuration" title="Organization settings" description="Configure retrieval and quality boundaries. Environment secrets remain server-only." /><SettingsPanel /></div>; }
