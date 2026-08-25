import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "PolicyPulse AI — Policy intelligence you can act on",
    template: "%s · PolicyPulse AI",
  },
  description: "Compare policy versions, trace compliance impact, coordinate approvals, and answer policy questions with grounded citations.",
  applicationName: "PolicyPulse AI",
  keywords: ["policy intelligence", "compliance", "policy comparison", "RAG", "governance"],
  openGraph: {
    title: "PolicyPulse AI",
    description: "From policy change to accountable action — with evidence attached.",
    type: "website",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "PolicyPulse AI",
    description: "From policy change to accountable action — with evidence attached.",
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = { themeColor: "#0d684d", colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
