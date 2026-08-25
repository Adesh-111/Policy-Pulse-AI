import { ImageResponse } from "next/og";

export const alt = "PolicyPulse AI — policy intelligence you can act on";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 76, color: "#f7fbf8", background: "linear-gradient(135deg, #062f24 0%, #0d684d 60%, #2f8b68 100%)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34, fontWeight: 700 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 58, height: 58, borderRadius: 16, color: "#0b4f3b", background: "#d8f0e5" }}>P</div>
        PolicyPulse AI
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ maxWidth: 920, fontSize: 70, lineHeight: 1.06, letterSpacing: -3, fontWeight: 700 }}>From policy change to accountable action.</div>
        <div style={{ fontSize: 28, color: "#c9e5d9" }}>Evidence-grounded analysis · Human approval · Complete audit trail</div>
      </div>
      <div style={{ color: "#e4b85f", fontSize: 23 }}>Policy intelligence you can act on</div>
    </div>,
    size,
  );
}
