export function formatGroundedAnswerForDisplay(raw: string): string {
  const candidate = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (!candidate.startsWith("{") || !candidate.endsWith("}")) return raw.trim();

  try {
    const parsed: unknown = JSON.parse(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return raw.trim();
    const record = parsed as Record<string, unknown>;
    const summary = ["decision_summary", "answer", "summary", "conclusion"]
      .map((key) => record[key])
      .find((value): value is string => typeof value === "string" && value.trim().length > 0);
    const evidence = [
      "evidence_for_highest_risk_finding",
      "supporting_evidence",
      "evidence",
    ]
      .map((key) => record[key])
      .find(
        (value): value is string[] =>
          Array.isArray(value) && value.every((item) => typeof item === "string"),
      );
    if (!summary && !evidence?.length) return raw.trim();

    const sections: string[] = [];
    if (summary) sections.push(summary.trim());
    if (evidence?.length) {
      sections.push(
        `Supporting evidence:\n${evidence
          .map((item, index) => `${index + 1}. ${item.trim()}`)
          .join("\n")}`,
      );
    }
    return sections.join("\n\n");
  } catch {
    return raw.trim();
  }
}
