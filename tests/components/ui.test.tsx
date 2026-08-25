import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Badge, EmptyState, ErrorState, LoadingState, statusTone } from "@/components/ui";

describe("shared application UI", () => {
  it("renders accessible loading and error states", () => {
    const retry = vi.fn();
    const { rerender } = render(<LoadingState label="Restoring checkpoint" rows={2} />);
    expect(screen.getByRole("status")).toHaveTextContent("Restoring checkpoint");
    rerender(<ErrorState message="Secure request failed" onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Secure request failed");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("renders real empty-state actions and consistent risk tones", () => {
    render(
      <EmptyState
        title="No policies"
        description="Upload an authorized policy to begin."
        action={<button type="button">Upload policy</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Upload policy" })).toBeEnabled();
    expect(statusTone("critical")).toBe("danger");
    expect(statusTone("awaiting_approval")).toBe("warning");
    expect(statusTone("indexed")).toBe("success");
    render(<Badge tone="success">Indexed</Badge>);
    expect(screen.getByText("Indexed")).toBeInTheDocument();
  });
});
