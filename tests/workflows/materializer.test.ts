import { describe, expect, it } from "vitest";

import { resolveConfiguredDepartmentId } from "@/lib/workflows/materializer";

describe("workflow materializer department resolution", () => {
  const departments = new Map([
    ["academic affairs", "department-academic"],
    ["student services", "department-student"],
  ]);

  it("uses an exact configured department name", () => {
    expect(
      resolveConfiguredDepartmentId(" Academic   Affairs ", departments, [
        "department-student",
      ]),
    ).toBe("department-academic");
  });

  it("uses the single policy department for a generated organizational label", () => {
    expect(
      resolveConfiguredDepartmentId("Teaching Departments", departments, [
        "department-academic",
      ]),
    ).toBe("department-academic");
  });

  it("fails closed when an unknown label has ambiguous fallbacks", () => {
    expect(
      resolveConfiguredDepartmentId("Teaching Departments", departments, [
        "department-academic",
        "department-student",
      ]),
    ).toBeNull();
  });
});
